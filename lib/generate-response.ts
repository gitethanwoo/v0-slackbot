import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, Output, jsonSchema, DeepPartial } from "ai";
import { createMcpClient } from "./mcp-client";

export const generateResponse = async (
  messages: any[],
  updateStatus?: (status: string) => void,
) => {
  let mcpTools: Record<string, any> = {};
  let closeMcp: null | (() => Promise<void>) = null;
  const client = await createMcpClient();
  if (client) {
    mcpTools = await client.tools();
    closeMcp = client.close;
  }

  let text: string;
  try {
    const maxAttempts = 3;
    let attempt = 0;
    let lastAssistantText: string | null = null;
    let summary: string | null = null;
    let followUps: string[] = [];
    let link: string | undefined;

    while (attempt < maxAttempts) {
      console.log("[gen] attempt", attempt + 1, "of", maxAttempts);
      if (updateStatus) await updateStatus(attempt === 0 ? "is thinking..." : "gathering more info...");

      const systemPromptBase = `You are a Slack bot assistant. Your primary goal is to help the user building prototypes and ideas with v0. You do not have to necessarily pass everything to v0, you are allowed to chat, clarify, and help the user with their ideas before using your tools to build for the user. It can often be helpful to clarify what the user wants to build before using your tools to build for the user.

If it's the first message, it's a good idea to reply with a plan of what you're going to do before you use v0_create_chat and ask for confirmation. Use your web_search_preview tool to get a sense of documentation, latest releases, and clarification around potentially unclear information in the user's message. Use it to gather context and information before you use your tools to build for the user.

Behavior:
- Keep responses concise and actionable. Do not tag users.
- Today is ${new Date().toISOString().split("T")[0]}.
- If you use web search, include sources inline where assertions are made.

Slack thread + v0 chat rules:
- If this conversation is within a Slack thread, you MUST continue the same v0 chat for that thread instead of starting a new one.
- To find the existing chat, scan the thread text for a literal token in any message like: [v0_chat_id: <ID>]. If present, use that chatId.
- If no chatId is present, create a new v0 chat and include a line in your reply with exactly: [v0_chat_id: <NEW_ID>] so future messages can reuse it.

Tool usage policy:
- Prefer v0_send_message when a chatId is available; otherwise use v0_create_chat and then include [v0_chat_id: <NEW_ID>] in your final reply.
- When tools return multiple links/fields, surface only preview/deployment links to the user. Never include chat links. SHOW THE DEMO URL!!!!! PEOPLE DON'T KNOW WHAT TO DO WITH THE OTHER LINKS.
- Do not expose tool internals beyond including the [v0_chat_id: ...] line when creating a new chat.
- If a tool fails, provide a brief fallback answer and ask to try again.`;

      const systemPrompt = attempt === 0
        ? systemPromptBase
        : `${systemPromptBase}\n\nImportant: Ensure your reply includes at least one follow-up question or an actionable link if applicable.`;

      console.log("[gen] calling generateText primary...");
      const textResult = await generateText({
        stopWhen: stepCountIs(10),
        model: openai("gpt-5"),
        system: systemPrompt,
        messages,
        tools: {
          ...mcpTools,
          web_search_preview: openai.tools.webSearchPreview({ searchContextSize: "medium" }),
        },
      });

      lastAssistantText = textResult.text;
      console.log("[gen] primary text length:", lastAssistantText?.length ?? 0);

      if (updateStatus) await updateStatus("structuring...");

      type StructuredOut = {
        summary: string;
        links?: string[];
        followUps?: string[];
      };

      console.log("[gen] calling generateText structured...");
      const structuredResult = await generateText<Record<string, never>, StructuredOut, DeepPartial<StructuredOut>>({
        model: openai("gpt-5"),
        prompt: `Extract a concise summary (1-3 sentences), a list of actionable links (if present), and follow-up questions that help clarify next steps from the assistant reply below. Return only these fields.\n\n--- Assistant reply start ---\n${lastAssistantText}\n--- Assistant reply end ---`,
        experimental_output: Output.object({
          schema: jsonSchema<StructuredOut>({
            type: "object",
            properties: {
              summary: { type: "string" },
              links: { type: "array", items: { type: "string" } },
              followUps: { type: "array", items: { type: "string" } },
            },
            required: ["summary"],
            additionalProperties: false,
          }),
        }),
      });

      const extracted = structuredResult.experimental_output;
      console.log("[gen] structured output:", extracted);
      summary = extracted.summary;
      followUps = extracted.followUps ?? [];
      const linksArr = extracted.links ?? [];
      if (linksArr.length > 0) link = linksArr[0];

      console.log("[gen] extracted counts:", { followUps: followUps.length, links: linksArr.length });
      if (followUps.length > 0 || !!link) break;
      attempt += 1;
    }

    // Build Slack-friendly message
    const parts: string[] = [];
    console.log("[gen] building Slack message. hasSummary:", !!summary, "hasLink:", !!link, "numFollowUps:", followUps.length);
    parts.push(`**Summary**: ${summary ?? (lastAssistantText ?? "")}`);
    if (link) parts.push(`**Link**: [Open](${link})`);
    if (followUps.length > 0) {
      const bullets = followUps.map((q) => `- ${q}`).join("\n");
      parts.push(`**Follow-up questions**:\n${bullets}`);
    }

    text = parts.join("\n\n");
  } finally {
    console.log("[gen] cleaning up MCP client...");
    if (closeMcp) await closeMcp();
    console.log("[gen] done.");
  }

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createMcpToolsForThread } from "./mcp-tools-adapter";


export const generateResponse = async (
  messages: any[],
  updateStatus?: (status: string) => void,
  opts?: { threadKey?: string; maxSteps?: number }
) => {
  let mcpTools: Record<string, any> = {};
  let closeMcp: null | (() => Promise<void>) = null;
  if (opts?.threadKey) {
    const clientTools = await createMcpToolsForThread(opts.threadKey, {
      maxSteps: opts?.maxSteps,
    });
    if (clientTools) {
      mcpTools = clientTools.tools;
      closeMcp = clientTools.close;
    }
  }

  let text: string;
  try {
    const result = await generateText({
      model: openai("gpt-5"),
      system: `You are a Slack bot assistant. Your primary goal is to help the user building prototypes and ideas with v0. You do not have to necessarily pass everything to v0, you are allowed to chat, clarify, and help the user with their ideas before using your tools to build for the user. It can often be helpful to clarify what the user wants to build before using your tools to build for the user. 
      Behavior:
      - Keep responses concise and actionable. Do not tag users.
      - Today is ${new Date().toISOString().split("T")[0]}.
      - If you use web search, include sources inline where assertions are made.

      Slack thread + v0 chat rules:
      - If this conversation is within a Slack thread, you MUST continue the same v0 chat for that thread instead of starting a new one.
      - To find the existing chat, scan the thread text for a literal token in any message like: [v0_chat_id: <ID>]. If present, use that chatId.
      - If no chatId is present, create a new v0 chat and include a line in your reply with exactly: [v0_chat_id: <NEW_ID>] so future messages can reuse it.

      Tools you can call:
      - v0_create_chat({ message, projectId?, system? }): creates a new v0 chat; returns JSON including a chat identifier (e.g. chatId or id).
      - v0_send_message({ chatId, message }): sends a message to an existing v0 chat; use this whenever [v0_chat_id: ...] is available.
      - v0_find_versions({ chatId }): list versions for the chat when helpful.

      Tool usage policy:
      - Prefer v0_send_message when a chatId is available; otherwise use v0_create_chat and then include [v0_chat_id: <NEW_ID>] in your final reply.
      - When tools return multiple links/fields, surface only preview/deployment links to the user. Never include chat links. Prefer in this order if present: demoUrl > previewUrl > webUrl > deploymentUrl. If multiple exist, show both demo and deployment.
      - Do not expose tool internals beyond including the [v0_chat_id: ...] line when creating a new chat.
      - If a tool fails, provide a brief fallback answer and ask to try again.
      Note: you don't have to put the entire thread into the new message, you can just put the latest message. You're writing to a chat thread. 
      
      `,
      messages,
      tools: {
        ...mcpTools,
        web_search_preview: openai.tools.webSearchPreview({
          searchContextSize: "medium",
        }),
      },
    });
    text = result.text;
  } finally {
    if (closeMcp) await closeMcp();
  }

  // Convert markdown to Slack mrkdwn format
  return text.replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>").replace(/\*\*/g, "*");
};

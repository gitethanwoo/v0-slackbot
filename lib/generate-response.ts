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
      system: `You are a Slack bot assistant. Keep your responses concise and to the point.
      - Do not tag users.
      - Current date is: ${new Date().toISOString().split("T")[0]}
      - Make sure to ALWAYS include sources in your final response if you use web search. Put sources inline if possible.`,
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

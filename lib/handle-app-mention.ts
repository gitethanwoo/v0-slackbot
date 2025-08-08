import { AppMentionEvent } from "@slack/web-api";
import { client, getThread } from "./slack-utils";
import { generateResponse } from "./generate-response";
import { v0 } from "v0-sdk";
import { buildWithV0 } from "./v0";
import { createMcpToolsForThread } from "./mcp-tools-adapter";

const updateStatusUtil = async (
  initialStatus: string,
  event: AppMentionEvent,
) => {
  const initialMessage = await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    text: initialStatus,
  });

  if (!initialMessage || !initialMessage.ts)
    throw new Error("Failed to post initial message");

  const updateMessage = async (status: string) => {
    await client.chat.update({
      channel: event.channel,
      ts: initialMessage.ts as string,
      text: status,
    });
  };
  return updateMessage;
};

export async function handleNewAppMention(
  event: AppMentionEvent,
  botUserId: string,
) {
  console.log("Handling app mention");
  if (event.bot_id || event.bot_id === botUserId || event.bot_profile) {
    console.log("Skipping app mention");
    return;
  }

  const { thread_ts, channel } = event;
  const updateMessage = await updateStatusUtil("Working on it…", event);

  if (thread_ts) {
    // Use v0 to build a preview from the full thread context
    const messages = await getThread(channel, thread_ts, botUserId);
    const fullPrompt = messages.map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`).join("\n");

    await updateMessage("building a preview…");
    try {
      // Prefer MCP tool if available, fallback to direct v0
      const threadKey = `${(event as any).team}:${channel}:${thread_ts}`;
      const mcpToolsResult = await createMcpToolsForThread(threadKey, { maxSteps: 10 });
      const mcpTools = mcpToolsResult?.tools ?? {};
      if (mcpTools["v0_build"]) {
        try {
          const result = await mcpTools["v0_build"].execute({ prompt: fullPrompt });
          const parsed = typeof result === "string" ? JSON.parse(result) : result;
          const demoUrl = parsed?.demoUrl;
          const webUrl = parsed?.webUrl;
          if (demoUrl) {
            await client.chat.postMessage({
              channel,
              thread_ts,
              text: `Preview is ready: ${demoUrl}`,
              unfurl_links: false,
            });
          }
          if (webUrl) {
            await client.chat.postMessage({
              channel,
              thread_ts,
              text: `Preview deployment: ${webUrl}`,
              unfurl_links: false,
            });
          }
        } finally {
          if (mcpToolsResult?.close) await mcpToolsResult.close();
        }
      } else {
        const { demoUrl, webUrl } = await buildWithV0(fullPrompt);
        if (demoUrl) {
          await client.chat.postMessage({
            channel,
            thread_ts,
            text: `Preview is ready: ${demoUrl}`,
            unfurl_links: false,
          });
        }
        if (webUrl) {
          await client.chat.postMessage({
            channel,
            thread_ts,
            text: `Preview deployment: ${webUrl}`,
            unfurl_links: false,
          });
        }
      }

      await updateMessage("done");
    } catch (e: any) {
      await updateMessage(`failed: ${e?.message || "unknown error"}`);
    }
  } else {
    const prompt = event.text || "";
    await updateMessage("building a preview…");
    try {
      const { demoUrl, webUrl } = await buildWithV0(prompt);

      if (demoUrl) {
        await client.chat.postMessage({
          channel,
          thread_ts: event.ts,
          text: `Preview is ready: ${demoUrl}`,
          unfurl_links: false,
        });
      }

      if (webUrl) {
        await client.chat.postMessage({
          channel,
          thread_ts: event.ts,
          text: `Preview deployment: ${webUrl}`,
          unfurl_links: false,
        });
      }
      await updateMessage("done");
    } catch (e: any) {
      await updateMessage(`failed: ${e?.message || "unknown error"}`);
    }
  }
}

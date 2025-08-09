import { AppMentionEvent } from "@slack/web-api";
import { client, getThread } from "./slack-utils";
import { generateResponse } from "./generate-response";

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
  return Object.assign(updateMessage, { initialMessageTs: initialMessage.ts as string });
};

export async function handleNewAppMention(
  event: AppMentionEvent,
  botUserId: string,
) {
  console.log("[mention] Handling app mention", {
    channel: event.channel,
    thread_ts: event.thread_ts,
  });
  if (event.bot_id || event.bot_id === botUserId || event.bot_profile) {
    console.log("[mention] Skipping app mention");
    return;
  }

  const { thread_ts, channel } = event;
  const updateMessage: any = await updateStatusUtil("Working on it…", event);
  console.log("[mention] posted initial status");

  try {
    const messages = thread_ts
      ? await getThread(channel, thread_ts, botUserId)
      : [
          {
            role: "user",
            content: (event.text || "").replace(`<@${botUserId}> `, ""),
          },
        ];

    await updateMessage("is thinking...");
    console.log("[mention] updated status: is thinking...");

    const result = await generateResponse(messages, updateMessage);
    console.log("[mention] generated response length:", result.length);

    await client.chat.postMessage({
      channel,
      thread_ts: thread_ts ?? event.ts,
      text: result,
      unfurl_links: false,
    });

    await updateMessage("done");
    console.log("[mention] done");
  } catch (e: any) {
    console.error("[mention] error:", e);
    await updateMessage(`failed: ${e?.message || "unknown error"}`);
  }
}

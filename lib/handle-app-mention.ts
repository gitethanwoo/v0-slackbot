import { AppMentionEvent } from "@slack/web-api";
import { client, getThread, findThreadChatId, updateMessageWithChatMetadata } from "./slack-utils";
import { buildWithV0 } from "./v0";

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
  console.log("Handling app mention");
  if (event.bot_id || event.bot_id === botUserId || event.bot_profile) {
    console.log("Skipping app mention");
    return;
  }

  const { thread_ts, channel } = event;
  const updateMessage: any = await updateStatusUtil("Working on it…", event);

  if (thread_ts) {
    // Use v0 to build or continue a chat from the full thread context
    const messages = await getThread(channel, thread_ts, botUserId);
    const fullPrompt = messages
      .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`)
      .join("\n");

    await updateMessage("building a preview…");
    try {
      // Reuse existing chatId for this thread if present
      let chatId: string | undefined = (await findThreadChatId(channel, thread_ts)) || undefined;

      const { chatId: newChatId, demoUrl, webUrl } = await buildWithV0(fullPrompt, { chatId });

      if (!chatId && newChatId && updateMessage.initialMessageTs) {
        await updateMessageWithChatMetadata({
          channel,
          ts: updateMessage.initialMessageTs,
          text: "building a preview…",
          chatId: newChatId,
        });
        chatId = newChatId;
      }

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

      await updateMessage("done");
    } catch (e: any) {
      await updateMessage(`failed: ${e?.message || "unknown error"}`);
    }
  } else {
    const prompt = event.text || "";
    await updateMessage("building a preview…");
    try {
      const { chatId, demoUrl, webUrl } = await buildWithV0(prompt);

      // Persist chatId on the status message so follow-ups in this thread reuse it
      if (chatId && updateMessage.initialMessageTs) {
        await updateMessageWithChatMetadata({
          channel,
          ts: updateMessage.initialMessageTs,
          text: "building a preview…",
          chatId,
        });
      }

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

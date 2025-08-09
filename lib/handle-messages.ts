import type {
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "@slack/web-api";
import { client, getThread, updateStatusUtil } from "./slack-utils";
import { generateResponse } from "./generate-response";

export async function assistantThreadMessage(
  event: AssistantThreadStartedEvent,
) {
  console.log("[msg] assistantThreadMessage", {
    channel: event.assistant_thread?.channel_id,
    thread: event.assistant_thread?.thread_ts,
  });
  const { channel_id, thread_ts } = event.assistant_thread;
  console.log(`Thread started: ${channel_id} ${thread_ts}`);
  console.log(JSON.stringify(event));

  await client.chat.postMessage({
    channel: channel_id,
    thread_ts: thread_ts,
    text: "Hello, I'm an AI assistant built with the AI SDK by Vercel!",
  });

}

export async function handleNewAssistantMessage(
  event: GenericMessageEvent,
  botUserId: string,
) {
  console.log("[msg] handleNewAssistantMessage", {
    channel: event.channel,
    thread_ts: event.thread_ts,
  });
  if (
    event.bot_id ||
    event.bot_id === botUserId ||
    event.bot_profile ||
    !event.thread_ts
  )
  {
    console.log("[msg] skipping message", {
      hasBotId: !!event.bot_id,
      isSameBot: event.bot_id === botUserId,
      hasBotProfile: !!event.bot_profile,
      hasThread: !!event.thread_ts,
    });
    return;
  }

  const { thread_ts, channel } = event;
  const updateStatus = updateStatusUtil(channel, thread_ts);
  console.log("[msg] setting status: is thinking...");
  await updateStatus("is thinking...");

  const messages = await getThread(channel, thread_ts, botUserId);
  console.log("[msg] fetched thread messages:", messages.length);
  const threadKey = `${event.team}:${channel}:${thread_ts}`;
  const result = await generateResponse(messages, updateStatus);
  console.log("[msg] generated response length:", result.length);

  await client.chat.postMessage({
    channel: channel,
    thread_ts: thread_ts,
    text: result,
    unfurl_links: false,
  });

  await updateStatus("");
}

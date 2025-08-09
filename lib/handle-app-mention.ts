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
  console.log("Handling app mention");
  if (event.bot_id || event.bot_id === botUserId || event.bot_profile) {
    console.log("Skipping app mention");
    return;
  }

  const { thread_ts, channel } = event;
  const updateMessage: any = await updateStatusUtil("Working on it…", event);

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

    const threadKey = `${(event as any).team}:${channel}:${thread_ts ?? event.ts}`;
    const result = await generateResponse(messages, updateMessage, {
      threadKey,
      maxSteps: 10,
    });

    await client.chat.postMessage({
      channel,
      thread_ts: thread_ts ?? event.ts,
      text: result,
      unfurl_links: false,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: result },
        },
      ],
    });

    await updateMessage("done");
  } catch (e: any) {
    await updateMessage(`failed: ${e?.message || "unknown error"}`);
  }
}

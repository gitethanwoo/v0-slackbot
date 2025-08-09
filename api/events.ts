import type { SlackEvent } from "@slack/web-api";
import {
  assistantThreadMessage,
  handleNewAssistantMessage,
} from "../lib/handle-messages";
import { waitUntil } from "@vercel/functions";
import { handleNewAppMention } from "../lib/handle-app-mention";
import { verifyRequest, getBotId } from "../lib/slack-utils";

export async function POST(request: Request) {
  console.log("[events] POST received");
  const rawBody = await request.text();
  const payload = JSON.parse(rawBody);
  const requestType = payload.type as "url_verification" | "event_callback";
  console.log("[events] requestType:", requestType);

  // See https://api.slack.com/events/url_verification
  if (requestType === "url_verification") {
    return new Response(payload.challenge, { status: 200 });
  }

  console.log("[events] verifying request signature...");
  await verifyRequest({ requestType, request, rawBody });
  console.log("[events] verification complete");

  try {
    const botUserId = await getBotId();
    console.log("[events] botUserId:", botUserId);

    const event = payload.event as SlackEvent;
    console.log("[events] event.type:", (event as any)?.type);

    if (event.type === "app_mention") {
      console.log("[events] routing to handleNewAppMention");
      waitUntil(handleNewAppMention(event, botUserId));
    }

    if (event.type === "assistant_thread_started") {
      console.log("[events] routing to assistantThreadMessage");
      waitUntil(assistantThreadMessage(event));
    }

    if (event.type === "message" && event.channel_type === "im") {
      console.log("[events] IM message received");
      const hasSubtype = "subtype" in event && !!(event as any).subtype;
      const hasBotId = "bot_id" in event && !!(event as any).bot_id;
      const hasBotProfile = "bot_profile" in event && !!(event as any).bot_profile;
      const isSameBot = "bot_id" in event && (event as any).bot_id === botUserId;
      console.log("[events] flags:", { hasSubtype, hasBotId, hasBotProfile, isSameBot });

      if (!hasSubtype && !hasBotId && !hasBotProfile && !isSameBot) {
        console.log("[events] routing to handleNewAssistantMessage");
        waitUntil(handleNewAssistantMessage(event as unknown as any, botUserId));
      } else {
        console.log("[events] message skipped");
      }
    }

    return new Response("Success!", { status: 200 });
  } catch (error) {
    console.error("[events] Error generating response", error);
    return new Response("Error generating response", { status: 500 });
  }
}

import type { SlackEvent } from "@slack/web-api";
import {
  assistantThreadMessage,
  handleNewAssistantMessage,
} from "../lib/handle-messages";
import { waitUntil } from "@vercel/functions";
import { handleNewAppMention } from "../lib/handle-app-mention";
import { verifyRequest, getBotId } from "../lib/slack-utils";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const payload = JSON.parse(rawBody);
  const requestType = payload.type as "url_verification" | "event_callback";

  // See https://api.slack.com/events/url_verification
  if (requestType === "url_verification") {
    return new Response(payload.challenge, { status: 200 });
  }

  await verifyRequest({ requestType, request, rawBody });

  try {
    const botUserId = await getBotId();

    const event = payload.event as SlackEvent;

    if (event.type === "app_mention") {
      waitUntil(handleNewAppMention(event, botUserId));
    }

    if (event.type === "assistant_thread_started") {
      waitUntil(assistantThreadMessage(event));
    }

    if (event.type === "message" && event.channel_type === "im") {
      const hasSubtype = "subtype" in event && !!(event as any).subtype;
      const hasBotId = "bot_id" in event && !!(event as any).bot_id;
      const hasBotProfile = "bot_profile" in event && !!(event as any).bot_profile;
      const isSameBot = "bot_id" in event && (event as any).bot_id === botUserId;

      if (!hasSubtype && !hasBotId && !hasBotProfile && !isSameBot) {
        // Cast to GenericMessageEvent for downstream handler which requires user messages
        waitUntil(handleNewAssistantMessage(event as unknown as any, botUserId));
      }
    }

    return new Response("Success!", { status: 200 });
  } catch (error) {
    console.error("Error generating response", error);
    return new Response("Error generating response", { status: 500 });
  }
}

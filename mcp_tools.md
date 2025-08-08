import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { v0 } from "v0-sdk";

// Optional but recommended on Vercel for long streams
export const maxDuration = 800;
// Force Node runtime if your app defaults to Edge
export const runtime = "nodejs";

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "v0_create_chat",
      "Create a v0 chat from a prompt, optionally within a project.",
      {
        message: z.string(),
        projectId: z.string().optional(),
        system: z.string().optional(),
      },
      async ({ message, projectId, system }) => {
        const chat = await v0.chats.create({
          message,
          projectId,
          system,
          modelConfiguration: { modelId: "v0-gpt-5", imageGenerations: true },
        });
        return { content: [{ type: "text", text: JSON.stringify(chat, null, 2) }] };
      }
    );

    server.tool(
      "v0_send_message",
      "Iterate on an existing chat by sending a new message.",
      { chatId: z.string(), message: z.string() },
      async ({ chatId, message }) => {
        const result = await v0.chats.sendMessage({ chatId, message });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    server.tool(
      "v0_find_versions",
      "List versions (iterations) for a chat.",
      { chatId: z.string() },
      async ({ chatId }) => {
        const versions = await v0.chats.findVersions({ chatId });
        return { content: [{ type: "text", text: JSON.stringify(versions, null, 2) }] };
      }
    );
  },
  // Optional server options
  {},
  // Adapter config for Next.js on Vercel
  {
    basePath: "",
    redisUrl: process.env.REDIS_URL,
    maxDuration: 800,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST };

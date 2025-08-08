import { v0 } from "v0-sdk";

export async function buildWithV0(prompt: string): Promise<{
  demoUrl?: string;
  webUrl?: string;
}> {
  const chat = await v0.chats.create({
    message: prompt,
  });

  // Expecting URLs in the result shape; adjust parsing to your server’s response as needed
  const demoUrl = (chat as any)?.demoUrl || (chat as any)?.demo_url;
  const webUrl = (chat as any)?.webUrl || (chat as any)?.web_url;
  return { demoUrl, webUrl };
}

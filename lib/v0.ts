import { v0 } from "v0-sdk";

export async function buildWithV0(
  prompt: string,
  opts?: { chatId?: string }
): Promise<{
  chatId?: string;
  demoUrl?: string;
  webUrl?: string;
}> {
  let chatResponse: any;
  let effectiveChatId: string | undefined = opts?.chatId;

  if (effectiveChatId) {
    // Continue existing chat
    chatResponse = await v0.chats.sendMessage({ chatId: effectiveChatId, message: prompt });
  } else {
    // Start a new chat
    chatResponse = await v0.chats.create({ message: prompt });
    effectiveChatId =
      chatResponse?.chatId || chatResponse?.id || chatResponse?.chat?.id || chatResponse?.chat?.chatId;
  }

  // Extract possible URLs in the result
  const demoUrl = chatResponse?.demoUrl || chatResponse?.demo_url || chatResponse?.previewUrl || chatResponse?.preview_url;
  const webUrl = chatResponse?.webUrl || chatResponse?.web_url || chatResponse?.deploymentUrl || chatResponse?.deployment_url;

  return { chatId: effectiveChatId, demoUrl, webUrl };
}

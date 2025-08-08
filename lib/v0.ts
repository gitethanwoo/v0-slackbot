const V0_API_BASE = process.env.V0_PLATFORM_API_BASE || "https://api.v0.dev";
const V0_API_KEY = process.env.V0_API_KEY;
const V0_PROJECT_ID = process.env.V0_PROJECT_ID;
const V0_MODEL_ID = process.env.V0_MODEL_ID || "v0-1.5-md";

type V0ChatVersion = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  demoUrl?: string;
};

type V0Chat = {
  id: string;
  latestVersion?: V0ChatVersion;
};

type V0Deployment = {
  id: string;
  webUrl?: string;
};

async function v0Fetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!V0_API_KEY) throw new Error("Missing V0_API_KEY");
  const res = await fetch(`${V0_API_BASE}${path}`,
    {
      ...init,
      headers: {
        "authorization": `Bearer ${V0_API_KEY}`,
        "content-type": "application/json",
        ...(init?.headers || {}),
      },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`v0 request failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function createChat(prompt: string): Promise<V0Chat> {
  if (!V0_PROJECT_ID) throw new Error("Missing V0_PROJECT_ID");
  return v0Fetch<V0Chat>(
    "/v1/chats",
    {
      method: "POST",
      body: JSON.stringify({
        message: prompt,
        projectId: V0_PROJECT_ID,
        responseMode: "async",
        modelConfiguration: {
          modelId: V0_MODEL_ID,
        },
      }),
    },
  );
}

async function getChat(chatId: string): Promise<V0Chat> {
  return v0Fetch<V0Chat>(`/v1/chats/${chatId}`);
}

async function createDeployment(params: { projectId: string; chatId: string; versionId: string; }): Promise<V0Deployment> {
  return v0Fetch<V0Deployment>(
    "/v1/deployments",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function buildWithV0(prompt: string): Promise<{ chatId?: string; versionId?: string; demoUrl?: string; webUrl?: string; }>
{
  const chat = await createChat(prompt);
  const chatId = chat.id;
  let attempts = 0;
  let latest: V0ChatVersion | undefined = chat.latestVersion;

  // Poll up to ~90s
  while (!latest || (latest.status !== "completed" && latest.status !== "failed")) {
    attempts += 1;
    if (attempts > 45) throw new Error("Timed out waiting for v0 to complete generation");
    await sleep(2000);
    const updated = await getChat(chatId);
    latest = updated.latestVersion;
  }

  if (latest.status === "failed") throw new Error("v0 generation failed");

  const versionId = latest.id;
  const demoUrl = latest.demoUrl;

  let webUrl: string | undefined;
  if (versionId) {
    const dep = await createDeployment({
      projectId: V0_PROJECT_ID!,
      chatId,
      versionId,
    });
    webUrl = dep.webUrl;
  }

  return { chatId, versionId, demoUrl, webUrl };
}



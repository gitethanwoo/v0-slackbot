const V0_API_BASE = process.env.V0_PLATFORM_API_BASE || "https://api.v0.dev";
const V0_API_KEY = process.env.V0_API_KEY;
const V0_PROJECT_ID = process.env.V0_PROJECT_ID;
const V0_PROJECT_NAME = process.env.V0_PROJECT_NAME || "v0-slackbot";
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

let cachedProjectId: string | undefined;

type V0Project = { id: string; name?: string; slug?: string };

async function findProjectIdByName(name: string): Promise<string | undefined> {
  // Best-effort search
  try {
    const res = await v0Fetch<{ projects?: V0Project[]; items?: V0Project[] }>(`/v1/projects`);
    const list = (res.projects || res.items || []) as V0Project[];
    const found = list.find((p) => (p.name || p.slug)?.toLowerCase() === name.toLowerCase());
    return found?.id;
  } catch {
    return undefined;
  }
}

async function createProjectByName(name: string): Promise<string | undefined> {
  try {
    const created = await v0Fetch<V0Project>(
      "/v1/projects",
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    );
    return created.id;
  } catch {
    return undefined;
  }
}

async function resolveProjectId(): Promise<string> {
  if (cachedProjectId) return cachedProjectId;
  if (V0_PROJECT_ID) {
    cachedProjectId = V0_PROJECT_ID;
    return cachedProjectId;
  }
  // Try to find by name, otherwise create
  const found = await findProjectIdByName(V0_PROJECT_NAME);
  if (found) {
    cachedProjectId = found;
    return found;
  }
  const created = await createProjectByName(V0_PROJECT_NAME);
  if (created) {
    cachedProjectId = created;
    return created;
  }
  throw new Error("Could not resolve or create a v0 project. Set V0_PROJECT_ID or V0_PROJECT_NAME.");
}

async function createChat(prompt: string): Promise<V0Chat> {
  const projectId = await resolveProjectId();
  return v0Fetch<V0Chat>(
    "/v1/chats",
    {
      method: "POST",
      body: JSON.stringify({
        message: prompt,
        projectId,
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
      projectId: await resolveProjectId(),
      chatId,
      versionId,
    });
    webUrl = dep.webUrl;
  }

  return { chatId, versionId, demoUrl, webUrl };
}



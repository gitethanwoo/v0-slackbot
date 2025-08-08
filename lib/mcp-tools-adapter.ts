import type { z } from "zod";
import { createMcpClient } from "./mcp-client";

export type ToolDefinition = {
  parameters?: z.ZodTypeAny;
  execute: (args: unknown) => Promise<string>;
};

export async function createMcpToolsForThread(
  threadKey: string,
  opts?: { maxSteps?: number }
): Promise<{ tools: Record<string, ToolDefinition>; close: () => Promise<void> } | null> {
  const maxSteps = opts?.maxSteps ?? 10;
  const client = await createMcpClient();
  if (!client) return null;

  const toolSet = await client.tools();
  let stepCount = 0;

  const adapted: Record<string, ToolDefinition> = {};

  for (const [name, tool] of Object.entries(toolSet)) {
    adapted[name] = {
      parameters: (tool as any).parameters,
      execute: async (args: unknown) => {
        if (stepCount >= maxSteps) {
          throw new Error(`Step limit reached (${maxSteps})`);
        }
        stepCount += 1;
        const result = await (tool as any).execute(args);
        return typeof result === "string" ? result : JSON.stringify(result);
      },
    };
  }

  return {
    tools: adapted,
    close: () => client.close(),
  };
}



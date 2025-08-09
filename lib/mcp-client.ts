import { experimental_createMCPClient } from "ai";

type McpClient = {
  tools: () => Promise<Record<string, any>>;
  close: () => Promise<void>;
};

export async function createMcpClient(): Promise<McpClient | null> {
  if (process.env.MCP_STDIO_COMMAND) {
    try {
      const { Experimental_StdioMCPTransport } = await import("ai/mcp-stdio");
      const transport = new Experimental_StdioMCPTransport({
        command: process.env.MCP_STDIO_COMMAND!,
        args: process.env.MCP_STDIO_ARGS ? JSON.parse(process.env.MCP_STDIO_ARGS) : [],
      } as any);
      const client = await experimental_createMCPClient({ transport: transport as any });
      return {
        tools: () => client.tools(),
        close: () => client.close(),
      };
    } catch {
      return null;
    }
  }

  return null;
}



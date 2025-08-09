import { experimental_createMCPClient } from "ai";

type McpClient = {
  tools: () => Promise<Record<string, any>>;
  close: () => Promise<void>;
};

export async function createMcpClient(): Promise<McpClient | null> {
  if (process.env.MCP_STDIO_COMMAND) {
    try {
      console.log('[mcp] creating stdio transport...')
      const { Experimental_StdioMCPTransport } = await import("ai/mcp-stdio");
      const transport = new Experimental_StdioMCPTransport({
        command: process.env.MCP_STDIO_COMMAND!,
        args: process.env.MCP_STDIO_ARGS ? JSON.parse(process.env.MCP_STDIO_ARGS) : [],
      } as any);
      const client = await experimental_createMCPClient({ transport: transport as any });
      console.log('[mcp] connected, tools available...');
      return {
        tools: () => client.tools(),
        close: () => client.close(),
      };
    } catch {
      console.log('[mcp] failed to initialize, continuing without MCP');
      return null;
    }
  }

  return null;
}



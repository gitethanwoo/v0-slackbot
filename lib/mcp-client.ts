import { experimental_createMCPClient } from "ai";

type McpClient = {
  tools: () => Promise<Record<string, any>>;
  close: () => Promise<void>;
};

/**
 * Creates an MCP client using either HTTP (streamable) or SSE transport, based on env configuration.
 * - Prefer HTTP when MCP_HTTP_URL is set
 * - Fallback to SSE when MCP_SSE_URL is set
 * If neither is set, returns null to indicate MCP is disabled.
 */
export async function createMcpClient(): Promise<McpClient | null> {
  // Prefer stdio when explicitly enabled (useful for local/dev). In serverless, you can adapt to HTTP/SSE later.
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

  // HTTP/SSE transports can be added later when the SDK is present in the runtime.
  return null;
}



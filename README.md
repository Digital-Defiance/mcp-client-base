# @ai-capabilities-suite/mcp-client-base

Shared MCP (Model Context Protocol) client base class providing consistent timeout handling, automatic re-synchronization, and connection state management for VSCode extensions.

## Features

- **Configurable Timeouts**: Different timeout values for initialization vs. standard requests
- **Automatic Re-synchronization**: Exponential backoff retry logic when timeouts occur
- **Connection State Management**: Track and notify listeners of connection state changes
- **Consistent Error Handling**: Unified error messages and recovery options
- **Extensible Architecture**: Abstract base class that extensions can customize
- **Comprehensive Logging**: Structured logging with timestamps and request IDs

## Installation

```bash
npm install @ai-capabilities-suite/mcp-client-base
```

## Usage

### Extending the Base Client

```typescript
import {
  BaseMCPClient,
  MCPClientConfig,
} from "@ai-capabilities-suite/mcp-client-base";
import * as vscode from "vscode";

export class MyMCPClient extends BaseMCPClient {
  constructor(
    outputChannel: vscode.LogOutputChannel,
    config?: Partial<MCPClientConfig>
  ) {
    super(outputChannel, config);
  }

  protected getServerCommand(): { command: string; args: string[] } {
    return {
      command: "npx",
      args: ["-y", "@my-org/my-mcp-server"],
    };
  }

  protected getServerEnv(): Record<string, string> {
    return { ...process.env };
  }

  protected async onServerReady(): Promise<void> {
    // Extension-specific initialization
    await this.callTool("my_tool", {});
  }

  // Add extension-specific methods
  async myCustomMethod(params: any): Promise<any> {
    return await this.callTool("my_custom_tool", params);
  }
}
```

### Using the Client

```typescript
const outputChannel = vscode.window.createOutputChannel("My Extension", {
  log: true,
});
const client = new MyMCPClient(outputChannel, {
  timeout: {
    initializationTimeoutMs: 60000,
    standardRequestTimeoutMs: 30000,
  },
  reSync: {
    maxRetries: 3,
    retryDelayMs: 2000,
    backoffMultiplier: 1.5,
  },
});

// Start the client
await client.start();

// Subscribe to connection state changes
client.getConnectionStatus(); // Get current status
client.onStateChange((status) => {
  console.log("Connection state:", status.state);
});

// Use the client
const result = await client.myCustomMethod({ foo: "bar" });

// Stop the client
client.stop();
```

## Configuration

### Timeout Configuration

```typescript
interface TimeoutConfig {
  initializationTimeoutMs: number; // Default: 60000 (60s)
  standardRequestTimeoutMs: number; // Default: 30000 (30s)
  toolsListTimeoutMs: number; // Default: 60000 (60s)
}
```

### Re-synchronization Configuration

```typescript
interface ReSyncConfig {
  maxRetries: number; // Default: 3
  retryDelayMs: number; // Default: 2000 (2s)
  backoffMultiplier: number; // Default: 1.5
}
```

## Connection States

- `DISCONNECTED`: Not connected to server
- `CONNECTING`: Attempting to connect
- `CONNECTED`: Successfully connected
- `TIMEOUT_RETRYING`: Timeout occurred, retrying connection
- `ERROR`: Unrecoverable error occurred

## API

### BaseMCPClient

#### Lifecycle Methods

- `async start(): Promise<void>` - Start the server and initialize connection
- `stop(): void` - Stop the server and cleanup
- `async reconnect(): Promise<boolean>` - Attempt to reconnect to the server

#### Connection Management

- `getConnectionStatus(): ConnectionStatus` - Get current connection status
- `getDiagnostics(): ServerDiagnostics` - Get detailed diagnostics
- `isServerProcessAlive(): boolean` - Check if server process is running

#### Abstract Methods (Must Implement)

- `protected abstract getServerCommand(): { command: string; args: string[] }` - Return server command and args
- `protected abstract getServerEnv(): Record<string, string>` - Return environment variables for server
- `protected abstract onServerReady(): Promise<void>` - Called when server is ready

## License

MIT

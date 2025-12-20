# @ai-capabilities-suite/mcp-client-base

Shared MCP (Model Context Protocol) client base class providing consistent timeout handling, automatic re-synchronization, and connection state management for VSCode extensions.

## Features

- **Configurable Timeouts**: Different timeout values for initialization vs. standard requests
- **Automatic Re-synchronization**: Exponential backoff retry logic when timeouts occur
- **Connection State Management**: Track and notify listeners of connection state changes
- **Consistent Error Handling**: Unified error messages and recovery options
- **Extensible Architecture**: Abstract base class that extensions can customize
- **Comprehensive Logging**: Structured logging with timestamps and request IDs
- **Diagnostic Commands**: Built-in commands for troubleshooting connection issues

## Installation

```bash
npm install @ai-capabilities-suite/mcp-client-base
```

## Quick Start

```typescript
import {
  BaseMCPClient,
  MCPClientConfig,
} from "@ai-capabilities-suite/mcp-client-base";
import * as vscode from "vscode";

// 1. Extend BaseMCPClient
export class MyMCPClient extends BaseMCPClient {
  protected getServerCommand() {
    return { command: "npx", args: ["-y", "@my-org/my-mcp-server"] };
  }

  protected getServerEnv() {
    return { ...process.env };
  }

  protected async onServerReady() {
    // Extension-specific initialization
  }
}

// 2. Create and start the client
const outputChannel = vscode.window.createOutputChannel("My Extension", {
  log: true,
});
const client = new MyMCPClient(outputChannel);
await client.start();

// 3. Use the client
const result = await client.callTool("my_tool", { param: "value" });
```

## Documentation

- [API Reference](./docs/API.md) - Complete API documentation
- [Extending BaseMCPClient](./docs/EXTENDING.md) - Guide to creating custom MCP clients
- [Configuration Guide](./docs/CONFIGURATION.md) - Timeout and re-sync configuration
- [Diagnostic Commands](./docs/DIAGNOSTICS.md) - Troubleshooting and diagnostic tools
- [Troubleshooting Guide](./docs/TROUBLESHOOTING.md) - Common issues and solutions

## Key Concepts

### Connection States

The client tracks connection state through a state machine:

- `DISCONNECTED` - Not connected to server
- `CONNECTING` - Attempting to establish connection
- `CONNECTED` - Successfully connected and ready
- `TIMEOUT_RETRYING` - Timeout occurred, attempting re-synchronization
- `ERROR` - Unrecoverable error occurred

### Timeout Handling

Different request types have different timeout values:

- **Initialization**: 60 seconds (server startup can be slow)
- **Standard Requests**: 30 seconds (normal operations)
- **Tools List**: 60 seconds (may involve discovery)

### Re-synchronization

When a timeout occurs during initialization, the client automatically attempts to re-synchronize using exponential backoff:

1. First retry after 2 seconds
2. Second retry after 3 seconds (2 × 1.5)
3. Third retry after 4.5 seconds (3 × 1.5)

## Usage Examples

### Basic Extension

```typescript
import { BaseMCPClient } from "@ai-capabilities-suite/mcp-client-base";
import * as vscode from "vscode";

export class MyMCPClient extends BaseMCPClient {
  constructor(outputChannel: vscode.LogOutputChannel) {
    super(outputChannel, {
      timeout: {
        initializationTimeoutMs: 60000,
        standardRequestTimeoutMs: 30000,
        toolsListTimeoutMs: 60000,
      },
      reSync: {
        maxRetries: 3,
        retryDelayMs: 2000,
        backoffMultiplier: 1.5,
      },
      logging: {
        logLevel: "info",
        logCommunication: true,
      },
    });
  }

  protected getServerCommand() {
    return {
      command: "npx",
      args: ["-y", "@my-org/my-mcp-server"],
    };
  }

  protected getServerEnv() {
    return { ...process.env };
  }

  protected async onServerReady() {
    // Verify server is working
    await this.callTool("health_check", {});
  }

  // Extension-specific methods
  async doSomething(params: any): Promise<any> {
    return await this.callTool("my_tool", params);
  }
}
```

### Monitoring Connection State

```typescript
const client = new MyMCPClient(outputChannel);

// Subscribe to state changes
const disposable = client.onStateChange((status) => {
  console.log(`State: ${status.state}`);
  console.log(`Message: ${status.message}`);
  console.log(`Server Running: ${status.serverProcessRunning}`);

  if (status.state === "ERROR") {
    vscode.window.showErrorMessage(`Connection error: ${status.message}`);
  }
});

await client.start();

// Later: cleanup
disposable.dispose();
client.stop();
```

### Using Diagnostic Commands

```typescript
import { diagnosticCommands } from "@ai-capabilities-suite/mcp-client-base";

// Register your extension
diagnosticCommands.registerExtension({
  name: "my-extension",
  displayName: "My Extension",
  client: myClient,
});

// Reconnect to server
await diagnosticCommands.reconnectToServer("my-extension");

// Restart server
await diagnosticCommands.restartServer("my-extension");

// Get diagnostics
const diag = diagnosticCommands.getDiagnostics("my-extension");
console.log(diagnosticCommands.formatDiagnostics(diag));

// Get all extensions status
const allDiag = diagnosticCommands.getAllDiagnostics();
console.log(diagnosticCommands.formatAllDiagnostics());
```

## Configuration

### Default Configuration

```typescript
{
  timeout: {
    initializationTimeoutMs: 60000,  // 60 seconds
    standardRequestTimeoutMs: 30000,  // 30 seconds
    toolsListTimeoutMs: 60000,        // 60 seconds
  },
  reSync: {
    maxRetries: 3,                    // 3 retry attempts
    retryDelayMs: 2000,               // 2 second initial delay
    backoffMultiplier: 1.5,           // 1.5x backoff multiplier
  },
  logging: {
    logLevel: 'info',                 // info level logging
    logCommunication: true,           // log all communication
  },
}
```

### Custom Configuration

```typescript
const client = new MyMCPClient(outputChannel, {
  timeout: {
    initializationTimeoutMs: 120000, // 2 minutes for slow servers
    standardRequestTimeoutMs: 45000, // 45 seconds for slow operations
  },
  reSync: {
    maxRetries: 5, // More retry attempts
    retryDelayMs: 1000, // Faster initial retry
    backoffMultiplier: 2.0, // Aggressive backoff
  },
  logging: {
    logLevel: "debug", // Verbose logging
    logCommunication: true,
  },
});
```

## Architecture

The package consists of four main components:

1. **BaseMCPClient** - Abstract base class with core functionality
2. **TimeoutManager** - Configurable timeout handling
3. **ConnectionStateManager** - Connection state tracking and notifications
4. **ReSyncManager** - Automatic re-synchronization with exponential backoff

```
┌─────────────────────────────────────────────────────────────┐
│              @ai-capabilities-suite/mcp-client-base         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              BaseMCPClient (Abstract)                   │ │
│  │  ┌──────────────┐  ┌────────────────┐  ┌───────────┐ │ │
│  │  │   Timeout    │  │ Re-sync Logic  │  │  Request  │ │ │
│  │  │   Manager    │  │                │  │   Queue   │ │ │
│  │  └──────────────┘  └────────────────┘  └───────────┘ │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │        ConnectionStateManager                     │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ extends
          ┌─────────────────┼─────────────────┐
          │                 │                  │
┌─────────┴──────┐  ┌──────┴───────┐  ┌──────┴───────┐
│ MCPProcessClient│  │MCPScreenshot │  │MCPDebugger   │
│                 │  │   Client     │  │   Client     │
└─────────────────┘  └──────────────┘  └──────────────┘
```

## Testing

The package includes comprehensive tests:

- **Unit Tests** - Test individual components in isolation
- **Property-Based Tests** - Verify correctness properties across all inputs
- **Integration Tests** - Test full client lifecycle

Run tests:

```bash
npm test
```

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass
2. New features include tests
3. Documentation is updated
4. Code follows existing style

## License

MIT

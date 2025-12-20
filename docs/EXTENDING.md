# Extending BaseMCPClient

Guide to creating custom MCP clients by extending `BaseMCPClient`.

## Table of Contents

- [Overview](#overview)
- [Basic Extension](#basic-extension)
- [Implementing Abstract Methods](#implementing-abstract-methods)
- [Adding Custom Methods](#adding-custom-methods)
- [Customizing Configuration](#customizing-configuration)
- [Handling Extension-Specific State](#handling-extension-specific-state)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

---

## Overview

`BaseMCPClient` is an abstract class that provides:

- Server process lifecycle management
- JSON-RPC communication
- Timeout handling with automatic re-synchronization
- Connection state management
- Diagnostic capabilities

To create a custom MCP client, you need to:

1. Extend `BaseMCPClient`
2. Implement three abstract methods
3. Add extension-specific methods

---

## Basic Extension

Here's a minimal extension:

```typescript
import { BaseMCPClient } from "@ai-capabilities-suite/mcp-client-base";
import * as vscode from "vscode";

export class MyMCPClient extends BaseMCPClient {
  constructor(outputChannel: vscode.LogOutputChannel) {
    super(outputChannel);
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
    // Extension-specific initialization
  }
}
```

---

## Implementing Abstract Methods

### getServerCommand()

Returns the command and arguments to spawn your MCP server.

**Common Patterns:**

#### NPX Package

```typescript
protected getServerCommand() {
  return {
    command: 'npx',
    args: ['-y', '@my-org/my-mcp-server'],
  };
}
```

#### Local Binary

```typescript
protected getServerCommand() {
  const serverPath = path.join(__dirname, '..', 'bin', 'server');
  return {
    command: serverPath,
    args: ['--port', '8080'],
  };
}
```

#### Python Script

```typescript
protected getServerCommand() {
  return {
    command: 'python',
    args: ['-m', 'my_mcp_server'],
  };
}
```

#### Node Script

```typescript
protected getServerCommand() {
  const serverScript = path.join(__dirname, '..', 'server', 'index.js');
  return {
    command: 'node',
    args: [serverScript],
  };
}
```

### getServerEnv()

Returns environment variables for the server process.

**Common Patterns:**

#### Basic Environment

```typescript
protected getServerEnv() {
  return { ...process.env };
}
```

#### With Configuration

```typescript
protected getServerEnv() {
  return {
    ...process.env,
    MY_SERVER_CONFIG: JSON.stringify(this.config),
    MY_SERVER_LOG_LEVEL: 'debug',
  };
}
```

#### With Secrets

```typescript
protected getServerEnv() {
  return {
    ...process.env,
    API_KEY: this.getApiKey(),
    DATABASE_URL: this.getDatabaseUrl(),
  };
}
```

#### Platform-Specific

```typescript
protected getServerEnv() {
  const env = { ...process.env };

  if (process.platform === 'win32') {
    env.PATH = `${env.PATH};C:\\my-tools`;
  } else {
    env.PATH = `${env.PATH}:/usr/local/my-tools`;
  }

  return env;
}
```

### onServerReady()

Called when the server is initialized and ready. Use this for extension-specific setup.

**Common Patterns:**

#### Health Check

```typescript
protected async onServerReady() {
  // Verify server is working
  await this.callTool('health_check', {});
}
```

#### Load Initial Data

```typescript
protected async onServerReady() {
  // Load configuration
  const config = await this.callTool('get_config', {});
  this.serverConfig = config;

  // Load initial state
  const state = await this.callTool('get_state', {});
  this.serverState = state;
}
```

#### Register Callbacks

```typescript
protected async onServerReady() {
  // Register for server notifications
  await this.sendNotification('register_client', {
    clientId: this.clientId,
  });
}
```

#### Verify Capabilities

```typescript
protected async onServerReady() {
  // Get server capabilities
  const capabilities = await this.callTool('get_capabilities', {});

  if (!capabilities.includes('required_feature')) {
    throw new Error('Server does not support required feature');
  }
}
```

---

## Adding Custom Methods

Add extension-specific methods that wrap `callTool()` or `sendRequest()`.

### Simple Tool Wrapper

```typescript
export class MyMCPClient extends BaseMCPClient {
  async doSomething(input: string): Promise<string> {
    const result = await this.callTool("my_tool", { input });
    return result.output;
  }
}
```

### With Type Safety

```typescript
interface MyToolParams {
  input: string;
  options?: {
    verbose?: boolean;
    timeout?: number;
  };
}

interface MyToolResult {
  output: string;
  metadata: {
    duration: number;
    status: string;
  };
}

export class MyMCPClient extends BaseMCPClient {
  async doSomething(params: MyToolParams): Promise<MyToolResult> {
    return await this.callTool("my_tool", params);
  }
}
```

### With Error Handling

```typescript
export class MyMCPClient extends BaseMCPClient {
  async doSomething(input: string): Promise<string> {
    try {
      const result = await this.callTool("my_tool", { input });
      return result.output;
    } catch (error) {
      if (error.message.includes("not found")) {
        throw new Error(`Input not found: ${input}`);
      }
      throw error;
    }
  }
}
```

### With Validation

```typescript
export class MyMCPClient extends BaseMCPClient {
  async doSomething(input: string): Promise<string> {
    if (!input || input.trim().length === 0) {
      throw new Error("Input cannot be empty");
    }

    if (input.length > 1000) {
      throw new Error("Input too long (max 1000 characters)");
    }

    const result = await this.callTool("my_tool", { input });
    return result.output;
  }
}
```

### Async Operations

```typescript
export class MyMCPClient extends BaseMCPClient {
  async startLongOperation(input: string): Promise<string> {
    // Start operation
    const result = await this.callTool("start_operation", { input });
    return result.operationId;
  }

  async checkOperationStatus(operationId: string): Promise<string> {
    const result = await this.callTool("check_status", { operationId });
    return result.status;
  }

  async waitForOperation(operationId: string): Promise<any> {
    while (true) {
      const status = await this.checkOperationStatus(operationId);

      if (status === "completed") {
        return await this.callTool("get_result", { operationId });
      }

      if (status === "failed") {
        throw new Error("Operation failed");
      }

      // Wait before checking again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
```

---

## Customizing Configuration

### Custom Configuration Type

```typescript
interface MyClientConfig extends MCPClientConfig {
  myExtension: {
    apiKey: string;
    endpoint: string;
    retryCount: number;
  };
}

export class MyMCPClient extends BaseMCPClient {
  private myConfig: MyClientConfig["myExtension"];

  constructor(
    outputChannel: vscode.LogOutputChannel,
    config: Partial<MyClientConfig>
  ) {
    super(outputChannel, config);

    this.myConfig = {
      apiKey: config.myExtension?.apiKey || "",
      endpoint: config.myExtension?.endpoint || "https://api.example.com",
      retryCount: config.myExtension?.retryCount || 3,
    };
  }

  protected getServerEnv() {
    return {
      ...process.env,
      API_KEY: this.myConfig.apiKey,
      API_ENDPOINT: this.myConfig.endpoint,
    };
  }
}
```

### Configuration Validation

```typescript
export class MyMCPClient extends BaseMCPClient {
  constructor(
    outputChannel: vscode.LogOutputChannel,
    config: Partial<MyClientConfig>
  ) {
    // Validate before calling super
    if (!config.myExtension?.apiKey) {
      throw new Error("API key is required");
    }

    super(outputChannel, config);
  }
}
```

### Dynamic Configuration

```typescript
export class MyMCPClient extends BaseMCPClient {
  updateConfiguration(newConfig: Partial<MyClientConfig>): void {
    if (newConfig.myExtension) {
      this.myConfig = { ...this.myConfig, ...newConfig.myExtension };
    }

    // Restart server with new config
    this.stop();
    this.start();
  }
}
```

---

## Handling Extension-Specific State

### State Management

```typescript
interface MyClientState {
  sessionId?: string;
  authenticated: boolean;
  lastSync: number;
}

export class MyMCPClient extends BaseMCPClient {
  private state: MyClientState = {
    authenticated: false,
    lastSync: 0,
  };

  protected async onServerReady() {
    // Authenticate
    const result = await this.callTool("authenticate", {
      apiKey: this.myConfig.apiKey,
    });

    this.state.sessionId = result.sessionId;
    this.state.authenticated = true;
    this.state.lastSync = Date.now();
  }

  getState(): Readonly<MyClientState> {
    return { ...this.state };
  }

  isAuthenticated(): boolean {
    return this.state.authenticated;
  }
}
```

### State Persistence

```typescript
export class MyMCPClient extends BaseMCPClient {
  private context: vscode.ExtensionContext;

  constructor(
    outputChannel: vscode.LogOutputChannel,
    context: vscode.ExtensionContext
  ) {
    super(outputChannel);
    this.context = context;
    this.loadState();
  }

  private loadState(): void {
    const saved = this.context.globalState.get<MyClientState>("myClientState");
    if (saved) {
      this.state = saved;
    }
  }

  private async saveState(): Promise<void> {
    await this.context.globalState.update("myClientState", this.state);
  }

  async doSomething(input: string): Promise<string> {
    const result = await this.callTool("my_tool", { input });

    // Update and save state
    this.state.lastSync = Date.now();
    await this.saveState();

    return result.output;
  }
}
```

---

## Advanced Patterns

### Custom Timeout Logic

```typescript
export class MyMCPClient extends BaseMCPClient {
  async slowOperation(input: string): Promise<string> {
    // Use custom timeout for this specific operation
    const result = await this.sendRequest(
      "tools/call",
      {
        name: "slow_tool",
        arguments: { input },
      },
      120000 // 2 minute timeout
    );

    return result.content[0].text;
  }
}
```

### Custom Error Handling

```typescript
export class MyMCPClient extends BaseMCPClient {
  protected async handleServerError(error: Error): void {
    // Call base implementation
    super.handleServerError(error);

    // Extension-specific error handling
    if (error.message.includes("authentication")) {
      vscode.window
        .showErrorMessage(
          "Authentication failed. Please check your API key.",
          "Open Settings"
        )
        .then((selection) => {
          if (selection === "Open Settings") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "myExtension.apiKey"
            );
          }
        });
    }
  }
}
```

### Progress Reporting

```typescript
export class MyMCPClient extends BaseMCPClient {
  async doLongOperation(input: string): Promise<string> {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Processing...",
        cancellable: true,
      },
      async (progress, token) => {
        // Check for cancellation
        token.onCancellationRequested(() => {
          this.sendNotification("cancel_operation", {});
        });

        // Report progress
        progress.report({ increment: 0, message: "Starting..." });

        const result = await this.callTool("long_operation", { input });

        progress.report({ increment: 100, message: "Complete!" });

        return result.output;
      }
    );
  }
}
```

### Caching

```typescript
export class MyMCPClient extends BaseMCPClient {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTTL = 60000; // 1 minute

  async getCachedData(key: string): Promise<any> {
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const data = await this.callTool("get_data", { key });
    this.cache.set(key, { data, timestamp: Date.now() });

    return data;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
```

---

## Best Practices

### 1. Always Call Super Constructor

```typescript
constructor(outputChannel: vscode.LogOutputChannel, config?: Partial<MCPClientConfig>) {
  super(outputChannel, config);  // Always call super first
  // Then do extension-specific initialization
}
```

### 2. Handle Errors Gracefully

```typescript
async doSomething(input: string): Promise<string> {
  try {
    return await this.callTool('my_tool', { input });
  } catch (error) {
    // Log error
    this.outputChannel.error(`Failed to do something: ${error.message}`);

    // Provide user-friendly error
    throw new Error(`Operation failed: ${error.message}`);
  }
}
```

### 3. Validate Inputs

```typescript
async doSomething(input: string): Promise<string> {
  if (!input) {
    throw new Error('Input is required');
  }

  return await this.callTool('my_tool', { input });
}
```

### 4. Use Type Safety

```typescript
interface MyParams {
  input: string;
  options?: MyOptions;
}

interface MyResult {
  output: string;
  metadata: MyMetadata;
}

async doSomething(params: MyParams): Promise<MyResult> {
  return await this.callTool('my_tool', params);
}
```

### 5. Document Public Methods

```typescript
/**
 * Processes the input and returns the result.
 *
 * @param input - The input string to process
 * @returns The processed output
 * @throws Error if input is invalid or processing fails
 */
async doSomething(input: string): Promise<string> {
  return await this.callTool('my_tool', { input });
}
```

### 6. Clean Up Resources

```typescript
stop(): void {
  // Clean up extension-specific resources
  this.cache.clear();
  this.cancelPendingOperations();

  // Call base implementation
  super.stop();
}
```

### 7. Test Your Extension

```typescript
describe("MyMCPClient", () => {
  let client: MyMCPClient;
  let outputChannel: vscode.LogOutputChannel;

  beforeEach(() => {
    outputChannel = vscode.window.createOutputChannel("Test", { log: true });
    client = new MyMCPClient(outputChannel);
  });

  afterEach(() => {
    client.stop();
  });

  it("should do something", async () => {
    await client.start();
    const result = await client.doSomething("test");
    expect(result).toBe("expected");
  });
});
```

### 8. Monitor Connection State

```typescript
constructor(outputChannel: vscode.LogOutputChannel) {
  super(outputChannel);

  // Monitor connection state
  this.onStateChange((status) => {
    if (status.state === 'ERROR') {
      vscode.window.showErrorMessage(`Connection error: ${status.message}`);
    }
  });
}
```

### 9. Provide Diagnostic Information

```typescript
getDiagnosticInfo(): any {
  return {
    ...super.getDiagnostics(),
    extensionSpecific: {
      cacheSize: this.cache.size,
      authenticated: this.state.authenticated,
      lastSync: this.state.lastSync,
    },
  };
}
```

### 10. Use Semantic Versioning

When publishing your extension, follow semantic versioning:

- Major version: Breaking changes
- Minor version: New features (backward compatible)
- Patch version: Bug fixes

```json
{
  "name": "@my-org/my-mcp-client",
  "version": "1.2.3",
  "peerDependencies": {
    "@ai-capabilities-suite/mcp-client-base": "^1.0.0"
  }
}
```

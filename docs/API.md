# API Reference

Complete API documentation for `@ai-capabilities-suite/mcp-client-base`.

## Table of Contents

- [BaseMCPClient](#basemcpclient)
- [TimeoutManager](#timeoutmanager)
- [ConnectionStateManager](#connectionstatemanager)
- [ReSyncManager](#resyncmanager)
- [DiagnosticCommands](#diagnosticcommands)
- [Types](#types)

---

## BaseMCPClient

Abstract base class for MCP clients. All extension-specific clients should extend this class.

### Constructor

```typescript
constructor(
  outputChannel: vscode.LogOutputChannel,
  config?: Partial<MCPClientConfig>
)
```

**Parameters:**

- `outputChannel` - VSCode output channel for logging
- `config` - Optional partial configuration (merged with defaults)

**Example:**

```typescript
const client = new MyMCPClient(outputChannel, {
  timeout: {
    initializationTimeoutMs: 90000,
  },
});
```

### Lifecycle Methods

#### `async start(): Promise<void>`

Starts the MCP server process and initializes the connection.

**Behavior:**

1. Updates state to `CONNECTING`
2. Spawns server process using `getServerCommand()` and `getServerEnv()`
3. Sends `initialize` request
4. Calls `onServerReady()` when initialization succeeds
5. Updates state to `CONNECTED`

**Throws:**

- Error if server fails to spawn
- Error if initialization times out (after re-sync attempts)

**Example:**

```typescript
try {
  await client.start();
  console.log("Client started successfully");
} catch (error) {
  console.error("Failed to start client:", error);
}
```

#### `stop(): void`

Stops the MCP server process and cleans up resources.

**Behavior:**

1. Clears all pending requests
2. Kills server process
3. Updates state to `DISCONNECTED`
4. Removes all event listeners

**Example:**

```typescript
client.stop();
```

#### `async reconnect(): Promise<boolean>`

Attempts to reconnect to the server.

**Returns:** `true` if reconnection succeeded, `false` otherwise

**Behavior:**

1. Stops current connection
2. Waits 500ms for cleanup
3. Starts new connection
4. Returns success status

**Example:**

```typescript
const success = await client.reconnect();
if (success) {
  console.log("Reconnected successfully");
} else {
  console.error("Reconnection failed");
}
```

### Abstract Methods (Must Implement)

#### `protected abstract getServerCommand(): { command: string; args: string[] }`

Returns the command and arguments to spawn the MCP server.

**Returns:** Object with `command` and `args` properties

**Example:**

```typescript
protected getServerCommand() {
  return {
    command: 'npx',
    args: ['-y', '@my-org/my-mcp-server'],
  };
}
```

#### `protected abstract getServerEnv(): Record<string, string>`

Returns environment variables for the server process.

**Returns:** Object with environment variable key-value pairs

**Example:**

```typescript
protected getServerEnv() {
  return {
    ...process.env,
    MY_SERVER_CONFIG: JSON.stringify(this.config),
  };
}
```

#### `protected abstract onServerReady(): Promise<void>`

Called when the server is ready and initialized. Use this for extension-specific initialization.

**Example:**

```typescript
protected async onServerReady() {
  // Verify server is working
  await this.callTool('health_check', {});

  // Load initial data
  await this.callTool('load_data', {});
}
```

### Request Methods

#### `protected async sendRequest(method: string, params: any, customTimeout?: number): Promise<any>`

Sends a JSON-RPC request to the server.

**Parameters:**

- `method` - JSON-RPC method name
- `params` - Request parameters
- `customTimeout` - Optional custom timeout in milliseconds

**Returns:** Response from server

**Throws:** Error if request times out or fails

**Example:**

```typescript
const result = await this.sendRequest("my_method", { param: "value" });
```

#### `protected async sendNotification(method: string, params: any): Promise<void>`

Sends a JSON-RPC notification (no response expected).

**Parameters:**

- `method` - JSON-RPC method name
- `params` - Notification parameters

**Example:**

```typescript
await this.sendNotification("status_update", { status: "ready" });
```

#### `protected async callTool(name: string, args: any): Promise<any>`

Calls an MCP tool (convenience wrapper for `tools/call` request).

**Parameters:**

- `name` - Tool name
- `args` - Tool arguments

**Returns:** Tool result

**Example:**

```typescript
const result = await this.callTool("my_tool", { input: "data" });
```

### Connection Management

#### `getConnectionStatus(): ConnectionStatus`

Gets the current connection status.

**Returns:** `ConnectionStatus` object with state, message, and metadata

**Example:**

```typescript
const status = client.getConnectionStatus();
console.log(`State: ${status.state}`);
console.log(`Message: ${status.message}`);
console.log(`Server Running: ${status.serverProcessRunning}`);
```

#### `onStateChange(listener: (status: ConnectionStatus) => void): vscode.Disposable`

Subscribes to connection state changes.

**Parameters:**

- `listener` - Callback function called when state changes

**Returns:** Disposable to unsubscribe

**Example:**

```typescript
const disposable = client.onStateChange((status) => {
  if (status.state === "ERROR") {
    vscode.window.showErrorMessage(`Connection error: ${status.message}`);
  }
});

// Later: cleanup
disposable.dispose();
```

#### `getDiagnostics(): ServerDiagnostics`

Gets detailed diagnostic information.

**Returns:** `ServerDiagnostics` object with process info, pending requests, logs, etc.

**Example:**

```typescript
const diag = client.getDiagnostics();
console.log(`Process ID: ${diag.processId}`);
console.log(`Pending Requests: ${diag.pendingRequestCount}`);
console.log(`Recent Communication:`, diag.recentCommunication);
```

#### `isServerProcessAlive(): boolean`

Checks if the server process is still running.

**Returns:** `true` if process is alive, `false` otherwise

**Example:**

```typescript
if (!client.isServerProcessAlive()) {
  console.error("Server process has died");
  await client.reconnect();
}
```

---

## TimeoutManager

Manages timeout configuration and selection for different request types.

### Constructor

```typescript
constructor(config?: Partial<TimeoutConfig>)
```

**Parameters:**

- `config` - Optional partial timeout configuration

### Methods

#### `getTimeoutForRequest(method: string): number`

Gets the appropriate timeout for a request method.

**Parameters:**

- `method` - JSON-RPC method name

**Returns:** Timeout in milliseconds

**Behavior:**

- `initialize` → `initializationTimeoutMs`
- `tools/list` → `toolsListTimeoutMs`
- All others → `standardRequestTimeoutMs`

**Example:**

```typescript
const timeout = timeoutManager.getTimeoutForRequest("initialize");
console.log(`Timeout: ${timeout}ms`);
```

#### `validateConfig(config: Partial<TimeoutConfig>): ValidationResult`

Validates timeout configuration.

**Parameters:**

- `config` - Configuration to validate

**Returns:** `ValidationResult` with `valid`, `errors`, and `warnings`

**Validation Rules:**

- All timeouts must be positive numbers
- Initialization timeout should be ≥ standard timeout
- Tools list timeout should be ≥ standard timeout

**Example:**

```typescript
const result = timeoutManager.validateConfig({
  initializationTimeoutMs: 60000,
  standardRequestTimeoutMs: 30000,
});

if (!result.valid) {
  console.error("Invalid config:", result.errors);
}
```

#### `updateConfig(config: Partial<TimeoutConfig>): void`

Updates timeout configuration.

**Parameters:**

- `config` - New configuration (merged with existing)

**Throws:** Error if configuration is invalid

**Example:**

```typescript
timeoutManager.updateConfig({
  standardRequestTimeoutMs: 45000,
});
```

#### `getConfig(): TimeoutConfig`

Gets the current timeout configuration.

**Returns:** Complete `TimeoutConfig` object

**Example:**

```typescript
const config = timeoutManager.getConfig();
console.log(`Init timeout: ${config.initializationTimeoutMs}ms`);
```

---

## ConnectionStateManager

Manages connection state tracking and notifications.

### Constructor

```typescript
constructor();
```

### Methods

#### `getStatus(): ConnectionStatus`

Gets the current connection status.

**Returns:** `ConnectionStatus` object

**Example:**

```typescript
const status = stateManager.getStatus();
console.log(`Current state: ${status.state}`);
```

#### `setState(state: ConnectionState, details?: Partial<ConnectionStatus>): void`

Updates the connection state.

**Parameters:**

- `state` - New connection state
- `details` - Optional additional status details

**Behavior:**

- Validates state transition
- Updates timestamp
- Notifies all listeners
- Adds to state history

**Example:**

```typescript
stateManager.setState(ConnectionState.CONNECTED, {
  message: "Successfully connected to server",
});
```

#### `onStateChange(listener: (status: ConnectionStatus) => void): vscode.Disposable`

Subscribes to state changes.

**Parameters:**

- `listener` - Callback function

**Returns:** Disposable to unsubscribe

**Example:**

```typescript
const disposable = stateManager.onStateChange((status) => {
  console.log(`State changed to: ${status.state}`);
});
```

#### `getHistory(limit?: number): ConnectionStatus[]`

Gets state change history.

**Parameters:**

- `limit` - Optional maximum number of entries (default: all)

**Returns:** Array of `ConnectionStatus` objects

**Example:**

```typescript
const history = stateManager.getHistory(5);
for (const status of history) {
  console.log(`[${new Date(status.timestamp).toISOString()}] ${status.state}`);
}
```

#### `isServerProcessRunning(): boolean`

Checks if server process is marked as running.

**Returns:** `true` if running, `false` otherwise

#### `setServerProcessRunning(running: boolean): void`

Updates server process running status.

**Parameters:**

- `running` - Whether process is running

---

## ReSyncManager

Manages automatic re-synchronization with exponential backoff.

### Constructor

```typescript
constructor(config?: Partial<ReSyncConfig>)
```

**Parameters:**

- `config` - Optional partial re-sync configuration

### Methods

#### `async attemptReSync(sendInitialize: () => Promise<void>, stateManager: ConnectionStateManager): Promise<ReSyncResult>`

Attempts re-synchronization with exponential backoff.

**Parameters:**

- `sendInitialize` - Function to send initialize request
- `stateManager` - Connection state manager

**Returns:** `ReSyncResult` with success status and attempt count

**Behavior:**

1. Updates state to `TIMEOUT_RETRYING`
2. Attempts re-sync up to `maxRetries` times
3. Uses exponential backoff between attempts
4. Updates state to `CONNECTED` on success or `ERROR` on failure

**Example:**

```typescript
const result = await reSyncManager.attemptReSync(
  async () => await client.sendRequest("initialize", {}),
  stateManager
);

if (result.success) {
  console.log(`Re-synced after ${result.attempts} attempts`);
} else {
  console.error("Re-sync failed:", result.error);
}
```

#### `reset(): void`

Resets retry counter.

**Example:**

```typescript
reSyncManager.reset();
```

#### `shouldRetry(): boolean`

Checks if more retries are available.

**Returns:** `true` if can retry, `false` if max retries reached

**Example:**

```typescript
if (reSyncManager.shouldRetry()) {
  await reSyncManager.attemptReSync(...);
}
```

#### `getNextRetryDelay(): number`

Calculates next retry delay using exponential backoff.

**Returns:** Delay in milliseconds

**Formula:** `retryDelayMs * (backoffMultiplier ^ currentAttempt)`

**Example:**

```typescript
const delay = reSyncManager.getNextRetryDelay();
console.log(`Next retry in ${delay}ms`);
```

#### `getCurrentAttempt(): number`

Gets current retry attempt number.

**Returns:** Attempt number (0-based)

---

## DiagnosticCommands

Provides diagnostic and troubleshooting commands for MCP extensions.

### Methods

#### `registerExtension(info: ExtensionInfo): void`

Registers an extension with the diagnostic system.

**Parameters:**

- `info` - Extension information (name, displayName, client)

**Example:**

```typescript
diagnosticCommands.registerExtension({
  name: "my-extension",
  displayName: "My Extension",
  client: myClient,
});
```

#### `unregisterExtension(name: string): void`

Unregisters an extension.

**Parameters:**

- `name` - Extension name

#### `async reconnectToServer(extensionName: string): Promise<boolean>`

Reconnects to server for a specific extension.

**Parameters:**

- `extensionName` - Extension name

**Returns:** `true` if reconnection succeeded

**Example:**

```typescript
const success = await diagnosticCommands.reconnectToServer("my-extension");
```

#### `async restartServer(extensionName: string): Promise<void>`

Restarts server for a specific extension.

**Parameters:**

- `extensionName` - Extension name

**Example:**

```typescript
await diagnosticCommands.restartServer("my-extension");
```

#### `getDiagnostics(extensionName: string): ServerDiagnostics`

Gets diagnostics for a specific extension.

**Parameters:**

- `extensionName` - Extension name

**Returns:** `ServerDiagnostics` object

#### `getAllDiagnostics(): Map<string, ServerDiagnostics>`

Gets diagnostics for all registered extensions.

**Returns:** Map of extension name to diagnostics

#### `formatDiagnostics(diagnostics: ServerDiagnostics): string`

Formats diagnostics as human-readable string.

**Parameters:**

- `diagnostics` - Diagnostics to format

**Returns:** Formatted string

#### `formatAllDiagnostics(): string`

Formats all diagnostics as human-readable string.

**Returns:** Formatted string with summary table and details

#### `getRegisteredExtensions(): string[]`

Gets list of registered extension names.

**Returns:** Array of extension names

---

## Types

### TimeoutConfig

```typescript
interface TimeoutConfig {
  initializationTimeoutMs: number; // Default: 60000
  standardRequestTimeoutMs: number; // Default: 30000
  toolsListTimeoutMs: number; // Default: 60000
}
```

### ReSyncConfig

```typescript
interface ReSyncConfig {
  maxRetries: number; // Default: 3
  retryDelayMs: number; // Default: 2000
  backoffMultiplier: number; // Default: 1.5
}
```

### MCPClientConfig

```typescript
interface MCPClientConfig {
  timeout: TimeoutConfig;
  reSync: ReSyncConfig;
  logging: {
    logLevel: "debug" | "info" | "warn" | "error";
    logCommunication: boolean;
  };
}
```

### ConnectionState

```typescript
enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  TIMEOUT_RETRYING = "timeout_retrying",
  ERROR = "error",
}
```

### ConnectionStatus

```typescript
interface ConnectionStatus {
  state: ConnectionState;
  message: string;
  retryCount?: number;
  lastError?: Error;
  serverProcessRunning: boolean;
  timestamp: number;
}
```

### ServerDiagnostics

```typescript
interface ServerDiagnostics {
  extensionName: string;
  processId?: number;
  processRunning: boolean;
  connectionState: ConnectionState;
  pendingRequestCount: number;
  pendingRequests: Array<{
    id: number;
    method: string;
    elapsedMs: number;
  }>;
  lastError?: {
    message: string;
    timestamp: number;
  };
  recentCommunication: CommunicationLogEntry[];
  stateHistory: ConnectionStatus[];
}
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

### ReSyncResult

```typescript
interface ReSyncResult {
  success: boolean;
  attempts: number;
  error?: Error;
}
```

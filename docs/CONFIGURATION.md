# Configuration Guide

Complete guide to configuring timeout and re-synchronization behavior for MCP clients.

## Table of Contents

- [Overview](#overview)
- [Timeout Configuration](#timeout-configuration)
- [Re-synchronization Configuration](#re-synchronization-configuration)
- [Logging Configuration](#logging-configuration)
- [Complete Configuration Example](#complete-configuration-example)
- [Configuration Validation](#configuration-validation)
- [Dynamic Configuration Updates](#dynamic-configuration-updates)
- [Best Practices](#best-practices)

---

## Overview

`BaseMCPClient` accepts a configuration object that controls:

- **Timeouts** - How long to wait for different types of requests
- **Re-synchronization** - How to handle timeouts and retry logic
- **Logging** - What to log and at what level

All configuration is optional - sensible defaults are provided.

---

## Timeout Configuration

### Default Values

```typescript
{
  timeout: {
    initializationTimeoutMs: 60000,   // 60 seconds
    standardRequestTimeoutMs: 30000,   // 30 seconds
    toolsListTimeoutMs: 60000,         // 60 seconds
  }
}
```

### Configuration Options

#### `initializationTimeoutMs`

Timeout for the `initialize` request sent when starting the server.

**Why it's longer:** Server initialization can involve:

- Installing dependencies
- Loading models or data
- Establishing connections
- Warming up caches

**Recommended values:**

- Fast servers: 30000ms (30s)
- Normal servers: 60000ms (60s) - **default**
- Slow servers: 120000ms (2min)
- Very slow servers: 300000ms (5min)

**Example:**

```typescript
const client = new MyMCPClient(outputChannel, {
  timeout: {
    initializationTimeoutMs: 120000, // 2 minutes for slow server
  },
});
```

#### `standardRequestTimeoutMs`

Timeout for regular tool calls and requests.

**Why it's shorter:** Normal operations should be fast. If they're not, something is wrong.

**Recommended values:**

- Fast operations: 10000ms (10s)
- Normal operations: 30000ms (30s) - **default**
- Slow operations: 60000ms (1min)

**Example:**

```typescript
const client = new MyMCPClient(outputChannel, {
  timeout: {
    standardRequestTimeoutMs: 45000, // 45 seconds for slower operations
  },
});
```

#### `toolsListTimeoutMs`

Timeout for the `tools/list` request that retrieves available tools.

**Why it's longer:** Tool discovery can involve:

- Scanning plugins
- Loading tool definitions
- Validating tool schemas

**Recommended values:**

- Simple servers: 30000ms (30s)
- Normal servers: 60000ms (60s) - **default**
- Complex servers: 120000ms (2min)

**Example:**

```typescript
const client = new MyMCPClient(outputChannel, {
  timeout: {
    toolsListTimeoutMs: 90000, // 90 seconds for complex tool discovery
  },
});
```

### Timeout Selection Logic

The client automatically selects the appropriate timeout based on the request method:

| Request Method | Timeout Used               |
| -------------- | -------------------------- |
| `initialize`   | `initializationTimeoutMs`  |
| `tools/list`   | `toolsListTimeoutMs`       |
| All others     | `standardRequestTimeoutMs` |

### Custom Timeouts for Specific Requests

You can override the timeout for a specific request:

```typescript
// Use custom 2-minute timeout for this specific operation
const result = await this.sendRequest(
  "tools/call",
  { name: "slow_tool", arguments: {} },
  120000 // Custom timeout in milliseconds
);
```

---

## Re-synchronization Configuration

### Default Values

```typescript
{
  reSync: {
    maxRetries: 3,              // 3 retry attempts
    retryDelayMs: 2000,         // 2 second initial delay
    backoffMultiplier: 1.5,     // 1.5x backoff multiplier
  }
}
```

### Configuration Options

#### `maxRetries`

Maximum number of re-synchronization attempts after a timeout.

**How it works:**

1. Initial request times out
2. Attempt 1: Re-send initialize
3. Attempt 2: Re-send initialize (if attempt 1 fails)
4. Attempt 3: Re-send initialize (if attempt 2 fails)
5. Give up and report error

**Recommended values:**

- Reliable networks: 2-3 retries - **default: 3**
- Unreliable networks: 5-7 retries
- No retries: 0 (fail immediately)

**Example:**

```typescript
const client = new MyMCPClient(outputChannel, {
  reSync: {
    maxRetries: 5, // More retries for unreliable connection
  },
});
```

#### `retryDelayMs`

Initial delay before the first retry attempt.

**How it works:**

- After timeout, wait `retryDelayMs` before retry 1
- Before retry 2, wait `retryDelayMs * backoffMultiplier`
- Before retry 3, wait `retryDelayMs * backoffMultiplier^2`

**Recommended values:**

- Fast retry: 1000ms (1s)
- Normal retry: 2000ms (2s) - **default**
- Slow retry: 5000ms (5s)

**Example:**

```typescript
const client = new MyMCPClient(outputChannel, {
  reSync: {
    retryDelayMs: 1000, // Retry faster
  },
});
```

#### `backoffMultiplier`

Multiplier for exponential backoff between retries.

**How it works:**

- Retry 1 delay: `retryDelayMs`
- Retry 2 delay: `retryDelayMs * backoffMultiplier`
- Retry 3 delay: `retryDelayMs * backoffMultiplier^2`

**Recommended values:**

- Linear backoff: 1.0 (same delay each time)
- Moderate backoff: 1.5 - **default**
- Aggressive backoff: 2.0 (double each time)

**Example:**

```typescript
const client = new MyMCPClient(outputChannel, {
  reSync: {
    backoffMultiplier: 2.0, // Double delay each retry
  },
});
```

### Retry Delay Examples

With default configuration (`retryDelayMs: 2000`, `backoffMultiplier: 1.5`):

- Retry 1: Wait 2000ms (2s)
- Retry 2: Wait 3000ms (3s)
- Retry 3: Wait 4500ms (4.5s)
- **Total time:** ~9.5 seconds

With aggressive configuration (`retryDelayMs: 1000`, `backoffMultiplier: 2.0`):

- Retry 1: Wait 1000ms (1s)
- Retry 2: Wait 2000ms (2s)
- Retry 3: Wait 4000ms (4s)
- **Total time:** ~7 seconds

With slow configuration (`retryDelayMs: 5000`, `backoffMultiplier: 1.5`):

- Retry 1: Wait 5000ms (5s)
- Retry 2: Wait 7500ms (7.5s)
- Retry 3: Wait 11250ms (11.25s)
- **Total time:** ~23.75 seconds

---

## Logging Configuration

### Default Values

```typescript
{
  logging: {
    logLevel: 'info',           // info level
    logCommunication: true,     // log all communication
  }
}
```

### Configuration Options

#### `logLevel`

Controls what gets logged to the output channel.

**Levels:**

- `'debug'` - Everything (verbose)
- `'info'` - Normal operations - **default**
- `'warn'` - Warnings and errors only
- `'error'` - Errors only

**What gets logged at each level:**

| Level   | Logs                                                          |
| ------- | ------------------------------------------------------------- |
| `debug` | All JSON-RPC messages, state transitions, internal operations |
| `info`  | Connection events, requests, responses, retries               |
| `warn`  | Timeouts, retry attempts, configuration warnings              |
| `error` | Initialization failures, server crashes, unrecoverable errors |

**Example:**

```typescript
const client = new MyMCPClient(outputChannel, {
  logging: {
    logLevel: "debug", // Verbose logging for troubleshooting
  },
});
```

#### `logCommunication`

Controls whether JSON-RPC communication is logged.

**When `true`:**

- Logs all requests sent to server
- Logs all responses received from server
- Logs all notifications

**When `false`:**

- Only logs connection events and errors
- Reduces log noise for production

**Example:**

```typescript
const client = new MyMCPClient(outputChannel, {
  logging: {
    logCommunication: false, // Reduce log noise
  },
});
```

### Log Format

All logs follow this format:

```
[YYYY-MM-DDTHH:mm:ss.sssZ] [LEVEL] [ExtensionName] [RequestID?] Message
```

**Examples:**

```
[2025-12-19T10:30:45.123Z] [INFO] [MyExtension] Starting MCP server
[2025-12-19T10:30:45.456Z] [DEBUG] [MyExtension] [req-1] Sending request: initialize
[2025-12-19T10:30:45.789Z] [INFO] [MyExtension] [req-1] Received response: initialize (333ms)
[2025-12-19T10:31:15.890Z] [WARN] [MyExtension] [req-2] Request timeout after 30000ms: tools/list
[2025-12-19T10:31:15.891Z] [INFO] [MyExtension] Attempting re-synchronization (attempt 1/3)
```

---

## Complete Configuration Example

### Minimal Configuration (Use Defaults)

```typescript
const client = new MyMCPClient(outputChannel);
```

### Custom Configuration

```typescript
const client = new MyMCPClient(outputChannel, {
  timeout: {
    initializationTimeoutMs: 90000, // 90 seconds
    standardRequestTimeoutMs: 45000, // 45 seconds
    toolsListTimeoutMs: 90000, // 90 seconds
  },
  reSync: {
    maxRetries: 5, // 5 retry attempts
    retryDelayMs: 1000, // 1 second initial delay
    backoffMultiplier: 2.0, // Double each retry
  },
  logging: {
    logLevel: "debug", // Verbose logging
    logCommunication: true, // Log all communication
  },
});
```

### Production Configuration

```typescript
const client = new MyMCPClient(outputChannel, {
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
    logCommunication: false, // Reduce log noise
  },
});
```

### Development Configuration

```typescript
const client = new MyMCPClient(outputChannel, {
  timeout: {
    initializationTimeoutMs: 120000, // Longer for debugging
    standardRequestTimeoutMs: 60000, // Longer for debugging
    toolsListTimeoutMs: 120000,
  },
  reSync: {
    maxRetries: 1, // Fail fast during development
    retryDelayMs: 500,
    backoffMultiplier: 1.0,
  },
  logging: {
    logLevel: "debug", // Verbose logging
    logCommunication: true,
  },
});
```

---

## Configuration Validation

The client validates configuration when it's provided.

### Validation Rules

**Timeout Configuration:**

- All timeout values must be positive numbers
- `initializationTimeoutMs` should be ≥ `standardRequestTimeoutMs`
- `toolsListTimeoutMs` should be ≥ `standardRequestTimeoutMs`

**Re-sync Configuration:**

- `maxRetries` must be ≥ 0
- `retryDelayMs` must be > 0
- `backoffMultiplier` must be ≥ 1.0

**Logging Configuration:**

- `logLevel` must be one of: `'debug'`, `'info'`, `'warn'`, `'error'`
- `logCommunication` must be boolean

### Validation Example

```typescript
import { TimeoutManager } from "@ai-capabilities-suite/mcp-client-base";

const timeoutManager = new TimeoutManager();

const result = timeoutManager.validateConfig({
  initializationTimeoutMs: 60000,
  standardRequestTimeoutMs: 30000,
  toolsListTimeoutMs: 60000,
});

if (!result.valid) {
  console.error("Invalid configuration:");
  result.errors.forEach((error) => console.error(`  - ${error}`));
}

if (result.warnings.length > 0) {
  console.warn("Configuration warnings:");
  result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
}
```

### Invalid Configuration Examples

```typescript
// ❌ Negative timeout
{
  timeout: {
    standardRequestTimeoutMs: -1000,  // Error: must be positive
  }
}

// ❌ Init timeout shorter than standard
{
  timeout: {
    initializationTimeoutMs: 10000,   // Warning: should be ≥ standard
    standardRequestTimeoutMs: 30000,
  }
}

// ❌ Invalid backoff multiplier
{
  reSync: {
    backoffMultiplier: 0.5,  // Error: must be ≥ 1.0
  }
}

// ❌ Invalid log level
{
  logging: {
    logLevel: 'verbose',  // Error: must be debug/info/warn/error
  }
}
```

---

## Dynamic Configuration Updates

You can update timeout configuration at runtime:

```typescript
const client = new MyMCPClient(outputChannel);

// Start with default configuration
await client.start();

// Later: update timeout configuration
client.updateTimeoutConfig({
  standardRequestTimeoutMs: 45000, // Increase timeout
});

// Configuration is validated before applying
try {
  client.updateTimeoutConfig({
    standardRequestTimeoutMs: -1000, // Invalid
  });
} catch (error) {
  console.error("Invalid configuration:", error.message);
}
```

**Note:** Re-sync configuration cannot be updated at runtime. You must create a new client instance.

---

## Best Practices

### 1. Start with Defaults

Use default configuration unless you have a specific reason to change it:

```typescript
const client = new MyMCPClient(outputChannel);
```

### 2. Tune Based on Measurements

Measure actual server performance before adjusting timeouts:

```typescript
// Monitor initialization time
const start = Date.now();
await client.start();
const duration = Date.now() - start;
console.log(`Initialization took ${duration}ms`);

// If consistently > 60s, increase timeout
```

### 3. Use Environment-Specific Configuration

```typescript
const isDevelopment = process.env.NODE_ENV === "development";

const client = new MyMCPClient(outputChannel, {
  timeout: {
    initializationTimeoutMs: isDevelopment ? 120000 : 60000,
  },
  logging: {
    logLevel: isDevelopment ? "debug" : "info",
    logCommunication: isDevelopment,
  },
});
```

### 4. Document Custom Configuration

If you use non-default configuration, document why:

```typescript
const client = new MyMCPClient(outputChannel, {
  timeout: {
    // Increased to 2 minutes because our server loads a 500MB model
    initializationTimeoutMs: 120000,
  },
  reSync: {
    // Increased retries because we're on a flaky network
    maxRetries: 5,
  },
});
```

### 5. Validate Configuration in Tests

```typescript
describe("MyMCPClient configuration", () => {
  it("should use valid timeout configuration", () => {
    const timeoutManager = new TimeoutManager(myConfig.timeout);
    const result = timeoutManager.validateConfig(myConfig.timeout);
    expect(result.valid).toBe(true);
  });
});
```

### 6. Provide Configuration UI

For VSCode extensions, expose configuration in settings:

```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "myExtension.timeout.initialization": {
          "type": "number",
          "default": 60000,
          "description": "Timeout for server initialization (ms)"
        },
        "myExtension.timeout.standard": {
          "type": "number",
          "default": 30000,
          "description": "Timeout for standard requests (ms)"
        }
      }
    }
  }
}
```

Then read from settings:

```typescript
const config = vscode.workspace.getConfiguration("myExtension");

const client = new MyMCPClient(outputChannel, {
  timeout: {
    initializationTimeoutMs: config.get("timeout.initialization", 60000),
    standardRequestTimeoutMs: config.get("timeout.standard", 30000),
  },
});
```

### 7. Handle Configuration Errors Gracefully

```typescript
try {
  const client = new MyMCPClient(outputChannel, userConfig);
  await client.start();
} catch (error) {
  if (error.message.includes("Invalid configuration")) {
    vscode.window.showErrorMessage(
      "Invalid MCP client configuration. Using defaults.",
      "Open Settings"
    );

    // Fall back to defaults
    const client = new MyMCPClient(outputChannel);
    await client.start();
  }
}
```

### 8. Monitor and Adjust

Log timeout events and adjust configuration based on real-world usage:

```typescript
client.onStateChange((status) => {
  if (status.state === "TIMEOUT_RETRYING") {
    console.warn(`Timeout occurred, retry ${status.retryCount}`);

    // If timeouts are frequent, consider increasing timeout
    if (status.retryCount === 3) {
      console.warn("Consider increasing timeout configuration");
    }
  }
});
```

# Diagnostic Commands

Guide to using diagnostic and troubleshooting commands for MCP clients.

## Table of Contents

- [Overview](#overview)
- [Registering Extensions](#registering-extensions)
- [Diagnostic Commands](#diagnostic-commands)
- [Diagnostic Information](#diagnostic-information)
- [VSCode Integration](#vscode-integration)
- [Command Line Usage](#command-line-usage)
- [Troubleshooting Workflows](#troubleshooting-workflows)

---

## Overview

The `DiagnosticCommands` class provides consistent diagnostic and troubleshooting capabilities across all MCP extensions. It allows you to:

- Reconnect to servers
- Restart servers
- View detailed diagnostics
- Monitor connection status across all extensions

---

## Registering Extensions

Before using diagnostic commands, register your extension:

```typescript
import { diagnosticCommands } from "@ai-capabilities-suite/mcp-client-base";

// Register your extension
diagnosticCommands.registerExtension({
  name: "my-extension",
  displayName: "My Extension",
  client: myClient,
});
```

### Registration in Extension Activation

```typescript
export async function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("My Extension", {
    log: true,
  });
  const client = new MyMCPClient(outputChannel);

  // Register with diagnostic system
  diagnosticCommands.registerExtension({
    name: "my-extension",
    displayName: "My Extension",
    client: client,
  });

  // Start the client
  await client.start();

  // Unregister on deactivation
  context.subscriptions.push({
    dispose: () => {
      diagnosticCommands.unregisterExtension("my-extension");
      client.stop();
    },
  });
}
```

---

## Diagnostic Commands

### Reconnect to Server

Attempts to reconnect to the server for a specific extension.

```typescript
const success = await diagnosticCommands.reconnectToServer("my-extension");

if (success) {
  console.log("Reconnected successfully");
} else {
  console.error("Reconnection failed");
}
```

**When to use:**

- Server is unresponsive
- Connection was lost
- After network issues

**What it does:**

1. Stops current connection
2. Waits for cleanup
3. Starts new connection
4. Returns success status

### Restart Server

Restarts the server process for a specific extension.

```typescript
await diagnosticCommands.restartServer("my-extension");
console.log("Server restarted");
```

**When to use:**

- Server is in a bad state
- After configuration changes
- Server is hung or frozen

**What it does:**

1. Stops server process
2. Waits 500ms for cleanup
3. Starts new server process
4. Initializes connection

### Get Diagnostics

Gets detailed diagnostic information for a specific extension.

```typescript
const diag = diagnosticCommands.getDiagnostics("my-extension");

console.log(`Connection State: ${diag.connectionState}`);
console.log(`Process Running: ${diag.processRunning}`);
console.log(`Pending Requests: ${diag.pendingRequestCount}`);
```

**Returns:** `ServerDiagnostics` object with:

- Extension name
- Process ID (if running)
- Connection state
- Pending requests
- Last error
- Recent communication logs
- State history

### Get All Diagnostics

Gets diagnostics for all registered extensions.

```typescript
const allDiag = diagnosticCommands.getAllDiagnostics();

for (const [name, diag] of allDiag) {
  console.log(`${name}: ${diag.connectionState}`);
}
```

**Returns:** Map of extension name to `ServerDiagnostics`

### Format Diagnostics

Formats diagnostics as a human-readable string.

```typescript
const diag = diagnosticCommands.getDiagnostics("my-extension");
const formatted = diagnosticCommands.formatDiagnostics(diag);

console.log(formatted);
```

**Output example:**

```
=== My Extension Diagnostics ===

Connection State: connected
Process Running: Yes
Process ID: 12345

Pending Requests: 2

Active Requests:
  - [1] tools/list (1234ms elapsed)
  - [2] tools/call (567ms elapsed)

Recent Communication (last 10):
  ✓ [2025-12-19T10:30:45.123Z] request: initialize
  ✓ [2025-12-19T10:30:45.456Z] response: initialize
  ✓ [2025-12-19T10:30:46.789Z] request: tools/list
  ✗ [2025-12-19T10:31:16.890Z] request: tools/call

State History (last 5):
  [2025-12-19T10:30:44.000Z] connecting: Starting server
  [2025-12-19T10:30:45.500Z] connected: Server ready
```

### Format All Diagnostics

Formats diagnostics for all extensions.

```typescript
const formatted = diagnosticCommands.formatAllDiagnostics();
console.log(formatted);
```

**Output example:**

```
================================================================================
MCP ACS Extensions Status
================================================================================

Extension Summary:

Extension                     State               Process        Pending
--------------------------------------------------------------------------------
Process Extension             connected           PID 12345      0
Screenshot Extension          connected           PID 12346      1
Debugger Extension            timeout_retrying    PID 12347      2

================================================================================

=== Process Extension Diagnostics ===
...

================================================================================

=== Screenshot Extension Diagnostics ===
...

================================================================================
```

---

## Diagnostic Information

### ServerDiagnostics Structure

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

### Connection States

- `disconnected` - Not connected to server
- `connecting` - Attempting to establish connection
- `connected` - Successfully connected and ready
- `timeout_retrying` - Timeout occurred, attempting re-synchronization
- `error` - Unrecoverable error occurred

### Interpreting Diagnostics

#### Healthy Connection

```
Connection State: connected
Process Running: Yes
Process ID: 12345
Pending Requests: 0
```

**Indicators:**

- State is `connected`
- Process is running
- No pending requests (or few)
- No recent errors

#### Connection Issues

```
Connection State: timeout_retrying
Process Running: Yes
Process ID: 12345
Pending Requests: 3
Last Error: Request timeout after 30000ms
```

**Indicators:**

- State is `timeout_retrying`
- Process is running but unresponsive
- Multiple pending requests
- Recent timeout errors

**Action:** Wait for re-sync to complete, or restart server

#### Server Crash

```
Connection State: error
Process Running: No
Pending Requests: 0
Last Error: Server process exited with code 1
```

**Indicators:**

- State is `error`
- Process is not running
- No pending requests
- Exit error in logs

**Action:** Check server logs, restart server

---

## VSCode Integration

### Register Commands

Register diagnostic commands in your extension:

```typescript
export function activate(context: vscode.ExtensionContext) {
  // ... create and register client ...

  // Reconnect command
  context.subscriptions.push(
    vscode.commands.registerCommand("myExtension.reconnect", async () => {
      try {
        const success = await diagnosticCommands.reconnectToServer(
          "my-extension"
        );
        if (success) {
          vscode.window.showInformationMessage("Reconnected successfully");
        } else {
          vscode.window.showErrorMessage("Reconnection failed");
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Reconnection error: ${error.message}`);
      }
    })
  );

  // Restart command
  context.subscriptions.push(
    vscode.commands.registerCommand("myExtension.restart", async () => {
      try {
        await diagnosticCommands.restartServer("my-extension");
        vscode.window.showInformationMessage("Server restarted");
      } catch (error) {
        vscode.window.showErrorMessage(`Restart error: ${error.message}`);
      }
    })
  );

  // Show diagnostics command
  context.subscriptions.push(
    vscode.commands.registerCommand("myExtension.showDiagnostics", () => {
      const diag = diagnosticCommands.getDiagnostics("my-extension");
      const formatted = diagnosticCommands.formatDiagnostics(diag);

      const panel = vscode.window.createWebviewPanel(
        "mcpDiagnostics",
        "MCP Diagnostics",
        vscode.ViewColumn.One,
        {}
      );

      panel.webview.html = `
        <html>
          <body>
            <pre>${formatted}</pre>
          </body>
        </html>
      `;
    })
  );

  // Show all status command
  context.subscriptions.push(
    vscode.commands.registerCommand("myExtension.showAllStatus", () => {
      const formatted = diagnosticCommands.formatAllDiagnostics();

      const panel = vscode.window.createWebviewPanel(
        "mcpAllStatus",
        "All MCP Extensions Status",
        vscode.ViewColumn.One,
        {}
      );

      panel.webview.html = `
        <html>
          <body>
            <pre>${formatted}</pre>
          </body>
        </html>
      `;
    })
  );
}
```

### Add to package.json

```json
{
  "contributes": {
    "commands": [
      {
        "command": "myExtension.reconnect",
        "title": "Reconnect to Server",
        "category": "My Extension"
      },
      {
        "command": "myExtension.restart",
        "title": "Restart Server",
        "category": "My Extension"
      },
      {
        "command": "myExtension.showDiagnostics",
        "title": "Show Diagnostics",
        "category": "My Extension"
      },
      {
        "command": "myExtension.showAllStatus",
        "title": "Show All MCP Status",
        "category": "My Extension"
      }
    ]
  }
}
```

### Status Bar Integration

Show connection status in status bar:

```typescript
const statusBarItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100
);

client.onStateChange((status) => {
  switch (status.state) {
    case "connected":
      statusBarItem.text = "$(check) My Extension";
      statusBarItem.backgroundColor = undefined;
      statusBarItem.command = "myExtension.showDiagnostics";
      break;

    case "connecting":
      statusBarItem.text = "$(sync~spin) My Extension";
      statusBarItem.backgroundColor = undefined;
      statusBarItem.command = undefined;
      break;

    case "timeout_retrying":
      statusBarItem.text = "$(warning) My Extension";
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
      statusBarItem.command = "myExtension.reconnect";
      break;

    case "error":
      statusBarItem.text = "$(error) My Extension";
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
      statusBarItem.command = "myExtension.restart";
      break;

    case "disconnected":
      statusBarItem.text = "$(circle-slash) My Extension";
      statusBarItem.backgroundColor = undefined;
      statusBarItem.command = "myExtension.restart";
      break;
  }
});

statusBarItem.show();
context.subscriptions.push(statusBarItem);
```

---

## Command Line Usage

### Node.js Script

```typescript
import { diagnosticCommands } from "@ai-capabilities-suite/mcp-client-base";
import { MyMCPClient } from "./myClient";

async function main() {
  const client = new MyMCPClient(console);

  diagnosticCommands.registerExtension({
    name: "my-extension",
    displayName: "My Extension",
    client: client,
  });

  await client.start();

  // Get diagnostics
  const diag = diagnosticCommands.getDiagnostics("my-extension");
  console.log(diagnosticCommands.formatDiagnostics(diag));

  // Reconnect if needed
  if (diag.connectionState !== "connected") {
    console.log("Reconnecting...");
    await diagnosticCommands.reconnectToServer("my-extension");
  }
}

main().catch(console.error);
```

### Testing Script

```typescript
import { diagnosticCommands } from "@ai-capabilities-suite/mcp-client-base";

async function testConnection() {
  const diag = diagnosticCommands.getDiagnostics("my-extension");

  if (diag.connectionState !== "connected") {
    console.error("Connection test failed");
    console.error(diagnosticCommands.formatDiagnostics(diag));
    process.exit(1);
  }

  console.log("Connection test passed");
  process.exit(0);
}

testConnection();
```

---

## Troubleshooting Workflows

### Workflow 1: Server Not Responding

**Symptoms:**

- Requests timing out
- State is `timeout_retrying`
- Process is running

**Steps:**

1. Check diagnostics:

   ```typescript
   const diag = diagnosticCommands.getDiagnostics("my-extension");
   console.log(diagnosticCommands.formatDiagnostics(diag));
   ```

2. Check pending requests:

   ```typescript
   if (diag.pendingRequestCount > 0) {
     console.log("Pending requests:", diag.pendingRequests);
   }
   ```

3. Try reconnecting:

   ```typescript
   await diagnosticCommands.reconnectToServer("my-extension");
   ```

4. If reconnect fails, restart:
   ```typescript
   await diagnosticCommands.restartServer("my-extension");
   ```

### Workflow 2: Server Crashed

**Symptoms:**

- State is `error`
- Process is not running
- Exit code in logs

**Steps:**

1. Check diagnostics:

   ```typescript
   const diag = diagnosticCommands.getDiagnostics("my-extension");
   console.log("Last error:", diag.lastError);
   ```

2. Check server logs:

   ```typescript
   // Look at output channel
   client.outputChannel.show();
   ```

3. Restart server:

   ```typescript
   await diagnosticCommands.restartServer("my-extension");
   ```

4. If restart fails, check configuration:
   ```typescript
   // Verify server command and environment
   console.log("Server command:", client.getServerCommand());
   console.log("Server env:", client.getServerEnv());
   ```

### Workflow 3: Slow Initialization

**Symptoms:**

- Initialization takes > 60 seconds
- Timeouts during startup
- State is `timeout_retrying`

**Steps:**

1. Check state history:

   ```typescript
   const diag = diagnosticCommands.getDiagnostics("my-extension");
   console.log("State history:", diag.stateHistory);
   ```

2. Measure initialization time:

   ```typescript
   const start = Date.now();
   await client.start();
   const duration = Date.now() - start;
   console.log(`Initialization took ${duration}ms`);
   ```

3. Increase timeout if needed:
   ```typescript
   const client = new MyMCPClient(outputChannel, {
     timeout: {
       initializationTimeoutMs: 120000, // 2 minutes
     },
   });
   ```

### Workflow 4: Multiple Extensions Failing

**Symptoms:**

- Multiple extensions in error state
- Network issues
- System resource issues

**Steps:**

1. Check all extensions:

   ```typescript
   const allDiag = diagnosticCommands.getAllDiagnostics();
   console.log(diagnosticCommands.formatAllDiagnostics());
   ```

2. Identify common issues:

   ```typescript
   for (const [name, diag] of allDiag) {
     if (diag.connectionState === "error") {
       console.log(`${name}: ${diag.lastError?.message}`);
     }
   }
   ```

3. Restart all failing extensions:
   ```typescript
   for (const [name, diag] of allDiag) {
     if (diag.connectionState === "error") {
       await diagnosticCommands.restartServer(name);
     }
   }
   ```

### Workflow 5: Debugging Communication Issues

**Symptoms:**

- Requests failing intermittently
- Unexpected responses
- Protocol errors

**Steps:**

1. Enable debug logging:

   ```typescript
   const client = new MyMCPClient(outputChannel, {
     logging: {
       logLevel: "debug",
       logCommunication: true,
     },
   });
   ```

2. Check recent communication:

   ```typescript
   const diag = diagnosticCommands.getDiagnostics("my-extension");
   console.log("Recent communication:", diag.recentCommunication);
   ```

3. Look for patterns:

   ```typescript
   const failed = diag.recentCommunication.filter((c) => !c.success);
   console.log("Failed communications:", failed);
   ```

4. Check for specific errors:
   ```typescript
   const errors = diag.recentCommunication
     .filter((c) => c.error)
     .map((c) => c.error);
   console.log("Errors:", errors);
   ```

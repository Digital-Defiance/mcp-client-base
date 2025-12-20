# Troubleshooting Guide

Common issues and solutions for MCP client connections.

## Table of Contents

- [Connection Issues](#connection-issues)
- [Timeout Issues](#timeout-issues)
- [Server Process Issues](#server-process-issues)
- [Performance Issues](#performance-issues)
- [Configuration Issues](#configuration-issues)
- [Platform-Specific Issues](#platform-specific-issues)
- [Debugging Tips](#debugging-tips)

---

## Connection Issues

### Issue: Cannot Connect to Server

**Symptoms:**

- Client fails to start
- State remains in `connecting`
- Error: "Server process exited"

**Possible Causes:**

1. Server executable not found
2. Missing dependencies
3. Permission issues
4. Port already in use

**Solutions:**

#### 1. Verify Server Command

```typescript
const client = new MyMCPClient(outputChannel);
console.log("Server command:", client.getServerCommand());
```

Check that:

- Command exists and is executable
- Arguments are correct
- Path is absolute or in PATH

#### 2. Check Server Logs

```typescript
// Look at output channel for server stderr
client.outputChannel.show();
```

Common errors:

- `command not found` → Install server or fix PATH
- `permission denied` → Make executable: `chmod +x server`
- `module not found` → Install dependencies: `npm install`

#### 3. Test Server Manually

```bash
# Try running server command directly
npx -y @my-org/my-mcp-server

# Or with node
node /path/to/server/index.js
```

#### 4. Check Environment

```typescript
const env = client.getServerEnv();
console.log("Server environment:", env);
```

Verify:

- PATH includes necessary directories
- Required environment variables are set
- No conflicting variables

### Issue: Connection Drops Randomly

**Symptoms:**

- Client connects successfully
- Connection drops after some time
- State changes to `disconnected`

**Possible Causes:**

1. Server crashes
2. Network issues
3. Resource exhaustion
4. Idle timeout

**Solutions:**

#### 1. Monitor Server Process

```typescript
client.onStateChange((status) => {
  if (status.state === "disconnected") {
    console.log("Connection dropped");
    console.log("Server running:", status.serverProcessRunning);

    if (!status.serverProcessRunning) {
      console.log("Server process died");
      // Check server logs for crash reason
    }
  }
});
```

#### 2. Check Server Logs

Look for:

- Uncaught exceptions
- Out of memory errors
- Segmentation faults
- Resource limits

#### 3. Implement Auto-Reconnect

```typescript
client.onStateChange(async (status) => {
  if (status.state === "disconnected") {
    console.log("Attempting auto-reconnect...");
    await client.reconnect();
  }
});
```

#### 4. Increase Resource Limits

```typescript
protected getServerEnv() {
  return {
    ...process.env,
    NODE_OPTIONS: '--max-old-space-size=4096',  // 4GB heap
  };
}
```

---

## Timeout Issues

### Issue: Initialization Timeout

**Symptoms:**

- Client times out during start()
- State changes to `timeout_retrying`
- Error: "Request timeout after 60000ms: initialize"

**Possible Causes:**

1. Server is slow to start
2. Server is downloading dependencies
3. Server is loading large models
4. Network latency

**Solutions:**

#### 1. Increase Initialization Timeout

```typescript
const client = new MyMCPClient(outputChannel, {
  timeout: {
    initializationTimeoutMs: 120000, // 2 minutes
  },
});
```

#### 2. Measure Actual Initialization Time

```typescript
const start = Date.now();
await client.start();
const duration = Date.now() - start;
console.log(`Initialization took ${duration}ms`);

// Set timeout to 2x measured time
const timeout = duration * 2;
```

#### 3. Optimize Server Startup

- Pre-install dependencies
- Cache models or data
- Use lazy loading
- Reduce initialization work

#### 4. Check Server Logs

```typescript
client.outputChannel.show();
```

Look for:

- Downloading packages
- Loading models
- Database connections
- Network requests

### Issue: Request Timeout

**Symptoms:**

- Specific requests time out
- Error: "Request timeout after 30000ms: tools/call"
- Other requests work fine

**Possible Causes:**

1. Operation is slow
2. Server is busy
3. Deadlock or hang
4. Resource contention

**Solutions:**

#### 1. Increase Timeout for Specific Request

```typescript
// Use custom timeout for slow operation
const result = await this.sendRequest(
  "tools/call",
  { name: "slow_tool", arguments: {} },
  120000 // 2 minute timeout
);
```

#### 2. Increase Standard Timeout

```typescript
const client = new MyMCPClient(outputChannel, {
  timeout: {
    standardRequestTimeoutMs: 60000, // 1 minute
  },
});
```

#### 3. Optimize Server Operation

- Add caching
- Use async operations
- Reduce computation
- Parallelize work

#### 4. Check for Deadlocks

```typescript
const diag = diagnosticCommands.getDiagnostics("my-extension");
console.log("Pending requests:", diag.pendingRequests);

// If same request is stuck for long time, likely a deadlock
```

### Issue: Re-synchronization Fails

**Symptoms:**

- Timeout occurs
- Re-sync attempts fail
- State changes to `error`
- Error: "Re-synchronization failed after 3 attempts"

**Possible Causes:**

1. Server is unresponsive
2. Server crashed
3. Network issues
4. Not enough retries

**Solutions:**

#### 1. Check Server Status

```typescript
const diag = diagnosticCommands.getDiagnostics("my-extension");
console.log("Server running:", diag.processRunning);
console.log("Process ID:", diag.processId);

if (!diag.processRunning) {
  console.log("Server crashed, restart needed");
  await diagnosticCommands.restartServer("my-extension");
}
```

#### 2. Increase Retry Count

```typescript
const client = new MyMCPClient(outputChannel, {
  reSync: {
    maxRetries: 5, // More retries
  },
});
```

#### 3. Adjust Retry Timing

```typescript
const client = new MyMCPClient(outputChannel, {
  reSync: {
    retryDelayMs: 1000, // Faster initial retry
    backoffMultiplier: 2.0, // Aggressive backoff
  },
});
```

#### 4. Restart Server

```typescript
// If re-sync keeps failing, restart server
await diagnosticCommands.restartServer("my-extension");
```

---

## Server Process Issues

### Issue: Server Process Exits Immediately

**Symptoms:**

- Server starts but exits immediately
- Exit code 1 or other error code
- State changes to `error`

**Possible Causes:**

1. Missing dependencies
2. Configuration error
3. Port already in use
4. Permission issues

**Solutions:**

#### 1. Check Exit Code

```typescript
client.onStateChange((status) => {
  if (status.lastError?.message.includes("exited with code")) {
    console.log("Server exit error:", status.lastError.message);
  }
});
```

Common exit codes:

- `1` - General error
- `127` - Command not found
- `126` - Permission denied
- `EADDRINUSE` - Port in use

#### 2. Check Server Stderr

```typescript
// Server stderr is logged to output channel
client.outputChannel.show();
```

#### 3. Test Server Manually

```bash
# Run server command directly to see errors
npx -y @my-org/my-mcp-server
```

#### 4. Fix Common Issues

**Missing dependencies:**

```bash
npm install -g @my-org/my-mcp-server
```

**Port in use:**

```typescript
protected getServerEnv() {
  return {
    ...process.env,
    PORT: '8081',  // Use different port
  };
}
```

**Permission issues:**

```bash
chmod +x /path/to/server
```

### Issue: Server Process Hangs

**Symptoms:**

- Server starts but doesn't respond
- Process is running but unresponsive
- All requests timeout

**Possible Causes:**

1. Deadlock
2. Infinite loop
3. Waiting for input
4. Resource exhaustion

**Solutions:**

#### 1. Check Process Status

```typescript
const diag = diagnosticCommands.getDiagnostics("my-extension");
console.log("Process running:", diag.processRunning);
console.log("Process ID:", diag.processId);
console.log("Pending requests:", diag.pendingRequestCount);
```

#### 2. Kill and Restart

```typescript
await diagnosticCommands.restartServer("my-extension");
```

#### 3. Debug Server

```bash
# Attach debugger to server process
node --inspect-brk /path/to/server/index.js
```

#### 4. Check for Blocking Operations

Look for:

- Synchronous file I/O
- Blocking network calls
- CPU-intensive operations
- Missing async/await

### Issue: Server Process Crashes

**Symptoms:**

- Server runs for a while then crashes
- Exit code or signal in logs
- State changes to `disconnected`

**Possible Causes:**

1. Uncaught exception
2. Out of memory
3. Segmentation fault
4. Signal (SIGTERM, SIGKILL)

**Solutions:**

#### 1. Check Crash Logs

```typescript
client.onStateChange((status) => {
  if (!status.serverProcessRunning && status.lastError) {
    console.log("Server crashed:", status.lastError.message);

    // Check for specific signals
    if (status.lastError.message.includes("SIGSEGV")) {
      console.log("Segmentation fault - likely native module issue");
    }
    if (status.lastError.message.includes("SIGKILL")) {
      console.log("Process killed - likely OOM");
    }
  }
});
```

#### 2. Increase Memory Limit

```typescript
protected getServerEnv() {
  return {
    ...process.env,
    NODE_OPTIONS: '--max-old-space-size=8192',  // 8GB heap
  };
}
```

#### 3. Add Error Handling

Server-side:

```typescript
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  // Don't exit, try to recover
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
```

#### 4. Enable Core Dumps

```bash
# Enable core dumps for debugging
ulimit -c unlimited
node /path/to/server/index.js
```

---

## Performance Issues

### Issue: Slow Requests

**Symptoms:**

- Requests take a long time
- Not timing out, just slow
- Performance degrades over time

**Possible Causes:**

1. Server is doing too much work
2. Memory leaks
3. Resource contention
4. Network latency

**Solutions:**

#### 1. Measure Request Time

```typescript
const start = Date.now();
const result = await client.doSomething(input);
const duration = Date.now() - start;
console.log(`Request took ${duration}ms`);
```

#### 2. Check Server Performance

```typescript
const diag = diagnosticCommands.getDiagnostics("my-extension");
console.log("Pending requests:", diag.pendingRequestCount);
console.log("Recent communication:", diag.recentCommunication);

// Look for slow requests
const slow = diag.recentCommunication.filter((c) => {
  // Assuming we track duration somehow
  return c.duration > 5000; // > 5 seconds
});
```

#### 3. Add Caching

```typescript
export class MyMCPClient extends BaseMCPClient {
  private cache = new Map<string, any>();

  async getCachedData(key: string): Promise<any> {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const data = await this.callTool("get_data", { key });
    this.cache.set(key, data);
    return data;
  }
}
```

#### 4. Optimize Server

- Profile server code
- Add database indexes
- Use connection pooling
- Implement pagination
- Reduce payload size

### Issue: High Memory Usage

**Symptoms:**

- Server memory grows over time
- Eventually crashes with OOM
- Performance degrades

**Possible Causes:**

1. Memory leaks
2. Caching too much data
3. Not cleaning up resources
4. Large payloads

**Solutions:**

#### 1. Monitor Memory

```typescript
// Server-side
setInterval(() => {
  const usage = process.memoryUsage();
  console.log("Memory usage:", {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + "MB",
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + "MB",
  });
}, 60000); // Every minute
```

#### 2. Implement Cache Limits

```typescript
export class MyMCPClient extends BaseMCPClient {
  private cache = new Map<string, any>();
  private maxCacheSize = 1000;

  async getCachedData(key: string): Promise<any> {
    // Limit cache size
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    // ... rest of caching logic
  }
}
```

#### 3. Clean Up Resources

```typescript
stop(): void {
  // Clean up before stopping
  this.cache.clear();
  this.pendingOperations.forEach(op => op.cancel());
  this.pendingOperations.clear();

  super.stop();
}
```

#### 4. Use Streaming

For large payloads, use streaming instead of loading everything into memory:

```typescript
async streamLargeData(key: string): AsyncIterator<Buffer> {
  // Stream data in chunks instead of loading all at once
}
```

---

## Configuration Issues

### Issue: Invalid Configuration

**Symptoms:**

- Client fails to start
- Error: "Invalid configuration"
- Validation errors

**Possible Causes:**

1. Negative timeout values
2. Invalid log level
3. Backoff multiplier < 1.0
4. Type mismatches

**Solutions:**

#### 1. Validate Configuration

```typescript
import { TimeoutManager } from "@ai-capabilities-suite/mcp-client-base";

const timeoutManager = new TimeoutManager();
const result = timeoutManager.validateConfig(myConfig.timeout);

if (!result.valid) {
  console.error("Invalid configuration:");
  result.errors.forEach((error) => console.error(`  - ${error}`));
}
```

#### 2. Use Type Safety

```typescript
import { MCPClientConfig } from "@ai-capabilities-suite/mcp-client-base";

const config: Partial<MCPClientConfig> = {
  timeout: {
    initializationTimeoutMs: 60000, // TypeScript ensures this is a number
  },
};
```

#### 3. Provide Defaults

```typescript
const config: Partial<MCPClientConfig> = {
  timeout: {
    initializationTimeoutMs:
      userConfig.timeout?.initializationTimeoutMs ?? 60000,
    standardRequestTimeoutMs:
      userConfig.timeout?.standardRequestTimeoutMs ?? 30000,
    toolsListTimeoutMs: userConfig.timeout?.toolsListTimeoutMs ?? 60000,
  },
};
```

### Issue: Configuration Not Applied

**Symptoms:**

- Configuration is set but not used
- Default values are used instead
- Timeouts don't match configuration

**Possible Causes:**

1. Configuration passed incorrectly
2. Configuration overridden
3. Configuration not merged properly

**Solutions:**

#### 1. Verify Configuration

```typescript
const client = new MyMCPClient(outputChannel, myConfig);

// Check what configuration is actually being used
const timeoutConfig = client.getTimeoutConfig();
console.log("Actual timeout config:", timeoutConfig);
```

#### 2. Check Constructor

```typescript
export class MyMCPClient extends BaseMCPClient {
  constructor(
    outputChannel: vscode.LogOutputChannel,
    config?: Partial<MCPClientConfig>
  ) {
    // Make sure config is passed to super
    super(outputChannel, config);
  }
}
```

---

## Platform-Specific Issues

### Windows Issues

#### Issue: Command Not Found

**Solution:**

```typescript
protected getServerCommand() {
  if (process.platform === 'win32') {
    return {
      command: 'npx.cmd',  // Use .cmd on Windows
      args: ['-y', '@my-org/my-mcp-server'],
    };
  }
  return {
    command: 'npx',
    args: ['-y', '@my-org/my-mcp-server'],
  };
}
```

#### Issue: Path Separators

**Solution:**

```typescript
import * as path from 'path';

protected getServerCommand() {
  const serverPath = path.join(__dirname, '..', 'bin', 'server');
  return {
    command: serverPath,  // path.join handles platform differences
    args: [],
  };
}
```

### macOS Issues

#### Issue: Permission Denied

**Solution:**

```bash
# Make server executable
chmod +x /path/to/server

# Or in code:
import { execSync } from 'child_process';
execSync(`chmod +x ${serverPath}`);
```

### Linux Issues

#### Issue: Missing Dependencies

**Solution:**

```bash
# Install system dependencies
sudo apt-get install -y libx11-dev libxkbfile-dev

# Or check in code:
protected async onServerReady() {
  try {
    await this.callTool('health_check', {});
  } catch (error) {
    if (error.message.includes('libx11')) {
      throw new Error('Missing system dependency: libx11-dev. Install with: sudo apt-get install libx11-dev');
    }
    throw error;
  }
}
```

---

## Debugging Tips

### Enable Debug Logging

```typescript
const client = new MyMCPClient(outputChannel, {
  logging: {
    logLevel: "debug",
    logCommunication: true,
  },
});
```

### Monitor All Events

```typescript
client.onStateChange((status) => {
  console.log(`[${new Date().toISOString()}] State: ${status.state}`);
  console.log(`  Message: ${status.message}`);
  console.log(`  Server Running: ${status.serverProcessRunning}`);
  if (status.lastError) {
    console.log(`  Last Error: ${status.lastError.message}`);
  }
});
```

### Use Diagnostic Commands

```typescript
// Get detailed diagnostics
const diag = diagnosticCommands.getDiagnostics("my-extension");
console.log(diagnosticCommands.formatDiagnostics(diag));

// Check all extensions
console.log(diagnosticCommands.formatAllDiagnostics());
```

### Test Server Independently

```bash
# Run server manually to see errors
npx -y @my-org/my-mcp-server

# Or with debugging
node --inspect-brk /path/to/server/index.js
```

### Check Network

```bash
# Test if server is listening
netstat -an | grep 8080

# Test connection
curl http://localhost:8080/health
```

### Profile Performance

```typescript
// Server-side
const { performance } = require("perf_hooks");

const start = performance.now();
// ... do work ...
const duration = performance.now() - start;
console.log(`Operation took ${duration}ms`);
```

### Use Process Monitoring

```bash
# Monitor server process
top -p <pid>

# Check open files
lsof -p <pid>

# Check network connections
netstat -anp | grep <pid>
```

### Collect Diagnostics

```typescript
async function collectDiagnostics() {
  const diag = diagnosticCommands.getDiagnostics("my-extension");

  const report = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    nodeVersion: process.version,
    diagnostics: diag,
    config: client.getConfig(),
    environment: process.env,
  };

  // Save to file
  fs.writeFileSync("diagnostics.json", JSON.stringify(report, null, 2));

  console.log("Diagnostics saved to diagnostics.json");
}
```

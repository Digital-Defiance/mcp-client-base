/**
 * BaseMCPClient - Abstract base class for MCP client implementations
 *
 * Provides consistent timeout handling, re-synchronization logic, and
 * connection state management across all MCP extensions.
 */

import { ChildProcess, spawn } from "child_process";
import {
  MCPClientConfig,
  PendingRequest,
  ConnectionStatus,
  ServerDiagnostics,
  ConnectionState,
  CommunicationLogEntry,
} from "./types";
import { TimeoutManager } from "./TimeoutManager";
import { ConnectionStateManager } from "./ConnectionStateManager";
import { ReSyncManager } from "./ReSyncManager";

/**
 * Log output channel interface (compatible with vscode.LogOutputChannel)
 */
export interface LogOutputChannel {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string | Error, ...args: unknown[]): void;
  append(value: string): void;
  appendLine(value: string): void;
  clear(): void;
  show(preserveFocus?: boolean): void;
  hide(): void;
  dispose(): void;
}

/**
 * BaseMCPClient
 *
 * Abstract base class that provides core MCP client functionality.
 * Extensions should extend this class and implement the abstract methods
 * to provide extension-specific behavior.
 */
export abstract class BaseMCPClient {
  protected serverProcess?: ChildProcess;
  protected requestId: number = 0;
  protected pendingRequests: Map<number, PendingRequest>;
  protected outputChannel: LogOutputChannel;
  protected timeoutManager: TimeoutManager;
  protected stateManager: ConnectionStateManager;
  protected reSyncManager: ReSyncManager;
  protected config: MCPClientConfig;
  protected recentCommunication: CommunicationLogEntry[];
  protected readonly maxCommunicationLog: number = 100;
  protected lastError?: { message: string; timestamp: number };
  protected serverStderr: string = "";
  protected extensionName: string;
  private isStopping: boolean = false;

  constructor(
    extensionName: string,
    outputChannel: LogOutputChannel,
    config?: Partial<MCPClientConfig>
  ) {
    this.extensionName = extensionName;
    this.outputChannel = outputChannel;
    this.pendingRequests = new Map();
    this.recentCommunication = [];

    // Initialize configuration with defaults
    this.config = {
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
      ...config,
    };

    // Initialize managers
    this.timeoutManager = new TimeoutManager(this.config.timeout);
    this.stateManager = new ConnectionStateManager();
    this.reSyncManager = new ReSyncManager(this.config.reSync);
  }

  // ========== Abstract Methods (Extension-Specific) ==========

  /**
   * Get the command and arguments to spawn the server process
   * @returns Command and arguments for spawning the server
   */
  protected abstract getServerCommand(): { command: string; args: string[] };

  /**
   * Get environment variables for the server process
   * @returns Environment variables object
   */
  protected abstract getServerEnv(): Record<string, string>;

  /**
   * Called when the server is ready (after successful initialization)
   * Extensions can perform additional setup here
   */
  protected abstract onServerReady(): Promise<void>;

  // ========== Lifecycle Methods ==========

  /**
   * Start the MCP server and initialize connection
   */
  async start(): Promise<void> {
    // Reset stopping flag
    this.isStopping = false;

    this.log("info", "Starting MCP server");
    this.stateManager.setState(ConnectionState.CONNECTING, {
      message: "Starting server process",
    });

    try {
      // Spawn server process
      await this.spawnServerProcess();

      // Send initialization request
      await this.sendInitialize();

      // Call extension-specific ready handler
      await this.onServerReady();

      this.stateManager.setState(ConnectionState.CONNECTED, {
        message: "Server connected and ready",
      });

      this.log("info", "MCP server started successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.lastError = {
        message: errorMessage,
        timestamp: Date.now(),
      };

      this.stateManager.setState(ConnectionState.ERROR, {
        message: `Failed to start server: ${errorMessage}`,
        lastError: error instanceof Error ? error : new Error(String(error)),
      });

      this.log("error", `Failed to start MCP server: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Stop the MCP server and cleanup resources
   */
  stop(): void {
    // Set flag to prevent any further logging
    this.isStopping = true;

    this.log("info", "Stopping MCP server");

    // Clear all pending requests
    this.clearPendingRequests();

    // Kill server process if running
    if (this.serverProcess) {
      // Remove all event listeners to prevent race conditions
      this.serverProcess.removeAllListeners();

      // Also remove listeners from streams
      this.serverProcess.stdout?.removeAllListeners();
      this.serverProcess.stderr?.removeAllListeners();
      this.serverProcess.stdin?.removeAllListeners();

      if (this.isServerProcessAlive()) {
        this.serverProcess.kill();
      }

      this.serverProcess = undefined;
    }

    // Update state
    this.stateManager.setServerProcessRunning(false);
    this.stateManager.setState(ConnectionState.DISCONNECTED, {
      message: "Server stopped",
    });

    this.log("info", "MCP server stopped");
  }

  /**
   * Reconnect to the server
   * @returns true if reconnection was successful
   */
  async reconnect(): Promise<boolean> {
    this.log("info", "Attempting to reconnect to server");

    // Stop existing connection
    this.stop();

    // Reset re-sync manager
    this.reSyncManager.reset();

    try {
      // Start new connection
      await this.start();
      return true;
    } catch (error) {
      this.log(
        "error",
        `Reconnection failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  // ========== Request Handling ==========

  /**
   * Send a JSON-RPC request to the server
   * @param method Request method name
   * @param params Request parameters
   * @param customTimeout Optional custom timeout (overrides default)
   * @returns Response from server
   */
  protected async sendRequest(
    method: string,
    params: unknown,
    customTimeout?: number
  ): Promise<unknown> {
    const id = ++this.requestId;
    const timeout =
      customTimeout ?? this.timeoutManager.getTimeoutForRequest(method);

    this.log(
      "debug",
      `[req-${id}] Sending request: ${method}`,
      JSON.stringify(params)
    );

    return new Promise((resolve, reject) => {
      // Create timeout handler
      const timeoutHandle = setTimeout(async () => {
        this.log(
          "warn",
          `[req-${id}] Request timeout after ${timeout}ms: ${method}`
        );
        await this.handleTimeout(id, method);
        reject(new Error(`Request timeout after ${timeout}ms: ${method}`));
      }, timeout);

      // Store pending request
      const pendingRequest: PendingRequest = {
        id,
        method,
        params,
        resolve,
        reject,
        timeoutHandle,
        startTime: Date.now(),
      };

      this.pendingRequests.set(id, pendingRequest);

      // Send request
      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.sendToServer(request);
      this.logCommunication("request", { id, method });
    });
  }

  /**
   * Send a JSON-RPC notification to the server (no response expected)
   * @param method Notification method name
   * @param params Notification parameters
   */
  protected async sendNotification(
    method: string,
    params: unknown
  ): Promise<void> {
    this.log(
      "debug",
      `Sending notification: ${method}`,
      JSON.stringify(params)
    );

    const notification = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.sendToServer(notification);
    this.logCommunication("notification", { method });
  }

  /**
   * Call an MCP tool
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool result
   */
  protected async callTool(name: string, args: unknown): Promise<unknown> {
    return this.sendRequest("tools/call", { name, arguments: args });
  }

  // ========== Connection Management ==========

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.stateManager.getStatus();
  }

  /**
   * Subscribe to connection state changes
   * @param listener Callback function to be called when state changes
   * @returns Disposable to unregister the listener
   */
  onStateChange(listener: (status: ConnectionStatus) => void): {
    dispose: () => void;
  } {
    return this.stateManager.onStateChange(listener);
  }

  /**
   * Get re-sync configuration
   * @returns Current re-sync configuration
   */
  getReSyncConfig() {
    return this.config.reSync;
  }

  /**
   * Get comprehensive diagnostics information
   */
  getDiagnostics(): ServerDiagnostics {
    const now = Date.now();
    const pendingRequestsArray = Array.from(this.pendingRequests.values()).map(
      (req) => ({
        id: req.id,
        method: req.method,
        elapsedMs: now - req.startTime,
      })
    );

    return {
      extensionName: this.extensionName,
      processId: this.serverProcess?.pid,
      processRunning: this.isServerProcessAlive(),
      connectionState: this.stateManager.getStatus().state,
      pendingRequestCount: this.pendingRequests.size,
      pendingRequests: pendingRequestsArray,
      lastError: this.lastError,
      recentCommunication: [...this.recentCommunication],
      stateHistory: this.stateManager.getHistory(20),
    };
  }

  /**
   * Check if server process is alive
   */
  isServerProcessAlive(): boolean {
    if (!this.serverProcess) {
      return false;
    }

    // Check if process has exited
    if (this.serverProcess.exitCode !== null) {
      return false;
    }

    // Check if process was killed by signal
    if (this.serverProcess.signalCode !== null) {
      return false;
    }

    // Try to send signal 0 (doesn't actually send a signal, just checks if process exists)
    try {
      process.kill(this.serverProcess.pid!, 0);
      return true;
    } catch {
      return false;
    }
  }

  // ========== Event Handlers ==========

  /**
   * Handle incoming message from server
   */
  protected handleMessage(message: {
    id?: number;
    error?: { message: string };
    result?: unknown;
  }): void {
    // Handle response
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      clearTimeout(pending.timeoutHandle);
      this.pendingRequests.delete(message.id);

      const elapsed = Date.now() - pending.startTime;

      if (message.error) {
        this.log(
          "error",
          `[req-${message.id}] Request failed (${elapsed}ms): ${pending.method}`,
          JSON.stringify(message.error)
        );
        this.logCommunication("response", {
          id: message.id,
          method: pending.method,
          error: message.error.message,
        });
        pending.reject(new Error(message.error.message || "Request failed"));
      } else {
        this.log(
          "debug",
          `[req-${message.id}] Request completed (${elapsed}ms): ${pending.method}`
        );
        this.logCommunication("response", {
          id: message.id,
          method: pending.method,
        });
        pending.resolve(message.result);
      }
    }
  }

  /**
   * Handle request timeout
   */
  protected async handleTimeout(
    requestId: number,
    method: string
  ): Promise<void> {
    // Remove from pending requests
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeoutHandle);
      this.pendingRequests.delete(requestId);
    }

    // For initialization timeout, attempt re-synchronization
    if (method === "initialize") {
      this.log("warn", "Initialization timeout, attempting re-synchronization");

      // Check if server process is still alive
      if (!this.isServerProcessAlive()) {
        this.log(
          "error",
          "Server process is not running, cannot re-synchronize"
        );
        this.stateManager.setState(ConnectionState.ERROR, {
          message: "Server process exited during initialization",
        });
        return;
      }

      // Attempt re-synchronization
      const result = await this.reSyncManager.attemptReSync(
        () => this.sendInitialize(),
        this.stateManager
      );

      if (!result.success) {
        this.log(
          "error",
          `Re-synchronization failed after ${result.attempts} attempts`
        );
        this.lastError = {
          message: result.error?.message || "Re-synchronization failed",
          timestamp: Date.now(),
        };
      } else {
        this.log(
          "info",
          `Re-synchronization successful after ${result.attempts} attempts`
        );
      }
    }
  }

  /**
   * Handle server process exit
   */
  protected handleServerExit(code: number | null, signal: string | null): void {
    this.stateManager.setServerProcessRunning(false);

    let message: string;
    if (signal) {
      message = `Server process killed by signal: ${signal}`;
      this.log("error", message);
    } else if (code !== null) {
      message = `Server process exited with code: ${code}`;
      this.log("error", message);
    } else {
      message = "Server process exited unexpectedly";
      this.log("error", message);
    }

    // Log stderr if available
    if (this.serverStderr) {
      this.log("error", `Server stderr: ${this.serverStderr}`);
    }

    this.lastError = {
      message,
      timestamp: Date.now(),
    };

    // Clear pending requests
    this.clearPendingRequests();

    // Update state
    this.stateManager.setState(ConnectionState.DISCONNECTED, {
      message,
    });
  }

  /**
   * Handle server process error
   */
  protected handleServerError(error: Error): void {
    const message = `Server process error: ${error.message}`;
    this.log("error", message);

    this.lastError = {
      message: error.message,
      timestamp: Date.now(),
    };

    this.stateManager.setState(ConnectionState.ERROR, {
      message,
      lastError: error,
    });
  }

  // ========== Utility Methods ==========

  /**
   * Clear all pending requests with error
   */
  protected clearPendingRequests(): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();
  }

  /**
   * Log communication event
   */
  protected logCommunication(
    type: "request" | "response" | "notification",
    data: { method?: string; id?: number; error?: unknown; result?: unknown }
  ): void {
    if (!this.config.logging.logCommunication) {
      return;
    }

    const entry: CommunicationLogEntry = {
      type,
      method: data.method,
      timestamp: Date.now(),
      success: type === "request" || type === "notification" || !data.error,
      requestId: data.id,
      error:
        typeof data.error === "string"
          ? data.error
          : data.error instanceof Error
          ? data.error.message
          : undefined,
    };

    this.recentCommunication.push(entry);

    // Trim log if it exceeds max size
    if (this.recentCommunication.length > this.maxCommunicationLog) {
      this.recentCommunication = this.recentCommunication.slice(
        -this.maxCommunicationLog
      );
    }
  }

  /**
   * Log message with timestamp and request ID
   */
  protected log(
    level: "trace" | "debug" | "info" | "warn" | "error",
    message: string,
    ...args: unknown[]
  ): void {
    // Don't log if we're stopping (prevents race conditions with disposed output channel)
    if (this.isStopping) {
      return;
    }

    try {
      const timestamp = new Date().toISOString();
      const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] [${
        this.extensionName
      }] ${message}`;

      switch (level) {
        case "trace":
          this.outputChannel.trace(formattedMessage, ...args);
          break;
        case "debug":
          this.outputChannel.debug(formattedMessage, ...args);
          break;
        case "info":
          this.outputChannel.info(formattedMessage, ...args);
          break;
        case "warn":
          this.outputChannel.warn(formattedMessage, ...args);
          break;
        case "error":
          this.outputChannel.error(formattedMessage, ...args);
          break;
      }
    } catch (error) {
      // Silently ignore logging errors (e.g., if output channel is disposed)
    }
  }

  // ========== Private Methods ==========

  /**
   * Spawn the server process
   */
  private async spawnServerProcess(): Promise<void> {
    const { command, args } = this.getServerCommand();
    const env = this.getServerEnv();

    this.log("info", `Spawning server: ${command} ${args.join(" ")}`);

    try {
      this.serverProcess = spawn(command, args, {
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.stateManager.setServerProcessRunning(true);

      // Setup event handlers
      this.serverProcess.on("exit", (code, signal) => {
        this.handleServerExit(code, signal);
      });

      this.serverProcess.on("error", (error) => {
        this.handleServerError(error);
      });

      // Capture stderr
      this.serverProcess.stderr?.on("data", (data) => {
        if (this.isStopping) return;
        const text = data.toString();
        this.serverStderr += text;
        this.log("warn", `Server stderr: ${text}`);
      });

      // Handle stdout (JSON-RPC messages)
      let buffer = "";
      this.serverProcess.stdout?.on("data", (data) => {
        if (this.isStopping) return;
        buffer += data.toString();

        // Process complete JSON messages
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              this.handleMessage(message);
            } catch {
              this.log("error", `Failed to parse message: ${line}`);
            }
          }
        }
      });

      this.log(
        "info",
        `Server process spawned with PID: ${this.serverProcess.pid}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log("error", `Failed to spawn server process: ${errorMessage}`);
      throw new Error(`Failed to spawn server: ${errorMessage}`);
    }
  }

  /**
   * Send initialization request
   */
  private async sendInitialize(): Promise<void> {
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: this.extensionName,
        version: "1.0.0",
      },
    });
  }

  /**
   * Send data to server process
   */
  private sendToServer(data: {
    jsonrpc: string;
    id?: number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
  }): void {
    if (!this.serverProcess || !this.serverProcess.stdin) {
      throw new Error("Server process not available");
    }

    const message = JSON.stringify(data) + "\n";
    this.serverProcess.stdin.write(message);
  }
}

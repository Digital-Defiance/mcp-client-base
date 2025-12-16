/**
 * Unit tests for BaseMCPClient
 */

import { BaseMCPClient, LogOutputChannel } from "./BaseMCPClient";
import { MCPClientConfig, ConnectionState } from "./types";

/**
 * Mock LogOutputChannel for testing
 */
class MockLogOutputChannel implements LogOutputChannel {
  logs: Array<{ level: string; message: string; args: unknown[] }> = [];

  trace(message: string, ...args: unknown[]): void {
    this.logs.push({ level: "trace", message, args });
  }

  debug(message: string, ...args: unknown[]): void {
    this.logs.push({ level: "debug", message, args });
  }

  info(message: string, ...args: unknown[]): void {
    this.logs.push({ level: "info", message, args });
  }

  warn(message: string, ...args: unknown[]): void {
    this.logs.push({ level: "warn", message, args });
  }

  error(message: string | Error, ...args: unknown[]): void {
    this.logs.push({
      level: "error",
      message: message instanceof Error ? message.message : message,
      args,
    });
  }

  append(_value: string): void {}
  appendLine(_value: string): void {}
  clear(): void {
    this.logs = [];
  }
  show(_preserveFocus?: boolean): void {}
  hide(): void {}
  dispose(): void {}
}

/**
 * Concrete test implementation of BaseMCPClient
 */
class TestMCPClient extends BaseMCPClient {
  public serverReadyCallCount = 0;
  public shouldFailServerReady = false;

  constructor(
    extensionName: string,
    outputChannel: LogOutputChannel,
    config?: Partial<MCPClientConfig>
  ) {
    super(extensionName, outputChannel, config);
  }

  protected getServerCommand(): { command: string; args: string[] } {
    return { command: "node", args: ["-e", "console.log('test')"] };
  }

  protected getServerEnv(): Record<string, string> {
    return { ...process.env } as Record<string, string>;
  }

  protected async onServerReady(): Promise<void> {
    this.serverReadyCallCount++;
    if (this.shouldFailServerReady) {
      throw new Error("Server ready failed");
    }
  }
}

describe("BaseMCPClient Unit Tests", () => {
  let outputChannel: MockLogOutputChannel;
  let client: TestMCPClient;

  beforeEach(() => {
    outputChannel = new MockLogOutputChannel();
  });

  afterEach(() => {
    if (client) {
      client.stop();
    }
  });

  describe("Initialization", () => {
    it("should initialize with default configuration", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      const status = client.getConnectionStatus();
      expect(status.state).toBe(ConnectionState.DISCONNECTED);
    });

    it("should initialize with custom configuration", () => {
      const customConfig: Partial<MCPClientConfig> = {
        timeout: {
          initializationTimeoutMs: 90000,
          standardRequestTimeoutMs: 45000,
          toolsListTimeoutMs: 90000,
        },
      };

      client = new TestMCPClient("TestExtension", outputChannel, customConfig);

      const timeoutConfig = client["timeoutManager"].getConfig();
      expect(timeoutConfig.initializationTimeoutMs).toBe(90000);
      expect(timeoutConfig.standardRequestTimeoutMs).toBe(45000);
      expect(timeoutConfig.toolsListTimeoutMs).toBe(90000);
    });

    it("should reject invalid timeout configuration", () => {
      expect(() => {
        new TestMCPClient("TestExtension", outputChannel, {
          timeout: {
            initializationTimeoutMs: 500, // Too low
            standardRequestTimeoutMs: 30000,
            toolsListTimeoutMs: 60000,
          },
        });
      }).toThrow();
    });
  });

  describe("Connection Status", () => {
    it("should return current connection status", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      const status = client.getConnectionStatus();
      expect(status).toBeDefined();
      expect(status.state).toBe(ConnectionState.DISCONNECTED);
      expect(status.message).toBeDefined();
      expect(status.timestamp).toBeGreaterThan(0);
      expect(status.serverProcessRunning).toBe(false);
    });

    it("should track connection state changes", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      // Simulate state change
      client["stateManager"].setState(ConnectionState.CONNECTING, {
        message: "Connecting to server",
      });

      const status = client.getConnectionStatus();
      expect(status.state).toBe(ConnectionState.CONNECTING);
      expect(status.message).toContain("Connecting");
    });
  });

  describe("Diagnostics", () => {
    it("should provide comprehensive diagnostics", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      const diagnostics = client.getDiagnostics();

      expect(diagnostics.extensionName).toBe("TestExtension");
      expect(diagnostics.processRunning).toBe(false);
      expect(diagnostics.connectionState).toBe(ConnectionState.DISCONNECTED);
      expect(diagnostics.pendingRequestCount).toBe(0);
      expect(diagnostics.pendingRequests).toEqual([]);
      expect(diagnostics.recentCommunication).toEqual([]);
      expect(diagnostics.stateHistory).toBeDefined();
      expect(diagnostics.stateHistory.length).toBeGreaterThan(0);
    });

    it("should track pending requests in diagnostics", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      // Add a mock pending request
      const pendingRequest = {
        id: 1,
        method: "test/method",
        params: {},
        resolve: jest.fn(),
        reject: jest.fn(),
        timeoutHandle: setTimeout(() => {}, 1000),
        startTime: Date.now(),
      };

      client["pendingRequests"].set(1, pendingRequest);

      const diagnostics = client.getDiagnostics();
      expect(diagnostics.pendingRequestCount).toBe(1);
      expect(diagnostics.pendingRequests).toHaveLength(1);
      expect(diagnostics.pendingRequests[0].id).toBe(1);
      expect(diagnostics.pendingRequests[0].method).toBe("test/method");
      expect(diagnostics.pendingRequests[0].elapsedMs).toBeGreaterThanOrEqual(
        0
      );

      // Cleanup
      clearTimeout(pendingRequest.timeoutHandle);
    });

    it("should track last error in diagnostics", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      // Simulate an error
      const error = new Error("Test error");
      client["handleServerError"](error);

      const diagnostics = client.getDiagnostics();
      expect(diagnostics.lastError).toBeDefined();
      expect(diagnostics.lastError!.message).toBe("Test error");
      expect(diagnostics.lastError!.timestamp).toBeGreaterThan(0);
    });
  });

  describe("Stop and Cleanup", () => {
    it("should stop cleanly when no server is running", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      expect(() => client.stop()).not.toThrow();

      const status = client.getConnectionStatus();
      expect(status.state).toBe(ConnectionState.DISCONNECTED);
    });

    it("should clear pending requests on stop", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      // Add mock pending requests
      const reject1 = jest.fn();
      const reject2 = jest.fn();

      client["pendingRequests"].set(1, {
        id: 1,
        method: "test1",
        params: {},
        resolve: jest.fn(),
        reject: reject1,
        timeoutHandle: setTimeout(() => {}, 1000),
        startTime: Date.now(),
      });

      client["pendingRequests"].set(2, {
        id: 2,
        method: "test2",
        params: {},
        resolve: jest.fn(),
        reject: reject2,
        timeoutHandle: setTimeout(() => {}, 1000),
        startTime: Date.now(),
      });

      client.stop();

      // Verify pending requests were cleared and rejected
      expect(client["pendingRequests"].size).toBe(0);
      expect(reject1).toHaveBeenCalledWith(expect.any(Error));
      expect(reject2).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("Server Process Lifecycle", () => {
    it("should detect when server process is not alive", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      expect(client.isServerProcessAlive()).toBe(false);
    });

    it("should handle server exit with exit code", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      client["handleServerExit"](1, null);

      const diagnostics = client.getDiagnostics();
      expect(diagnostics.lastError).toBeDefined();
      expect(diagnostics.lastError!.message).toContain("exited with code");
      expect(diagnostics.lastError!.message).toContain("1");
      expect(diagnostics.connectionState).toBe(ConnectionState.DISCONNECTED);
    });

    it("should handle server exit with signal", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      client["handleServerExit"](null, "SIGTERM");

      const diagnostics = client.getDiagnostics();
      expect(diagnostics.lastError).toBeDefined();
      expect(diagnostics.lastError!.message).toContain("killed by signal");
      expect(diagnostics.lastError!.message).toContain("SIGTERM");
      expect(diagnostics.connectionState).toBe(ConnectionState.DISCONNECTED);
    });

    it("should handle server error", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      const error = new Error("Server crashed");
      client["handleServerError"](error);

      const diagnostics = client.getDiagnostics();
      expect(diagnostics.lastError).toBeDefined();
      expect(diagnostics.lastError!.message).toBe("Server crashed");
      expect(diagnostics.connectionState).toBe(ConnectionState.ERROR);
    });
  });

  describe("Logging", () => {
    it("should log messages with consistent format", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      client["log"]("info", "Test message");

      const lastLog = outputChannel.logs[outputChannel.logs.length - 1];
      expect(lastLog.level).toBe("info");
      expect(lastLog.message).toMatch(
        /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/
      );
      expect(lastLog.message).toContain("[INFO]");
      expect(lastLog.message).toContain("[TestExtension]");
      expect(lastLog.message).toContain("Test message");
    });

    it("should log communication events when enabled", () => {
      client = new TestMCPClient("TestExtension", outputChannel, {
        logging: {
          logLevel: "debug",
          logCommunication: true,
        },
      });

      client["logCommunication"]("request", {
        id: 1,
        method: "test/method",
      });

      const diagnostics = client.getDiagnostics();
      expect(diagnostics.recentCommunication).toHaveLength(1);
      expect(diagnostics.recentCommunication[0].type).toBe("request");
      expect(diagnostics.recentCommunication[0].method).toBe("test/method");
      expect(diagnostics.recentCommunication[0].requestId).toBe(1);
    });

    it("should not log communication events when disabled", () => {
      client = new TestMCPClient("TestExtension", outputChannel, {
        logging: {
          logLevel: "info",
          logCommunication: false,
        },
      });

      client["logCommunication"]("request", {
        id: 1,
        method: "test/method",
      });

      const diagnostics = client.getDiagnostics();
      expect(diagnostics.recentCommunication).toHaveLength(0);
    });
  });

  describe("Timeout Handling", () => {
    it("should handle timeout for non-initialize methods", async () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      // Add a pending request
      const reject = jest.fn();
      client["pendingRequests"].set(1, {
        id: 1,
        method: "tools/call",
        params: {},
        resolve: jest.fn(),
        reject,
        timeoutHandle: setTimeout(() => {}, 1000),
        startTime: Date.now(),
      });

      // Handle timeout
      await client["handleTimeout"](1, "tools/call");

      // Verify request was removed
      expect(client["pendingRequests"].has(1)).toBe(false);
    });
  });

  describe("Message Handling", () => {
    it("should handle successful response", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      const resolve = jest.fn();
      const reject = jest.fn();

      client["pendingRequests"].set(1, {
        id: 1,
        method: "test/method",
        params: {},
        resolve,
        reject,
        timeoutHandle: setTimeout(() => {}, 1000),
        startTime: Date.now(),
      });

      // Simulate response
      client["handleMessage"]({
        id: 1,
        result: { success: true },
      });

      expect(resolve).toHaveBeenCalledWith({ success: true });
      expect(reject).not.toHaveBeenCalled();
      expect(client["pendingRequests"].has(1)).toBe(false);
    });

    it("should handle error response", () => {
      client = new TestMCPClient("TestExtension", outputChannel);

      const resolve = jest.fn();
      const reject = jest.fn();

      client["pendingRequests"].set(1, {
        id: 1,
        method: "test/method",
        params: {},
        resolve,
        reject,
        timeoutHandle: setTimeout(() => {}, 1000),
        startTime: Date.now(),
      });

      // Simulate error response
      client["handleMessage"]({
        id: 1,
        error: { message: "Invalid request" },
      });

      expect(reject).toHaveBeenCalledWith(expect.any(Error));
      expect(resolve).not.toHaveBeenCalled();
      expect(client["pendingRequests"].has(1)).toBe(false);
    });
  });
});

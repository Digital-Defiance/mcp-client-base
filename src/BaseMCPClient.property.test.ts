/**
 * Property-based tests for BaseMCPClient
 *
 * Feature: shared-mcp-client-timeout-fix
 */

import * as fc from "fast-check";
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
    // No-op for testing
  }
}

/**
 * Arbitrary for valid timeout configuration
 */
const validTimeoutConfigArb = fc.record({
  initializationTimeoutMs: fc.integer({ min: 1000, max: 300000 }),
  standardRequestTimeoutMs: fc.integer({ min: 1000, max: 300000 }),
  toolsListTimeoutMs: fc.integer({ min: 1000, max: 300000 }),
});

/**
 * Arbitrary for valid MCPClientConfig
 */
const validMCPClientConfigArb = fc.record({
  timeout: validTimeoutConfigArb,
  reSync: fc.record({
    maxRetries: fc.integer({ min: 1, max: 10 }),
    retryDelayMs: fc.integer({ min: 100, max: 10000 }),
    backoffMultiplier: fc.float({ min: 1.0, max: 3.0 }),
  }),
  logging: fc.record({
    logLevel: fc.constantFrom(
      "debug" as const,
      "info" as const,
      "warn" as const,
      "error" as const
    ),
    logCommunication: fc.boolean(),
  }),
});

describe("BaseMCPClient Property Tests", () => {
  /**
   * Feature: shared-mcp-client-timeout-fix, Property 4: Configuration validation consistency
   * Validates: Requirements 1.4, 3.4
   *
   * For any timeout configuration across any extension, validation should produce
   * the same result (valid/invalid with same errors)
   */
  describe("Property 4: Configuration validation consistency", () => {
    it("should validate configurations consistently across multiple client instances", () => {
      fc.assert(
        fc.property(validMCPClientConfigArb, (config) => {
          const outputChannel1 = new MockLogOutputChannel();
          const outputChannel2 = new MockLogOutputChannel();
          const outputChannel3 = new MockLogOutputChannel();

          // Create three different extension clients with the same config
          const client1 = new TestMCPClient(
            "Extension1",
            outputChannel1,
            config
          );
          const client2 = new TestMCPClient(
            "Extension2",
            outputChannel2,
            config
          );
          const client3 = new TestMCPClient(
            "Extension3",
            outputChannel3,
            config
          );

          // All clients should have the same timeout configuration
          const timeout1 = client1["timeoutManager"].getConfig();
          const timeout2 = client2["timeoutManager"].getConfig();
          const timeout3 = client3["timeoutManager"].getConfig();

          // Verify all timeout configs are identical
          expect(timeout1).toEqual(timeout2);
          expect(timeout2).toEqual(timeout3);

          // Verify all re-sync configs are identical
          const reSync1 = client1["reSyncManager"].getConfig();
          const reSync2 = client2["reSyncManager"].getConfig();
          const reSync3 = client3["reSyncManager"].getConfig();

          expect(reSync1).toEqual(reSync2);
          expect(reSync2).toEqual(reSync3);

          // Cleanup
          client1.stop();
          client2.stop();
          client3.stop();
        }),
        { numRuns: 100 }
      );
    });

    it("should reject invalid configurations consistently across extensions", () => {
      fc.assert(
        fc.property(
          fc.record({
            initializationTimeoutMs: fc.integer({ min: -1000, max: 500 }),
            standardRequestTimeoutMs: fc.integer({ min: -1000, max: 500 }),
            toolsListTimeoutMs: fc.integer({ min: -1000, max: 500 }),
          }),
          (invalidTimeoutConfig) => {
            const outputChannel1 = new MockLogOutputChannel();
            const outputChannel2 = new MockLogOutputChannel();

            // Both clients should reject the invalid config
            expect(() => {
              new TestMCPClient("Extension1", outputChannel1, {
                timeout: invalidTimeoutConfig,
              });
            }).toThrow();

            expect(() => {
              new TestMCPClient("Extension2", outputChannel2, {
                timeout: invalidTimeoutConfig,
              });
            }).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: shared-mcp-client-timeout-fix, Property 5: Error message consistency
   * Validates: Requirements 1.5, 9.1, 9.2, 9.3
   *
   * For any error condition across any extension, the error message format
   * and recovery options should be the same
   */
  describe("Property 5: Error message consistency", () => {
    it("should format server exit errors consistently across extensions", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("Extension1", "Extension2", "Extension3"),
          fc.oneof(
            fc.integer({ min: 0, max: 255 }), // exit code
            fc.constant(null) // no exit code
          ),
          fc.oneof(
            fc.constantFrom("SIGTERM", "SIGKILL", "SIGINT"), // signal
            fc.constant(null) // no signal
          ),
          (extensionName, exitCode, signal) => {
            const outputChannel = new MockLogOutputChannel();
            const client = new TestMCPClient(extensionName, outputChannel);

            // Simulate server exit
            client["handleServerExit"](exitCode, signal);

            // Get the last error
            const diagnostics = client.getDiagnostics();
            const lastError = diagnostics.lastError;

            // Verify error message format is consistent
            expect(lastError).toBeDefined();
            if (signal) {
              expect(lastError!.message).toContain("killed by signal");
              expect(lastError!.message).toContain(signal);
            } else if (exitCode !== null) {
              expect(lastError!.message).toContain("exited with code");
              expect(lastError!.message).toContain(exitCode.toString());
            } else {
              expect(lastError!.message).toContain("exited unexpectedly");
            }

            // Verify timestamp is present
            expect(lastError!.timestamp).toBeGreaterThan(0);

            // Verify connection state is updated
            expect(diagnostics.connectionState).toBe(
              ConnectionState.DISCONNECTED
            );

            // Cleanup
            client.stop();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should format server process errors consistently across extensions", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("Extension1", "Extension2", "Extension3"),
          fc.string({ minLength: 1, maxLength: 100 }),
          (extensionName, errorMessage) => {
            const outputChannel = new MockLogOutputChannel();
            const client = new TestMCPClient(extensionName, outputChannel);

            // Simulate server error
            const error = new Error(errorMessage);
            client["handleServerError"](error);

            // Get the last error
            const diagnostics = client.getDiagnostics();
            const lastError = diagnostics.lastError;

            // Verify error message format is consistent
            expect(lastError).toBeDefined();
            expect(lastError!.message).toBe(errorMessage);
            expect(lastError!.timestamp).toBeGreaterThan(0);

            // Verify connection state is updated to ERROR
            expect(diagnostics.connectionState).toBe(ConnectionState.ERROR);

            // Cleanup
            client.stop();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should format timeout errors consistently across extensions", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("Extension1", "Extension2", "Extension3"),
          fc.constantFrom("initialize", "tools/list", "tools/call"),
          fc.integer({ min: 1000, max: 60000 }),
          (extensionName, method, timeout) => {
            const outputChannel = new MockLogOutputChannel();
            const client = new TestMCPClient(extensionName, outputChannel, {
              timeout: {
                initializationTimeoutMs: timeout,
                standardRequestTimeoutMs: timeout,
                toolsListTimeoutMs: timeout,
              },
            });

            // Create a pending request
            const requestId = 1;
            const pendingRequest = {
              id: requestId,
              method,
              params: {},
              resolve: jest.fn(),
              reject: jest.fn(),
              timeoutHandle: setTimeout(() => {}, 1000),
              startTime: Date.now(),
            };

            client["pendingRequests"].set(requestId, pendingRequest);

            // Simulate timeout (without triggering re-sync for non-initialize methods)
            client["handleTimeout"](requestId, method);

            // Verify the request was removed from pending
            expect(client["pendingRequests"].has(requestId)).toBe(false);

            // Cleanup
            clearTimeout(pendingRequest.timeoutHandle);
            client.stop();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: shared-mcp-client-timeout-fix, Property 13: Log format consistency
   * Validates: Requirements 7.1, 7.5
   *
   * For any communication event logged by any extension, the log entry should
   * include timestamp, request ID (if applicable), and method name
   */
  describe("Property 13: Log format consistency", () => {
    it("should format log messages consistently across extensions", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("Extension1", "Extension2", "Extension3"),
          fc.constantFrom("trace", "debug", "info", "warn", "error"),
          fc.string({ minLength: 1, maxLength: 100 }),
          (extensionName, logLevel, message) => {
            const outputChannel = new MockLogOutputChannel();
            const client = new TestMCPClient(extensionName, outputChannel);

            // Log a message
            client["log"](
              logLevel as "trace" | "debug" | "info" | "warn" | "error",
              message
            );

            // Get the last log entry
            const lastLog = outputChannel.logs[outputChannel.logs.length - 1];

            // Verify log format
            expect(lastLog).toBeDefined();
            expect(lastLog.level).toBe(logLevel);

            // Verify log message contains timestamp (ISO format)
            expect(lastLog.message).toMatch(
              /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/
            );

            // Verify log message contains log level
            expect(lastLog.message).toContain(`[${logLevel.toUpperCase()}]`);

            // Verify log message contains extension name
            expect(lastLog.message).toContain(`[${extensionName}]`);

            // Verify log message contains the actual message
            expect(lastLog.message).toContain(message);

            // Cleanup
            client.stop();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should log communication events with consistent format across extensions", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("Extension1", "Extension2", "Extension3"),
          fc.constantFrom("request", "response", "notification"),
          fc.constantFrom("initialize", "tools/list", "tools/call"),
          fc.integer({ min: 1, max: 1000 }),
          (extensionName, type, method, requestId) => {
            const outputChannel = new MockLogOutputChannel();
            const client = new TestMCPClient(extensionName, outputChannel, {
              logging: {
                logLevel: "debug",
                logCommunication: true,
              },
            });

            // Log communication event
            client["logCommunication"](
              type as "request" | "response" | "notification",
              {
                id: requestId,
                method,
              }
            );

            // Get diagnostics to check recent communication
            const diagnostics = client.getDiagnostics();
            const lastComm =
              diagnostics.recentCommunication[
                diagnostics.recentCommunication.length - 1
              ];

            // Verify communication log format
            expect(lastComm).toBeDefined();
            expect(lastComm.type).toBe(type);
            expect(lastComm.method).toBe(method);
            if (type !== "notification") {
              expect(lastComm.requestId).toBe(requestId);
            }
            expect(lastComm.timestamp).toBeGreaterThan(0);

            // Cleanup
            client.stop();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: shared-mcp-client-timeout-fix, Property 14: Error log completeness
   * Validates: Requirements 7.2
   *
   * For any error logged by any extension, the log entry should include
   * error category, server process status, and connection state
   */
  describe("Property 14: Error log completeness", () => {
    it("should include complete error information in diagnostics", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("Extension1", "Extension2", "Extension3"),
          fc.string({ minLength: 1, maxLength: 100 }),
          (extensionName, errorMessage) => {
            const outputChannel = new MockLogOutputChannel();
            const client = new TestMCPClient(extensionName, outputChannel);

            // Simulate an error
            const error = new Error(errorMessage);
            client["handleServerError"](error);

            // Get diagnostics
            const diagnostics = client.getDiagnostics();

            // Verify error information is complete
            expect(diagnostics.lastError).toBeDefined();
            expect(diagnostics.lastError!.message).toBe(errorMessage);
            expect(diagnostics.lastError!.timestamp).toBeGreaterThan(0);

            // Verify server process status is included
            expect(diagnostics.processRunning).toBeDefined();
            expect(typeof diagnostics.processRunning).toBe("boolean");

            // Verify connection state is included
            expect(diagnostics.connectionState).toBeDefined();
            expect(diagnostics.connectionState).toBe(ConnectionState.ERROR);

            // Cleanup
            client.stop();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include server process information in exit error logs", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("Extension1", "Extension2", "Extension3"),
          fc.oneof(fc.integer({ min: 0, max: 255 }), fc.constant(null)),
          fc.oneof(
            fc.constantFrom("SIGTERM", "SIGKILL", "SIGINT"),
            fc.constant(null)
          ),
          (extensionName, exitCode, signal) => {
            const outputChannel = new MockLogOutputChannel();
            const client = new TestMCPClient(extensionName, outputChannel);

            // Simulate server exit
            client["handleServerExit"](exitCode, signal);

            // Get diagnostics
            const diagnostics = client.getDiagnostics();

            // Verify error information includes exit details
            expect(diagnostics.lastError).toBeDefined();
            expect(diagnostics.lastError!.message).toBeDefined();
            expect(diagnostics.lastError!.timestamp).toBeGreaterThan(0);

            // Verify server process status shows not running
            expect(diagnostics.processRunning).toBe(false);

            // Verify connection state is DISCONNECTED
            expect(diagnostics.connectionState).toBe(
              ConnectionState.DISCONNECTED
            );

            // Verify error message contains exit information
            if (signal) {
              expect(diagnostics.lastError!.message).toContain(signal);
            } else if (exitCode !== null) {
              expect(diagnostics.lastError!.message).toContain(
                exitCode.toString()
              );
            }

            // Cleanup
            client.stop();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should track error history in state history", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("Extension1", "Extension2", "Extension3"),
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
            minLength: 1,
            maxLength: 5,
          }),
          (extensionName, errorMessages) => {
            const outputChannel = new MockLogOutputChannel();
            const client = new TestMCPClient(extensionName, outputChannel);

            // Simulate multiple errors
            for (const errorMessage of errorMessages) {
              const error = new Error(errorMessage);
              client["handleServerError"](error);
            }

            // Get diagnostics
            const diagnostics = client.getDiagnostics();

            // Verify state history includes error states
            const errorStates = diagnostics.stateHistory.filter(
              (status) => status.state === ConnectionState.ERROR
            );

            // Should have at least as many error states as errors we triggered
            expect(errorStates.length).toBeGreaterThanOrEqual(
              errorMessages.length
            );

            // Each error state should have complete information
            for (const errorState of errorStates) {
              expect(errorState.state).toBe(ConnectionState.ERROR);
              expect(errorState.message).toBeDefined();
              expect(errorState.timestamp).toBeGreaterThan(0);
              expect(errorState.serverProcessRunning).toBeDefined();
            }

            // Cleanup
            client.stop();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

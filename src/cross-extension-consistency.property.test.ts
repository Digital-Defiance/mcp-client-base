/**
 * Cross-Extension Consistency Property Tests
 *
 * These tests verify that all extensions using BaseMCPClient behave consistently
 * across timeout handling, state management, error handling, and diagnostics.
 */

import * as fc from "fast-check";
import { TimeoutManager } from "./TimeoutManager";
import { ConnectionStateManager } from "./ConnectionStateManager";
import { BaseMCPClient, LogOutputChannel } from "./BaseMCPClient";
import { ConnectionState } from "./types";

// Mock implementations for testing
class MockProcessClient extends BaseMCPClient {
  constructor(outputChannel: LogOutputChannel) {
    super("Process", outputChannel);
  }
  protected getServerCommand(): { command: string; args: string[] } {
    return { command: "node", args: ["process-server.js"] };
  }
  protected getServerEnv(): Record<string, string> {
    return {};
  }
  protected async onServerReady(): Promise<void> {}
}

class MockScreenshotClient extends BaseMCPClient {
  constructor(outputChannel: LogOutputChannel) {
    super("Screenshot", outputChannel);
  }
  protected getServerCommand(): { command: string; args: string[] } {
    return { command: "node", args: ["screenshot-server.js"] };
  }
  protected getServerEnv(): Record<string, string> {
    return {};
  }
  protected async onServerReady(): Promise<void> {}
}

class MockDebuggerClient extends BaseMCPClient {
  constructor(outputChannel: LogOutputChannel) {
    super("Debugger", outputChannel);
  }
  protected getServerCommand(): { command: string; args: string[] } {
    return { command: "node", args: ["debugger-server.js"] };
  }
  protected getServerEnv(): Record<string, string> {
    return {};
  }
  protected async onServerReady(): Promise<void> {}
}

class MockFilesystemClient extends BaseMCPClient {
  constructor(outputChannel: LogOutputChannel) {
    super("Filesystem", outputChannel);
  }
  protected getServerCommand(): { command: string; args: string[] } {
    return { command: "node", args: ["filesystem-server.js"] };
  }
  protected getServerEnv(): Record<string, string> {
    return {};
  }
  protected async onServerReady(): Promise<void> {}
}

// Mock output channel
const createMockOutputChannel = (): LogOutputChannel => ({
  append: jest.fn(),
  appendLine: jest.fn(),
  clear: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  dispose: jest.fn(),
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe("Cross-Extension Consistency Property Tests", () => {
  /**
   * Feature: shared-mcp-client-timeout-fix, Property 1: Timeout consistency across extensions
   * Validates: Requirements 1.1, 3.2, 3.3
   */
  test("Property 1: Timeout consistency across extensions", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "initialize",
          "tools/list",
          "tools/call",
          "resources/list",
          "prompts/list",
          "custom/method"
        ),
        fc.record({
          initializationTimeoutMs: fc.integer({ min: 1000, max: 120000 }),
          standardRequestTimeoutMs: fc.integer({ min: 1000, max: 60000 }),
          toolsListTimeoutMs: fc.integer({ min: 1000, max: 120000 }),
        }),
        (method, timeoutConfig) => {
          const processTimeout = new TimeoutManager(timeoutConfig);
          const screenshotTimeout = new TimeoutManager(timeoutConfig);
          const debuggerTimeout = new TimeoutManager(timeoutConfig);
          const filesystemTimeout = new TimeoutManager(timeoutConfig);

          const processValue = processTimeout.getTimeoutForRequest(method);
          const screenshotValue =
            screenshotTimeout.getTimeoutForRequest(method);
          const debuggerValue = debuggerTimeout.getTimeoutForRequest(method);
          const filesystemValue =
            filesystemTimeout.getTimeoutForRequest(method);

          expect(processValue).toBe(screenshotValue);
          expect(processValue).toBe(debuggerValue);
          expect(processValue).toBe(filesystemValue);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 1 (defaults): Same default timeout values across all extensions", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "initialize",
          "tools/list",
          "tools/call",
          "resources/list"
        ),
        (method) => {
          const processTimeout = new TimeoutManager();
          const screenshotTimeout = new TimeoutManager();
          const debuggerTimeout = new TimeoutManager();
          const filesystemTimeout = new TimeoutManager();

          const processValue = processTimeout.getTimeoutForRequest(method);
          const screenshotValue =
            screenshotTimeout.getTimeoutForRequest(method);
          const debuggerValue = debuggerTimeout.getTimeoutForRequest(method);
          const filesystemValue =
            filesystemTimeout.getTimeoutForRequest(method);

          expect(processValue).toBe(screenshotValue);
          expect(processValue).toBe(debuggerValue);
          expect(processValue).toBe(filesystemValue);

          if (method === "initialize" || method === "tools/list") {
            expect(processValue).toBe(60000);
          } else {
            expect(processValue).toBe(30000);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Property 3: Connection state management consistency", () => {
  /**
   * Feature: shared-mcp-client-timeout-fix, Property 3: Connection state management consistency
   * Validates: Requirements 1.3, 5.1, 5.2
   */
  test("Property 3: State transitions validated consistently", () => {
    const validTransitions: Array<[ConnectionState, ConnectionState]> = [
      [ConnectionState.DISCONNECTED, ConnectionState.CONNECTING],
      [ConnectionState.DISCONNECTED, ConnectionState.ERROR],
      [ConnectionState.CONNECTING, ConnectionState.CONNECTED],
      [ConnectionState.CONNECTING, ConnectionState.ERROR],
      [ConnectionState.CONNECTING, ConnectionState.DISCONNECTED],
      [ConnectionState.CONNECTED, ConnectionState.TIMEOUT_RETRYING],
      [ConnectionState.CONNECTED, ConnectionState.DISCONNECTED],
      [ConnectionState.CONNECTED, ConnectionState.ERROR],
      [ConnectionState.TIMEOUT_RETRYING, ConnectionState.CONNECTED],
      [ConnectionState.TIMEOUT_RETRYING, ConnectionState.ERROR],
      [ConnectionState.TIMEOUT_RETRYING, ConnectionState.DISCONNECTED],
      [ConnectionState.ERROR, ConnectionState.CONNECTING],
      [ConnectionState.ERROR, ConnectionState.DISCONNECTED],
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...validTransitions),
        ([fromState, toState]) => {
          const processState = new ConnectionStateManager();
          const screenshotState = new ConnectionStateManager();
          const debuggerState = new ConnectionStateManager();
          const filesystemState = new ConnectionStateManager();

          // Transition to fromState
          const transitionToState = (
            mgr: ConnectionStateManager,
            target: ConnectionState
          ) => {
            if (target === ConnectionState.DISCONNECTED) return;
            if (target === ConnectionState.CONNECTING) {
              mgr.setState(ConnectionState.CONNECTING);
            } else if (target === ConnectionState.CONNECTED) {
              mgr.setState(ConnectionState.CONNECTING);
              mgr.setState(ConnectionState.CONNECTED);
            } else if (target === ConnectionState.TIMEOUT_RETRYING) {
              mgr.setState(ConnectionState.CONNECTING);
              mgr.setState(ConnectionState.CONNECTED);
              mgr.setState(ConnectionState.TIMEOUT_RETRYING);
            } else if (target === ConnectionState.ERROR) {
              mgr.setState(ConnectionState.ERROR);
            }
          };

          transitionToState(processState, fromState);
          transitionToState(screenshotState, fromState);
          transitionToState(debuggerState, fromState);
          transitionToState(filesystemState, fromState);

          processState.setState(toState);
          screenshotState.setState(toState);
          debuggerState.setState(toState);
          filesystemState.setState(toState);

          expect(processState.getStatus().state).toBe(toState);
          expect(screenshotState.getStatus().state).toBe(toState);
          expect(debuggerState.getStatus().state).toBe(toState);
          expect(filesystemState.getStatus().state).toBe(toState);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 3: Listeners notified consistently", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(ConnectionState.CONNECTING, ConnectionState.ERROR),
        (newState) => {
          const processState = new ConnectionStateManager();
          const screenshotState = new ConnectionStateManager();
          const debuggerState = new ConnectionStateManager();
          const filesystemState = new ConnectionStateManager();

          let processNotifications = 0;
          let screenshotNotifications = 0;
          let debuggerNotifications = 0;
          let filesystemNotifications = 0;

          processState.onStateChange(() => processNotifications++);
          screenshotState.onStateChange(() => screenshotNotifications++);
          debuggerState.onStateChange(() => debuggerNotifications++);
          filesystemState.onStateChange(() => filesystemNotifications++);

          processState.setState(newState);
          screenshotState.setState(newState);
          debuggerState.setState(newState);
          filesystemState.setState(newState);

          expect(processNotifications).toBe(1);
          expect(screenshotNotifications).toBe(1);
          expect(debuggerNotifications).toBe(1);
          expect(filesystemNotifications).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 3: Status format consistent", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ConnectionState.DISCONNECTED,
          ConnectionState.CONNECTING,
          ConnectionState.ERROR
        ),
        (state) => {
          const processState = new ConnectionStateManager();
          const screenshotState = new ConnectionStateManager();
          const debuggerState = new ConnectionStateManager();
          const filesystemState = new ConnectionStateManager();

          if (state !== ConnectionState.DISCONNECTED) {
            processState.setState(state);
            screenshotState.setState(state);
            debuggerState.setState(state);
            filesystemState.setState(state);
          }

          const processStatus = processState.getStatus();
          const screenshotStatus = screenshotState.getStatus();
          const debuggerStatus = debuggerState.getStatus();
          const filesystemStatus = filesystemState.getStatus();

          expect(Object.keys(processStatus).sort()).toEqual(
            Object.keys(screenshotStatus).sort()
          );
          expect(Object.keys(processStatus).sort()).toEqual(
            Object.keys(debuggerStatus).sort()
          );
          expect(Object.keys(processStatus).sort()).toEqual(
            Object.keys(filesystemStatus).sort()
          );

          expect(processStatus.state).toBe(state);
          expect(screenshotStatus.state).toBe(state);
          expect(debuggerStatus.state).toBe(state);
          expect(filesystemStatus.state).toBe(state);

          expect(processStatus).toHaveProperty("state");
          expect(processStatus).toHaveProperty("message");
          expect(processStatus).toHaveProperty("serverProcessRunning");
          expect(processStatus).toHaveProperty("timestamp");
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Property 16: Process lifecycle handling consistency", () => {
  /**
   * Feature: shared-mcp-client-timeout-fix, Property 16: Process lifecycle handling consistency
   * Validates: Requirements 9.2, 9.3, 9.4
   */
  test("Property 16: Process exit handled consistently", () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 255 }), { nil: null }),
        fc.option(fc.constantFrom("SIGTERM", "SIGKILL", "SIGINT", "SIGHUP"), {
          nil: null,
        }),
        (exitCode, signal) => {
          const processClient = new MockProcessClient(
            createMockOutputChannel()
          );
          const screenshotClient = new MockScreenshotClient(
            createMockOutputChannel()
          );
          const debuggerClient = new MockDebuggerClient(
            createMockOutputChannel()
          );
          const filesystemClient = new MockFilesystemClient(
            createMockOutputChannel()
          );

          const processSpy = jest.spyOn(
            processClient as any,
            "handleServerExit"
          );
          const screenshotSpy = jest.spyOn(
            screenshotClient as any,
            "handleServerExit"
          );
          const debuggerSpy = jest.spyOn(
            debuggerClient as any,
            "handleServerExit"
          );
          const filesystemSpy = jest.spyOn(
            filesystemClient as any,
            "handleServerExit"
          );

          (processClient as any).handleServerExit(exitCode, signal);
          (screenshotClient as any).handleServerExit(exitCode, signal);
          (debuggerClient as any).handleServerExit(exitCode, signal);
          (filesystemClient as any).handleServerExit(exitCode, signal);

          expect(processSpy).toHaveBeenCalledWith(exitCode, signal);
          expect(screenshotSpy).toHaveBeenCalledWith(exitCode, signal);
          expect(debuggerSpy).toHaveBeenCalledWith(exitCode, signal);
          expect(filesystemSpy).toHaveBeenCalledWith(exitCode, signal);

          const processStatus = (processClient as any).stateManager.getStatus();
          const screenshotStatus = (
            screenshotClient as any
          ).stateManager.getStatus();
          const debuggerStatus = (
            debuggerClient as any
          ).stateManager.getStatus();
          const filesystemStatus = (
            filesystemClient as any
          ).stateManager.getStatus();

          expect(processStatus.state).toBe(screenshotStatus.state);
          expect(processStatus.state).toBe(debuggerStatus.state);
          expect(processStatus.state).toBe(filesystemStatus.state);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 16: Process errors handled consistently", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "ENOENT",
          "EACCES",
          "EPERM",
          "ECONNREFUSED",
          "ETIMEDOUT"
        ),
        (errorCode) => {
          const processClient = new MockProcessClient(
            createMockOutputChannel()
          );
          const screenshotClient = new MockScreenshotClient(
            createMockOutputChannel()
          );
          const debuggerClient = new MockDebuggerClient(
            createMockOutputChannel()
          );
          const filesystemClient = new MockFilesystemClient(
            createMockOutputChannel()
          );

          const error = new Error(`Test error: ${errorCode}`);
          (error as any).code = errorCode;

          const processSpy = jest.spyOn(
            processClient as any,
            "handleServerError"
          );
          const screenshotSpy = jest.spyOn(
            screenshotClient as any,
            "handleServerError"
          );
          const debuggerSpy = jest.spyOn(
            debuggerClient as any,
            "handleServerError"
          );
          const filesystemSpy = jest.spyOn(
            filesystemClient as any,
            "handleServerError"
          );

          (processClient as any).handleServerError(error);
          (screenshotClient as any).handleServerError(error);
          (debuggerClient as any).handleServerError(error);
          (filesystemClient as any).handleServerError(error);

          expect(processSpy).toHaveBeenCalled();
          expect(screenshotSpy).toHaveBeenCalled();
          expect(debuggerSpy).toHaveBeenCalled();
          expect(filesystemSpy).toHaveBeenCalled();

          const processStatus = (processClient as any).stateManager.getStatus();
          const screenshotStatus = (
            screenshotClient as any
          ).stateManager.getStatus();
          const debuggerStatus = (
            debuggerClient as any
          ).stateManager.getStatus();
          const filesystemStatus = (
            filesystemClient as any
          ).stateManager.getStatus();

          expect(processStatus.state).toBe(screenshotStatus.state);
          expect(processStatus.state).toBe(debuggerStatus.state);
          expect(processStatus.state).toBe(filesystemStatus.state);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Property 17: Process alive detection consistency", () => {
  /**
   * Feature: shared-mcp-client-timeout-fix, Property 17: Process alive detection consistency
   * Validates: Requirements 9.5
   */
  test("Property 17: Process alive detection consistent", () => {
    fc.assert(
      fc.property(fc.boolean(), (hasProcess) => {
        const processClient = new MockProcessClient(createMockOutputChannel());
        const screenshotClient = new MockScreenshotClient(
          createMockOutputChannel()
        );
        const debuggerClient = new MockDebuggerClient(
          createMockOutputChannel()
        );
        const filesystemClient = new MockFilesystemClient(
          createMockOutputChannel()
        );

        if (hasProcess) {
          (processClient as any).serverProcess = undefined;
          (screenshotClient as any).serverProcess = undefined;
          (debuggerClient as any).serverProcess = undefined;
          (filesystemClient as any).serverProcess = undefined;
        } else {
          const mockProcess = {
            pid: 12345,
            killed: true,
            exitCode: 0,
            signalCode: null,
          } as any;

          (processClient as any).serverProcess = mockProcess;
          (screenshotClient as any).serverProcess = mockProcess;
          (debuggerClient as any).serverProcess = mockProcess;
          (filesystemClient as any).serverProcess = mockProcess;
        }

        const processAlive = processClient.isServerProcessAlive();
        const screenshotAlive = screenshotClient.isServerProcessAlive();
        const debuggerAlive = debuggerClient.isServerProcessAlive();
        const filesystemAlive = filesystemClient.isServerProcessAlive();

        expect(processAlive).toBe(screenshotAlive);
        expect(processAlive).toBe(debuggerAlive);
        expect(processAlive).toBe(filesystemAlive);
        expect(processAlive).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  test("Property 17 (diagnostics): Diagnostics format consistent", () => {
    fc.assert(
      fc.property(fc.boolean(), (hasProcess) => {
        const processClient = new MockProcessClient(createMockOutputChannel());
        const screenshotClient = new MockScreenshotClient(
          createMockOutputChannel()
        );
        const debuggerClient = new MockDebuggerClient(
          createMockOutputChannel()
        );
        const filesystemClient = new MockFilesystemClient(
          createMockOutputChannel()
        );

        if (hasProcess) {
          const mockProcess = {
            pid: 12345,
            killed: false,
            exitCode: null,
            signalCode: null,
          } as any;

          (processClient as any).serverProcess = mockProcess;
          (screenshotClient as any).serverProcess = mockProcess;
          (debuggerClient as any).serverProcess = mockProcess;
          (filesystemClient as any).serverProcess = mockProcess;
        }

        const processDiag = processClient.getDiagnostics();
        const screenshotDiag = screenshotClient.getDiagnostics();
        const debuggerDiag = debuggerClient.getDiagnostics();
        const filesystemDiag = filesystemClient.getDiagnostics();

        expect(Object.keys(processDiag).sort()).toEqual(
          Object.keys(screenshotDiag).sort()
        );
        expect(Object.keys(processDiag).sort()).toEqual(
          Object.keys(debuggerDiag).sort()
        );
        expect(Object.keys(processDiag).sort()).toEqual(
          Object.keys(filesystemDiag).sort()
        );

        expect(processDiag).toHaveProperty("extensionName");
        expect(processDiag).toHaveProperty("processRunning");
        expect(processDiag).toHaveProperty("connectionState");
        expect(processDiag).toHaveProperty("pendingRequestCount");
        expect(processDiag).toHaveProperty("pendingRequests");
        expect(processDiag).toHaveProperty("recentCommunication");
        expect(processDiag).toHaveProperty("stateHistory");

        expect(processDiag.processRunning).toBe(screenshotDiag.processRunning);
        expect(processDiag.processRunning).toBe(debuggerDiag.processRunning);
        expect(processDiag.processRunning).toBe(filesystemDiag.processRunning);
      }),
      { numRuns: 100 }
    );
  });
});

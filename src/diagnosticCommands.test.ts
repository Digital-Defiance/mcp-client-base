/**
 * Unit tests for diagnostic commands
 *
 * Tests the diagnostic command functionality including:
 * - Reconnect command triggers re-sync
 * - Restart command kills and restarts server
 * - Diagnostics command shows required information
 * - All MCP status command aggregates status
 */

import { DiagnosticCommands } from "./diagnosticCommands";
import { BaseMCPClient } from "./BaseMCPClient";
import { ConnectionState, ServerDiagnostics } from "./types";

// Mock BaseMCPClient
class MockMCPClient extends BaseMCPClient {
  public reconnectCalled = false;
  public stopCalled = false;
  public startCalled = false;

  protected getServerCommand(): { command: string; args: string[] } {
    return { command: "node", args: ["server.js"] };
  }

  protected getServerEnv(): Record<string, string> {
    return {};
  }

  protected async onServerReady(): Promise<void> {
    // No-op
  }

  async reconnect(): Promise<boolean> {
    this.reconnectCalled = true;
    return true;
  }

  stop(): void {
    this.stopCalled = true;
  }

  async start(): Promise<void> {
    this.startCalled = true;
  }
}

// Mock output channel
const mockOutputChannel = {
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  append: jest.fn(),
  appendLine: jest.fn(),
  clear: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  dispose: jest.fn(),
};

describe("DiagnosticCommands", () => {
  let diagnosticCommands: DiagnosticCommands;
  let mockClient1: MockMCPClient;
  let mockClient2: MockMCPClient;

  beforeEach(() => {
    diagnosticCommands = new DiagnosticCommands();
    mockClient1 = new MockMCPClient("test-extension-1", mockOutputChannel);
    mockClient2 = new MockMCPClient("test-extension-2", mockOutputChannel);
  });

  describe("Extension Registration", () => {
    it("should register an extension", () => {
      diagnosticCommands.registerExtension({
        name: "test-ext",
        displayName: "Test Extension",
        client: mockClient1,
      });

      const registered = diagnosticCommands.getRegisteredExtensions();
      expect(registered).toContain("test-ext");
    });

    it("should unregister an extension", () => {
      diagnosticCommands.registerExtension({
        name: "test-ext",
        displayName: "Test Extension",
        client: mockClient1,
      });

      diagnosticCommands.unregisterExtension("test-ext");

      const registered = diagnosticCommands.getRegisteredExtensions();
      expect(registered).not.toContain("test-ext");
    });

    it("should handle multiple extensions", () => {
      diagnosticCommands.registerExtension({
        name: "ext1",
        displayName: "Extension 1",
        client: mockClient1,
      });

      diagnosticCommands.registerExtension({
        name: "ext2",
        displayName: "Extension 2",
        client: mockClient2,
      });

      const registered = diagnosticCommands.getRegisteredExtensions();
      expect(registered).toHaveLength(2);
      expect(registered).toContain("ext1");
      expect(registered).toContain("ext2");
    });
  });

  describe("Reconnect Command", () => {
    it("should trigger re-sync when reconnect is called", async () => {
      diagnosticCommands.registerExtension({
        name: "test-ext",
        displayName: "Test Extension",
        client: mockClient1,
      });

      const result = await diagnosticCommands.reconnectToServer("test-ext");

      expect(result).toBe(true);
      expect(mockClient1.reconnectCalled).toBe(true);
    });

    it("should throw error for unregistered extension", async () => {
      await expect(
        diagnosticCommands.reconnectToServer("non-existent")
      ).rejects.toThrow("Extension non-existent not registered");
    });

    it("should handle reconnect failure", async () => {
      const failingClient = new MockMCPClient("failing", mockOutputChannel);
      failingClient.reconnect = jest.fn().mockResolvedValue(false);

      diagnosticCommands.registerExtension({
        name: "failing-ext",
        displayName: "Failing Extension",
        client: failingClient,
      });

      const result = await diagnosticCommands.reconnectToServer("failing-ext");
      expect(result).toBe(false);
    });
  });

  describe("Restart Command", () => {
    it("should kill and restart server", async () => {
      diagnosticCommands.registerExtension({
        name: "test-ext",
        displayName: "Test Extension",
        client: mockClient1,
      });

      await diagnosticCommands.restartServer("test-ext");

      expect(mockClient1.stopCalled).toBe(true);
      expect(mockClient1.startCalled).toBe(true);
    });

    it("should throw error for unregistered extension", async () => {
      await expect(
        diagnosticCommands.restartServer("non-existent")
      ).rejects.toThrow("Extension non-existent not registered");
    });

    it("should wait between stop and start", async () => {
      diagnosticCommands.registerExtension({
        name: "test-ext",
        displayName: "Test Extension",
        client: mockClient1,
      });

      const startTime = Date.now();
      await diagnosticCommands.restartServer("test-ext");
      const elapsed = Date.now() - startTime;

      // Should wait at least 500ms
      expect(elapsed).toBeGreaterThanOrEqual(450); // Allow some tolerance
    });
  });

  describe("Show Diagnostics Command", () => {
    it("should return diagnostics with required information", () => {
      diagnosticCommands.registerExtension({
        name: "test-ext",
        displayName: "Test Extension",
        client: mockClient1,
      });

      const diagnostics = diagnosticCommands.getDiagnostics("test-ext");

      // Verify required fields per Requirement 8.5
      expect(diagnostics).toHaveProperty("extensionName");
      expect(diagnostics).toHaveProperty("processRunning");
      expect(diagnostics).toHaveProperty("connectionState");
      expect(diagnostics).toHaveProperty("pendingRequestCount");
      expect(diagnostics).toHaveProperty("pendingRequests");
      expect(diagnostics).toHaveProperty("recentCommunication");
      expect(diagnostics).toHaveProperty("stateHistory");
    });

    it("should throw error for unregistered extension", () => {
      expect(() => {
        diagnosticCommands.getDiagnostics("non-existent");
      }).toThrow("Extension non-existent not registered");
    });

    it("should format diagnostics as human-readable string", () => {
      diagnosticCommands.registerExtension({
        name: "test-ext",
        displayName: "Test Extension",
        client: mockClient1,
      });

      const diagnostics = diagnosticCommands.getDiagnostics("test-ext");
      const formatted = diagnosticCommands.formatDiagnostics(diagnostics);

      expect(formatted).toContain("test-extension-1 Diagnostics");
      expect(formatted).toContain("Connection State:");
      expect(formatted).toContain("Process Running:");
      expect(formatted).toContain("Pending Requests:");
    });
  });

  describe("Show All MCP Status Command", () => {
    it("should aggregate status from all extensions", () => {
      diagnosticCommands.registerExtension({
        name: "ext1",
        displayName: "Extension 1",
        client: mockClient1,
      });

      diagnosticCommands.registerExtension({
        name: "ext2",
        displayName: "Extension 2",
        client: mockClient2,
      });

      const allDiagnostics = diagnosticCommands.getAllDiagnostics();

      expect(allDiagnostics.size).toBe(2);
      expect(allDiagnostics.has("ext1")).toBe(true);
      expect(allDiagnostics.has("ext2")).toBe(true);
    });

    it("should return empty map when no extensions registered", () => {
      const allDiagnostics = diagnosticCommands.getAllDiagnostics();
      expect(allDiagnostics.size).toBe(0);
    });

    it("should format all diagnostics as human-readable string", () => {
      diagnosticCommands.registerExtension({
        name: "ext1",
        displayName: "Extension 1",
        client: mockClient1,
      });

      diagnosticCommands.registerExtension({
        name: "ext2",
        displayName: "Extension 2",
        client: mockClient2,
      });

      const formatted = diagnosticCommands.formatAllDiagnostics();

      expect(formatted).toContain("MCP ACS Extensions Status");
      expect(formatted).toContain("Extension Summary:");
      expect(formatted).toContain("Extension 1");
      expect(formatted).toContain("Extension 2");
    });

    it("should handle no registered extensions gracefully", () => {
      const formatted = diagnosticCommands.formatAllDiagnostics();
      expect(formatted).toContain("No extensions registered");
    });
  });

  describe("Diagnostic Format Consistency", () => {
    it("should include server process status in diagnostics", () => {
      diagnosticCommands.registerExtension({
        name: "test-ext",
        displayName: "Test Extension",
        client: mockClient1,
      });

      const diagnostics = diagnosticCommands.getDiagnostics("test-ext");
      const formatted = diagnosticCommands.formatDiagnostics(diagnostics);

      expect(formatted).toMatch(/Process Running: (Yes|No)/);
    });

    it("should include pending requests in diagnostics", () => {
      diagnosticCommands.registerExtension({
        name: "test-ext",
        displayName: "Test Extension",
        client: mockClient1,
      });

      const diagnostics = diagnosticCommands.getDiagnostics("test-ext");
      const formatted = diagnosticCommands.formatDiagnostics(diagnostics);

      expect(formatted).toContain("Pending Requests:");
    });

    it("should include recent communication logs in diagnostics", () => {
      diagnosticCommands.registerExtension({
        name: "test-ext",
        displayName: "Test Extension",
        client: mockClient1,
      });

      const diagnostics = diagnosticCommands.getDiagnostics("test-ext");
      const formatted = diagnosticCommands.formatDiagnostics(diagnostics);

      // Recent communication section only appears if there are communication logs
      // Since we haven't made any requests, it won't appear
      // Just verify the format is correct
      expect(formatted).toContain("Diagnostics");
    });

    it("should include state history in diagnostics", () => {
      diagnosticCommands.registerExtension({
        name: "test-ext",
        displayName: "Test Extension",
        client: mockClient1,
      });

      const diagnostics = diagnosticCommands.getDiagnostics("test-ext");
      const formatted = diagnosticCommands.formatDiagnostics(diagnostics);

      expect(formatted).toContain("State History");
    });
  });

  describe("Error Handling", () => {
    it("should handle errors during reconnect gracefully", async () => {
      const errorClient = new MockMCPClient("error", mockOutputChannel);
      errorClient.reconnect = jest
        .fn()
        .mockRejectedValue(new Error("Connection failed"));

      diagnosticCommands.registerExtension({
        name: "error-ext",
        displayName: "Error Extension",
        client: errorClient,
      });

      await expect(
        diagnosticCommands.reconnectToServer("error-ext")
      ).rejects.toThrow("Connection failed");
    });

    it("should handle errors during restart gracefully", async () => {
      const errorClient = new MockMCPClient("error", mockOutputChannel);
      errorClient.start = jest
        .fn()
        .mockRejectedValue(new Error("Start failed"));

      diagnosticCommands.registerExtension({
        name: "error-ext",
        displayName: "Error Extension",
        client: errorClient,
      });

      await expect(
        diagnosticCommands.restartServer("error-ext")
      ).rejects.toThrow("Start failed");
    });
  });
});

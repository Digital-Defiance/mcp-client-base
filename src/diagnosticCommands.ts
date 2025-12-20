/**
 * Shared diagnostic commands for MCP extensions
 *
 * Provides consistent diagnostic and troubleshooting commands across all
 * MCP ACS extensions (Process, Screenshot, Debugger, Filesystem).
 */

import { BaseMCPClient } from "./BaseMCPClient";
import { ConnectionState, ServerDiagnostics } from "./types";

/**
 * Extension registration info for diagnostic commands
 */
export interface ExtensionInfo {
  name: string;
  displayName: string;
  client: BaseMCPClient;
}

/**
 * Diagnostic command handlers
 */
export class DiagnosticCommands {
  private extensions: Map<string, ExtensionInfo> = new Map();

  /**
   * Register an extension with the diagnostic system
   */
  registerExtension(info: ExtensionInfo): void {
    this.extensions.set(info.name, info);
  }

  /**
   * Unregister an extension
   */
  unregisterExtension(name: string): void {
    this.extensions.delete(name);
  }

  /**
   * Reconnect to server for a specific extension
   * Implements Requirement 8.1: WHEN I execute a "Reconnect" command THEN the System SHALL attempt re-synchronization
   */
  async reconnectToServer(extensionName: string): Promise<boolean> {
    const extension = this.extensions.get(extensionName);
    if (!extension) {
      throw new Error(`Extension ${extensionName} not registered`);
    }

    return await extension.client.reconnect();
  }

  /**
   * Restart server for a specific extension
   * Implements Requirement 8.2: WHEN I execute a "Restart Server" command THEN the System SHALL restart the server
   */
  async restartServer(extensionName: string): Promise<void> {
    const extension = this.extensions.get(extensionName);
    if (!extension) {
      throw new Error(`Extension ${extensionName} not registered`);
    }

    // Stop and start the server
    extension.client.stop();

    // Wait a moment for cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));

    await extension.client.start();
  }

  /**
   * Get diagnostics for a specific extension
   * Implements Requirement 8.3: WHEN I execute a "Show Diagnostics" command THEN the System SHALL display diagnostics
   * Implements Requirement 8.5: WHEN diagnostics are displayed THEN the System SHALL include server process status, pending requests, and recent communication logs
   */
  getDiagnostics(extensionName: string): ServerDiagnostics {
    const extension = this.extensions.get(extensionName);
    if (!extension) {
      throw new Error(`Extension ${extensionName} not registered`);
    }

    return extension.client.getDiagnostics();
  }

  /**
   * Get diagnostics for all registered extensions
   * Implements Requirement 8.4: WHEN I execute a "Show All MCP Status" command THEN the System SHALL display connection status for all extensions
   */
  getAllDiagnostics(): Map<string, ServerDiagnostics> {
    const diagnostics = new Map<string, ServerDiagnostics>();

    for (const [name, extension] of this.extensions) {
      diagnostics.set(name, extension.client.getDiagnostics());
    }

    return diagnostics;
  }

  /**
   * Format diagnostics as a human-readable string
   */
  formatDiagnostics(diagnostics: ServerDiagnostics): string {
    const lines: string[] = [];

    lines.push(`=== ${diagnostics.extensionName} Diagnostics ===`);
    lines.push("");

    // Connection state
    lines.push(`Connection State: ${diagnostics.connectionState}`);
    lines.push(`Process Running: ${diagnostics.processRunning ? "Yes" : "No"}`);
    if (diagnostics.processId) {
      lines.push(`Process ID: ${diagnostics.processId}`);
    }
    lines.push("");

    // Pending requests
    lines.push(`Pending Requests: ${diagnostics.pendingRequestCount}`);
    if (diagnostics.pendingRequests.length > 0) {
      lines.push("");
      lines.push("Active Requests:");
      for (const req of diagnostics.pendingRequests) {
        lines.push(
          `  - [${req.id}] ${req.method} (${req.elapsedMs}ms elapsed)`
        );
      }
    }
    lines.push("");

    // Last error
    if (diagnostics.lastError) {
      lines.push(`Last Error: ${diagnostics.lastError.message}`);
      lines.push(
        `  Timestamp: ${new Date(
          diagnostics.lastError.timestamp
        ).toISOString()}`
      );
      lines.push("");
    }

    // Recent communication
    if (diagnostics.recentCommunication.length > 0) {
      lines.push("Recent Communication (last 10):");
      const recent = diagnostics.recentCommunication.slice(-10);
      for (const comm of recent) {
        const timestamp = new Date(comm.timestamp).toISOString();
        const status = comm.success ? "✓" : "✗";
        const method = comm.method || "notification";
        lines.push(`  ${status} [${timestamp}] ${comm.type}: ${method}`);
      }
      lines.push("");
    }

    // State history
    if (diagnostics.stateHistory.length > 0) {
      lines.push("State History (last 5):");
      const history = diagnostics.stateHistory.slice(-5);
      for (const state of history) {
        const timestamp = new Date(state.timestamp).toISOString();
        lines.push(`  [${timestamp}] ${state.state}: ${state.message}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Format all diagnostics as a human-readable string
   */
  formatAllDiagnostics(): string {
    const lines: string[] = [];

    lines.push("=".repeat(80));
    lines.push("MCP ACS Extensions Status");
    lines.push("=".repeat(80));
    lines.push("");

    const allDiagnostics = this.getAllDiagnostics();

    if (allDiagnostics.size === 0) {
      lines.push("No extensions registered");
      return lines.join("\n");
    }

    // Summary table
    lines.push("Extension Summary:");
    lines.push("");
    lines.push(
      "Extension".padEnd(30) +
        "State".padEnd(20) +
        "Process".padEnd(15) +
        "Pending"
    );
    lines.push("-".repeat(80));

    for (const [name, diag] of allDiagnostics) {
      const extension = this.extensions.get(name);
      const displayName = extension?.displayName || name;
      const state = diag.connectionState;
      const processStatus = diag.processRunning
        ? `PID ${diag.processId}`
        : "Not Running";
      const pending = diag.pendingRequestCount.toString();

      lines.push(
        displayName.padEnd(30) +
          state.padEnd(20) +
          processStatus.padEnd(15) +
          pending
      );
    }

    lines.push("");
    lines.push("=".repeat(80));
    lines.push("");

    // Detailed diagnostics for each extension
    for (const [name, diag] of allDiagnostics) {
      lines.push(this.formatDiagnostics(diag));
      lines.push("");
      lines.push("=".repeat(80));
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Get list of registered extensions
   */
  getRegisteredExtensions(): string[] {
    return Array.from(this.extensions.keys());
  }
}

/**
 * Global diagnostic commands instance
 */
export const diagnosticCommands = new DiagnosticCommands();

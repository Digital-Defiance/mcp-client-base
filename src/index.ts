/**
 * @ai-capabilities-suite/mcp-client-base
 *
 * Shared MCP client base class providing consistent timeout handling,
 * automatic re-synchronization, and connection state management.
 */

// Export main classes
export { BaseMCPClient } from "./BaseMCPClient";
export type { LogOutputChannel } from "./BaseMCPClient";
export { TimeoutManager } from "./TimeoutManager";
export { ConnectionStateManager } from "./ConnectionStateManager";
export { ReSyncManager } from "./ReSyncManager";
export { DiagnosticCommands, diagnosticCommands } from "./diagnosticCommands";
export type { ExtensionInfo } from "./diagnosticCommands";

// Export types and interfaces
export * from "./types";

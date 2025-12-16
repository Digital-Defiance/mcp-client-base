/**
 * Shared types and interfaces for MCP client base
 */

/**
 * Timeout configuration for different types of requests
 */
export interface TimeoutConfig {
  /** Timeout for server initialization (default: 60000ms) */
  initializationTimeoutMs: number;
  /** Timeout for standard requests (default: 30000ms) */
  standardRequestTimeoutMs: number;
  /** Timeout for tools/list requests (default: 60000ms) */
  toolsListTimeoutMs: number;
}

/**
 * Result of configuration validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Connection states for MCP client
 */
export enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  TIMEOUT_RETRYING = "timeout_retrying",
  ERROR = "error",
}

/**
 * Connection status information
 */
export interface ConnectionStatus {
  state: ConnectionState;
  message: string;
  retryCount?: number;
  lastError?: Error;
  serverProcessRunning: boolean;
  timestamp: number;
}

/**
 * Re-synchronization configuration
 */
export interface ReSyncConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial retry delay in milliseconds (default: 2000) */
  retryDelayMs: number;
  /** Backoff multiplier for exponential backoff (default: 1.5) */
  backoffMultiplier: number;
}

/**
 * Result of re-synchronization attempt
 */
export interface ReSyncResult {
  success: boolean;
  attempts: number;
  error?: Error;
}

/**
 * Complete MCP client configuration
 */
export interface MCPClientConfig {
  timeout: TimeoutConfig;
  reSync: ReSyncConfig;
  logging: {
    logLevel: "debug" | "info" | "warn" | "error";
    logCommunication: boolean;
  };
}

/**
 * Pending request tracking
 */
export interface PendingRequest {
  id: number;
  method: string;
  params: unknown;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutHandle: NodeJS.Timeout;
  startTime: number;
}

/**
 * Communication log entry
 */
export interface CommunicationLogEntry {
  type: "request" | "response" | "notification";
  method?: string;
  timestamp: number;
  success: boolean;
  requestId?: number;
  error?: string;
}

/**
 * Server diagnostics information
 */
export interface ServerDiagnostics {
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

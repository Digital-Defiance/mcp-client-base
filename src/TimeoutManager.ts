/**
 * TimeoutManager - Manages timeout configuration and selection for MCP requests
 */

import { TimeoutConfig, ValidationResult } from "./types";

/**
 * Default timeout values (in milliseconds)
 */
const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  initializationTimeoutMs: 60000, // 60 seconds
  standardRequestTimeoutMs: 30000, // 30 seconds
  toolsListTimeoutMs: 60000, // 60 seconds
};

/**
 * Minimum allowed timeout values (in milliseconds)
 */
const MIN_TIMEOUT_MS = 1000; // 1 second

/**
 * Maximum allowed timeout values (in milliseconds)
 */
const MAX_TIMEOUT_MS = 300000; // 5 minutes

/**
 * TimeoutManager handles timeout configuration and provides
 * method-specific timeout values for MCP requests.
 */
export class TimeoutManager {
  private config: TimeoutConfig;

  /**
   * Creates a new TimeoutManager instance
   * @param config - Partial timeout configuration (merged with defaults)
   */
  constructor(config?: Partial<TimeoutConfig>) {
    this.config = { ...DEFAULT_TIMEOUT_CONFIG };
    if (config) {
      this.updateConfig(config);
    }
  }

  /**
   * Gets the appropriate timeout for a given request method
   * @param method - The JSON-RPC method name
   * @returns Timeout in milliseconds
   */
  getTimeoutForRequest(method: string): number {
    // Initialization requests get longer timeout
    if (method === "initialize") {
      return this.config.initializationTimeoutMs;
    }

    // Tools list requests get longer timeout
    if (method === "tools/list") {
      return this.config.toolsListTimeoutMs;
    }

    // All other requests use standard timeout
    return this.config.standardRequestTimeoutMs;
  }

  /**
   * Validates a timeout configuration
   * @param config - Configuration to validate
   * @returns Validation result with errors and warnings
   */
  validateConfig(config: Partial<TimeoutConfig>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate initializationTimeoutMs
    if (config.initializationTimeoutMs !== undefined) {
      if (typeof config.initializationTimeoutMs !== "number") {
        errors.push("initializationTimeoutMs must be a number");
      } else if (config.initializationTimeoutMs < MIN_TIMEOUT_MS) {
        errors.push(
          `initializationTimeoutMs must be at least ${MIN_TIMEOUT_MS}ms`
        );
      } else if (config.initializationTimeoutMs > MAX_TIMEOUT_MS) {
        errors.push(
          `initializationTimeoutMs must not exceed ${MAX_TIMEOUT_MS}ms`
        );
      } else if (!Number.isInteger(config.initializationTimeoutMs)) {
        errors.push("initializationTimeoutMs must be an integer");
      } else if (config.initializationTimeoutMs < 10000) {
        warnings.push(
          "initializationTimeoutMs is less than 10 seconds, which may be too short for slow servers"
        );
      }
    }

    // Validate standardRequestTimeoutMs
    if (config.standardRequestTimeoutMs !== undefined) {
      if (typeof config.standardRequestTimeoutMs !== "number") {
        errors.push("standardRequestTimeoutMs must be a number");
      } else if (config.standardRequestTimeoutMs < MIN_TIMEOUT_MS) {
        errors.push(
          `standardRequestTimeoutMs must be at least ${MIN_TIMEOUT_MS}ms`
        );
      } else if (config.standardRequestTimeoutMs > MAX_TIMEOUT_MS) {
        errors.push(
          `standardRequestTimeoutMs must not exceed ${MAX_TIMEOUT_MS}ms`
        );
      } else if (!Number.isInteger(config.standardRequestTimeoutMs)) {
        errors.push("standardRequestTimeoutMs must be an integer");
      } else if (config.standardRequestTimeoutMs < 5000) {
        warnings.push(
          "standardRequestTimeoutMs is less than 5 seconds, which may be too short for some operations"
        );
      }
    }

    // Validate toolsListTimeoutMs
    if (config.toolsListTimeoutMs !== undefined) {
      if (typeof config.toolsListTimeoutMs !== "number") {
        errors.push("toolsListTimeoutMs must be a number");
      } else if (config.toolsListTimeoutMs < MIN_TIMEOUT_MS) {
        errors.push(`toolsListTimeoutMs must be at least ${MIN_TIMEOUT_MS}ms`);
      } else if (config.toolsListTimeoutMs > MAX_TIMEOUT_MS) {
        errors.push(`toolsListTimeoutMs must not exceed ${MAX_TIMEOUT_MS}ms`);
      } else if (!Number.isInteger(config.toolsListTimeoutMs)) {
        errors.push("toolsListTimeoutMs must be an integer");
      } else if (config.toolsListTimeoutMs < 10000) {
        warnings.push(
          "toolsListTimeoutMs is less than 10 seconds, which may be too short for servers with many tools"
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Updates the timeout configuration
   * @param config - Partial configuration to merge with current config
   * @throws Error if configuration is invalid
   */
  updateConfig(config: Partial<TimeoutConfig>): void {
    const validation = this.validateConfig(config);

    if (!validation.valid) {
      throw new Error(
        `Invalid timeout configuration: ${validation.errors.join(", ")}`
      );
    }

    // Merge with existing config
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Gets the current timeout configuration
   * @returns Current timeout configuration
   */
  getConfig(): TimeoutConfig {
    return { ...this.config };
  }
}

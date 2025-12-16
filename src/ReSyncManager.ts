/**
 * ReSyncManager - Manages re-synchronization logic with exponential backoff
 *
 * Provides consistent re-synchronization behavior across all MCP extensions,
 * including retry counting, exponential backoff, and max retry enforcement.
 */

import { ReSyncConfig, ReSyncResult, ConnectionState } from "./types";
import { ConnectionStateManager } from "./ConnectionStateManager";

/**
 * Default re-synchronization configuration
 */
const DEFAULT_RESYNC_CONFIG: ReSyncConfig = {
  maxRetries: 3,
  retryDelayMs: 2000,
  backoffMultiplier: 1.5,
};

/**
 * ReSyncManager
 *
 * Manages automatic re-synchronization with exponential backoff.
 * Ensures consistent retry behavior across all MCP extensions.
 */
export class ReSyncManager {
  private config: ReSyncConfig;
  private currentAttempt: number;

  constructor(config?: Partial<ReSyncConfig>) {
    this.config = { ...DEFAULT_RESYNC_CONFIG, ...config };
    this.currentAttempt = 0;
  }

  /**
   * Attempt re-synchronization with exponential backoff
   * @param sendInitialize Function to send initialization request
   * @param stateManager Connection state manager for status updates
   * @returns Result of re-synchronization attempt
   */
  async attemptReSync(
    sendInitialize: () => Promise<void>,
    stateManager: ConnectionStateManager
  ): Promise<ReSyncResult> {
    const startAttempt = this.currentAttempt;

    while (this.shouldRetry()) {
      this.currentAttempt++;

      try {
        // Update state to indicate retry attempt
        stateManager.setState(ConnectionState.TIMEOUT_RETRYING, {
          message: `Re-synchronization attempt ${this.currentAttempt}/${this.config.maxRetries}`,
          retryCount: this.currentAttempt,
        });

        // Wait for backoff delay before retry (except for first attempt)
        if (this.currentAttempt > 1) {
          const delay = this.getNextRetryDelay();
          await this.sleep(delay);
        }

        // Attempt to re-initialize
        await sendInitialize();

        // Success - reset and return
        const attempts = this.currentAttempt - startAttempt;
        this.reset();

        stateManager.setState(ConnectionState.CONNECTED, {
          message: "Re-synchronization successful",
        });

        return {
          success: true,
          attempts,
        };
      } catch (error) {
        // If we've exhausted retries, fail
        if (!this.shouldRetry()) {
          const attempts = this.currentAttempt - startAttempt;

          stateManager.setState(ConnectionState.ERROR, {
            message: `Re-synchronization failed after ${attempts} attempts`,
            lastError:
              error instanceof Error ? error : new Error(String(error)),
          });

          return {
            success: false,
            attempts,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }

        // Otherwise, continue to next retry
      }
    }

    // Should not reach here, but handle it anyway
    const attempts = this.currentAttempt - startAttempt;
    return {
      success: false,
      attempts,
      error: new Error("Max retries exceeded"),
    };
  }

  /**
   * Reset retry counter
   */
  reset(): void {
    this.currentAttempt = 0;
  }

  /**
   * Check if another retry should be attempted
   * @returns true if current attempt count is less than max retries
   */
  shouldRetry(): boolean {
    return this.currentAttempt < this.config.maxRetries;
  }

  /**
   * Calculate next retry delay using exponential backoff
   * @returns Delay in milliseconds for next retry
   */
  getNextRetryDelay(): number {
    // For attempt N, delay = retryDelayMs * (backoffMultiplier ^ (N-1))
    // We use N-1 because the first retry (attempt 1) should use the base delay
    const exponent = this.currentAttempt - 1;
    return (
      this.config.retryDelayMs *
      Math.pow(this.config.backoffMultiplier, exponent)
    );
  }

  /**
   * Get current attempt number
   */
  getCurrentAttempt(): number {
    return this.currentAttempt;
  }

  /**
   * Get current configuration
   */
  getConfig(): ReSyncConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param config Partial configuration to update
   */
  updateConfig(config: Partial<ReSyncConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

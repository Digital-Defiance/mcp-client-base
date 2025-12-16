/**
 * Unit tests for ReSyncManager
 */

import { ReSyncManager } from "./ReSyncManager";
import { ConnectionStateManager } from "./ConnectionStateManager";
import { ConnectionState } from "./types";

describe("ReSyncManager", () => {
  describe("constructor", () => {
    test("should use default values when no config provided", () => {
      const manager = new ReSyncManager();
      const config = manager.getConfig();

      expect(config.maxRetries).toBe(3);
      expect(config.retryDelayMs).toBe(2000);
      expect(config.backoffMultiplier).toBe(1.5);
    });

    test("should merge provided config with defaults", () => {
      const manager = new ReSyncManager({
        maxRetries: 5,
      });
      const config = manager.getConfig();

      expect(config.maxRetries).toBe(5);
      expect(config.retryDelayMs).toBe(2000); // default
      expect(config.backoffMultiplier).toBe(1.5); // default
    });

    test("should accept custom configuration", () => {
      const manager = new ReSyncManager({
        maxRetries: 5,
        retryDelayMs: 3000,
        backoffMultiplier: 2.0,
      });
      const config = manager.getConfig();

      expect(config.maxRetries).toBe(5);
      expect(config.retryDelayMs).toBe(3000);
      expect(config.backoffMultiplier).toBe(2.0);
    });
  });

  describe("shouldRetry", () => {
    test("should return true when current attempt is less than max retries", () => {
      const manager = new ReSyncManager({ maxRetries: 3 });

      expect(manager.shouldRetry()).toBe(true);
      expect(manager.getCurrentAttempt()).toBe(0);
    });

    test("should return false when current attempt equals max retries", () => {
      const manager = new ReSyncManager({ maxRetries: 3 });

      // Simulate 3 attempts
      manager["currentAttempt"] = 3;

      expect(manager.shouldRetry()).toBe(false);
    });

    test("should return false when current attempt exceeds max retries", () => {
      const manager = new ReSyncManager({ maxRetries: 3 });

      // Simulate 4 attempts
      manager["currentAttempt"] = 4;

      expect(manager.shouldRetry()).toBe(false);
    });
  });

  describe("getNextRetryDelay", () => {
    test("should return base delay for first retry", () => {
      const manager = new ReSyncManager({
        retryDelayMs: 2000,
        backoffMultiplier: 1.5,
      });

      // Simulate being at attempt 1
      manager["currentAttempt"] = 1;

      const delay = manager.getNextRetryDelay();
      expect(delay).toBe(2000); // 2000 * 1.5^0 = 2000
    });

    test("should apply exponential backoff for subsequent retries", () => {
      const manager = new ReSyncManager({
        retryDelayMs: 2000,
        backoffMultiplier: 1.5,
      });

      // Simulate being at attempt 2
      manager["currentAttempt"] = 2;
      expect(manager.getNextRetryDelay()).toBe(3000); // 2000 * 1.5^1 = 3000

      // Simulate being at attempt 3
      manager["currentAttempt"] = 3;
      expect(manager.getNextRetryDelay()).toBe(4500); // 2000 * 1.5^2 = 4500

      // Simulate being at attempt 4
      manager["currentAttempt"] = 4;
      expect(manager.getNextRetryDelay()).toBe(6750); // 2000 * 1.5^3 = 6750
    });

    test("should handle backoff multiplier of 1.0 (no backoff)", () => {
      const manager = new ReSyncManager({
        retryDelayMs: 2000,
        backoffMultiplier: 1.0,
      });

      manager["currentAttempt"] = 1;
      expect(manager.getNextRetryDelay()).toBe(2000);

      manager["currentAttempt"] = 2;
      expect(manager.getNextRetryDelay()).toBe(2000);

      manager["currentAttempt"] = 3;
      expect(manager.getNextRetryDelay()).toBe(2000);
    });

    test("should handle backoff multiplier of 2.0 (double each time)", () => {
      const manager = new ReSyncManager({
        retryDelayMs: 1000,
        backoffMultiplier: 2.0,
      });

      manager["currentAttempt"] = 1;
      expect(manager.getNextRetryDelay()).toBe(1000); // 1000 * 2^0 = 1000

      manager["currentAttempt"] = 2;
      expect(manager.getNextRetryDelay()).toBe(2000); // 1000 * 2^1 = 2000

      manager["currentAttempt"] = 3;
      expect(manager.getNextRetryDelay()).toBe(4000); // 1000 * 2^2 = 4000

      manager["currentAttempt"] = 4;
      expect(manager.getNextRetryDelay()).toBe(8000); // 1000 * 2^3 = 8000
    });
  });

  describe("reset", () => {
    test("should reset current attempt to zero", () => {
      const manager = new ReSyncManager();

      // Simulate some attempts
      manager["currentAttempt"] = 3;
      expect(manager.getCurrentAttempt()).toBe(3);

      manager.reset();
      expect(manager.getCurrentAttempt()).toBe(0);
    });

    test("should allow retries after reset", () => {
      const manager = new ReSyncManager({ maxRetries: 3 });

      // Exhaust retries
      manager["currentAttempt"] = 3;
      expect(manager.shouldRetry()).toBe(false);

      // Reset
      manager.reset();
      expect(manager.shouldRetry()).toBe(true);
    });
  });

  describe("getCurrentAttempt", () => {
    test("should return zero initially", () => {
      const manager = new ReSyncManager();
      expect(manager.getCurrentAttempt()).toBe(0);
    });

    test("should return current attempt count", () => {
      const manager = new ReSyncManager();

      manager["currentAttempt"] = 2;
      expect(manager.getCurrentAttempt()).toBe(2);
    });
  });

  describe("attemptReSync", () => {
    test("should succeed on first attempt if initialization succeeds", async () => {
      const manager = new ReSyncManager({ maxRetries: 3 });
      const stateManager = new ConnectionStateManager();

      // Set up state for valid transition
      stateManager.setState(ConnectionState.CONNECTING);
      stateManager.setState(ConnectionState.CONNECTED);

      let callCount = 0;
      const mockInit = async () => {
        callCount++;
      };

      const result = await manager.attemptReSync(mockInit, stateManager);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(callCount).toBe(1);
      expect(manager.getCurrentAttempt()).toBe(0); // Should be reset
    });

    test("should retry on failure and succeed eventually", async () => {
      const manager = new ReSyncManager({
        maxRetries: 3,
        retryDelayMs: 10, // Short delay for testing
      });
      const stateManager = new ConnectionStateManager();

      stateManager.setState(ConnectionState.CONNECTING);
      stateManager.setState(ConnectionState.CONNECTED);

      let callCount = 0;
      const mockInit = async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Initialization failed");
        }
      };

      const result = await manager.attemptReSync(mockInit, stateManager);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(callCount).toBe(3);
      expect(manager.getCurrentAttempt()).toBe(0); // Should be reset
    });

    test("should fail after max retries", async () => {
      const manager = new ReSyncManager({
        maxRetries: 3,
        retryDelayMs: 10,
      });
      const stateManager = new ConnectionStateManager();

      stateManager.setState(ConnectionState.CONNECTING);
      stateManager.setState(ConnectionState.CONNECTED);

      let callCount = 0;
      const mockInit = async () => {
        callCount++;
        throw new Error("Initialization failed");
      };

      const result = await manager.attemptReSync(mockInit, stateManager);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe("Initialization failed");
      expect(callCount).toBe(3);
    });

    test("should update state manager during re-sync", async () => {
      const manager = new ReSyncManager({
        maxRetries: 2,
        retryDelayMs: 10,
      });
      const stateManager = new ConnectionStateManager();

      stateManager.setState(ConnectionState.CONNECTING);
      stateManager.setState(ConnectionState.CONNECTED);

      const states: ConnectionState[] = [];
      stateManager.onStateChange((status) => {
        states.push(status.state);
      });

      let callCount = 0;
      const mockInit = async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error("Initialization failed");
        }
      };

      await manager.attemptReSync(mockInit, stateManager);

      // Should have transitioned through TIMEOUT_RETRYING states
      expect(states).toContain(ConnectionState.TIMEOUT_RETRYING);
      expect(states[states.length - 1]).toBe(ConnectionState.CONNECTED);
    });

    test("should set error state on final failure", async () => {
      const manager = new ReSyncManager({
        maxRetries: 2,
        retryDelayMs: 10,
      });
      const stateManager = new ConnectionStateManager();

      stateManager.setState(ConnectionState.CONNECTING);
      stateManager.setState(ConnectionState.CONNECTED);

      const mockInit = async () => {
        throw new Error("Initialization failed");
      };

      await manager.attemptReSync(mockInit, stateManager);

      const status = stateManager.getStatus();
      expect(status.state).toBe(ConnectionState.ERROR);

      // Check the history for the error details
      const history = stateManager.getHistory();
      const errorStatus = history.find(
        (s) => s.state === ConnectionState.ERROR
      );
      expect(errorStatus).toBeDefined();
      expect(errorStatus?.lastError).toBeDefined();
      expect(errorStatus?.lastError?.message).toBe("Initialization failed");
    });

    test("should include retry count in state updates", async () => {
      const manager = new ReSyncManager({
        maxRetries: 3,
        retryDelayMs: 10,
      });
      const stateManager = new ConnectionStateManager();

      stateManager.setState(ConnectionState.CONNECTING);
      stateManager.setState(ConnectionState.CONNECTED);

      const retryCounts: number[] = [];
      stateManager.onStateChange((status) => {
        if (status.retryCount !== undefined) {
          retryCounts.push(status.retryCount);
        }
      });

      let callCount = 0;
      const mockInit = async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("Initialization failed");
        }
      };

      await manager.attemptReSync(mockInit, stateManager);

      // Should have recorded retry counts
      expect(retryCounts).toContain(1);
      expect(retryCounts).toContain(2);
      expect(retryCounts).toContain(3);
    });
  });

  describe("updateConfig", () => {
    test("should update configuration", () => {
      const manager = new ReSyncManager({
        maxRetries: 3,
        retryDelayMs: 2000,
      });

      manager.updateConfig({
        maxRetries: 5,
      });

      const config = manager.getConfig();
      expect(config.maxRetries).toBe(5);
      expect(config.retryDelayMs).toBe(2000); // unchanged
    });

    test("should preserve existing values when updating", () => {
      const manager = new ReSyncManager({
        maxRetries: 3,
        retryDelayMs: 2000,
        backoffMultiplier: 1.5,
      });

      manager.updateConfig({
        retryDelayMs: 3000,
      });

      const config = manager.getConfig();
      expect(config.maxRetries).toBe(3);
      expect(config.retryDelayMs).toBe(3000);
      expect(config.backoffMultiplier).toBe(1.5);
    });
  });

  describe("getConfig", () => {
    test("should return a copy of the configuration", () => {
      const manager = new ReSyncManager({
        maxRetries: 5,
      });

      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      // Should be equal but not the same object
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    test("should not allow external modification of config", () => {
      const manager = new ReSyncManager({
        maxRetries: 3,
      });

      const config = manager.getConfig();
      config.maxRetries = 99;

      // Internal config should be unchanged
      const actualConfig = manager.getConfig();
      expect(actualConfig.maxRetries).toBe(3);
    });
  });
});

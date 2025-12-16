/**
 * Property-based tests for ReSyncManager
 * Using fast-check for property-based testing
 */

import * as fc from "fast-check";
import { ReSyncManager } from "./ReSyncManager";
import { ConnectionStateManager } from "./ConnectionStateManager";
import { ReSyncConfig, ConnectionState } from "./types";

describe("ReSyncManager Property Tests", () => {
  /**
   * Feature: shared-mcp-client-timeout-fix, Property 8: Exponential backoff correctness
   * Validates: Requirements 4.2
   *
   * For any retry attempt N, the delay before attempt N+1 should be
   * delay * (backoffMultiplier ^ N)
   */
  test("Property 8: Exponential backoff correctness", () => {
    fc.assert(
      fc.property(
        // Generate arbitrary re-sync configurations
        fc.record({
          maxRetries: fc.integer({ min: 1, max: 10 }),
          retryDelayMs: fc.integer({ min: 100, max: 10000 }),
          backoffMultiplier: fc.float({
            min: 1.0,
            max: 3.0,
            noNaN: true,
          }),
        }),
        // Generate arbitrary attempt number (within bounds)
        fc.integer({ min: 1, max: 9 }),
        (config: ReSyncConfig, attemptNumber: number) => {
          // Only test attempts that are within maxRetries
          fc.pre(attemptNumber < config.maxRetries);

          const manager = new ReSyncManager(config);

          // Simulate being at attempt N
          for (let i = 0; i < attemptNumber; i++) {
            // Manually increment the attempt counter
            // We do this by calling shouldRetry which doesn't increment,
            // but we need to simulate the state
            manager["currentAttempt"] = i + 1;
          }

          // Get the delay for the next retry
          const actualDelay = manager.getNextRetryDelay();

          // Calculate expected delay: retryDelayMs * (backoffMultiplier ^ (N-1))
          // We use N-1 because attempt 1 should use base delay
          const exponent = attemptNumber - 1;
          const expectedDelay =
            config.retryDelayMs * Math.pow(config.backoffMultiplier, exponent);

          // Assert the delay matches exponential backoff formula
          // Use approximate equality due to floating point arithmetic
          expect(actualDelay).toBeCloseTo(expectedDelay, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: shared-mcp-client-timeout-fix, Property 2: Re-synchronization logic consistency
   * Validates: Requirements 1.2, 4.1, 4.2
   *
   * For any timeout scenario across any extension, the re-synchronization logic
   * should follow the same retry pattern with the same backoff delays
   */
  test("Property 2: Re-synchronization logic consistency", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary re-sync configurations
        fc.record({
          maxRetries: fc.integer({ min: 1, max: 3 }),
          retryDelayMs: fc.integer({ min: 10, max: 100 }), // Smaller delays for faster tests
          backoffMultiplier: fc.float({
            min: 1.0,
            max: 2.0,
            noNaN: true,
          }),
        }),
        // Generate whether initialization should succeed or fail
        fc.boolean(),
        async (config: ReSyncConfig, shouldSucceed: boolean) => {
          // Create two separate ReSyncManager instances with same config
          // (simulating different extensions)
          const manager1 = new ReSyncManager(config);
          const manager2 = new ReSyncManager(config);

          const stateManager1 = new ConnectionStateManager();
          const stateManager2 = new ConnectionStateManager();

          // Set up state managers to be in CONNECTED state
          // (required for valid transition to TIMEOUT_RETRYING)
          stateManager1.setState(ConnectionState.CONNECTING);
          stateManager1.setState(ConnectionState.CONNECTED);
          stateManager2.setState(ConnectionState.CONNECTING);
          stateManager2.setState(ConnectionState.CONNECTED);

          let callCount1 = 0;
          let callCount2 = 0;

          // Mock initialization function
          const mockInit1 = async () => {
            callCount1++;
            if (!shouldSucceed) {
              throw new Error("Initialization failed");
            }
          };

          const mockInit2 = async () => {
            callCount2++;
            if (!shouldSucceed) {
              throw new Error("Initialization failed");
            }
          };

          // Attempt re-sync on both managers
          const result1 = await manager1.attemptReSync(
            mockInit1,
            stateManager1
          );
          const result2 = await manager2.attemptReSync(
            mockInit2,
            stateManager2
          );

          // Both should have the same success/failure outcome
          expect(result1.success).toBe(result2.success);
          expect(result1.success).toBe(shouldSucceed);

          // Both should make the same number of attempts
          expect(result1.attempts).toBe(result2.attempts);

          // Both should have made the same number of calls
          expect(callCount1).toBe(callCount2);

          // If failed, both should have attempted maxRetries times
          if (!shouldSucceed) {
            expect(result1.attempts).toBe(config.maxRetries);
            expect(result2.attempts).toBe(config.maxRetries);
            expect(callCount1).toBe(config.maxRetries);
          } else {
            // If succeeded, should have made at least one attempt
            expect(result1.attempts).toBeGreaterThanOrEqual(1);
            expect(callCount1).toBeGreaterThanOrEqual(1);
          }
        }
      ),
      { numRuns: 50 }
    );
  }, 30000); // 30 second timeout for this test
});

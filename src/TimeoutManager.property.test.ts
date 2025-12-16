/**
 * Property-based tests for TimeoutManager
 * Using fast-check for property-based testing
 */

import * as fc from "fast-check";
import { TimeoutManager } from "./TimeoutManager";
import { TimeoutConfig } from "./types";

describe("TimeoutManager Property Tests", () => {
  /**
   * Feature: shared-mcp-client-timeout-fix, Property 1: Timeout consistency across extensions
   * Validates: Requirements 1.1, 3.2, 3.3
   *
   * For any request method and any extension using BaseMCPClient,
   * the timeout value returned by getTimeoutForRequest should be the same
   */
  test("Property 1: Timeout consistency across extensions", () => {
    fc.assert(
      fc.property(
        // Generate arbitrary timeout configurations
        fc.record({
          initializationTimeoutMs: fc.integer({ min: 1000, max: 300000 }),
          standardRequestTimeoutMs: fc.integer({ min: 1000, max: 300000 }),
          toolsListTimeoutMs: fc.integer({ min: 1000, max: 300000 }),
        }),
        // Generate arbitrary request methods
        fc.oneof(
          fc.constant("initialize"),
          fc.constant("tools/list"),
          fc.string({ minLength: 1, maxLength: 50 }) // Other methods
        ),
        (config: TimeoutConfig, method: string) => {
          // Create two separate TimeoutManager instances with same config
          // (simulating different extensions)
          const manager1 = new TimeoutManager(config);
          const manager2 = new TimeoutManager(config);

          // Both managers should return the same timeout for the same method
          const timeout1 = manager1.getTimeoutForRequest(method);
          const timeout2 = manager2.getTimeoutForRequest(method);

          // Assert consistency
          expect(timeout1).toBe(timeout2);

          // Also verify the timeout matches the expected value from config
          if (method === "initialize") {
            expect(timeout1).toBe(config.initializationTimeoutMs);
          } else if (method === "tools/list") {
            expect(timeout1).toBe(config.toolsListTimeoutMs);
          } else {
            expect(timeout1).toBe(config.standardRequestTimeoutMs);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: shared-mcp-client-timeout-fix, Property 7: Default timeout values
   * Validates: Requirements 3.5
   *
   * For any extension using BaseMCPClient without explicit timeout configuration,
   * the default values should be 60s for initialization and 30s for standard requests
   */
  test("Property 7: Default timeout values", () => {
    fc.assert(
      fc.property(
        // Generate arbitrary request methods
        fc.oneof(
          fc.constant("initialize"),
          fc.constant("tools/list"),
          fc.string({ minLength: 1, maxLength: 50 }) // Other methods
        ),
        (method: string) => {
          // Create manager without config (should use defaults)
          const manager = new TimeoutManager();

          const timeout = manager.getTimeoutForRequest(method);

          // Verify default values
          if (method === "initialize") {
            expect(timeout).toBe(60000); // 60 seconds
          } else if (method === "tools/list") {
            expect(timeout).toBe(60000); // 60 seconds
          } else {
            expect(timeout).toBe(30000); // 30 seconds
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

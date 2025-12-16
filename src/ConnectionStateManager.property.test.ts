/**
 * Property-based tests for ConnectionStateManager
 *
 * These tests verify correctness properties that should hold across
 * all valid executions of the ConnectionStateManager.
 */

import * as fc from "fast-check";
import { ConnectionStateManager } from "./ConnectionStateManager";
import { ConnectionState, ConnectionStatus } from "./types";

/**
 * Arbitrary for generating ConnectionState values
 */
const connectionStateArbitrary = fc.constantFrom(
  ConnectionState.DISCONNECTED,
  ConnectionState.CONNECTING,
  ConnectionState.CONNECTED,
  ConnectionState.TIMEOUT_RETRYING,
  ConnectionState.ERROR
);

/**
 * Valid state transitions map for testing
 */
const VALID_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
  [ConnectionState.DISCONNECTED]: [
    ConnectionState.CONNECTING,
    ConnectionState.ERROR,
  ],
  [ConnectionState.CONNECTING]: [
    ConnectionState.CONNECTED,
    ConnectionState.ERROR,
    ConnectionState.DISCONNECTED,
  ],
  [ConnectionState.CONNECTED]: [
    ConnectionState.TIMEOUT_RETRYING,
    ConnectionState.DISCONNECTED,
    ConnectionState.ERROR,
  ],
  [ConnectionState.TIMEOUT_RETRYING]: [
    ConnectionState.CONNECTED,
    ConnectionState.ERROR,
    ConnectionState.DISCONNECTED,
  ],
  [ConnectionState.ERROR]: [
    ConnectionState.CONNECTING,
    ConnectionState.DISCONNECTED,
  ],
};

/**
 * Check if a state transition is valid
 */
function isValidTransition(
  from: ConnectionState,
  to: ConnectionState
): boolean {
  if (from === to) {
    return true;
  }
  return VALID_TRANSITIONS[from].includes(to);
}

describe("ConnectionStateManager - Property Tests", () => {
  /**
   * Feature: shared-mcp-client-timeout-fix, Property 9: State transition validity
   * Validates: Requirements 5.2
   *
   * For any sequence of connection state changes, only valid transitions
   * should be allowed (e.g., CONNECTING → CONNECTED, not CONNECTED → CONNECTING)
   */
  describe("Property 9: State transition validity", () => {
    it("should only allow valid state transitions", () => {
      fc.assert(
        fc.property(
          connectionStateArbitrary,
          connectionStateArbitrary,
          (fromState, toState) => {
            const manager = new ConnectionStateManager();

            // Set up initial state (if not DISCONNECTED)
            if (fromState !== ConnectionState.DISCONNECTED) {
              // Navigate to the desired initial state through valid transitions
              const path = findValidPath(
                ConnectionState.DISCONNECTED,
                fromState
              );
              for (const state of path) {
                manager.setState(state);
              }
            }

            // Now test the transition from fromState to toState
            const shouldBeValid = isValidTransition(fromState, toState);

            if (shouldBeValid) {
              // Valid transition should succeed
              expect(() => manager.setState(toState)).not.toThrow();
              expect(manager.getStatus().state).toBe(toState);
            } else {
              // Invalid transition should throw
              expect(() => manager.setState(toState)).toThrow(
                /Invalid state transition/
              );
              // State should remain unchanged
              expect(manager.getStatus().state).toBe(fromState);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should allow staying in the same state", () => {
      fc.assert(
        fc.property(connectionStateArbitrary, (state) => {
          const manager = new ConnectionStateManager();

          // Navigate to the desired state
          if (state !== ConnectionState.DISCONNECTED) {
            const path = findValidPath(ConnectionState.DISCONNECTED, state);
            for (const s of path) {
              manager.setState(s);
            }
          }

          // Staying in the same state should always be valid
          expect(() => manager.setState(state)).not.toThrow();
          expect(manager.getStatus().state).toBe(state);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: shared-mcp-client-timeout-fix, Property 10: Listener notification consistency
   * Validates: Requirements 5.3, 5.4
   *
   * For any connection state change, all registered listeners should be
   * notified with the same ConnectionStatus object
   */
  describe("Property 10: Listener notification consistency", () => {
    it("should notify all listeners with the same status object", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }), // number of listeners
          connectionStateArbitrary,
          (numListeners, targetState) => {
            const manager = new ConnectionStateManager();
            const receivedStatuses: ConnectionStatus[][] = [];

            // Register multiple listeners
            for (let i = 0; i < numListeners; i++) {
              receivedStatuses[i] = [];
              manager.onStateChange((status) => {
                receivedStatuses[i].push(status);
              });
            }

            // Navigate to target state
            if (targetState !== ConnectionState.DISCONNECTED) {
              const path = findValidPath(
                ConnectionState.DISCONNECTED,
                targetState
              );
              for (const state of path) {
                manager.setState(state);
              }
            }

            // All listeners should have received the same number of notifications
            const notificationCount = receivedStatuses[0].length;
            for (let i = 1; i < numListeners; i++) {
              expect(receivedStatuses[i].length).toBe(notificationCount);
            }

            // For each notification, all listeners should have received the same status
            for (let notifIdx = 0; notifIdx < notificationCount; notifIdx++) {
              const firstStatus = receivedStatuses[0][notifIdx];
              for (
                let listenerIdx = 1;
                listenerIdx < numListeners;
                listenerIdx++
              ) {
                const status = receivedStatuses[listenerIdx][notifIdx];
                expect(status.state).toBe(firstStatus.state);
                expect(status.message).toBe(firstStatus.message);
                expect(status.serverProcessRunning).toBe(
                  firstStatus.serverProcessRunning
                );
                expect(status.timestamp).toBe(firstStatus.timestamp);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should notify listeners on every state change", () => {
      fc.assert(
        fc.property(
          fc.array(connectionStateArbitrary, { minLength: 1, maxLength: 10 }),
          (stateSequence) => {
            const manager = new ConnectionStateManager();
            const notifications: ConnectionStatus[] = [];

            manager.onStateChange((status) => {
              notifications.push(status);
            });

            // Try to apply each state in sequence
            let validTransitions = 0;
            let currentState = ConnectionState.DISCONNECTED;

            for (const targetState of stateSequence) {
              if (isValidTransition(currentState, targetState)) {
                manager.setState(targetState);
                validTransitions++;
                currentState = targetState;
              }
            }

            // Should have received exactly one notification per valid transition
            expect(notifications.length).toBe(validTransitions);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: shared-mcp-client-timeout-fix, Property 11: Status format consistency
   * Validates: Requirements 5.5
   *
   * For any extension querying connection status, the returned ConnectionStatus
   * object should have the same structure and fields
   */
  describe("Property 11: Status format consistency", () => {
    it("should always return status with required fields", () => {
      fc.assert(
        fc.property(connectionStateArbitrary, (targetState) => {
          const manager = new ConnectionStateManager();

          // Navigate to target state
          if (targetState !== ConnectionState.DISCONNECTED) {
            const path = findValidPath(
              ConnectionState.DISCONNECTED,
              targetState
            );
            for (const state of path) {
              manager.setState(state);
            }
          }

          const status = manager.getStatus();

          // Verify all required fields are present
          expect(status).toHaveProperty("state");
          expect(status).toHaveProperty("message");
          expect(status).toHaveProperty("serverProcessRunning");
          expect(status).toHaveProperty("timestamp");

          // Verify field types
          expect(typeof status.state).toBe("string");
          expect(typeof status.message).toBe("string");
          expect(typeof status.serverProcessRunning).toBe("boolean");
          expect(typeof status.timestamp).toBe("number");

          // Verify state is valid
          expect(Object.values(ConnectionState)).toContain(status.state);
        }),
        { numRuns: 100 }
      );
    });

    it("should return consistent status format across multiple queries", () => {
      fc.assert(
        fc.property(
          connectionStateArbitrary,
          fc.integer({ min: 1, max: 10 }),
          (targetState, numQueries) => {
            const manager = new ConnectionStateManager();

            // Navigate to target state
            if (targetState !== ConnectionState.DISCONNECTED) {
              const path = findValidPath(
                ConnectionState.DISCONNECTED,
                targetState
              );
              for (const state of path) {
                manager.setState(state);
              }
            }

            // Query status multiple times
            const statuses: ConnectionStatus[] = [];
            for (let i = 0; i < numQueries; i++) {
              statuses.push(manager.getStatus());
            }

            // All queries should return the same state
            for (let i = 1; i < numQueries; i++) {
              expect(statuses[i].state).toBe(statuses[0].state);
              expect(statuses[i].serverProcessRunning).toBe(
                statuses[0].serverProcessRunning
              );
            }

            // All should have the same structure
            for (const status of statuses) {
              expect(Object.keys(status).sort()).toEqual(
                ["state", "message", "serverProcessRunning", "timestamp"].sort()
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * Helper function to find a valid path from one state to another
 * Uses BFS to find the shortest valid path
 */
function findValidPath(
  from: ConnectionState,
  to: ConnectionState
): ConnectionState[] {
  if (from === to) {
    return [];
  }

  const queue: { state: ConnectionState; path: ConnectionState[] }[] = [
    { state: from, path: [] },
  ];
  const visited = new Set<ConnectionState>([from]);

  while (queue.length > 0) {
    const { state, path } = queue.shift()!;

    for (const nextState of VALID_TRANSITIONS[state]) {
      if (nextState === to) {
        return [...path, nextState];
      }

      if (!visited.has(nextState)) {
        visited.add(nextState);
        queue.push({ state: nextState, path: [...path, nextState] });
      }
    }
  }

  // If no path found, throw error
  throw new Error(`No valid path from ${from} to ${to}`);
}

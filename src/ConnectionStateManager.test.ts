/**
 * Unit tests for ConnectionStateManager
 */

import { ConnectionStateManager } from "./ConnectionStateManager";
import { ConnectionState, ConnectionStatus } from "./types";
import { withConsoleMocks } from "@digitaldefiance/express-suite-test-utils/src/lib/console";

describe("ConnectionStateManager", () => {
  describe("initialization", () => {
    it("should start in DISCONNECTED state", () => {
      const manager = new ConnectionStateManager();
      const status = manager.getStatus();

      expect(status.state).toBe(ConnectionState.DISCONNECTED);
      expect(status.serverProcessRunning).toBe(false);
    });

    it("should have initial state in history", () => {
      const manager = new ConnectionStateManager();
      const history = manager.getHistory();

      expect(history.length).toBe(1);
      expect(history[0].state).toBe(ConnectionState.DISCONNECTED);
    });
  });

  describe("state transitions", () => {
    it("should allow valid transition from DISCONNECTED to CONNECTING", () => {
      const manager = new ConnectionStateManager();

      expect(() => {
        manager.setState(ConnectionState.CONNECTING);
      }).not.toThrow();

      expect(manager.getStatus().state).toBe(ConnectionState.CONNECTING);
    });

    it("should allow valid transition from CONNECTING to CONNECTED", () => {
      const manager = new ConnectionStateManager();
      manager.setState(ConnectionState.CONNECTING);

      expect(() => {
        manager.setState(ConnectionState.CONNECTED);
      }).not.toThrow();

      expect(manager.getStatus().state).toBe(ConnectionState.CONNECTED);
    });

    it("should allow valid transition from CONNECTED to TIMEOUT_RETRYING", () => {
      const manager = new ConnectionStateManager();
      manager.setState(ConnectionState.CONNECTING);
      manager.setState(ConnectionState.CONNECTED);

      expect(() => {
        manager.setState(ConnectionState.TIMEOUT_RETRYING);
      }).not.toThrow();

      expect(manager.getStatus().state).toBe(ConnectionState.TIMEOUT_RETRYING);
    });

    it("should allow valid transition from TIMEOUT_RETRYING to CONNECTED", () => {
      const manager = new ConnectionStateManager();
      manager.setState(ConnectionState.CONNECTING);
      manager.setState(ConnectionState.CONNECTED);
      manager.setState(ConnectionState.TIMEOUT_RETRYING);

      expect(() => {
        manager.setState(ConnectionState.CONNECTED);
      }).not.toThrow();

      expect(manager.getStatus().state).toBe(ConnectionState.CONNECTED);
    });

    it("should allow transition to ERROR from any state", () => {
      const states = [
        ConnectionState.DISCONNECTED,
        ConnectionState.CONNECTING,
        ConnectionState.CONNECTED,
        ConnectionState.TIMEOUT_RETRYING,
      ];

      for (const state of states) {
        const manager = new ConnectionStateManager();

        // Navigate to the state
        if (state === ConnectionState.CONNECTING) {
          manager.setState(ConnectionState.CONNECTING);
        } else if (state === ConnectionState.CONNECTED) {
          manager.setState(ConnectionState.CONNECTING);
          manager.setState(ConnectionState.CONNECTED);
        } else if (state === ConnectionState.TIMEOUT_RETRYING) {
          manager.setState(ConnectionState.CONNECTING);
          manager.setState(ConnectionState.CONNECTED);
          manager.setState(ConnectionState.TIMEOUT_RETRYING);
        }

        expect(() => {
          manager.setState(ConnectionState.ERROR);
        }).not.toThrow();

        expect(manager.getStatus().state).toBe(ConnectionState.ERROR);
      }
    });

    it("should reject invalid transition from CONNECTED to CONNECTING", () => {
      const manager = new ConnectionStateManager();
      manager.setState(ConnectionState.CONNECTING);
      manager.setState(ConnectionState.CONNECTED);

      expect(() => {
        manager.setState(ConnectionState.CONNECTING);
      }).toThrow(/Invalid state transition/);

      // State should remain unchanged
      expect(manager.getStatus().state).toBe(ConnectionState.CONNECTED);
    });

    it("should reject invalid transition from DISCONNECTED to CONNECTED", () => {
      const manager = new ConnectionStateManager();

      expect(() => {
        manager.setState(ConnectionState.CONNECTED);
      }).toThrow(/Invalid state transition/);

      expect(manager.getStatus().state).toBe(ConnectionState.DISCONNECTED);
    });

    it("should allow staying in the same state", () => {
      const manager = new ConnectionStateManager();

      expect(() => {
        manager.setState(ConnectionState.DISCONNECTED);
      }).not.toThrow();

      expect(manager.getStatus().state).toBe(ConnectionState.DISCONNECTED);
    });

    it("should accept custom message in setState", () => {
      const manager = new ConnectionStateManager();
      const customMessage = "Custom connection message";

      manager.setState(ConnectionState.CONNECTING, { message: customMessage });

      expect(manager.getStatus().message).toBe(customMessage);
    });

    it("should use default message if not provided", () => {
      const manager = new ConnectionStateManager();

      manager.setState(ConnectionState.CONNECTING);

      expect(manager.getStatus().message).toBe("Connecting to server");
    });
  });

  describe("listener notifications", () => {
    it("should notify listener on state change", () => {
      const manager = new ConnectionStateManager();
      const notifications: ConnectionStatus[] = [];

      manager.onStateChange((status) => {
        notifications.push(status);
      });

      manager.setState(ConnectionState.CONNECTING);

      expect(notifications.length).toBe(1);
      expect(notifications[0].state).toBe(ConnectionState.CONNECTING);
    });

    it("should notify multiple listeners", () => {
      const manager = new ConnectionStateManager();
      const notifications1: ConnectionStatus[] = [];
      const notifications2: ConnectionStatus[] = [];

      manager.onStateChange((status) => notifications1.push(status));
      manager.onStateChange((status) => notifications2.push(status));

      manager.setState(ConnectionState.CONNECTING);

      expect(notifications1.length).toBe(1);
      expect(notifications2.length).toBe(1);
      expect(notifications1[0].state).toBe(ConnectionState.CONNECTING);
      expect(notifications2[0].state).toBe(ConnectionState.CONNECTING);
    });

    it("should allow listener to be disposed", () => {
      const manager = new ConnectionStateManager();
      const notifications: ConnectionStatus[] = [];

      const disposable = manager.onStateChange((status) => {
        notifications.push(status);
      });

      manager.setState(ConnectionState.CONNECTING);
      expect(notifications.length).toBe(1);

      disposable.dispose();

      manager.setState(ConnectionState.CONNECTED);
      expect(notifications.length).toBe(1); // Should not receive second notification
    });

    it("should not fail if listener throws error", () => {
      withConsoleMocks({ mute: true }, () => {
        const manager = new ConnectionStateManager();
        const goodNotifications: ConnectionStatus[] = [];

        // Add a listener that throws
        manager.onStateChange(() => {
          throw new Error("Listener error");
        });

        // Add a good listener
        manager.onStateChange((status) => {
          goodNotifications.push(status);
        });

        // Should not throw
        expect(() => {
          manager.setState(ConnectionState.CONNECTING);
        }).not.toThrow();

        // Good listener should still be notified
        expect(goodNotifications.length).toBe(1);
      });
    });
  });

  describe("status history tracking", () => {
    it("should track state changes in history", () => {
      const manager = new ConnectionStateManager();

      manager.setState(ConnectionState.CONNECTING);
      manager.setState(ConnectionState.CONNECTED);

      const history = manager.getHistory();

      expect(history.length).toBe(3); // Initial + 2 changes
      expect(history[0].state).toBe(ConnectionState.DISCONNECTED);
      expect(history[1].state).toBe(ConnectionState.CONNECTING);
      expect(history[2].state).toBe(ConnectionState.CONNECTED);
    });

    it("should limit history with getHistory(limit)", () => {
      const manager = new ConnectionStateManager();

      manager.setState(ConnectionState.CONNECTING);
      manager.setState(ConnectionState.CONNECTED);
      manager.setState(ConnectionState.DISCONNECTED);

      const history = manager.getHistory(2);

      expect(history.length).toBe(2);
      expect(history[0].state).toBe(ConnectionState.CONNECTED);
      expect(history[1].state).toBe(ConnectionState.DISCONNECTED);
    });

    it("should include timestamps in history", () => {
      const manager = new ConnectionStateManager();
      const before = Date.now();

      manager.setState(ConnectionState.CONNECTING);

      const after = Date.now();
      const history = manager.getHistory();

      expect(history[1].timestamp).toBeGreaterThanOrEqual(before);
      expect(history[1].timestamp).toBeLessThanOrEqual(after);
    });

    it("should trim history when it exceeds max size", () => {
      const manager = new ConnectionStateManager();

      // Make many state changes (more than maxHistorySize of 50)
      // Use valid state transitions: DISCONNECTED -> CONNECTING -> CONNECTED -> DISCONNECTED
      for (let i = 0; i < 20; i++) {
        manager.setState(ConnectionState.CONNECTING);
        manager.setState(ConnectionState.CONNECTED);
        manager.setState(ConnectionState.DISCONNECTED);
      }

      const history = manager.getHistory();

      // Should be limited to 50
      expect(history.length).toBe(50);
    });
  });

  describe("server process tracking", () => {
    it("should track server process running state", () => {
      const manager = new ConnectionStateManager();

      expect(manager.isServerProcessRunning()).toBe(false);

      manager.setServerProcessRunning(true);
      expect(manager.isServerProcessRunning()).toBe(true);

      manager.setServerProcessRunning(false);
      expect(manager.isServerProcessRunning()).toBe(false);
    });

    it("should include server process state in status", () => {
      const manager = new ConnectionStateManager();

      manager.setServerProcessRunning(true);
      const status = manager.getStatus();

      expect(status.serverProcessRunning).toBe(true);
    });
  });

  describe("getStatus", () => {
    it("should return current status with all required fields", () => {
      const manager = new ConnectionStateManager();
      manager.setState(ConnectionState.CONNECTING);

      const status = manager.getStatus();

      expect(status).toHaveProperty("state");
      expect(status).toHaveProperty("message");
      expect(status).toHaveProperty("serverProcessRunning");
      expect(status).toHaveProperty("timestamp");
    });

    it("should return fresh timestamp on each call", () => {
      const manager = new ConnectionStateManager();

      const status1 = manager.getStatus();
      // Small delay
      const delay = new Promise((resolve) => setTimeout(resolve, 10));
      return delay.then(() => {
        const status2 = manager.getStatus();

        expect(status2.timestamp).toBeGreaterThanOrEqual(status1.timestamp);
      });
    });
  });
});

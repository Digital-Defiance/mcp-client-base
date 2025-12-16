/**
 * ConnectionStateManager - Manages connection state tracking and notifications
 *
 * Provides consistent connection state management across all MCP extensions,
 * including state transitions, listener notifications, and status history.
 */

import { ConnectionState, ConnectionStatus } from "./types";

/**
 * Disposable interface for cleanup
 */
interface Disposable {
  dispose(): void;
}

/**
 * Valid state transitions map
 * Defines which state transitions are allowed
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
 * ConnectionStateManager
 *
 * Manages connection state with validation, listener notifications,
 * and history tracking. Ensures consistent state management across
 * all MCP extensions.
 */
export class ConnectionStateManager {
  private state: ConnectionState;
  private listeners: Set<(status: ConnectionStatus) => void>;
  private statusHistory: ConnectionStatus[];
  private serverProcessRunning: boolean;
  private currentMessage: string;
  private readonly maxHistorySize: number = 50;

  constructor() {
    this.state = ConnectionState.DISCONNECTED;
    this.listeners = new Set();
    this.statusHistory = [];
    this.serverProcessRunning = false;
    this.currentMessage = "Initial state";

    // Add initial state to history
    this.addToHistory({
      state: this.state,
      message: this.currentMessage,
      serverProcessRunning: false,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return {
      state: this.state,
      message: this.currentMessage,
      serverProcessRunning: this.serverProcessRunning,
      timestamp: Date.now(),
    };
  }

  /**
   * Set connection state with validation
   * @param state New connection state
   * @param details Additional status details
   * @throws Error if state transition is invalid
   */
  setState(state: ConnectionState, details?: Partial<ConnectionStatus>): void {
    // Validate state transition
    if (!this.isValidTransition(this.state, state)) {
      throw new Error(
        `Invalid state transition from ${this.state} to ${state}`
      );
    }

    // Update state
    // Track previous state for potential future use
    // const previousState = this.state;
    this.state = state;

    // Update current message
    this.currentMessage = details?.message || this.getStateMessage();

    // Create status object
    const status: ConnectionStatus = {
      state,
      message: this.currentMessage,
      serverProcessRunning: this.serverProcessRunning,
      timestamp: Date.now(),
      ...details,
    };

    // Add to history
    this.addToHistory(status);

    // Notify all listeners with the same status object
    this.notifyListeners(status);
  }

  /**
   * Register a listener for state changes
   * @param listener Callback function to be called on state changes
   * @returns Disposable to unregister the listener
   */
  onStateChange(listener: (status: ConnectionStatus) => void): Disposable {
    this.listeners.add(listener);

    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  /**
   * Get state history
   * @param limit Maximum number of history entries to return (default: all)
   * @returns Array of connection status entries
   */
  getHistory(limit?: number): ConnectionStatus[] {
    if (limit === undefined) {
      return [...this.statusHistory];
    }
    return this.statusHistory.slice(-limit);
  }

  /**
   * Check if server process is running
   */
  isServerProcessRunning(): boolean {
    return this.serverProcessRunning;
  }

  /**
   * Set server process running state
   * @param running Whether the server process is running
   */
  setServerProcessRunning(running: boolean): void {
    this.serverProcessRunning = running;
  }

  /**
   * Validate if a state transition is allowed
   * @param from Current state
   * @param to Target state
   * @returns true if transition is valid
   */
  private isValidTransition(
    from: ConnectionState,
    to: ConnectionState
  ): boolean {
    // Allow staying in the same state
    if (from === to) {
      return true;
    }

    const validTargets = VALID_TRANSITIONS[from];
    return validTargets.includes(to);
  }

  /**
   * Get default message for current state
   */
  private getStateMessage(): string {
    switch (this.state) {
      case ConnectionState.DISCONNECTED:
        return "Disconnected from server";
      case ConnectionState.CONNECTING:
        return "Connecting to server";
      case ConnectionState.CONNECTED:
        return "Connected to server";
      case ConnectionState.TIMEOUT_RETRYING:
        return "Connection timeout, retrying";
      case ConnectionState.ERROR:
        return "Connection error";
      default:
        return "Unknown state";
    }
  }

  /**
   * Add status to history with size limit
   */
  private addToHistory(status: ConnectionStatus): void {
    this.statusHistory.push(status);

    // Trim history if it exceeds max size
    if (this.statusHistory.length > this.maxHistorySize) {
      this.statusHistory = this.statusHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(status: ConnectionStatus): void {
    // Create a copy to ensure all listeners get the same object
    const statusCopy = { ...status };

    for (const listener of this.listeners) {
      try {
        listener(statusCopy);
      } catch (error) {
        // Silently catch listener errors to prevent one bad listener
        // from affecting others
        console.error("Error in state change listener:", error);
      }
    }
  }
}

/**
 * Test utilities for mocking console methods
 */

export interface ConsoleMocks {
  error: jest.SpyInstance;
  warn: jest.SpyInstance;
  log: jest.SpyInstance;
  info: jest.SpyInstance;
}

/**
 * Temporarily mocks console methods for a test callback
 * @param callback The test function to run with mocked console
 * @returns The result of the callback
 */
export function withConsoleMocks<T>(callback: () => T): T {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalInfo = console.info;

  const mocks: ConsoleMocks = {
    error: jest.spyOn(console, "error").mockImplementation(() => {}),
    warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
    log: jest.spyOn(console, "log").mockImplementation(() => {}),
    info: jest.spyOn(console, "info").mockImplementation(() => {}),
  };

  try {
    return callback();
  } finally {
    mocks.error.mockRestore();
    mocks.warn.mockRestore();
    mocks.log.mockRestore();
    mocks.info.mockRestore();

    console.error = originalError;
    console.warn = originalWarn;
    console.log = originalLog;
    console.info = originalInfo;
  }
}

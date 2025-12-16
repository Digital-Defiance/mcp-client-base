/**
 * Unit tests for TimeoutManager
 */

import { TimeoutManager } from "./TimeoutManager";

describe("TimeoutManager", () => {
  describe("constructor", () => {
    test("should use default values when no config provided", () => {
      const manager = new TimeoutManager();
      const config = manager.getConfig();

      expect(config.initializationTimeoutMs).toBe(60000);
      expect(config.standardRequestTimeoutMs).toBe(30000);
      expect(config.toolsListTimeoutMs).toBe(60000);
    });

    test("should merge provided config with defaults", () => {
      const manager = new TimeoutManager({
        initializationTimeoutMs: 45000,
      });
      const config = manager.getConfig();

      expect(config.initializationTimeoutMs).toBe(45000);
      expect(config.standardRequestTimeoutMs).toBe(30000); // default
      expect(config.toolsListTimeoutMs).toBe(60000); // default
    });

    test("should throw error for invalid config", () => {
      expect(() => {
        new TimeoutManager({
          initializationTimeoutMs: 500, // Too low
        });
      }).toThrow("Invalid timeout configuration");
    });
  });

  describe("getTimeoutForRequest", () => {
    test("should return initialization timeout for initialize method", () => {
      const manager = new TimeoutManager({
        initializationTimeoutMs: 45000,
      });

      expect(manager.getTimeoutForRequest("initialize")).toBe(45000);
    });

    test("should return tools list timeout for tools/list method", () => {
      const manager = new TimeoutManager({
        toolsListTimeoutMs: 90000,
      });

      expect(manager.getTimeoutForRequest("tools/list")).toBe(90000);
    });

    test("should return standard timeout for other methods", () => {
      const manager = new TimeoutManager({
        standardRequestTimeoutMs: 20000,
      });

      expect(manager.getTimeoutForRequest("tools/call")).toBe(20000);
      expect(manager.getTimeoutForRequest("resources/list")).toBe(20000);
      expect(manager.getTimeoutForRequest("custom/method")).toBe(20000);
    });
  });

  describe("validateConfig", () => {
    test("should accept valid configuration", () => {
      const manager = new TimeoutManager();
      const result = manager.validateConfig({
        initializationTimeoutMs: 45000,
        standardRequestTimeoutMs: 20000,
        toolsListTimeoutMs: 90000,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should reject non-number values", () => {
      const manager = new TimeoutManager();
      const result = manager.validateConfig({
        initializationTimeoutMs: "45000" as unknown as number,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "initializationTimeoutMs must be a number"
      );
    });

    test("should reject values below minimum", () => {
      const manager = new TimeoutManager();
      const result = manager.validateConfig({
        standardRequestTimeoutMs: 500,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "standardRequestTimeoutMs must be at least 1000ms"
      );
    });

    test("should reject values above maximum", () => {
      const manager = new TimeoutManager();
      const result = manager.validateConfig({
        toolsListTimeoutMs: 400000,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "toolsListTimeoutMs must not exceed 300000ms"
      );
    });

    test("should reject non-integer values", () => {
      const manager = new TimeoutManager();
      const result = manager.validateConfig({
        initializationTimeoutMs: 45000.5,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "initializationTimeoutMs must be an integer"
      );
    });

    test("should warn about very short timeouts", () => {
      const manager = new TimeoutManager();
      const result = manager.validateConfig({
        initializationTimeoutMs: 5000,
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("may be too short");
    });

    test("should validate multiple fields at once", () => {
      const manager = new TimeoutManager();
      const result = manager.validateConfig({
        initializationTimeoutMs: 500, // Too low
        standardRequestTimeoutMs: "invalid" as unknown as number, // Not a number
        toolsListTimeoutMs: 400000, // Too high
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
    });
  });

  describe("updateConfig", () => {
    test("should update configuration with valid values", () => {
      const manager = new TimeoutManager();
      manager.updateConfig({
        initializationTimeoutMs: 45000,
      });

      const config = manager.getConfig();
      expect(config.initializationTimeoutMs).toBe(45000);
    });

    test("should throw error for invalid configuration", () => {
      const manager = new TimeoutManager();

      expect(() => {
        manager.updateConfig({
          standardRequestTimeoutMs: 500, // Too low
        });
      }).toThrow("Invalid timeout configuration");
    });

    test("should preserve existing values when updating", () => {
      const manager = new TimeoutManager({
        initializationTimeoutMs: 45000,
        standardRequestTimeoutMs: 20000,
      });

      manager.updateConfig({
        toolsListTimeoutMs: 90000,
      });

      const config = manager.getConfig();
      expect(config.initializationTimeoutMs).toBe(45000);
      expect(config.standardRequestTimeoutMs).toBe(20000);
      expect(config.toolsListTimeoutMs).toBe(90000);
    });

    test("should not modify config if validation fails", () => {
      const manager = new TimeoutManager({
        initializationTimeoutMs: 45000,
      });

      expect(() => {
        manager.updateConfig({
          initializationTimeoutMs: 500, // Invalid
        });
      }).toThrow();

      // Config should remain unchanged
      const config = manager.getConfig();
      expect(config.initializationTimeoutMs).toBe(45000);
    });
  });

  describe("getConfig", () => {
    test("should return a copy of the configuration", () => {
      const manager = new TimeoutManager({
        initializationTimeoutMs: 45000,
      });

      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      // Should be equal but not the same object
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });

    test("should not allow external modification of config", () => {
      const manager = new TimeoutManager({
        initializationTimeoutMs: 45000,
      });

      const config = manager.getConfig();
      config.initializationTimeoutMs = 99999;

      // Internal config should be unchanged
      const actualConfig = manager.getConfig();
      expect(actualConfig.initializationTimeoutMs).toBe(45000);
    });
  });
});

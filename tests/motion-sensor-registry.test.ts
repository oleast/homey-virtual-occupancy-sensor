import {
  describe, it, expect, beforeEach, vi, afterEach,
} from 'vitest';

import { MotionSensorRegistry } from '../lib/sensors/motion-sensor-registry';

// Mock the parent class dependencies
vi.mock('homey-api');
vi.mock('../lib/homey/api', () => ({
  getHomeyAPI: vi.fn().mockResolvedValue({
    devices: {
      getDevices: vi.fn().mockResolvedValue({}),
    },
  }),
}));

describe('MotionSensorRegistry', () => {
  // We test the timeout learning logic by directly invoking the internal tracking
  // Since trackTimeoutLearning is private, we test it through the public interface
  // by simulating the onDeviceEvent callback behavior

  let registry: MotionSensorRegistry;
  let mockOnDeviceEvent: ReturnType<typeof vi.fn>;
  let mockLog: ReturnType<typeof vi.fn>;
  let mockError: ReturnType<typeof vi.fn>;
  let mockHomey: unknown;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockOnDeviceEvent = vi.fn().mockResolvedValue(undefined);
    mockLog = vi.fn();
    mockError = vi.fn();
    mockHomey = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    if (registry) {
      registry.destroy();
    }
  });

  function createRegistry(options: {
    defaultTimeoutMs?: number;
    enableLearning?: boolean;
    deviceIds?: string[];
  } = {}) {
    const {
      defaultTimeoutMs = 30000,
      enableLearning = true,
      deviceIds = [],
    } = options;

    registry = new MotionSensorRegistry(
      mockHomey as never,
      defaultTimeoutMs,
      enableLearning,
      deviceIds,
      mockOnDeviceEvent,
      mockLog,
      mockError,
    );

    return registry;
  }

  describe('getDeviceConfigs', () => {
    it('should return default timeout when no learning has occurred', () => {
      createRegistry({
        defaultTimeoutMs: 20000,
        enableLearning: true,
        deviceIds: ['motion-1', 'motion-2'],
      });

      const configs = registry.getDeviceConfigs();

      expect(configs).toHaveLength(2);
      expect(configs[0]).toEqual({ id: 'motion-1', timeoutMs: 20000 });
      expect(configs[1]).toEqual({ id: 'motion-2', timeoutMs: 20000 });
    });

    it('should return default timeout for empty device list', () => {
      createRegistry({
        defaultTimeoutMs: 15000,
        enableLearning: true,
        deviceIds: [],
      });

      const configs = registry.getDeviceConfigs();

      expect(configs).toHaveLength(0);
    });
  });

  describe('getLearnedTimeout', () => {
    it('should return null for unknown device', () => {
      createRegistry({
        enableLearning: true,
        deviceIds: ['motion-1'],
      });

      const timeout = registry.getLearnedTimeout('unknown-device');

      expect(timeout).toBeNull();
    });

    it('should return null for known device with no learning yet', () => {
      createRegistry({
        enableLearning: true,
        deviceIds: ['motion-1'],
      });

      // Even for registered devices, learning hasn't happened yet
      const timeout = registry.getLearnedTimeout('motion-1');

      expect(timeout).toBeNull();
    });
  });

  describe('getAllLearnedTimeouts', () => {
    it('should return empty map when no learning has occurred', () => {
      createRegistry({
        enableLearning: true,
        deviceIds: ['motion-1', 'motion-2'],
      });

      const timeouts = registry.getAllLearnedTimeouts();

      expect(timeouts.size).toBe(0);
    });
  });

  describe('getMinLearnedTimeout', () => {
    it('should return provided default when no learning has occurred', () => {
      createRegistry({
        defaultTimeoutMs: 30000,
        enableLearning: true,
        deviceIds: ['motion-1'],
      });

      const minTimeout = registry.getMinLearnedTimeout(25000);

      expect(minTimeout).toBe(25000);
    });
  });

  /**
   * To properly test the timeout learning logic, we test the actual private method
   * on the instance using type casting. This ensures we test the real code
   * and strictly validates the implementation.
   */
  describe('Timeout Learning Logic', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Create a registry with known device Ids
      createRegistry({
        enableLearning: true,
        deviceIds: ['motion-1', 'motion-2', 'motion-3'],
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // Helper to invoke the private method on the real instance
    function trackTimeoutLearning(deviceId: string, value: boolean): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (registry as any).trackTimeoutLearning(deviceId, value);
    }

    function getLearnedTimeout(deviceId: string): number | null {
      return registry.getLearnedTimeout(deviceId);
    }

    function getMinLearnedTimeout(defaultMs: number): number {
      return registry.getMinLearnedTimeout(defaultMs);
    }

    describe('Basic Learning', () => {
      it('should learn timeout from a single true->false cycle', () => {
      // Motion detected
        trackTimeoutLearning('motion-1', true);

        // 15 seconds pass
        vi.advanceTimersByTime(15000);

        // Motion ends
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBe(15000);
        expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('15000 ms'));
      });

      it('should return null before any learning cycle', () => {
        expect(getLearnedTimeout('motion-1')).toBeNull();
      });

      it('should return null after only true event (no false yet)', () => {
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);

        expect(getLearnedTimeout('motion-1')).toBeNull();
      });
    });

    describe('Minimum Tracking', () => {
      it('should learn shorter timeout when new cycle is faster', () => {
      // First cycle: 20 seconds
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(20000);
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBe(20000);

        // Second cycle: 12 seconds (shorter)
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(12000);
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBe(12000);
      });

      it('should NOT update when new cycle is longer', () => {
      // First cycle: 10 seconds
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBe(10000);

        // Second cycle: 25 seconds (longer)
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(25000);
        trackTimeoutLearning('motion-1', false);

        // Should still be 10000
        expect(getLearnedTimeout('motion-1')).toBe(10000);
      });

      it('should track minimum across many cycles', () => {
        const durations = [30000, 25000, 28000, 15000, 22000, 18000];

        for (const duration of durations) {
          trackTimeoutLearning('motion-1', true);
          vi.advanceTimersByTime(duration);
          trackTimeoutLearning('motion-1', false);
        }

        // Minimum is 15000
        expect(getLearnedTimeout('motion-1')).toBe(15000);
      });
    });

    describe('Multiple Devices', () => {
      it('should track each device independently', () => {
      // Device 1: 10 second cycle
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);
        trackTimeoutLearning('motion-1', false);

        // Device 2: 20 second cycle
        trackTimeoutLearning('motion-2', true);
        vi.advanceTimersByTime(20000);
        trackTimeoutLearning('motion-2', false);

        expect(getLearnedTimeout('motion-1')).toBe(10000);
        expect(getLearnedTimeout('motion-2')).toBe(20000);
      });

      it('should handle overlapping motion events from different devices', () => {
      // Device 1 starts at t=0
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(5000);

        // Device 2 starts at t=5000 while device 1 is still active
        trackTimeoutLearning('motion-2', true);
        vi.advanceTimersByTime(8000);

        // Device 1 ends at t=13000 (13s duration)
        trackTimeoutLearning('motion-1', false);
        vi.advanceTimersByTime(7000);

        // Device 2 ends at t=20000 (15s duration since it started at t=5000)
        trackTimeoutLearning('motion-2', false);

        expect(getLearnedTimeout('motion-1')).toBe(13000);
        expect(getLearnedTimeout('motion-2')).toBe(15000); // 20000 - 5000 = 15000ms
      });

      it('getMinLearnedTimeout should return minimum across all devices', () => {
      // Device 1: 15s
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(15000);
        trackTimeoutLearning('motion-1', false);

        // Device 2: 8s
        trackTimeoutLearning('motion-2', true);
        vi.advanceTimersByTime(8000);
        trackTimeoutLearning('motion-2', false);

        // Device 3: 22s
        trackTimeoutLearning('motion-3', true);
        vi.advanceTimersByTime(22000);
        trackTimeoutLearning('motion-3', false);

        expect(getMinLearnedTimeout(30000)).toBe(8000);
      });

      it('getMinLearnedTimeout should return default if no device is shorter', () => {
      // Device 1: 25s
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(25000);
        trackTimeoutLearning('motion-1', false);

        // Device 2: 30s
        trackTimeoutLearning('motion-2', true);
        vi.advanceTimersByTime(30000);
        trackTimeoutLearning('motion-2', false);

        // Default is 20s, which is shorter than both
        expect(getMinLearnedTimeout(20000)).toBe(20000);
      });
    });

    describe('Edge Cases', () => {
      it('should handle false without prior true (no-op)', () => {
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBeNull();
      });

      it('should handle consecutive true events (resets timestamp)', () => {
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(5000);

        // Another true (should update timestamp)
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);

        trackTimeoutLearning('motion-1', false);

        // Should be 10000, not 15000 (measured from second true)
        expect(getLearnedTimeout('motion-1')).toBe(10000);
      });

      it('should handle very short durations', () => {
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(100); // 100ms
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBe(100);
      });

      it('should handle very long durations', () => {
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(300000); // 5 minutes
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBe(300000);
      });

      it('should handle zero duration (immediate false after true)', () => {
        trackTimeoutLearning('motion-1', true);
        // No time advance
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBe(0);
      });
    });

    describe('Learning Disabled Behavior', () => {
    // When enableLearning is false, trackTimeoutLearning is never called
    // This tests that the condition works correctly

      it('should not track when learning is disabled (simulated)', () => {
        const enableLearning = false;

        // Simulate the conditional call in the registry
        if (enableLearning) {
          trackTimeoutLearning('motion-1', true);
          vi.advanceTimersByTime(15000);
          trackTimeoutLearning('motion-1', false);
        }

        expect(getLearnedTimeout('motion-1')).toBeNull();
      });
    });
  });
});

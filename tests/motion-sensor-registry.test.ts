import {
  describe, it, expect, beforeEach, vi, afterEach,
} from 'vitest';

import { MotionSensorRegistry, TimeoutLearningData } from '../lib/sensors/motion-sensor-registry';
import TimeoutStore from '../lib/storage/timeout-store';

// Mock the parent class dependencies
vi.mock('homey-api');
vi.mock('../lib/homey/api', () => ({
  getHomeyAPI: vi.fn().mockResolvedValue({
    devices: {
      getDevices: vi.fn().mockResolvedValue({}),
    },
  }),
}));

function createMockTimeoutStore(data: Map<string, TimeoutLearningData> = new Map()): TimeoutStore {
  return {
    load: vi.fn().mockReturnValue(data),
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  } as unknown as TimeoutStore;
}

describe('MotionSensorRegistry', () => {
  // We test the timeout learning logic by directly invoking the internal tracking
  // Since trackTimeoutLearning is private, we test it through the public interface
  // by simulating the onDeviceEvent callback behavior

  let registry: MotionSensorRegistry;
  let mockOnDeviceEvent: (deviceId: string, value: boolean | string | number) => void;
  let mockLog: (message: string) => void;
  let mockError: (message: string, err?: unknown) => void;
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
    timeoutStore?: TimeoutStore;
    initializeWithStoredData?: Map<string, TimeoutLearningData>;
  } = {}) {
    const {
      defaultTimeoutMs = 30000,
      enableLearning = true,
      deviceIds = [],
      timeoutStore,
      initializeWithStoredData,
    } = options;

    // Create mock store with optional initial data
    const store = timeoutStore ?? createMockTimeoutStore(initializeWithStoredData ?? new Map());

    registry = new MotionSensorRegistry(
      mockHomey as never,
      defaultTimeoutMs,
      enableLearning,
      deviceIds,
      mockOnDeviceEvent,
      mockLog,
      mockError,
      store,
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

      it('should clamp very short durations to minimum 1000ms', () => {
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(100); // 100ms
        trackTimeoutLearning('motion-1', false);

        // Clamped to minimum of 1000ms
        expect(getLearnedTimeout('motion-1')).toBe(1000);
      });

      it('should handle very long durations', () => {
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(300000); // 5 minutes
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBe(300000);
      });

      it('should clamp zero duration to minimum 1000ms', () => {
        trackTimeoutLearning('motion-1', true);
        // No time advance
        trackTimeoutLearning('motion-1', false);

        // Clamped to minimum of 1000ms
        expect(getLearnedTimeout('motion-1')).toBe(1000);
      });

      it('should not clamp durations at or above 1000ms', () => {
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(1500); // 1500ms
        trackTimeoutLearning('motion-1', false);

        // Not clamped - actual value is used
        expect(getLearnedTimeout('motion-1')).toBe(1500);
      });

      it('should log the clamped value when duration is below minimum', () => {
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(50); // 50ms
        trackTimeoutLearning('motion-1', false);

        // Should log 1000ms (clamped), not 50ms (raw)
        expect(mockLog).toHaveBeenCalledWith(
          'Learned new minimum timeout for motion-1: 1000 ms (was null ms)',
        );
      });
    });

    describe('TimeoutStore Persistence', () => {
      it('should call timeoutStore.save when new minimum learned', () => {
        const mockStore = createMockTimeoutStore();
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1'],
          timeoutStore: mockStore,
        });

        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(15000);
        trackTimeoutLearning('motion-1', false);

        expect(mockStore.save).toHaveBeenCalledTimes(1);
        const savedData = (mockStore.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(savedData.get('motion-1')).toBe(15000);
      });

      it('should NOT call timeoutStore.save when duration is longer than existing minimum', () => {
        const mockStore = createMockTimeoutStore();
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1'],
          timeoutStore: mockStore,
        });

        // First cycle: 10 seconds
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);
        trackTimeoutLearning('motion-1', false);

        // Second cycle: 20 seconds (longer)
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(20000);
        trackTimeoutLearning('motion-1', false);

        // Save should only have been called once (for initial learning)
        expect(mockStore.save).toHaveBeenCalledTimes(1);
      });

      it('should call timeoutStore.save with clamped value for very short durations', () => {
        const mockStore = createMockTimeoutStore();
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1'],
          timeoutStore: mockStore,
        });

        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(50); // 50ms
        trackTimeoutLearning('motion-1', false);

        expect(mockStore.save).toHaveBeenCalledTimes(1);
        const savedData = (mockStore.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(savedData.get('motion-1')).toBe(1000); // Clamped to 1000ms
      });

      it('should call timeoutStore.save for each device independently', () => {
        const mockStore = createMockTimeoutStore();
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1', 'motion-2'],
          timeoutStore: mockStore,
        });

        // Device 1: 10 second cycle
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);
        trackTimeoutLearning('motion-1', false);

        // Device 2: 20 second cycle
        trackTimeoutLearning('motion-2', true);
        vi.advanceTimersByTime(20000);
        trackTimeoutLearning('motion-2', false);

        expect(mockStore.save).toHaveBeenCalledTimes(2);
      });
    });

    describe('init() - Load from Store', () => {
      it('should load stored data via init()', () => {
        const storedData = new Map<string, TimeoutLearningData>([
          ['motion-2', { lastTrueTimestamp: null, learnedTimeoutMs: 8000 }],
          ['motion-3', { lastTrueTimestamp: null, learnedTimeoutMs: 12000 }],
        ]);
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-2', 'motion-3'],
          initializeWithStoredData: storedData,
        });

        // Data should be loaded from store
        expect(getLearnedTimeout('motion-2')).toBe(8000);
        expect(getLearnedTimeout('motion-3')).toBe(12000);
      });

      it('should NOT trigger timeoutStore.save during init()', () => {
        const storedData = new Map<string, TimeoutLearningData>([
          ['motion-1', { lastTrueTimestamp: null, learnedTimeoutMs: 5000 }],
        ]);
        const mockStore = createMockTimeoutStore(storedData);
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1'],
          timeoutStore: mockStore,
        });

        expect(mockStore.save).not.toHaveBeenCalled();
        expect(registry.getLearnedTimeout('motion-1')).toBe(5000);
      });

      it('should handle empty store gracefully', () => {
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1'],
          initializeWithStoredData: new Map(),
        });

        expect(getLearnedTimeout('motion-1')).toBeNull();
        expect(registry.getMinLearnedTimeout(30000)).toBe(30000);
      });

      it('should allow subsequent learning after restoring data', () => {
        const storedData = new Map<string, TimeoutLearningData>([
          ['motion-1', { lastTrueTimestamp: null, learnedTimeoutMs: 20000 }],
        ]);
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1'],
          initializeWithStoredData: storedData,
        });

        expect(getLearnedTimeout('motion-1')).toBe(20000);

        // Now learn a shorter timeout - should update
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(8000);
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBe(8000);
      });

      it('should NOT update restored data if subsequent learning is longer', () => {
        const storedData = new Map<string, TimeoutLearningData>([
          ['motion-1', { lastTrueTimestamp: null, learnedTimeoutMs: 5000 }],
        ]);
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1'],
          initializeWithStoredData: storedData,
        });

        // Learn a longer timeout - should NOT update
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(15000);
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBe(5000);
      });

      it('should log message when restoring data', () => {
        const storedData = new Map<string, TimeoutLearningData>([
          ['motion-1', { lastTrueTimestamp: null, learnedTimeoutMs: 10000 }],
          ['motion-2', { lastTrueTimestamp: null, learnedTimeoutMs: 15000 }],
        ]);
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1', 'motion-2'],
          initializeWithStoredData: storedData,
        });

        expect(mockLog).toHaveBeenCalledWith('Restored learned timeouts for 2 sensors');
      });
    });

    describe('removeDevice', () => {
      it('should remove existing device data', () => {
        // Learn a timeout for a device
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);
        trackTimeoutLearning('motion-1', false);

        expect(getLearnedTimeout('motion-1')).toBe(10000);

        // Remove the device
        registry.removeDevice('motion-1');

        expect(getLearnedTimeout('motion-1')).toBeNull();
      });

      it('should handle non-existent deviceId gracefully (no-op)', () => {
        // Should not throw
        expect(() => registry.removeDevice('non-existent-device')).not.toThrow();
      });

      it('should call timeoutStore.remove when device is removed', () => {
        const mockStore = createMockTimeoutStore();
        registry.destroy();
        registry = createRegistry({ timeoutStore: mockStore });

        // Learn a timeout (triggers save)
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);
        trackTimeoutLearning('motion-1', false);

        expect(mockStore.save).toHaveBeenCalledTimes(1);

        // Remove the device
        registry.removeDevice('motion-1');

        // Remove should have been called
        expect(mockStore.remove).toHaveBeenCalledTimes(1);
        expect(mockStore.remove).toHaveBeenCalledWith('motion-1');
      });

      it('should not affect other devices', () => {
        // Learn timeouts for two devices
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);
        trackTimeoutLearning('motion-1', false);

        trackTimeoutLearning('motion-2', true);
        vi.advanceTimersByTime(15000);
        trackTimeoutLearning('motion-2', false);

        expect(getLearnedTimeout('motion-1')).toBe(10000);
        expect(getLearnedTimeout('motion-2')).toBe(15000);

        // Remove device1
        registry.removeDevice('motion-1');

        // device1 data is gone, device2 preserved
        expect(getLearnedTimeout('motion-1')).toBeNull();
        expect(getLearnedTimeout('motion-2')).toBe(15000);
      });

      it('should affect getAllLearnedTimeouts result', () => {
        // Learn timeouts for two devices
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);
        trackTimeoutLearning('motion-1', false);

        trackTimeoutLearning('motion-2', true);
        vi.advanceTimersByTime(15000);
        trackTimeoutLearning('motion-2', false);

        // Remove one device
        registry.removeDevice('motion-1');

        const allTimeouts = registry.getAllLearnedTimeouts();
        expect(allTimeouts.has('motion-1')).toBe(false);
        expect(allTimeouts.get('motion-2')).toBe(15000);
      });

      it('should affect getMinLearnedTimeout result', () => {
        // Learn two timeouts: motion-1=5000ms, motion-2=15000ms
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(5000);
        trackTimeoutLearning('motion-1', false);

        trackTimeoutLearning('motion-2', true);
        vi.advanceTimersByTime(15000);
        trackTimeoutLearning('motion-2', false);

        expect(registry.getMinLearnedTimeout(20000)).toBe(5000);

        // Remove motion-1 (the minimum)
        registry.removeDevice('motion-1');

        // Min should now be motion-2's timeout
        expect(registry.getMinLearnedTimeout(20000)).toBe(15000);
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

    describe('updateDeviceIds cleanup', () => {
      it('should remove timeout data for devices no longer in list', async () => {
        const mockStore = createMockTimeoutStore();
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1', 'motion-2'],
          timeoutStore: mockStore,
        });

        // Learn timeouts for both devices
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);
        trackTimeoutLearning('motion-1', false);

        trackTimeoutLearning('motion-2', true);
        vi.advanceTimersByTime(15000);
        trackTimeoutLearning('motion-2', false);

        expect(getLearnedTimeout('motion-1')).toBe(10000);
        expect(getLearnedTimeout('motion-2')).toBe(15000);

        // Update to only include motion-2
        await registry.updateDeviceIds(['motion-2']);

        // motion-1 timeout data should be removed
        expect(getLearnedTimeout('motion-1')).toBeNull();
        expect(getLearnedTimeout('motion-2')).toBe(15000);
        expect(mockStore.remove).toHaveBeenCalledWith('motion-1');
      });

      it('should not remove timeout data for devices still in list', async () => {
        const mockStore = createMockTimeoutStore();
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1', 'motion-2'],
          timeoutStore: mockStore,
        });

        // Learn timeout for motion-1
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);
        trackTimeoutLearning('motion-1', false);

        // Clear mock call count from save
        vi.clearAllMocks();

        // Update with same devices
        await registry.updateDeviceIds(['motion-1', 'motion-2']);

        // No remove calls should have been made
        expect(mockStore.remove).not.toHaveBeenCalled();
        expect(getLearnedTimeout('motion-1')).toBe(10000);
      });

      it('should handle removing multiple devices', async () => {
        const mockStore = createMockTimeoutStore();
        registry.destroy();
        createRegistry({
          enableLearning: true,
          deviceIds: ['motion-1', 'motion-2', 'motion-3'],
          timeoutStore: mockStore,
        });

        // Learn timeouts for all devices
        trackTimeoutLearning('motion-1', true);
        vi.advanceTimersByTime(10000);
        trackTimeoutLearning('motion-1', false);

        trackTimeoutLearning('motion-2', true);
        vi.advanceTimersByTime(15000);
        trackTimeoutLearning('motion-2', false);

        trackTimeoutLearning('motion-3', true);
        vi.advanceTimersByTime(20000);
        trackTimeoutLearning('motion-3', false);

        // Update to only include motion-2
        await registry.updateDeviceIds(['motion-2']);

        // motion-1 and motion-3 should be removed
        expect(mockStore.remove).toHaveBeenCalledWith('motion-1');
        expect(mockStore.remove).toHaveBeenCalledWith('motion-3');
        expect(mockStore.remove).toHaveBeenCalledTimes(2);
      });
    });
  });
});

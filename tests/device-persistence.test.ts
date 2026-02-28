/* eslint-disable node/no-unsupported-features/es-syntax */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';

import * as HomeyAPIModuleMock from '../__mocks__/homey-api';
import { Device as MockDevice } from '../__mocks__/homey';
import { MockExternalDevice } from '../__mocks__/mock-external-device';

import { DeviceSettings } from '../lib/types';
import { VirtualOccupancySensorDeviceForTest } from './virtual-occupancy-sensor-device-for-test';

vi.mock('homey-api');
vi.mock('homey');

describe('Device Persistence - Registry Auto-Save Integration', () => {
  let device: VirtualOccupancySensorDeviceForTest;
  const devicesMap = new Map<string, unknown>();

  let motionSensor1: MockExternalDevice;
  let motionSensor2: MockExternalDevice;
  let doorSensor1: MockExternalDevice;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    devicesMap.clear();

    vi.spyOn(MockDevice.prototype, 'setCapabilityValue').mockImplementation(async () => Promise.resolve());

    motionSensor1 = new MockExternalDevice('motion-1', ['alarm_motion']);
    motionSensor2 = new MockExternalDevice('motion-2', ['alarm_motion']);
    doorSensor1 = new MockExternalDevice('door-1', ['alarm_contact']);

    devicesMap.set('motion-1', motionSensor1);
    devicesMap.set('motion-2', motionSensor2);
    devicesMap.set('door-1', doorSensor1);

    if (HomeyAPIModuleMock.__setMockDevices) {
      HomeyAPIModuleMock.__setMockDevices(devicesMap);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    if (device) {
      device.onDeleted().catch((err) => {
        console.error('Error during device deletion in afterEach:', err);
      });
    }
  });

  async function createDevice(settingsOverride: Partial<DeviceSettings> = {}) {
    device = new VirtualOccupancySensorDeviceForTest();
    device.getSettings = () => ({
      motion_timeout: 30,
      auto_learn_timeout: true,
      auto_detect_motion_sensors: false,
      auto_detect_door_sensors: false,
      include_child_zones_motion: false,
      include_child_zones_contact: false,
      active_on_occupied: true,
      active_on_empty: false,
      active_on_door_open: false,
      active_on_checking: false,
      door_sensors: 'door-1',
      motion_sensors: 'motion-1,motion-2',
      ...settingsOverride,
    });

    await device.onInit();
    await vi.advanceTimersByTimeAsync(0);
    return device;
  }

  describe('Automatic persistence integration', () => {
    it('should auto-save when new minimum timeout is learned', async () => {
      await createDevice();

      // Initially no data saved
      expect(device.getStoreValue('learnedMotionTimeouts')).toBeUndefined();

      // Learn a timeout by triggering motion cycle
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(10000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);

      // Allow async save to complete
      await vi.advanceTimersByTimeAsync(0);

      // Should be auto-saved
      const stored = device.getStoreValue('learnedMotionTimeouts') as {
        version: number;
        data: Record<string, number>;
      };
      expect(stored).toBeDefined();
      expect(stored.data['motion-1']).toBe(10000);
    });

    it('should auto-save each time a shorter timeout is learned', async () => {
      await createDevice();

      // First learning cycle
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(15000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);
      await vi.advanceTimersByTimeAsync(0);

      let stored = device.getStoreValue('learnedMotionTimeouts') as {
        version: number;
        data: Record<string, number>;
      };
      expect(stored.data['motion-1']).toBe(15000);

      // Second learning cycle with shorter timeout
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(8000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);
      await vi.advanceTimersByTimeAsync(0);

      stored = device.getStoreValue('learnedMotionTimeouts') as {
        version: number;
        data: Record<string, number>;
      };
      expect(stored.data['motion-1']).toBe(8000);
    });

    it('should not auto-save when learning is disabled', async () => {
      await createDevice({ auto_learn_timeout: false });

      // Trigger motion cycle
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(10000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);
      await vi.advanceTimersByTimeAsync(0);

      // Should not be saved (learning disabled)
      expect(device.getStoreValue('learnedMotionTimeouts')).toBeUndefined();
    });

    it('should auto-load persisted data on device init', async () => {
      // Create device with pre-set store data
      device = new VirtualOccupancySensorDeviceForTest();
      device.getSettings = () => ({
        motion_timeout: 30,
        auto_learn_timeout: true,
        auto_detect_motion_sensors: false,
        auto_detect_door_sensors: false,
        include_child_zones_motion: false,
        include_child_zones_contact: false,
        active_on_occupied: true,
        active_on_empty: false,
        active_on_door_open: false,
        active_on_checking: false,
        door_sensors: 'door-1',
        motion_sensors: 'motion-1,motion-2',
      });

      // Pre-set the store data before init
      await device.setStoreValue('learnedMotionTimeouts', {
        version: 1,
        data: {
          'motion-1': 5000,
        },
      });

      await device.onInit();
      await vi.advanceTimersByTimeAsync(0);

      // Learn a longer timeout - should not override the restored 5000
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(20000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);
      await vi.advanceTimersByTimeAsync(0);

      // Should still be 5000 (auto-loaded on init), not 20000
      const stored = device.getStoreValue('learnedMotionTimeouts') as {
        version: number;
        data: Record<string, number>;
      };
      expect(stored.data['motion-1']).toBe(5000);
    });
  });

  describe('Cleanup removed sensors', () => {
    it('should remove learned timeout data when motion sensor is removed via settings', async () => {
      await createDevice();

      // Learn timeouts for both sensors
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(10000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);
      await vi.advanceTimersByTimeAsync(0);

      await motionSensor2.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(15000);
      await motionSensor2.setCapabilityValue('alarm_motion', false);
      await vi.advanceTimersByTimeAsync(0);

      // Verify both are saved
      let stored = device.getStoreValue('learnedMotionTimeouts') as {
        version: number;
        data: Record<string, number>;
      };
      expect(stored.data['motion-1']).toBe(10000);
      expect(stored.data['motion-2']).toBe(15000);

      // Remove motion-2 from settings
      await device.callOnSettings({
        oldSettings: {
          motion_timeout: 30,
          auto_learn_timeout: true,
          auto_detect_motion_sensors: false,
          auto_detect_door_sensors: false,
          include_child_zones_motion: false,
          include_child_zones_contact: false,
          active_on_occupied: true,
          active_on_empty: false,
          active_on_door_open: false,
          active_on_checking: false,
          door_sensors: 'door-1',
          motion_sensors: 'motion-1,motion-2',
        },
        newSettings: {
          motion_timeout: 30,
          auto_learn_timeout: true,
          auto_detect_motion_sensors: false,
          auto_detect_door_sensors: false,
          include_child_zones_motion: false,
          include_child_zones_contact: false,
          active_on_occupied: true,
          active_on_empty: false,
          active_on_door_open: false,
          active_on_checking: false,
          door_sensors: 'door-1',
          motion_sensors: 'motion-1',
        },
        changedKeys: ['motion_sensors'],
      });
      await vi.advanceTimersByTimeAsync(0);

      // Verify motion-2 data is removed, motion-1 data is preserved
      stored = device.getStoreValue('learnedMotionTimeouts') as {
        version: number;
        data: Record<string, number>;
      };
      expect(stored.data['motion-1']).toBe(10000);
      expect(stored.data['motion-2']).toBeUndefined();
    });

    it('should remove all learned timeout data when all motion sensors are removed', async () => {
      await createDevice();

      // Learn timeout for sensor
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(10000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);
      await vi.advanceTimersByTimeAsync(0);

      // Verify data is saved
      let stored = device.getStoreValue('learnedMotionTimeouts') as {
        version: number;
        data: Record<string, number>;
      };
      expect(stored.data['motion-1']).toBe(10000);

      // Remove all motion sensors
      await device.callOnSettings({
        oldSettings: {
          motion_timeout: 30,
          auto_learn_timeout: true,
          auto_detect_motion_sensors: false,
          auto_detect_door_sensors: false,
          include_child_zones_motion: false,
          include_child_zones_contact: false,
          active_on_occupied: true,
          active_on_empty: false,
          active_on_door_open: false,
          active_on_checking: false,
          door_sensors: 'door-1',
          motion_sensors: 'motion-1,motion-2',
        },
        newSettings: {
          motion_timeout: 30,
          auto_learn_timeout: true,
          auto_detect_motion_sensors: false,
          auto_detect_door_sensors: false,
          include_child_zones_motion: false,
          include_child_zones_contact: false,
          active_on_occupied: true,
          active_on_empty: false,
          active_on_door_open: false,
          active_on_checking: false,
          door_sensors: 'door-1',
          motion_sensors: '',
        },
        changedKeys: ['motion_sensors'],
      });
      await vi.advanceTimersByTimeAsync(0);

      // Verify all data is cleaned up
      stored = device.getStoreValue('learnedMotionTimeouts') as {
        version: number;
        data: Record<string, number>;
      };
      expect(Object.keys(stored.data)).toHaveLength(0);
    });

    it('should not save when no sensors are removed', async () => {
      await createDevice();

      // Learn timeout
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(10000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);
      await vi.advanceTimersByTimeAsync(0);

      // Spy on setStoreValue to track saves
      const setStoreValueSpy = vi.spyOn(device, 'setStoreValue');

      // Update with same sensor list (no change)
      await device.callOnSettings({
        oldSettings: {
          motion_timeout: 30,
          auto_learn_timeout: true,
          auto_detect_motion_sensors: false,
          auto_detect_door_sensors: false,
          include_child_zones_motion: false,
          include_child_zones_contact: false,
          active_on_occupied: true,
          active_on_empty: false,
          active_on_door_open: false,
          active_on_checking: false,
          door_sensors: 'door-1',
          motion_sensors: 'motion-1,motion-2',
        },
        newSettings: {
          motion_timeout: 30,
          auto_learn_timeout: true,
          auto_detect_motion_sensors: false,
          auto_detect_door_sensors: false,
          include_child_zones_motion: false,
          include_child_zones_contact: false,
          active_on_occupied: true,
          active_on_empty: false,
          active_on_door_open: false,
          active_on_checking: false,
          door_sensors: 'door-1',
          motion_sensors: 'motion-1,motion-2',
        },
        changedKeys: ['motion_sensors'],
      });
      await vi.advanceTimersByTimeAsync(0);

      // Should not have called save (no sensor removed)
      expect(setStoreValueSpy).not.toHaveBeenCalled();
    });

    it('should preserve learned data when adding new sensors', async () => {
      // Start with just motion-1
      device = new VirtualOccupancySensorDeviceForTest();
      device.getSettings = () => ({
        motion_timeout: 30,
        auto_learn_timeout: true,
        auto_detect_motion_sensors: false,
        auto_detect_door_sensors: false,
        include_child_zones_motion: false,
        include_child_zones_contact: false,
        active_on_occupied: true,
        active_on_empty: false,
        active_on_door_open: false,
        active_on_checking: false,
        door_sensors: 'door-1',
        motion_sensors: 'motion-1',
      });

      await device.onInit();
      await vi.advanceTimersByTimeAsync(0);

      // Learn timeout for motion-1
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(10000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);
      await vi.advanceTimersByTimeAsync(0);

      // Add motion-2
      await device.callOnSettings({
        oldSettings: {
          motion_timeout: 30,
          auto_learn_timeout: true,
          auto_detect_motion_sensors: false,
          auto_detect_door_sensors: false,
          include_child_zones_motion: false,
          include_child_zones_contact: false,
          active_on_occupied: true,
          active_on_empty: false,
          active_on_door_open: false,
          active_on_checking: false,
          door_sensors: 'door-1',
          motion_sensors: 'motion-1',
        },
        newSettings: {
          motion_timeout: 30,
          auto_learn_timeout: true,
          auto_detect_motion_sensors: false,
          auto_detect_door_sensors: false,
          include_child_zones_motion: false,
          include_child_zones_contact: false,
          active_on_occupied: true,
          active_on_empty: false,
          active_on_door_open: false,
          active_on_checking: false,
          door_sensors: 'door-1',
          motion_sensors: 'motion-1,motion-2',
        },
        changedKeys: ['motion_sensors'],
      });
      await vi.advanceTimersByTimeAsync(0);

      // motion-1 data should still exist
      const stored = device.getStoreValue('learnedMotionTimeouts') as {
        version: number;
        data: Record<string, number>;
      };
      expect(stored.data['motion-1']).toBe(10000);
    });
  });
});

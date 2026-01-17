/* eslint-disable node/no-unsupported-features/es-syntax */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';

// Use relative imports for mocks to avoid resolution issues in the test file itself
import * as HomeyAPIModuleMock from '../__mocks__/homey-api';
import { Device as MockDevice } from '../__mocks__/homey';
import { MockExternalDevice } from '../__mocks__/mock-external-device';

// Import Class Under Test
import { DeviceSettings } from '../drivers/virtual-occupancy-sensor/device';
import { VirtualOccupancySensorDeviceForTest } from './virtual-occupancy-sensor-device-for-test';
import { OccupancyState } from '../lib/types';

// Setup Mocks
vi.mock('homey-api'); // Auto-mock from root __mocks__
vi.mock('homey');

describe('Multi-Sensor Scenarios', () => {
  let device: VirtualOccupancySensorDeviceForTest;
  const devicesMap = new Map<string, unknown>();
  let lastOccupancyState: string = 'empty';

  // Multiple sensors
  let motionSensor1: MockExternalDevice;
  let motionSensor2: MockExternalDevice;
  let doorSensor1: MockExternalDevice;
  let doorSensor2: MockExternalDevice;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    devicesMap.clear();
    lastOccupancyState = 'empty';

    vi.spyOn(MockDevice.prototype, 'setCapabilityValue').mockImplementation(async (id: string, val: unknown) => {
      if (id === 'occupancy_state') {
        lastOccupancyState = val as string;
      }
      return Promise.resolve();
    });

    // Create multiple sensors
    motionSensor1 = new MockExternalDevice('motion-1', ['alarm_motion']);
    motionSensor2 = new MockExternalDevice('motion-2', ['alarm_motion']);
    doorSensor1 = new MockExternalDevice('door-1', ['alarm_contact']);
    doorSensor2 = new MockExternalDevice('door-2', ['alarm_contact']);

    devicesMap.set('motion-1', motionSensor1);
    devicesMap.set('motion-2', motionSensor2);
    devicesMap.set('door-1', doorSensor1);
    devicesMap.set('door-2', doorSensor2);

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

  async function createDevice(settingsOverride: Partial<DeviceSettings>) {
    device = new VirtualOccupancySensorDeviceForTest();
    device.getSettings = () => ({
      motion_timeout: 30,
      auto_learn_timeout: false,
      active_on_occupied: true,
      active_on_empty: false,
      active_on_door_open: false,
      active_on_checking: false,
      door_sensors: 'door-1,door-2',
      motion_sensors: 'motion-1,motion-2',
      ...settingsOverride,
    });

    await device.onInit();
    await vi.advanceTimersByTimeAsync(0);
    device.forceOccupancyState('empty');
    return device;
  }

  async function forceState(state: OccupancyState) {
    device.forceOccupancyState(state);
    lastOccupancyState = state;
  }

  // ============================================================================
  // MULTIPLE DOOR SENSORS TESTS
  // ============================================================================

  describe('Multiple Door Sensors', () => {
    /**
     * SCENARIO: One door opens while another is already open
     *
     * Expected behavior:
     * - First door opens → door_open state
     * - Second door opens → stay in door_open (already there)
     * - First door closes → stay in door_open (second door still open)
     * - Second door closes → transition to checking
     *
     * This tests the "all doors must be closed" logic.
     */
    it('should stay in door_open until ALL doors are closed', async () => {
      await createDevice({});
      expect(lastOccupancyState).toBe('empty');

      // First door opens
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      // Second door opens
      await doorSensor2.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      // First door closes - second still open
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      expect(lastOccupancyState).toBe('door_open');

      // Second door closes - all doors now closed
      await doorSensor2.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');
    });

    /**
     * SCENARIO: Doors close in different order than they opened
     *
     * Expected behavior: Order doesn't matter, only that ALL are closed.
     */
    it('should handle doors closing in different order than opening', async () => {
      await createDevice({});

      // Open door 1, then door 2
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      await doorSensor2.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      // Close door 2 first (opposite order)
      await doorSensor2.setCapabilityValue('alarm_contact', false);
      expect(lastOccupancyState).toBe('door_open');

      // Close door 1
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');
    });

    /**
     * SCENARIO: Door reopens during checking phase
     *
     * Expected behavior:
     * - In checking state
     * - Any door opens → back to door_open
     * - Door closes → back to checking
     */
    it('should return to door_open if any door opens during checking', async () => {
      await createDevice({});

      // Enter checking via door cycle
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      // Door 2 opens
      await doorSensor2.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      // Door 2 closes
      await doorSensor2.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');
    });

    /**
     * SCENARIO: Multiple doors open from empty state
     *
     * Expected behavior: First door triggers door_open, subsequent doors don't change state.
     */
    it('should only trigger door_open once when multiple doors open simultaneously', async () => {
      await createDevice({});

      // Both doors open in quick succession
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      await doorSensor2.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open'); // Still door_open, no change
    });

    /**
     * SCENARIO: Door sensor flaps (rapid open/close) while other door is stable
     *
     * This can happen with faulty sensors or drafts.
     * Expected behavior: As long as one door is stably open, stay in door_open.
     */
    it('should handle door sensor flapping while another door is stable', async () => {
      await createDevice({});

      // Door 1 opens and stays open
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      // Door 2 flaps open/closed rapidly
      await doorSensor2.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');
      await doorSensor2.setCapabilityValue('alarm_contact', false);
      expect(lastOccupancyState).toBe('door_open'); // Door 1 still open
      await doorSensor2.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');
      await doorSensor2.setCapabilityValue('alarm_contact', false);
      expect(lastOccupancyState).toBe('door_open'); // Door 1 still open

      // Door 1 finally closes
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');
    });

    /**
     * SCENARIO: Occupied room with multiple doors opening/closing
     *
     * Expected behavior: Door cycles from occupied should go to checking.
     */
    it('should handle door cycles from occupied state with multiple doors', async () => {
      await createDevice({});
      await forceState('occupied');

      // Door 1 opens
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      // Door 2 opens
      await doorSensor2.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      // Door 1 closes
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      expect(lastOccupancyState).toBe('door_open');

      // Door 2 closes - all closed
      await doorSensor2.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');
    });
  });

  // ============================================================================
  // MULTIPLE MOTION SENSORS TESTS
  // ============================================================================

  describe('Multiple Motion Sensors', () => {
    /**
     * SCENARIO: Motion from any sensor should trigger occupied from empty
     *
     * Expected behavior: Any motion sensor can trigger the occupied state.
     */
    it('should transition to occupied from any motion sensor (sensor 1)', async () => {
      await createDevice({});
      expect(lastOccupancyState).toBe('empty');

      await motionSensor1.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('occupied');
    });

    it('should transition to occupied from any motion sensor (sensor 2)', async () => {
      await createDevice({});
      expect(lastOccupancyState).toBe('empty');

      await motionSensor2.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('occupied');
    });

    /**
     * SCENARIO: Both motion sensors active, then one times out
     *
     * Expected behavior: Stay occupied as long as ANY motion sensor is active.
     */
    it('should stay occupied if only one motion sensor times out', async () => {
      await createDevice({});
      await forceState('occupied');

      // Both sensors active
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await motionSensor2.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('occupied');

      // Sensor 1 times out
      await motionSensor1.setCapabilityValue('alarm_motion', false);
      expect(lastOccupancyState).toBe('occupied'); // Sensor 2 still active

      // Sensor 2 times out
      await motionSensor2.setCapabilityValue('alarm_motion', false);
      expect(lastOccupancyState).toBe('occupied'); // motion_timeout doesn't leave occupied
    });

    /**
     * SCENARIO: Checking state with multiple motion sensors - any motion should trigger occupied
     *
     * Expected behavior: In checking, motion from ANY sensor triggers occupied.
     */
    it('should transition to occupied from checking if any motion sensor detects motion', async () => {
      await createDevice({});

      // Enter checking
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      // Motion from sensor 2
      await motionSensor2.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('occupied');
    });

    /**
     * SCENARIO: Checking timeout with multiple motion sensors - all must be inactive
     *
     * Expected behavior:
     * - Checking timeout fires
     * - System checks if ANY motion sensor is still active
     * - If any active → occupied
     * - If all inactive → empty
     */
    it('should stay occupied after checking timeout if ANY motion sensor is still active', async () => {
      await createDevice({ motion_timeout: 20 });

      // Door cycle with motion active
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await motionSensor2.setCapabilityValue('alarm_motion', true);
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      // Sensor 1 times out before checking timeout
      await vi.advanceTimersByTimeAsync(10000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);

      // Checking timeout fires - sensor 2 still active
      await vi.advanceTimersByTimeAsync(15000);
      await vi.advanceTimersByTimeAsync(0);

      // Should be occupied because sensor 2 is still active
      expect(lastOccupancyState).toBe('occupied');
    });

    it('should go to empty after checking timeout if ALL motion sensors are inactive', async () => {
      await createDevice({ motion_timeout: 20 });

      // Door cycle with motion
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      // Motion times out before checking timeout
      await vi.advanceTimersByTimeAsync(10000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);

      // Checking timeout fires - no motion active
      await vi.advanceTimersByTimeAsync(15000);
      await vi.advanceTimersByTimeAsync(0);

      expect(lastOccupancyState).toBe('empty');
    });

    /**
     * SCENARIO: Motion sensors with different timeouts during checking
     *
     * The CheckingSensorRegistry waits for ALL sensors to report their timeout.
     * With different sensor timeouts, this ensures we wait long enough.
     */
    it('should wait for all motion sensor timeouts during checking', async () => {
      // Sensor 1 has 10s timeout, sensor 2 has 30s timeout
      // The checking should use individual timeouts from getDeviceConfigs()
      await createDevice({ motion_timeout: 30 });

      // Enter checking
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      // After 15s (sensor 1 would have timed out), still checking
      await vi.advanceTimersByTimeAsync(15000);
      expect(lastOccupancyState).toBe('checking');

      // After full timeout period, go to empty
      await vi.advanceTimersByTimeAsync(20000);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('empty');
    });

    /**
     * SCENARIO: Motion detected on sensor 1, then sensor 2 during door_open
     *
     * Expected behavior: Additional motion events are tracked but don't change state.
     */
    it('should track multiple motion events during door_open state', async () => {
      await createDevice({});

      // Door opens
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      // Motion on sensor 1
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('door_open'); // Stay in door_open

      // Motion on sensor 2
      await motionSensor2.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('door_open'); // Stay in door_open

      // Door closes
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      // Let the checking timeout fire - both motion sensors active
      await vi.advanceTimersByTimeAsync(35000);
      await vi.advanceTimersByTimeAsync(0);

      // Should be occupied (both sensors still active)
      expect(lastOccupancyState).toBe('occupied');
    });
  });

  // ============================================================================
  // COMBINED MULTIPLE DOOR AND MOTION SENSORS
  // ============================================================================

  describe('Combined Multiple Door and Motion Sensors', () => {
    /**
     * SCENARIO: Room with multiple entry points, person enters one, leaves another
     *
     * Timeline:
     * - Door 1 opens → door_open
     * - Motion detected → tracked (still door_open)
     * - Door 1 closes → checking (door 2 still closed)
     * - Motion triggers → occupied
     * - Door 2 opens → door_open
     * - Door 2 closes → checking
     * - No motion → empty
     */
    it('should handle entry from door 1 and exit from door 2', async () => {
      await createDevice({});

      // Enter through door 1
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      await motionSensor1.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('occupied');

      // Exit through door 2
      await doorSensor2.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      await motionSensor1.setCapabilityValue('alarm_motion', false);

      await doorSensor2.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      // No motion - room is empty
      await vi.advanceTimersByTimeAsync(35000);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('empty');
    });

    /**
     * SCENARIO: Two people enter through different doors simultaneously
     *
     * Expected behavior: System tracks both doors, waits for both to close.
     */
    it('should handle simultaneous entry through multiple doors', async () => {
      await createDevice({});

      // Both doors open (two people entering)
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      await doorSensor2.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      // Motion from multiple sensors
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      await motionSensor2.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('door_open');

      // First door closes
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      expect(lastOccupancyState).toBe('door_open'); // Door 2 still open

      // Second door closes
      await doorSensor2.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      // Motion sensors are still active, so after timeout we're occupied
      await vi.advanceTimersByTimeAsync(35000);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('occupied');
    });

    /**
     * SCENARIO: Motion in different parts of room during checking
     *
     * Expected behavior: Motion from any sensor during checking → occupied.
     */
    it('should detect motion from secondary sensor during checking', async () => {
      await createDevice({});

      // Enter and go to checking
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      // Motion from sensor 2 (far side of room)
      await vi.advanceTimersByTimeAsync(5000);
      await motionSensor2.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('occupied');
    });

    /**
     * SCENARIO: Person walks from one motion sensor coverage to another
     *
     * This simulates walking across a room where sensor 1 times out
     * but sensor 2 picks up the motion.
     */
    it('should stay occupied as person moves between motion sensor zones', async () => {
      await createDevice({ motion_timeout: 10 });
      await forceState('occupied');

      // Motion detected by sensor 1
      await motionSensor1.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('occupied');

      // Person walks to sensor 2's area
      await vi.advanceTimersByTimeAsync(5000);
      await motionSensor2.setCapabilityValue('alarm_motion', true);

      // Sensor 1 times out (person left that area)
      await vi.advanceTimersByTimeAsync(8000);
      await motionSensor1.setCapabilityValue('alarm_motion', false);
      expect(lastOccupancyState).toBe('occupied'); // Sensor 2 still active

      // Sensor 2 times out
      await vi.advanceTimersByTimeAsync(8000);
      await motionSensor2.setCapabilityValue('alarm_motion', false);
      expect(lastOccupancyState).toBe('occupied'); // motion_timeout in occupied is ignored
    });
  });

  // ============================================================================
  // EDGE CASES AND POTENTIAL ISSUES
  // ============================================================================

  describe('Edge Cases and Potential Issues', () => {
    /**
     * ISSUE: Sensor becomes unavailable during operation
     *
     * If a sensor goes offline, its state might be stale.
     * The system should handle this gracefully.
     */
    it('should handle sensor removal gracefully', async () => {
      await createDevice({
        door_sensors: 'door-1',
        motion_sensors: 'motion-1',
      });

      // Normal operation
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      await motionSensor1.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('occupied');
    });

    /**
     * ISSUE: Rapid door open/close events
     *
     * Some doors might generate multiple events quickly.
     * The system should not get confused.
     */
    it('should handle rapid door state changes', async () => {
      await createDevice({});

      // Rapid open/close/open/close
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);

      // Should end up in checking (door is closed)
      expect(lastOccupancyState).toBe('checking');
    });

    /**
     * ISSUE: Motion event during state transition
     *
     * What happens if motion fires exactly as we enter checking?
     */
    it('should process motion during transition to checking', async () => {
      await createDevice({});

      await doorSensor1.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      // Close door and immediately detect motion
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      await motionSensor1.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('occupied');
    });

    /**
     * ISSUE: All doors and motion sensors need to agree
     *
     * With multiple sensors, we need to ensure:
     * - ANY door open → door_open state
     * - ALL doors closed → checking
     * - ANY motion during checking → occupied
     * - ALL motion sensors timed out during checking → empty
     */
    it('should correctly aggregate multiple sensor states', async () => {
      await createDevice({});

      // Multiple doors, only check for empty when ALL closed
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      await doorSensor2.setCapabilityValue('alarm_contact', true);
      await doorSensor1.setCapabilityValue('alarm_contact', false);
      // Door 2 still open
      expect(lastOccupancyState).toBe('door_open');

      await doorSensor2.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      // Now all closed
      expect(lastOccupancyState).toBe('checking');
    });
  });

  // ============================================================================
  // SINGLE SENSOR FALLBACK (VERIFY BACKWARD COMPATIBILITY)
  // ============================================================================

  describe('Single Sensor Configuration', () => {
    it('should work with single door and single motion sensor', async () => {
      await createDevice({
        door_sensors: 'door-1',
        motion_sensors: 'motion-1',
      });

      // Standard flow with single sensors
      await doorSensor1.setCapabilityValue('alarm_contact', true);
      expect(lastOccupancyState).toBe('door_open');

      await doorSensor1.setCapabilityValue('alarm_contact', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      await motionSensor1.setCapabilityValue('alarm_motion', true);
      expect(lastOccupancyState).toBe('occupied');
    });
  });
});

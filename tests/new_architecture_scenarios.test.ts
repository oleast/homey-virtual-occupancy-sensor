/* eslint-disable node/no-unsupported-features/es-syntax */
/* eslint-disable max-classes-per-file */
/* eslint-disable no-console */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';

// Use relative imports for mocks to avoid resolution issues in the test file itself
import * as HomeyAPIModuleMock from '../__mocks__/homey-api';
import { Device as MockDevice } from '../__mocks__/homey'; // Auto-mock from root __mocks__

// Import Class Under Test
import VirtualOccupancySensorDevice, { DeviceSettings } from '../drivers/virtual-occupancy-sensor/device';
import { OccupancyState } from '../lib/types';

// Setup Mocks
vi.mock('homey-api'); // Auto-mock from root __mocks__
vi.mock('homey');

// Define the MockExternalDevice helper (same as before)
class MockExternalDevice {
    public id: string;
    public name: string;
    public capabilities: string[];
    public capabilitiesObj: Record<string, { value: unknown }>;
    public listeners: Map<string, (val: unknown) => void> = new Map();

    constructor(id: string, capabilities: string[]) {
      this.id = id;
      this.name = `Device ${id}`;
      this.capabilities = capabilities;
      this.capabilitiesObj = {};
      capabilities.forEach((cap) => {
        this.capabilitiesObj[cap] = { value: false }; // Default false
      });
    }

    makeCapabilityInstance(capabilityId: string, listener: (val: unknown) => void) {
      console.log(`[MockExternalDevice] makeCapabilityInstance called for ${this.id}, cap: ${capabilityId}`);
      if (!this.capabilities.includes(capabilityId)) {
        throw new Error(`Capability ${capabilityId} not found on device ${this.id}`);
      }
      this.listeners.set(capabilityId, listener);
      return {
        destroy: () => {
          this.listeners.delete(capabilityId);
        },
      };
    }

    async setCapabilityValue(capabilityId: string, value: unknown) {
      console.log(`[MockExternalDevice] setCapabilityValue called for ${this.id}, cap: ${capabilityId} = ${value}`);
      this.capabilitiesObj[capabilityId] = { value };
      const listener = this.listeners.get(capabilityId);
      if (listener) {
        console.log(`[MockExternalDevice] Triggering listener for ${this.id}`);
        await listener(value);
      } else {
        console.log(`[MockExternalDevice] NO LISTENER found for ${this.id}, cap: ${capabilityId}`);
        console.log('Listeners keys:', Array.from(this.listeners.keys()));
      }
    }
}

describe('VirtualOccupancySensorDevice - Scenarios', () => {
  let device: VirtualOccupancySensorDevice;
  let motionSensor: MockExternalDevice;
  let doorSensor: MockExternalDevice;
  const devicesMap = new Map<string, unknown>();

  let lastOccupancyState: string = 'empty';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    devicesMap.clear();
    lastOccupancyState = 'empty';

    // Spy on the mocked Device class prototype to intercept setCapabilityValue
    // This works because VirtualOccupancySensorDevice extends Homey.Device (which is now our Mock Device)
    vi.spyOn(MockDevice.prototype, 'setCapabilityValue').mockImplementation(async (id: string, val: unknown) => {
      if (id === 'occupancy_state') {
        lastOccupancyState = val as string;
      }
      return Promise.resolve();
    });

    motionSensor = new MockExternalDevice('motion-1', ['alarm_motion']);
    doorSensor = new MockExternalDevice('door-1', ['alarm_contact']);

    devicesMap.set('motion-1', motionSensor);
    devicesMap.set('door-1', doorSensor);

    // Inject devices into mock AFTER populating them
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
    device = new VirtualOccupancySensorDevice();
    // Use spy/mock on the instance itself for settings if needed, or overwrite method
    // Since getSettings was defined in our mock base class, we can overwrite it on the instance
    device.getSettings = () => ({
      motion_timeout: 30,
      active_on_door_open: false,
      active_on_checking: false,
      door_sensors: 'door-1',
      motion_sensors: 'motion-1',
      ...settingsOverride,
    });

    await device.onInit();

    // Wait for async listener registration to complete
    // The sensor registries call addListener asynchronously in their constructors
    await vi.advanceTimersByTimeAsync(0);

    // Force initial state if controller exists
    if (device.controller) await device.controller.setOccupancyState('empty');

    return device;
  }

  async function forceState(state: OccupancyState) {
    if (device.controller) await device.controller.setOccupancyState(state);
    lastOccupancyState = state;
  }

  it('Scenario 1: Standard Entry (Door Open -> Door Close -> Motion)', async () => {
    await createDevice({});
    await doorSensor.setCapabilityValue('alarm_contact', true);
    expect(lastOccupancyState).toBe('door_open');
    await doorSensor.setCapabilityValue('alarm_contact', false);
    expect(lastOccupancyState).toBe('checking');
    await vi.advanceTimersByTimeAsync(100);
    await motionSensor.setCapabilityValue('alarm_motion', true);
    expect(lastOccupancyState).toBe('occupied');
  });

  it('Scenario 2: Quick Exit (Occupied -> Door Open -> Door Close -> No Motion)', async () => {
    await createDevice({});
    await forceState('occupied');

    await doorSensor.setCapabilityValue('alarm_contact', true);
    expect(lastOccupancyState).toBe('door_open');
    await doorSensor.setCapabilityValue('alarm_contact', false);
    await vi.advanceTimersByTimeAsync(0); // Flush async to enter checking
    expect(lastOccupancyState).toBe('checking');
    // Wait for the CheckingSensorRegistry timeout (30s default + buffer)
    await vi.advanceTimersByTimeAsync(31000);
    await vi.advanceTimersByTimeAsync(0); // Flush async callbacks
    expect(lastOccupancyState).toBe('empty');
  });

  it('Scenario 3: Hesitant Visitor (Door Open -> Door Close -> Wait 15s -> Motion)', async () => {
    await createDevice({});
    await doorSensor.setCapabilityValue('alarm_contact', true);
    await doorSensor.setCapabilityValue('alarm_contact', false);
    await vi.advanceTimersByTimeAsync(0); // Flush async to enter checking
    expect(lastOccupancyState).toBe('checking');
    // Wait 15s (less than the 30s timeout), then motion detected
    await vi.advanceTimersByTimeAsync(15000);
    await motionSensor.setCapabilityValue('alarm_motion', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(lastOccupancyState).toBe('occupied');
  });

  it('Scenario 4: Continuous Motion (Occupied -> Door Cycle -> Timeout -> Then motion re-detected)', async () => {
    await createDevice({});
    await forceState('occupied');
    // Motion sensor is explicitly TRUE (someone is waving)
    await motionSensor.setCapabilityValue('alarm_motion', true);

    await doorSensor.setCapabilityValue('alarm_contact', true);
    expect(lastOccupancyState).toBe('door_open');

    // Door closes, enters checking
    await doorSensor.setCapabilityValue('alarm_contact', false);
    await vi.advanceTimersByTimeAsync(0);
    expect(lastOccupancyState).toBe('checking');

    // Wait for the checking timeout (30s)
    // Note: The CheckingSensorRegistry uses a fixed timeout. Even if motion is
    // continuously active, the timeout will fire. This is by design - the
    // checking phase verifies presence through the motion sensor's activity,
    // not its current state.
    await vi.advanceTimersByTimeAsync(31000);
    await vi.advanceTimersByTimeAsync(0);

    // After timeout, system goes to empty
    expect(lastOccupancyState).toBe('empty');

    // But if motion is still active (or re-triggered), system goes back to occupied
    // In real world, if someone is still moving, the motion sensor would trigger again
    await motionSensor.setCapabilityValue('alarm_motion', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(lastOccupancyState).toBe('occupied');
  });

  it('Scenario 5: Empty Motion (Motion in empty room -> Occupied)', async () => {
    await createDevice({});
    expect(lastOccupancyState).toBe('empty');
    // Wait for listeners to be fully registered
    await vi.advanceTimersByTimeAsync(0);
    await motionSensor.setCapabilityValue('alarm_motion', true);
    expect(lastOccupancyState).toBe('occupied');
  });

  it('Scenario 6: False Entry (Door Open -> Door Close -> No Motion)', async () => {
    await createDevice({});
    await forceState('empty');
    await doorSensor.setCapabilityValue('alarm_contact', true);
    await doorSensor.setCapabilityValue('alarm_contact', false);
    await vi.advanceTimersByTimeAsync(0); // Flush async to enter checking
    expect(lastOccupancyState).toBe('checking');
    // Wait for the CheckingSensorRegistry timeout
    await vi.advanceTimersByTimeAsync(31000);
    await vi.advanceTimersByTimeAsync(0); // Flush async callbacks
    expect(lastOccupancyState).toBe('empty');
  });

  /**
   * BUG REPRODUCTION: Motion sensor times out before door closes
   *
   * Real-world scenario:
   * 1. Room is empty
   * 2. User opens door (door sensor triggers)
   * 3. Motion sensor detects user entering (motion = true)
   * 4. User lingers in doorway, motion sensor's internal timeout elapses (20s)
   * 5. Motion sensor resets (motion = false, motion_timeout event sent)
   * 6. User finally closes door
   * 7. System enters 'checking' state
   * 8. handleCheckingState() checks isAnyMotionActive - it's FALSE because motion already timed out
   * 9. System immediately transitions to 'empty' - THIS IS THE BUG
   * 10. User moves again → system correctly goes to 'occupied'
   *
   * The core issue: When coming from door_open, we KNOW motion was detected while the door
   * was open (or at minimum, we should assume someone might have entered). We shouldn't
   * immediately go to empty just because the motion sensor's internal timeout elapsed.
   *
   * Expected: When entering 'checking' state, ALWAYS wait for the configured motion_timeout
   * before deciding nobody is there. Don't short-circuit based on current motion sensor state.
   */
  it('BUG SCENARIO A: Motion times out BEFORE door closes - immediate empty transition', async () => {
    // Configure with 20s motion timeout (matching real sensor)
    await createDevice({ motion_timeout: 20 });

    // Step 1: Door opens
    await doorSensor.setCapabilityValue('alarm_contact', true);
    expect(lastOccupancyState).toBe('door_open');

    // Step 2: Motion detected while door is open (user entering)
    await motionSensor.setCapabilityValue('alarm_motion', true);
    expect(lastOccupancyState).toBe('door_open');

    // Step 3: User lingers, motion sensor times out after 20s
    await vi.advanceTimersByTimeAsync(20000);
    await motionSensor.setCapabilityValue('alarm_motion', false);
    expect(lastOccupancyState).toBe('door_open');

    // Step 4: User finally closes door
    await doorSensor.setCapabilityValue('alarm_contact', false);
    await vi.advanceTimersByTimeAsync(0); // Flush async callbacks

    // THE BUG: System immediately goes to empty instead of staying in checking
    // EXPECTED: Should stay in 'checking' and wait for the full motion_timeout period
    expect(lastOccupancyState).not.toBe('empty');
    expect(lastOccupancyState).toBe('checking');

    // If the system were working correctly:
    // - It would stay in 'checking' for 20 seconds
    // - User moves after 2 seconds, motion sensor triggers
    // - System should transition to 'occupied'
  });

  /**
   * BUG REPRODUCTION: User's exact real-world scenario
   *
   * Timeline:
   * - T=0s: Door opens
   * - T=2s: Motion detected (user entering)
   * - T=4s: Door closes (motion still active - only 2s since detection, not 20s)
   * - T=4s+: System enters 'checking' with motion currently active
   * - T=22s: Motion sensor times out (20s after detection at T=2s)
   * - BUG: System goes to 'empty' immediately when motion times out
   *
   * Expected behavior: System should stay in 'checking' until the full checking
   * timeout period elapses, ignoring the motion_timeout event. The checking timeout
   * should start fresh when entering checking state, not be based on when motion
   * was originally detected.
   */
  it('BUG SCENARIO B: User exact case - Door open, 2s, motion, 2s, door close', async () => {
    // Configure with 20s motion timeout (matching real sensor)
    await createDevice({ motion_timeout: 20 });

    // T=0s: Door opens
    await doorSensor.setCapabilityValue('alarm_contact', true);
    expect(lastOccupancyState).toBe('door_open');

    // T=2s: Motion detected (user entering)
    await vi.advanceTimersByTimeAsync(2000);
    await motionSensor.setCapabilityValue('alarm_motion', true);
    expect(lastOccupancyState).toBe('door_open');

    // T=4s: Door closes (motion still active)
    await vi.advanceTimersByTimeAsync(2000);
    await doorSensor.setCapabilityValue('alarm_contact', false);
    await vi.advanceTimersByTimeAsync(0); // Flush async callbacks

    // At this point, motion is STILL TRUE (only 2s since motion detected, not 20s)
    // System should be in 'checking'
    expect(lastOccupancyState).toBe('checking');

    // T=22s: Motion sensor times out (18s later, 20s after initial detection)
    await vi.advanceTimersByTimeAsync(18000);
    await motionSensor.setCapabilityValue('alarm_motion', false);
    await vi.advanceTimersByTimeAsync(0);

    // BUG: System immediately goes to 'empty' when motion times out
    // EXPECTED: Should stay in 'checking' - the motion_timeout event should be ignored
    // in checking state. Only the CheckingSensorRegistry timeout should trigger empty.
    expect(lastOccupancyState).not.toBe('empty');
    expect(lastOccupancyState).toBe('checking');

    // After the full checking timeout (20s from entering checking at T=4s, so T=24s)
    // which is 2 more seconds from now (T=22s), the system should go to empty
    await vi.advanceTimersByTimeAsync(3000); // A bit more than 2s to be safe
    await vi.advanceTimersByTimeAsync(0);
    expect(lastOccupancyState).toBe('empty');
  });

});

/* eslint-disable node/no-unsupported-features/es-syntax */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';

// Use relative imports for mocks to avoid resolution issues in the test file itself
import * as HomeyAPIModuleMock from '../__mocks__/homey-api';
import { Device as MockDevice } from '../__mocks__/homey';
import { MockExternalDevice } from '../__mocks__/mock-external-device';

// Import Class Under Test
import { DeviceSettings, OccupancyState } from '../lib/types';
import { VirtualOccupancySensorDeviceForTest } from './virtual-occupancy-sensor-device-for-test';

// Setup Mocks
vi.mock('homey-api'); // Auto-mock from root __mocks__
vi.mock('homey');

describe('VirtualOccupancySensorDevice - Scenarios', () => {
  let device: VirtualOccupancySensorDeviceForTest;
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

    vi.spyOn(MockDevice.prototype, 'getCapabilityValue').mockImplementation((id: string) => {
      if (id === 'occupancy_state') {
        return lastOccupancyState;
      }
      return null;
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
    device = new VirtualOccupancySensorDeviceForTest();
    // Use spy/mock on the instance itself for settings if needed, or overwrite method
    // Since getSettings was defined in our mock base class, we can overwrite it on the instance
    device.getSettings = () => ({
      motion_timeout: 30,
      auto_learn_timeout: false,
      ignore_motion_when_empty: false,
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
      ...settingsOverride,
    });

    await device.onInit();

    // Wait for async listener registration to complete
    // The sensor registries call addListener asynchronously in their constructors
    await vi.advanceTimersByTimeAsync(0);

    device.forceOccupancyState('empty');

    return device;
  }

  async function forceState(state: OccupancyState) {
    device.forceOccupancyState(state);
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
    // With the fix, since motion is still TRUE (sensor active), system stays occupied
    await vi.advanceTimersByTimeAsync(31000);
    await vi.advanceTimersByTimeAsync(0);

    // After timeout, system stays occupied because motion sensor is still active
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

  /**
   * FIXED BEHAVIOR: Checking timer fires while motion sensor is still active
   *
   * Real-world logs (2026-01-16) showed the bug:
   * - 08:58:25.611Z: Checking starts with timeout 21779 ms
   * - 08:58:47.398Z: Checking sensor timeout fires (21.8s later) → went to empty (BUG!)
   * - 08:58:58.232Z: Motion sensor sends false (10.8s AFTER empty!)
   *
   * The motion sensor was active the ENTIRE time during checking. This means someone
   * was moving in the room during the entire checking period!
   *
   * Fixed behavior:
   * - Checking timer fires
   * - System checks if any motion sensor is still active (hasn't sent false)
   * - If active → go to occupied (someone is there!)
   * - If all inactive → go to empty
   */
  it('BUG SCENARIO C: Real-world logs - Motion still active when checking fires (fixed behavior)', async () => {
    // Configure with 22s motion timeout (close to the 21.779s in real logs)
    // Checking timeout will be ~22s
    await createDevice({ motion_timeout: 22 });

    // Door opens, motion detected, door closes
    await doorSensor.setCapabilityValue('alarm_contact', true);
    expect(lastOccupancyState).toBe('door_open');

    await motionSensor.setCapabilityValue('alarm_motion', true);
    expect(lastOccupancyState).toBe('door_open');

    await doorSensor.setCapabilityValue('alarm_contact', false);
    await vi.advanceTimersByTimeAsync(0);
    expect(lastOccupancyState).toBe('checking');

    // Checking timer fires after 22s
    // Motion sensor is STILL TRUE at this point (hasn't sent false yet)
    await vi.advanceTimersByTimeAsync(23000);
    await vi.advanceTimersByTimeAsync(0);

    // Fixed behavior: Goes to occupied because motion sensor is still active
    expect(lastOccupancyState).toBe('occupied');

    // Motion sensor sends false 10.8s later (as in real logs)
    // This is now ignored because we're already occupied
    await vi.advanceTimersByTimeAsync(10800);
    await motionSensor.setCapabilityValue('alarm_motion', false);
    await vi.advanceTimersByTimeAsync(0);

    // System stays occupied (motion_timeout in occupied state is ignored)
    expect(lastOccupancyState).toBe('occupied');
  });

  /**
   * BUG FIX: Checking should NOT complete if motion sensor is still active
   *
   * Expected behavior:
   * - When checking timer fires, check if any motion sensor is currently active
   * - If motion is active (sensor hasn't sent false), someone is there → occupied
   * - Only go to empty if motion sensors have ALL timed out
   *
   * This test represents what SHOULD happen. It should FAIL with current code.
   */
  it('BUG SCENARIO D: Expected behavior - Should be occupied if motion active when checking timer fires', async () => {
    // Configure with 22s motion timeout
    await createDevice({ motion_timeout: 22 });

    // Door opens, motion detected, door closes
    await doorSensor.setCapabilityValue('alarm_contact', true);
    await motionSensor.setCapabilityValue('alarm_motion', true);
    await doorSensor.setCapabilityValue('alarm_contact', false);
    await vi.advanceTimersByTimeAsync(0);
    expect(lastOccupancyState).toBe('checking');

    // Checking timer fires after 22s
    // But motion sensor is STILL TRUE (hasn't sent false yet)
    await vi.advanceTimersByTimeAsync(23000);
    await vi.advanceTimersByTimeAsync(0);

    // EXPECTED: Should be 'occupied' because motion sensor is still active
    // Someone is clearly still moving in the room!
    expect(lastOccupancyState).toBe('occupied');
  });

  /**
   * BUG SCENARIO E: Corrupted learned timeout from re-triggers causes stuck-in-occupied
   *
   * User's exact scenario:
   * 1. Motion sensor has ~60s native timeout but re-triggers mid-period
   * 2. Without fix: learned timeout = last-retrigger-to-false (~6s), NOT native timeout (~60s)
   * 3. User exits room: occupied → door_open → door_close → checking
   * 4. Checking timer uses corrupted learned timeout (6s)
   * 5. Timer fires while motion still true (native 60s hasn't elapsed)
   * 6. isAnyStateTrue() → true → transitions back to occupied
   * 7. Motion finally goes false ~54s later, but motion_timeout in occupied is ignored
   * 8. STUCK in occupied forever
   *
   * With fix (first-true-to-false learning):
   * - Learned timeout = 60s (native timeout, re-triggers ignored)
   * - Checking timer fires after 60s
   * - By then, motion sensor already went false
   * - isAnyStateTrue() → false → transitions to empty ✓
   */
  it('BUG SCENARIO E: Corrupted learned timeout from re-triggers causes stuck-in-occupied', async () => {
    // Enable auto-learning, use 60s as fallback
    await createDevice({ motion_timeout: 60, auto_learn_timeout: true });

    // === LEARNING CYCLE: Teach the sensor its native timeout ===
    // T=0s: Motion detected (first true)
    await motionSensor.setCapabilityValue('alarm_motion', true);
    expect(lastOccupancyState).toBe('occupied');

    // T=54s: Re-trigger (Zigbee sends another true mid-period)
    // With fix: this does NOT reset lastTrueTimestamp
    // Without fix: this resets lastTrueTimestamp to T=54
    await vi.advanceTimersByTimeAsync(54000);
    await motionSensor.setCapabilityValue('alarm_motion', true);

    // T=60s: Motion sensor native timeout → sends false
    // With fix: learned timeout = 60000ms (T=60 - T=0)
    // Without fix: learned timeout = 6000ms (T=60 - T=54) ← CORRUPTED
    await vi.advanceTimersByTimeAsync(6000);
    await motionSensor.setCapabilityValue('alarm_motion', false);
    await vi.advanceTimersByTimeAsync(0);

    // State is still occupied (motion_timeout in occupied is ignored by controller)
    expect(lastOccupancyState).toBe('occupied');

    // === EXIT SCENARIO: User leaves the room ===
    // Motion detected again (user starts moving to leave)
    await motionSensor.setCapabilityValue('alarm_motion', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(lastOccupancyState).toBe('occupied');

    // T+2s: Door opens
    await vi.advanceTimersByTimeAsync(2000);
    await doorSensor.setCapabilityValue('alarm_contact', true);
    expect(lastOccupancyState).toBe('door_open');

    // T+4s: Motion re-triggers as user walks past sensor toward door
    await vi.advanceTimersByTimeAsync(2000);
    await motionSensor.setCapabilityValue('alarm_motion', true);
    expect(lastOccupancyState).toBe('door_open');

    // T+6s: Door closes behind user → checking
    // Checking timer starts with learned timeout
    // With fix: checking timeout = 60s
    // Without fix: checking timeout = 6s
    await vi.advanceTimersByTimeAsync(2000);
    await doorSensor.setCapabilityValue('alarm_contact', false);
    await vi.advanceTimersByTimeAsync(0);
    expect(lastOccupancyState).toBe('checking');

    // T+12s (6s into checking): With corrupted timeout, checking would fire HERE
    // Motion sensor is still true (native timeout hasn't elapsed)
    // Without fix: isAnyStateTrue() → true → occupied → STUCK
    await vi.advanceTimersByTimeAsync(7000);
    await vi.advanceTimersByTimeAsync(0);

    // With fix: Still in checking (learned timeout is 60s, not 6s)
    expect(lastOccupancyState).toBe('checking');

    // T+60s from motion true: Motion sensor native timeout expires → false
    // This is ~54s after the motion true event during exit
    await vi.advanceTimersByTimeAsync(47000); // Total ~60s from exit motion true
    await motionSensor.setCapabilityValue('alarm_motion', false);
    await vi.advanceTimersByTimeAsync(0);

    // Still in checking (waiting for checking timer to fire)
    expect(lastOccupancyState).toBe('checking');

    // Checking timer fires at 60s after entering checking state
    // Motion already went false → isAnyStateTrue() → false → empty ✓
    await vi.advanceTimersByTimeAsync(7000); // Remaining time until 60s checking timeout
    await vi.advanceTimersByTimeAsync(0);

    expect(lastOccupancyState).toBe('empty');
  });

  describe('Flow Action: Set State Directly', () => {
    it('should start checking timer when setting state to checking via flow', async () => {
      await createDevice({});

      // Set directly to checking (bypasses normal door open -> close flow)
      device.setStateFromFlow('checking');
      await vi.advanceTimersByTimeAsync(0);

      expect(lastOccupancyState).toBe('checking');

      // Wait for timeout - should transition to empty
      await vi.advanceTimersByTimeAsync(31000);
      await vi.advanceTimersByTimeAsync(0);

      expect(lastOccupancyState).toBe('empty');
    });

    it('should cancel checking timer when setting to different state', async () => {
      await createDevice({});

      device.setStateFromFlow('checking');
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('checking');

      // Before timeout expires, set to occupied
      await vi.advanceTimersByTimeAsync(15000);
      device.setStateFromFlow('occupied');
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('occupied');

      // Wait past original timeout - should stay occupied (timer was cancelled)
      await vi.advanceTimersByTimeAsync(20000);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('occupied');
    });

    it('should be no-op when setting same state', async () => {
      await createDevice({});
      await forceState('occupied');

      const previousState = lastOccupancyState;
      device.setStateFromFlow('occupied');
      await vi.advanceTimersByTimeAsync(0);

      // State should remain the same (no duplicate callback)
      expect(lastOccupancyState).toBe(previousState);
    });

    it('should allow setting empty directly (skip checking)', async () => {
      await createDevice({});
      await forceState('occupied');

      // Normally would need: door_open -> door_close -> timeout
      // But flow action can set empty directly
      device.setStateFromFlow('empty');
      await vi.advanceTimersByTimeAsync(0);

      expect(lastOccupancyState).toBe('empty');
    });
  });

  describe('Ignore Motion When Empty', () => {
    it('should ignore motion_detected when setting enabled and state is empty', async () => {
      await createDevice({ ignore_motion_when_empty: true });
      expect(lastOccupancyState).toBe('empty');

      await motionSensor.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(0);

      expect(lastOccupancyState).toBe('empty');
    });

    it('should allow motion_detected when setting disabled and state is empty', async () => {
      await createDevice({ ignore_motion_when_empty: false });
      expect(lastOccupancyState).toBe('empty');

      await motionSensor.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(0);

      expect(lastOccupancyState).toBe('occupied');
    });

    it('should allow motion_detected when setting enabled but state is checking', async () => {
      await createDevice({ ignore_motion_when_empty: true });
      await forceState('checking');

      await motionSensor.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(0);

      expect(lastOccupancyState).toBe('occupied');
    });

    it('should not suppress motion_timeout events when setting is enabled and state is empty', async () => {
      await createDevice({ ignore_motion_when_empty: true });
      expect(lastOccupancyState).toBe('empty');

      await motionSensor.setCapabilityValue('alarm_motion', false);
      await vi.advanceTimersByTimeAsync(0);

      expect(lastOccupancyState).toBe('empty');
    });

    it('should transition to occupied when motion_detected triggered from flow despite setting', async () => {
      await createDevice({ ignore_motion_when_empty: true });
      expect(lastOccupancyState).toBe('empty');

      device.triggerEventFromFlow('motion_detected');
      await vi.advanceTimersByTimeAsync(0);

      expect(lastOccupancyState).toBe('occupied');
    });

    it('should respect setting change mid-scenario', async () => {
      await createDevice({ ignore_motion_when_empty: true });
      expect(lastOccupancyState).toBe('empty');

      // Motion while guard is enabled → stays empty
      await motionSensor.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('empty');

      // Reset motion
      await motionSensor.setCapabilityValue('alarm_motion', false);
      await vi.advanceTimersByTimeAsync(0);

      // Disable the guard mid-scenario
      device.getSettings = () => ({
        motion_timeout: 30,
        auto_learn_timeout: false,
        ignore_motion_when_empty: false,
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

      // Motion with guard disabled → transitions to occupied
      await motionSensor.setCapabilityValue('alarm_motion', true);
      await vi.advanceTimersByTimeAsync(0);
      expect(lastOccupancyState).toBe('occupied');
    });

    it('should call setSettings when setIgnoreMotionWhenEmpty is called', async () => {
      await createDevice({});

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setSettingsSpy = vi.spyOn(device, 'setSettings' as any)
        .mockResolvedValue(undefined);

      device.setIgnoreMotionWhenEmpty(true);

      expect(setSettingsSpy).toHaveBeenCalledWith({ ignore_motion_when_empty: true });

      device.setIgnoreMotionWhenEmpty(false);

      expect(setSettingsSpy).toHaveBeenCalledWith({ ignore_motion_when_empty: false });
    });
  });

});

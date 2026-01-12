/* eslint-disable max-classes-per-file */
import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';
import { VirtualOccupancySensorDevice } from '../drivers/virtual-occupancy-sensor/device';

// --- Mock Setup ---
const mocks = vi.hoisted(() => {
  return {
    log: vi.fn(),
    error: vi.fn(),
    setCapabilityValue: vi.fn(),
    getCapabilityValue: vi.fn(),
    setTimeout: vi.fn().mockImplementation((fn, ms) => setTimeout(fn, ms)),
    clearTimeout: vi.fn().mockImplementation((id) => clearTimeout(id)),
    flow: {
      getDeviceTriggerCard: vi.fn().mockReturnValue({ trigger: vi.fn().mockResolvedValue(true) }),
      getActionCard: vi.fn().mockReturnValue({ registerRunListener: vi.fn() }),
    },
    monitorIsAnyMotionActive: vi.fn().mockResolvedValue(false),
    monitorUpdateConfig: vi.fn().mockResolvedValue(undefined),
    monitorDestroy: vi.fn(),
  };
});

vi.mock('homey-api', () => {
  class MockHomeyAPI {
    devices = {
      getDevices: vi.fn().mockResolvedValue({}),
    };
    static createLocalAPI() {
      return new MockHomeyAPI();
    }
  }
  return {
    HomeyAPIV3Local: MockHomeyAPI
  }
});

vi.mock('homey', async () => {
  class MockDevice {
    log = mocks.log;
    error = mocks.error;
    setCapabilityValue = mocks.setCapabilityValue;
    getCapabilityValue = mocks.getCapabilityValue;
    hasCapability = vi.fn().mockReturnValue(true);
    addCapability = vi.fn().mockResolvedValue(undefined);
    getData = vi.fn().mockReturnValue({ id: 'mock-device-id' });
    homey = {
      setTimeout: mocks.setTimeout,
      clearTimeout: mocks.clearTimeout,
      flow: mocks.flow,
      api: {
        getLocalUrl: vi.fn().mockResolvedValue('http://mock-homey'),
        getOwnerApiToken: vi.fn().mockResolvedValue('mock-token'),
      },
    };

    onInit() {}
    onDeleted() {}

    getSetting(key: string) {
      return null;
    }

    getSettings() {
      return {
        motion_timeout: 30,
        active_on_door_open: false,
        active_on_checking: false,
      };
    }
  }

  return {
    default: {
      Device: MockDevice,
      FlowCardDeviceTrigger: class {},
    },
    Device: MockDevice,
  };
});

vi.mock('../drivers/virtual-occupancy-sensor/sensor-monitor', () => {
  return {
    // eslint-disable-next-line prefer-arrow-callback
    default: vi.fn().mockImplementation(function mockSensorMonitor() {
      return {
        on: vi.fn(),
        destroy: mocks.monitorDestroy,
        updateConfig: mocks.monitorUpdateConfig,
        isAnyMotionActive: mocks.monitorIsAnyMotionActive,
      };
    }),
  };
});

describe('Leaves Room Scenario', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let device: any;
  let capabilityState: Record<string, unknown> = {};

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    capabilityState = { occupancy_state: 'empty', alarm_motion: false };

    mocks.getCapabilityValue.mockImplementation((key) => capabilityState[key]);
    mocks.setCapabilityValue.mockImplementation(async (key, value) => {
      capabilityState[key] = value;
      return Promise.resolve();
    });

    // @ts-expect-error - device instantiation
    device = new VirtualOccupancySensorDevice();
    await device.onInit();
  });

  it('should transition to checking (not occupied) when leaving the room', async () => {
    // 1. Initial State
    capabilityState['occupancy_state'] = 'empty';

    // 2. Door opens
    // [log] ... Door sensor ... changed to: open
    // [log] ... Occupancy state changing from empty to door_open
    await device.handleDoorOpened();
    expect(capabilityState['occupancy_state']).toBe('door_open');

    // 3. Motion detected (User walking out)
    // [log] ... [EVENT] Vallhorn Motion Sensor ... -> true
    await device.handleMotionDetected('sensor1');

    // 4. Advance time slightly (e.g. 2 seconds) to simulate walking out
    vi.advanceTimersByTime(2000);

    // 5. Door closes
    // [log] ... Door sensor ... changed to: closed
    await device.handleDoorClosed();

    // EXPECTATION:
    // The user left the room. The system should NOT assume it is occupied yet.
    // It should go to 'checking' to verify if anyone is still inside.

    // CURRENT BUG LOGS:
    // "Recent motion detected during door open - assuming occupied"
    // "Occupancy state changing from door_open to occupied"

    // DESIRED BEHAVIOR:
    expect(capabilityState['occupancy_state']).toBe('checking');
  });
});

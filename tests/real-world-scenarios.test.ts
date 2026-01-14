/* eslint-disable max-classes-per-file */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';

// Import Device (CJS export)
// @ts-expect-error - Device import handles the Homey 'module.exports' pattern which TS doesn't like for default checking
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
    // Monitor mock methods
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
    HomeyAPIV3Local: MockHomeyAPI,
  };
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
      app: {
        updateDeviceConfig: vi.fn(),
      },
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

    getDriver() {
      return { getDevice: vi.fn() };
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

vi.mock('../lib/sensors/motion-sensor-registry', () => {
  return {
    MotionSensorRegistry: class MockMotionSensorRegistry {
      destroy = vi.fn();
      updateDeviceIds = vi.fn();
      isAnySensorActive = mocks.monitorIsAnyMotionActive;
    },
  };
});

vi.mock('../lib/sensors/contact-sensor-registry', () => {
  return {
    ContactSensorRegistry: class MockContactSensorRegistry {
      destroy = vi.fn();
      updateDeviceIds = vi.fn();
      isAnySensorActive = vi.fn().mockResolvedValue(false);
    },
  };
});

// eslint-disable-next-line max-classes-per-file
describe('Virtual Occupancy Sensor - Real World Scenarios', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let device: any;
  let capabilityState: Record<string, unknown> = {};

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    capabilityState = {
      occupancy_state: 'empty',
      alarm_motion: false,
    };

    // State persistence
    mocks.getCapabilityValue.mockImplementation((key) => capabilityState[key]);
    mocks.setCapabilityValue.mockImplementation(async (key, value) => {
      capabilityState[key] = value;
      return Promise.resolve();
    });

    device = new VirtualOccupancySensorDevice();

    // Config Mock
    device.getSetting = vi.fn((key) => {
      if (key === 'motion_timeout') return 30;
      if (key === 'door_sensors') return ['door_sensor_1'];
      if (key === 'motion_sensors') return ['motion_sensor_1'];
      return null;
    });

    await device.onInit();
    // Ensure start state
    capabilityState['occupancy_state'] = 'empty';
    capabilityState['alarm_motion'] = false;
    // Reset monitor mock
    mocks.monitorIsAnyMotionActive.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function getLastOccupancyState() {
    const { calls } = mocks.setCapabilityValue.mock;
    const stateCalls = calls.filter((args) => args[0] === 'occupancy_state');
    if (stateCalls.length === 0) return capabilityState['occupancy_state']; // return current if changed internally?
    // Actually returning the last *call* is safer to verify flow.
    // But since we use state store, we can also check capabilityState directly.
    // However, let's stick to calls to verify the *action* happened.
    return stateCalls[stateCalls.length - 1][1];
  }

  it('Scenario 1: Standard Entry (Door Open -> Door Close -> Motion)', async () => {
    await device.handleDoorOpened();
    expect(getLastOccupancyState()).toBe('door_open');

    await device.handleDoorClosed();
    expect(getLastOccupancyState()).toBe('checking');

    await vi.advanceTimersByTimeAsync(100);

    await device.handleMotionDetected('motion_sensor_1');
    expect(getLastOccupancyState()).toBe('occupied');
  });

  it('Scenario 2: Quick Exit (Occupied -> Door Open -> Door Close -> No Motion)', async () => {
    await device.setOccupancyState('occupied');
    mocks.setCapabilityValue.mockClear();

    await device.handleDoorOpened();
    expect(getLastOccupancyState()).toBe('door_open');

    await device.handleDoorClosed();
    expect(getLastOccupancyState()).toBe('checking');

    await vi.advanceTimersByTimeAsync(31000);
    expect(getLastOccupancyState()).toBe('empty');
  });

  it('Scenario 3: Hesitant Visitor (Door Open -> Door Close -> Wait 15s -> Motion)', async () => {
    await device.handleDoorOpened();
    await device.handleDoorClosed();
    expect(getLastOccupancyState()).toBe('checking');

    await vi.advanceTimersByTimeAsync(15000);
    await device.handleMotionDetected('motion_sensor_1');
    expect(getLastOccupancyState()).toBe('occupied');
  });

  it('Scenario 4: Continuous Motion (Occupied -> Door Cycle -> Timeout -> Monitor checks real sensors)', async () => {
    mocks.monitorIsAnyMotionActive.mockResolvedValue(true);
    await device.setOccupancyState('occupied');
    mocks.setCapabilityValue.mockClear();

    await device.handleDoorOpened();
    await device.handleDoorClosed(); // Checking

    await vi.advanceTimersByTimeAsync(31000);

    // Should stay/become occupied
    expect(getLastOccupancyState()).toBe('occupied');
  });

  it('Scenario 5: Empty Motion (Motion in empty room -> Occupied)', async () => {
    await device.handleMotionDetected('motion_sensor_1');
    expect(getLastOccupancyState()).toBe('occupied');
  });

  it('Scenario 6: False Entry (Door Open -> Door Close -> No Motion)', async () => {
    capabilityState['occupancy_state'] = 'empty';

    await device.handleDoorOpened();
    await device.handleDoorClosed();

    await vi.advanceTimersByTimeAsync(31000);
    expect(getLastOccupancyState()).toBe('empty');
  });
});

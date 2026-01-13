/* eslint-disable max-classes-per-file */
import {
  describe, it, expect, beforeEach, vi,
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
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
    flow: {
      getDeviceTriggerCard: vi.fn().mockReturnValue({ trigger: vi.fn().mockResolvedValue(true) }),
      getActionCard: vi.fn().mockReturnValue({ registerRunListener: vi.fn() }),
    },
    // Monitor mock methods
    monitorIsAnyMotionActive: vi.fn().mockResolvedValue(false),
    monitorUpdateConfig: vi.fn().mockResolvedValue(undefined),
    monitorDestroy: vi.fn(),
    getSettings: vi.fn(),
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
    // Mock capability management
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
    onSettings(args) {} // Will be overwritten by class method, but good to have stub
    getSetting(key: string) {
      return null;
    }

    getSettings = mocks.getSettings;

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

// eslint-disable-next-line max-classes-per-file
describe('Virtual Occupancy Sensor - Settings', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let device: any;
  let capabilityState: Record<string, unknown> = {};
  let settings: Record<string, unknown> = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    capabilityState = {
      occupancy_state: 'empty',
      alarm_motion: false,
    };
    settings = {
      motion_timeout: 30,
      door_sensors: 'door_1',
      motion_sensors: '',
      active_on_door_open: true, // Default
      active_on_checking: false, // Default
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
      return settings[key] ?? null;
    });
    mocks.getSettings.mockImplementation(() => settings);

    await device.onInit();
  });

  function getLastMotionState() {
    const { calls } = mocks.setCapabilityValue.mock;
    const stateCalls = calls.filter((args) => args[0] === 'alarm_motion');
    if (stateCalls.length === 0) return capabilityState['alarm_motion'];
    return stateCalls[stateCalls.length - 1][1];
  }

  it('should respect active_on_checking setting = true', async () => {
    // Enable setting
    settings['active_on_checking'] = true;

    // Simulate Door Close -> Checking
    // Door Open first
    await device.handleDoorOpened();

    // Door Close -> Checking
    mocks.setCapabilityValue.mockClear();
    await device.handleDoorClosed();

    expect(mocks.setCapabilityValue).toHaveBeenCalledWith('occupancy_state', 'checking');

    // With setting=true, alarm_motion should be true
    expect(getLastMotionState()).toBe(true);
  });

  it('should respect active_on_checking setting = false', async () => {
    // Disable setting (default)
    settings['active_on_checking'] = false;

    await device.handleDoorOpened();

    mocks.setCapabilityValue.mockClear();
    await device.handleDoorClosed(); // Checking

    expect(mocks.setCapabilityValue).toHaveBeenCalledWith('occupancy_state', 'checking');

    // With setting=false, alarm_motion should be false during checking
    expect(getLastMotionState()).toBe(false);
  });

  it('should update alarm_motion dynamically when settings change', async () => {
    // Start in Checking, with setting=false (default) -> Motion=false
    // Force state
    await device.setOccupancyState('checking');
    expect(getLastMotionState()).toBe(false);

    // Now user changes setting to TRUE
    settings['active_on_checking'] = true; // Update internal store

    // Call onSettings
    await device.onSettings({ changedKeys: ['active_on_checking'] });

    // Should have updated motion to True
    expect(getLastMotionState()).toBe(true);
  });
});

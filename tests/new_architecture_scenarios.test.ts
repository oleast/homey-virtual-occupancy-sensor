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

    // Force initial state if controller exists
    // @ts-expect-error - private access
    if (device.controller) await device.controller.setOccupancyState('empty');

    return device;
  }

  async function forceState(state: OccupancyState) {
    // @ts-expect-error - private access
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
    expect(lastOccupancyState).toBe('checking');
    await vi.advanceTimersByTimeAsync(31000); // 30s + buffer
    expect(lastOccupancyState).toBe('empty');
  });

  it('Scenario 3: Hesitant Visitor (Door Open -> Door Close -> Wait 15s -> Motion)', async () => {
    await createDevice({});
    await doorSensor.setCapabilityValue('alarm_contact', true);
    await doorSensor.setCapabilityValue('alarm_contact', false);
    expect(lastOccupancyState).toBe('checking');
    await vi.advanceTimersByTimeAsync(15000);
    expect(lastOccupancyState).toBe('checking');
    await motionSensor.setCapabilityValue('alarm_motion', true);
    expect(lastOccupancyState).toBe('occupied');
  });

  it('Scenario 4: Continuous Motion (Occupied -> Door Cycle -> Timeout -> Checks Sensors)', async () => {
    await createDevice({});
    await forceState('occupied');
    // Motion sensor is explicitly TRUE (someone is waving)
    await motionSensor.setCapabilityValue('alarm_motion', true);

    await doorSensor.setCapabilityValue('alarm_contact', true);
    expect(lastOccupancyState).toBe('door_open');

    // Door closes, enters checking
    await doorSensor.setCapabilityValue('alarm_contact', false);
    expect(lastOccupancyState).toBe('checking');

    // Timeout expires. Controller should check sensors. Motion is true.
    await vi.advanceTimersByTimeAsync(31000);
    expect(lastOccupancyState).toBe('occupied');
  });

  it('Scenario 5: Empty Motion (Motion in empty room -> Occupied)', async () => {
    await createDevice({});
    expect(lastOccupancyState).toBe('empty');
    await motionSensor.setCapabilityValue('alarm_motion', true);
    expect(lastOccupancyState).toBe('occupied');
  });

  it('Scenario 6: False Entry (Door Open -> Door Close -> No Motion)', async () => {
    await createDevice({});
    await forceState('empty');
    await doorSensor.setCapabilityValue('alarm_contact', true);
    await doorSensor.setCapabilityValue('alarm_contact', false);
    expect(lastOccupancyState).toBe('checking');
    await vi.advanceTimersByTimeAsync(31000);
    expect(lastOccupancyState).toBe('empty');
  });

});

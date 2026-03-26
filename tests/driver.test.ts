import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';

vi.mock('homey');

// eslint-disable-next-line import/first
import VirtualOccupancySensorDriver from '../drivers/virtual-occupancy-sensor/driver';

describe('VirtualOccupancySensorDriver', () => {
  let driver: InstanceType<typeof VirtualOccupancySensorDriver>;
  let triggerSpies: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    driver = new VirtualOccupancySensorDriver() as InstanceType<typeof VirtualOccupancySensorDriver>;
    triggerSpies = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const driverAny = driver as any;
    driverAny.homey.flow.getDeviceTriggerCard = (cardId: string) => {
      triggerSpies[cardId] = vi.fn().mockResolvedValue(true);
      return {
        trigger: triggerSpies[cardId],
        registerRunListener: vi.fn(),
      };
    };
    driverAny.homey.flow.getConditionCard = () => ({ registerRunListener: vi.fn() });
    driverAny.homey.flow.getActionCard = () => ({ registerRunListener: vi.fn() });

    await driver.onInit();
  });

  describe('contextToTokens null-to-0 fix', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeDevice = {} as any;

    it('converts null timeoutSeconds to 0', async () => {
      driver.triggerBecameOccupied(fakeDevice, {
        deviceId: 'flow_action',
        deviceName: 'Flow Action',
        timeoutSeconds: null,
      });

      expect(triggerSpies['became_occupied']).toHaveBeenCalledWith(
        expect.anything(),
        {
          triggering_device_id: 'flow_action',
          triggering_device_name: 'Flow Action',
          timeout_seconds: 0,
        },
      );
    });

    it('passes through numeric timeoutSeconds', async () => {
      driver.triggerBecameOccupied(fakeDevice, {
        deviceId: 'sensor-1',
        deviceName: 'Motion Sensor',
        timeoutSeconds: 30,
      });

      expect(triggerSpies['became_occupied']).toHaveBeenCalledWith(
        expect.anything(),
        {
          triggering_device_id: 'sensor-1',
          triggering_device_name: 'Motion Sensor',
          timeout_seconds: 30,
        },
      );
    });

    it('passes through zero timeoutSeconds', async () => {
      driver.triggerBecameOccupied(fakeDevice, {
        deviceId: 'sensor-2',
        deviceName: 'Door Sensor',
        timeoutSeconds: 0,
      });

      expect(triggerSpies['became_occupied']).toHaveBeenCalledWith(
        expect.anything(),
        {
          triggering_device_id: 'sensor-2',
          triggering_device_name: 'Door Sensor',
          timeout_seconds: 0,
        },
      );
    });
  });
});

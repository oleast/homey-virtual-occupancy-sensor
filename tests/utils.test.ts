import {
  describe, it, expect, vi,
} from 'vitest';
import { findVirtualDevice, findSensorsInZone, isAnyCapabilityActive } from '../lib/utils';
import { HomeyDevice, ManagerDevicesWithConnect } from '../lib/types';

// Helper to create a mock device
const createMockDevice = (
  id: string,
  zone: string,
  capabilities: Record<string, boolean> = {},
  dataId?: string,
): HomeyDevice => ({
  id,
  name: `Device ${id}`,
  zone,
  capabilitiesObj: Object.entries(capabilities).reduce((acc, [key, val]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (acc as any)[key] = { value: val };
    return acc;
  }, {} as Record<string, { value: boolean }>),
  data: dataId ? { id: dataId } : undefined,
} as unknown as HomeyDevice);

describe('utils', () => {
  describe('findVirtualDevice', () => {
    it('should find device by data.id', () => {
      const devices = {
        'uuid-1': createMockDevice('uuid-1', 'zone-1', {}, 'internal-id-1'),
        'uuid-2': createMockDevice('uuid-2', 'zone-1', {}, 'internal-id-2'),
      };

      const result = findVirtualDevice(devices, 'internal-id-2');
      expect(result).not.toBeNull();
      expect(result?.uuid).toBe('uuid-2');
    });

    it('should return null if not found', () => {
      const devices = {
        'uuid-1': createMockDevice('uuid-1', 'zone-1'),
      };
      const result = findVirtualDevice(devices, 'non-existent');
      expect(result).toBeNull();
    });
  });

  describe('findSensorsInZone', () => {
    it('should find sensors in the same zone', () => {
      const devices = {
        'door-1': createMockDevice('door-1', 'target-zone', { alarm_contact: false }),
        'motion-1': createMockDevice('motion-1', 'target-zone', { alarm_motion: false }),
        'other-1': createMockDevice('other-1', 'other-zone', { alarm_contact: false }),
        'light-1': createMockDevice('light-1', 'target-zone', { onoff: true }), // Not a sensor
      };

      const { doorSensorIds, motionSensorIds } = findSensorsInZone(devices, 'target-zone', 'ignore-me');

      expect(doorSensorIds).toContain('door-1');
      expect(motionSensorIds).toContain('motion-1');
      expect(doorSensorIds).not.toContain('other-1');
      expect(doorSensorIds).not.toContain('light-1'); // Has no alarm_contact
    });

    it('should ignore the virtual device itself', () => {
      const devices = {
        'self-uuid': createMockDevice('self-uuid', 'target-zone', { alarm_contact: true }), // e.g. if it had this capability
      };

      const { doorSensorIds } = findSensorsInZone(devices, 'target-zone', 'self-uuid');
      expect(doorSensorIds).toHaveLength(0);
    });
  });

  describe('isAnyCapabilityActive', () => {
    it('should return true if any device has capability active', async () => {
      const mockDevices = {
        d1: createMockDevice('d1', 'z1', { alarm_contact: true }),
        d2: createMockDevice('d2', 'z1', { alarm_contact: false }),
      };

      const mockApi = {
        getDevices: vi.fn().mockResolvedValue(mockDevices),
      } as unknown as ManagerDevicesWithConnect;

      const result = await isAnyCapabilityActive(mockApi, ['d1', 'd2'], 'alarm_contact');
      expect(result).toBe(true);
    });

    it('should return false if no device has capability active', async () => {
      const mockDevices = {
        d1: createMockDevice('d1', 'z1', { alarm_contact: false }),
        d2: createMockDevice('d2', 'z1', { alarm_contact: false }),
      };

      const mockApi = {
        getDevices: vi.fn().mockResolvedValue(mockDevices),
      } as unknown as ManagerDevicesWithConnect;

      const result = await isAnyCapabilityActive(mockApi, ['d1', 'd2'], 'alarm_contact');
      expect(result).toBe(false);
    });
  });
});

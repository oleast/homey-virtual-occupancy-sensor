import {
  describe, it, expect, beforeEach,
} from 'vitest';
import SensorRegistry from '../lib/sensor-registry';

describe('SensorRegistry', () => {
  let registry: SensorRegistry;

  beforeEach(() => {
    registry = new SensorRegistry();
  });

  it('should start with empty state', () => {
    expect(registry.getVirtualSensorUuid()).toBeNull();
    expect(registry.getCurrentZoneId()).toBeNull();
    expect(registry.getAllDoorSensorIds()).toEqual([]);
    expect(registry.getAllMotionSensorIds()).toEqual([]);
  });

  it('should set manual config', () => {
    const doors = ['d1', 'd2'];
    const motions = ['m1'];
    registry.setManualConfig(doors, motions);

    // Should not be active yet until useManualConfig is called or fallback logic
    // But the class stores them locally.
    // Let's verify if we use them
    registry.useManualConfig();

    expect(registry.getAllDoorSensorIds()).toHaveLength(2);
    expect(registry.getAllMotionSensorIds()).toHaveLength(1);
    expect(registry.isDoorSensor('d1')).toBe(true);
    expect(registry.isMotionSensor('m1')).toBe(true);
  });

  it('should set auto detect sensors', () => {
    const doors = ['d1'];
    const motions = ['m1', 'm2'];
    registry.setAutoDetectSensors(doors, motions);

    expect(registry.getAllDoorSensorIds()).toEqual(['d1']);
    expect(registry.getAllMotionSensorIds()).toHaveLength(2);
    // Set order is not guaranteed, but length and content are
    expect(registry.isMotionSensor('m1')).toBe(true);
    expect(registry.isMotionSensor('m2')).toBe(true);
  });

  it('should track zone changes', () => {
    registry.setZone('zone-1');
    registry.setVirtualSensorUuid('uuid-1');

    expect(registry.shouldRescan('uuid-1', 'zone-2')).toBe(true); // Changed zone
    expect(registry.shouldRescan('uuid-1', 'zone-1')).toBe(false); // Same zone
    expect(registry.shouldRescan('other-uuid', 'zone-2')).toBe(false); // Not self
  });
});

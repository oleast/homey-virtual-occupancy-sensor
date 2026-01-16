/* eslint-disable import/prefer-default-export */
import { HomeyInstance } from 'homey-api';
import { DeviceEvent, SensorRegistry } from './sensor-registry';

/**
 * A sensor registry specialized for boolean capabilities.
 * Provides helper methods for checking the state of boolean sensors.
 */
export class BooleanSensorRegistry extends SensorRegistry<boolean> {
  constructor(
    homey: HomeyInstance,
    deviceIds: string[],
    capabilityId: string,
    onDeviceEvent: DeviceEvent,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
  ) {
    super(homey, deviceIds, capabilityId, 'boolean', onDeviceEvent, log, error);
  }

  /**
   * Returns true if any registered sensor has a true state.
   */
  public isAnyStateTrue(): boolean {
    return this.getCapabilityStates().some((value) => value === true);
  }

  /**
   * Returns true if all registered sensors have a true state.
   */
  public isAllStateTrue(): boolean {
    return this.getCapabilityStates().every((value) => value === true);
  }

  /**
   * Returns true if any registered sensor has a false state.
   */
  public isAnyStateFalse(): boolean {
    return this.getCapabilityStates().some((value) => value === false);
  }

  /**
   * Returns true if all registered sensors have a false state.
   */
  public isAllStateFalse(): boolean {
    return this.getCapabilityStates().every((value) => value === false);
  }
}

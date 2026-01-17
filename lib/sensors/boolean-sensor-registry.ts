/* eslint-disable import/prefer-default-export */
import { HomeyInstance } from 'homey-api';
import { DeviceEvent, SensorRegistry } from './sensor-registry';

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

  public isAnyStateTrue(): boolean {
    return this.getCapabilityStates().some((value) => value === true);
  }

  public isAllStateTrue(): boolean {
    return this.getCapabilityStates().every((value) => value === true);
  }

  public isAnyStateFalse(): boolean {
    return this.getCapabilityStates().some((value) => value === false);
  }

  public isAllStateFalse(): boolean {
    return this.getCapabilityStates().every((value) => value === false);
  }
}

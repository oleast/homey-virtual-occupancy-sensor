import { HomeyInstance } from "homey-api";
import { DeviceEvent, SensorRegistry2 } from "./sensor-registry-2";

export class MotionSensorRegistry extends SensorRegistry2 {
    constructor(
    homey: HomeyInstance,
    deviceIds: string[],
    handleDeviceEvent: DeviceEvent,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
  ) {
    super(homey, deviceIds, 'alarm_motion', handleDeviceEvent, log, error);
  };
};

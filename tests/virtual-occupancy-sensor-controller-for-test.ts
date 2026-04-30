/* eslint-disable import/prefer-default-export */
import { VirtualOccupancySensorController } from '../drivers/virtual-occupancy-sensor/controller';
import { OccupancyState, TriggerContext } from '../lib/types';

export class VirtualOccupancySensorControllerForTest extends VirtualOccupancySensorController {
  constructor(
    onStateChange: (state: OccupancyState, context: TriggerContext) => void,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
    initialState: OccupancyState = 'empty',
  ) {
    super(onStateChange, log, error, initialState);
  }

  public setOccupancyState(state: OccupancyState, deviceId: string = 'test') {
    const context: TriggerContext = {
      deviceId,
      deviceName: `Test Device ${deviceId}`,
      timeoutSeconds: null,
    };
    this.transitionTo(state, context);
  }
}

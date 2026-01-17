/* eslint-disable import/prefer-default-export */
import { VirtualOccupancySensorController } from '../drivers/virtual-occupancy-sensor/controller';
import { OccupancyState } from '../lib/types';

export class VirtualOccupancySensorControllerForTest extends VirtualOccupancySensorController {
  public setOccupancyState(state: OccupancyState) {
    this.transitionTo(state);
  }
}

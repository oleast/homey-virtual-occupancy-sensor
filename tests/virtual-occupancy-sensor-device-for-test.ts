/* eslint-disable import/prefer-default-export */
import { VirtualOccupancySensorDevice } from '../drivers/virtual-occupancy-sensor/device';
import { OccupancyState } from '../lib/types';
import { VirtualOccupancySensorControllerForTest } from './virtual-occupancy-sensor-controller-for-test';

export class VirtualOccupancySensorDeviceForTest extends VirtualOccupancySensorDevice {
  protected controller: VirtualOccupancySensorControllerForTest;
  constructor() {
    super();
    this.controller = new VirtualOccupancySensorControllerForTest(
      (state: OccupancyState) => {
        this.onStateChange(state).catch(this.error);
      },
      this.log.bind(this),
      this.error.bind(this),
    );
  }

  public forceOccupancyState(state: OccupancyState) {
    this.controller.setOccupancyState(state);
  }
}

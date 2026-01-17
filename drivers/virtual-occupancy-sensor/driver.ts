'use strict';

import Homey from 'homey';

module.exports = class VirtualOccupancySensorDriver extends Homey.Driver {
  async onInit() {
    this.log('VirtualOccupancySensorDriver has been initialized');

    this.registerFlowCards();
  }

  registerFlowCards() {
    this.registerFlowCardIsOccupied();
    this.registerFlowCardOccupancyStateIs();
  }

  registerFlowCardIsOccupied() {
    const isOccupiedCondition = this.homey.flow.getConditionCard('is_occupied');
    isOccupiedCondition.registerRunListener(async (args, state) => {
      const { device } = args;
      const occupancyState = device.getCapabilityValue('occupancy_state');
      return occupancyState === 'occupied';
    });
  }

  registerFlowCardOccupancyStateIs() {
    const occupancyStateIsCondition = this.homey.flow.getConditionCard('occupancy_state_is');
    occupancyStateIsCondition.registerRunListener(async (args, state) => {
      const { device } = args;
      const currentState = device.getCapabilityValue('occupancy_state');
      return currentState === args.state;
    });
  }

  /**
   * Lists available devices for pairing.
   * Since this this a virtual device, we'll just return "generated" device instead of actually searching for new devices.
   */
  async onPairListDevices() {
    return [
      {
        name: 'Virtual Occupancy Sensor',
        data: {
          id: `virtual-occupancy-${Date.now()}`,
        },
      },
    ];
  }
};

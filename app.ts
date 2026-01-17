'use strict';

import Homey from 'homey';

module.exports = class VirtualOccupancySensorApp extends Homey.App {

  async onInit() {
    this.log('Virtual Room Occupancy App has been initialized');
  }

};

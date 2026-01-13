/* eslint-disable max-classes-per-file */
// tests/__mocks__/homey-api.ts
export const devicesMap = new Map<string, unknown>();

class MockManagerDevices {
  async getDevice({ id }: { id: string }) {
    const dev = devicesMap.get(id);
    if (!dev) {
      return null;
    }
    return dev;
  }

  async getDevices() {
    const obj: Record<string, unknown> = {};
    devicesMap.forEach((v, k) => {
      obj[k] = v;
    });
    return obj;
  }
}

export class HomeyAPIV3Local {
  devices = new MockManagerDevices();

  static createLocalAPI() {
    return new HomeyAPIV3Local();
  }
}

// Helper methods to manipulate state from tests
export const __setMockDevices = (map: Map<string, unknown>) => {
  devicesMap.clear();
  map.forEach((v, k) => devicesMap.set(k, v));
};

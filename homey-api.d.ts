// Homey does not expose all the correct types.
// These are stoled from https://github.com/OlivierZal/com.melcloud.extension/blob/main/homey-api-override.d.ts
// Relevant issues: https://github.com/athombv/homey-web-api-issues/issues/69, https://github.com/athombv/homey-apps-sdk-issues/issues/416
import 'homey-api';

declare module 'homey-api' {
  export type HomeyInstance = Homey.Device['homey'];

  export interface HomeyAPIV3Local {
    devices: HomeyAPIV3Local.ManagerDevices;
  }

  export interface CapabilityInstance {
    destroy(): void;
  }

  export type ManagerDevicesWithConnect = HomeyAPIV3Local.ManagerDevices & {
    connect(): Promise<void>;
  };

  export namespace HomeyAPIV3Local {
    export interface ManagerDevices {
      getDevice(params: { id: string }): Promise<ManagerDevices.Device>;
      getDevices(): Promise<Record<string, ManagerDevices.Device>>;
    }

    export namespace ManagerDevices {
      export type DeviceCapability = unknown;

      export interface CapabilityObj {
        id: string,
        type: 'boolean' | 'string' | 'number',
        iconObj: null,
        title: string,
        getable: boolean,
        setable: boolean,
        insights: boolean,
        insightsTitleTrue: string,
        insightsTitleFalse: string,
        value: boolean | string | number,
        lastUpdated: string
      }

      export interface Device {
        id: string;
        name: string;
        capabilities: string[];
        data: {
          id: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [key: string]: any
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        capabilitiesObj?: Record<string, CapabilityObj>;
      }
    }
  }
}

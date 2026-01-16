// Homey does not expose all the correct types.
// These are stoled from https://github.com/OlivierZal/com.melcloud.extension/blob/main/homey-api-override.d.ts
// Relevant issues: https://github.com/athombv/homey-web-api-issues/issues/69, https://github.com/athombv/homey-apps-sdk-issues/issues/416
// Documentation: https://athombv.github.io/node-homey-api/
import 'homey-api';

declare module 'homey-api' {
  export type HomeyInstance = Homey.Device['homey'];

  // Capability value types
  export type CapabilityValue = boolean | number | string | null;

  export interface HomeyAPIV3Local {
    devices: HomeyAPIV3Local.ManagerDevices;
    zones: HomeyAPIV3Local.ManagerZones;

    // Instance methods
    /** Translates an i18n-object to a string using Homey's language */
    __(input: Record<string, string>): string | null;
    /** Check if the current role matches */
    hasRole(roleId: 'owner' | 'manager' | 'user' | 'guest'): boolean;
    /** Check if Homey is connected to Socket.io */
    isConnected(): boolean;
  }

  /**
   * DeviceCapability instance returned by Device.makeCapabilityInstance()
   * Used for realtime capability updates
   */
  export interface DeviceCapabilityInstance {
    /** The current value of the capability */
    value: CapabilityValue;
    /** When the value was last changed */
    lastChanged: Date | null;

    /** Sets a new capability value */
    setValue(value: CapabilityValue, opts?: { duration?: number }): Promise<void>;
    /** Destroy this capability listener */
    destroy(): void;

    // EventEmitter methods
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
    once(event: string, callback: (...args: unknown[]) => void): void;
    addListener(event: string, callback: (...args: unknown[]) => void): void;
    removeListener(event: string, callback: (...args: unknown[]) => void): void;
    removeAllListeners(event?: string): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emit(event: string, ...data: any[]): void;
  }

  /** @deprecated Use DeviceCapabilityInstance instead */
  export interface CapabilityInstance {
    destroy(): void;
  }

  export type ManagerDevicesWithConnect = HomeyAPIV3Local.ManagerDevices & {
    connect(): Promise<void>;
  };

  export namespace HomeyAPIV3Local {
    /**
     * ManagerDevices - Access at HomeyAPIV3Local.devices
     * https://athombv.github.io/node-homey-api/HomeyAPIV3Local.ManagerDevices.html
     */
    export interface ManagerDevices {
      // Getter methods
      getDevice(params: { id: string }): Promise<ManagerDevices.Device>;
      getDevices(): Promise<Record<string, ManagerDevices.Device>>;
      getCapabilityValue(params: { deviceId: string; capabilityId: string }): Promise<CapabilityValue>;
      getDeviceSettingsObj(params: { id: string }): Promise<Record<string, unknown>>;
      getState(): Promise<unknown>;

      // Setter methods
      setCapabilityValue(params: { deviceId: string; capabilityId: string; value: CapabilityValue }): Promise<void>;
      setDeviceSettings(params: { id: string; settings: Record<string, unknown> }): Promise<unknown>;

      // Device management
      updateDevice(params: { id: string; name?: string; zone?: string; [key: string]: unknown }): Promise<ManagerDevices.Device>;
      deleteDevice(params: { id: string }): Promise<void>;

      // Group management
      createGroup(params: { name: string; devices: string[]; [key: string]: unknown }): Promise<unknown>;
      updateGroup(params: { id: string; [key: string]: unknown }): Promise<unknown>;
      deleteDeviceFromGroup(params: { groupId: string; deviceId: string }): Promise<unknown>;

      // Socket.io connection for realtime events
      connect(): Promise<void>;
      disconnect(): Promise<void>;

      // Event subscriptions
      on(event: 'device.create', callback: (device: ManagerDevices.Device) => void): void;
      on(event: 'device.delete', callback: (device: ManagerDevices.Device) => void): void;
      on(event: 'device.update', callback: (device: ManagerDevices.Device, info: ManagerDevices.DeviceUpdateInfo) => void): void;
      on(event: 'capability.create', callback: (capability: ManagerDevices.Capability) => void): void;
      on(event: 'capability.delete', callback: (capability: ManagerDevices.Capability) => void): void;
      on(event: 'capability.update', callback: (capability: ManagerDevices.Capability, info: Record<string, boolean>) => void): void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      removeListener(event: string, callback: (...args: any[]) => void): void;
    }

    /**
     * ManagerZones - Access at HomeyAPIV3Local.zones
     * https://athombv.github.io/node-homey-api/HomeyAPIV3Local.ManagerZones.html
     */
    export interface ManagerZones {
      // Getter methods
      getZone(params: { id: string }): Promise<ManagerZones.Zone>;
      getZones(): Promise<Record<string, ManagerZones.Zone>>;
      getState(): Promise<unknown>;

      // Zone management
      createZone(params: { name: string; parent?: string; icon?: string }): Promise<ManagerZones.Zone>;
      updateZone(params: { id: string; name?: string; parent?: string; icon?: string }): Promise<ManagerZones.Zone>;
      deleteZone(params: { id: string }): Promise<void>;

      // Socket.io connection for realtime events
      connect(): Promise<void>;
      disconnect(): Promise<void>;

      // Event subscriptions
      on(event: 'zone.create', callback: (zone: ManagerZones.Zone) => void): void;
      on(event: 'zone.delete', callback: (zone: ManagerZones.Zone) => void): void;
      on(event: 'zone.update', callback: (zone: ManagerZones.Zone, info: ManagerZones.ZoneUpdateInfo) => void): void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      removeListener(event: string, callback: (...args: any[]) => void): void;
    }

    /**
     * ManagerZones.Zone
     * https://athombv.github.io/node-homey-api/HomeyAPIV3Local.ManagerZones.Zone.html
     */
    export namespace ManagerZones {
      export interface ZoneUpdateInfo {
        name?: boolean;
        parent?: boolean;
        icon?: boolean;
        active?: boolean;
        [key: string]: boolean | undefined;
      }

      export interface Zone {
        id: string;
        name: string;
        parent: string | null;
        icon: string;
        uri: string;
        active: boolean;
        activeLastUpdated: string | null;
        activeOrigins: string[];

        // Instance methods
        connect(): Promise<void>;
        disconnect(): Promise<void>;
        getParent(): Promise<Zone | null>;

        // Event subscriptions
        on(event: 'delete', callback: () => void): void;
        on(event: 'update', callback: (zone: Zone, info: ZoneUpdateInfo) => void): void;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        removeListener(event: string, callback: (...args: any[]) => void): void;
      }
    }

    /**
     * ManagerDevices types
     * https://athombv.github.io/node-homey-api/HomeyAPIV3Local.ManagerDevices.Device.html
     */
    export namespace ManagerDevices {
      /** Info object passed to device.update events */
      export interface DeviceUpdateInfo {
        zone?: boolean;
        available?: boolean;
        name?: boolean;
        settings?: boolean;
        capabilities?: boolean;
        capabilitiesOptions?: boolean;
        class?: boolean;
        virtualClass?: boolean;
        energy?: boolean;
        [key: string]: boolean | undefined;
      }

      /**
       * Capability as returned by ManagerDevices
       * https://athombv.github.io/node-homey-api/HomeyAPIV3Local.ManagerDevices.Capability.html
       */
      export interface Capability {
        id: string;
        uri: string;

        // Instance methods
        connect(): Promise<void>;
        disconnect(): Promise<void>;

        // Event subscriptions
        on(event: 'delete', callback: () => void): void;
        on(event: 'update', callback: (capability: Capability, info: Record<string, boolean>) => void): void;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        removeListener(event: string, callback: (...args: any[]) => void): void;
      }

      /** Capability object stored in device.capabilitiesObj */
      export interface CapabilityObj {
        id: string;
        type: 'boolean' | 'string' | 'number' | 'enum';
        iconObj: object | null;
        title: string;
        getable: boolean;
        setable: boolean;
        insights: boolean;
        insightsTitleTrue?: string;
        insightsTitleFalse?: string;
        value: CapabilityValue;
        lastUpdated: string;
        units?: string;
        min?: number;
        max?: number;
        step?: number;
        decimals?: number;
        values?: Array<{ id: string; title: string }>;
      }

      /** Energy object for devices */
      export interface DeviceEnergy {
        batteries?: string[];
        cumulative?: boolean;
        generator?: boolean;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
      }

      /** UI component configuration */
      export interface DeviceUI {
        quickAction?: string;
        components?: Array<{
          id: string;
          capabilities?: string[];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [key: string]: any;
        }>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
      }

      /**
       * Device as returned by ManagerDevices
       * https://athombv.github.io/node-homey-api/HomeyAPIV3Local.ManagerDevices.Device.html
       */
      export interface Device {
        // Core properties
        id: string;
        name: string;
        zone: string;
        uri: string;

        // Status properties
        available: boolean;
        ready: boolean;
        unavailableMessage: string | null;
        warningMessage: string | null;
        lastSeenAt: string | null;

        // Capability properties
        capabilities: string[];
        capabilitiesObj?: Record<string, CapabilityObj>;

        // Classification properties
        class: string;
        virtualClass: string | null;
        driverId: string;
        ownerUri: string;
        flags: string[];

        // Device data
        data: {
          id: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [key: string]: any;
        };
        settings: Record<string, unknown>;
        settingsObj: boolean;

        // Energy properties
        energy: DeviceEnergy | null;
        energyObj: object | null;

        // Visual properties
        icon: string | null;
        iconObj: object | null;
        iconOverride: string | null;
        color: string | null;
        images: string[];
        note: string | null;

        // UI properties
        ui: DeviceUI;
        uiIndicator: string | null;

        // Management properties
        repair: boolean | null;
        unpair: boolean | null;

        // Instance methods
        connect(): Promise<void>;
        disconnect(): Promise<void>;
        getZone(): Promise<ManagerZones.Zone>;
        getDriver(): Promise<unknown>;
        getFlows(): Promise<Record<string, unknown>>;
        getAdvancedFlows(): Promise<Record<string, unknown>>;
        getLogs(): Promise<Record<string, unknown>>;
        setCapabilityValue(params: { capabilityId: string; value: CapabilityValue }): Promise<void>;

        /**
         * Creates a DeviceCapability instance for realtime capability updates
         * @param capabilityId The capability ID (e.g., 'onoff', 'dim', 'alarm_motion')
         * @param listener Callback function invoked when capability value changes
         * @returns DeviceCapabilityInstance that can be used to set values or destroy the listener
         */
        makeCapabilityInstance(
          capabilityId: string,
          listener: (value: CapabilityValue) => void,
        ): DeviceCapabilityInstance;

        // Event subscriptions
        on(event: 'update', callback: (device: Device, info: DeviceUpdateInfo) => void): void;
        on(event: 'delete', callback: () => void): void;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        removeListener(event: string, callback: (...args: any[]) => void): void;
      }
    }
  }
}

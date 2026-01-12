export type EventType = 'door_open' | 'door_close' | 'motion';

export interface Event {
  type: EventType;
  timestamp: number;
  deviceId: string;
}

export class EventQueue {
  private CUTOFF_TIME_MS = 5 * 60 * 1000; // 5 minutes
  private _queue: Array<Event> = [];

  private get queue(): Array<Event> {
    return this._queue.toSorted((a, b) => a.timestamp - b.timestamp);
  }

  constructor() {
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    const weakRef = new WeakRef(this);
    const interval = setInterval(() => {
      const self = weakRef.deref();
      if (!self) {
        clearInterval(interval);
      } else {
        self.cleanup();
      }
    }, this.CUTOFF_TIME_MS);
  }

  private cleanup(): void {
    const now = Date.now();
    this._queue = this._queue.filter((event) => now - event.timestamp <= this.CUTOFF_TIME_MS);
  }

  public addEvent(eventType: EventType, deviceId: string): Event {
    const event: Event = {
      type: eventType,
      timestamp: Date.now(),
      deviceId,
    };
    this._queue.push(event);
    return event;
  }

  public getEvents(): Array<Event> {
    return this.queue;
  }
}

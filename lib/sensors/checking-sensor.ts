import { HomeyInstance } from 'homey-api';

export default class VirtualCheckingSensor {
  private homey: HomeyInstance;
  private callback: () => void;
  private timeoutMs: number;
  private checkTimeout: NodeJS.Timeout | null = null;
  private log: (message: string) => void;
  private error: (message: string, error?: unknown) => void;

  constructor(
    homey: HomeyInstance,
    callback: () => void,
    timeoutMs: number,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
  ) {
    this.homey = homey;
    this.callback = callback;
    this.timeoutMs = timeoutMs;
    this.log = log;
    this.error = error;
  }

  public start(): void {
    this.log(`Starting checking sensor with timeout ${this.timeoutMs} ms`);
    this.clearTimeout();
    this.checkTimeout = this.homey.setTimeout(async () => {
      this.log('Checking sensor timeout reached, marking as unoccupied');
      try {
        this.callback();
      } catch (err) {
        this.error('Error in checking sensor callback', err);
      }
    }, this.timeoutMs);
  }

  public stop(): void {
    this.log('Stopping checking sensor');
    this.clearTimeout();
  }

  private clearTimeout(): void {
    if (this.checkTimeout) {
      this.homey.clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
    }
  }
}

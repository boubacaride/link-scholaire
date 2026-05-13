// Promise-based typed wrapper around the BioDigital HumanAPI

import type { IHumanAPI } from "./types";
import { loadHumanAPI } from "./humanLoader";

export class HumanApiWrapper {
  private api: IHumanAPI | null = null;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private eventHandlers = new Map<string, Set<(data: any) => void>>();

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /** Initialize the API with an iframe element ID */
  async init(iframeId: string): Promise<void> {
    await loadHumanAPI();

    if (!window.HumanAPI) {
      throw new Error("HumanAPI not available on window");
    }

    this.api = new window.HumanAPI(iframeId);

    // Wait for human.ready event
    return new Promise((resolve) => {
      this.api!.on("human.ready", () => {
        this.readyResolve();
        resolve();
      });
    });
  }

  /** Send a message and get a Promise-based response */
  send<T = any>(message: string, params?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      this.readyPromise.then(() => {
        if (!this.api) return reject(new Error("HumanAPI not initialized"));

        try {
          if (params !== undefined) {
            this.api.send(message, params, (data: T) => resolve(data));
          } else {
            this.api.send(message, (data: T) => resolve(data));
          }
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /** Subscribe to an event */
  on<T = any>(event: string, handler: (data: T) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    this.readyPromise.then(() => {
      if (this.api) {
        this.api.on(event, handler);
      }
    });
  }

  /** Unsubscribe from an event */
  off(event: string, handler?: (data: any) => void): void {
    if (handler) {
      this.eventHandlers.get(event)?.delete(handler);
    } else {
      this.eventHandlers.delete(event);
    }

    if (this.api) {
      this.api.off(event, handler);
    }
  }

  /** Check if API is ready */
  get isReady(): boolean {
    return this.api !== null;
  }

  /** Wait for the API to be ready */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /** Clean up all event handlers */
  destroy(): void {
    if (this.api) {
      this.eventHandlers.forEach((handlers, event) => {
        handlers.forEach((handler) => {
          this.api!.off(event, handler);
        });
      });
    }
    this.eventHandlers.clear();
    this.api = null;
  }
}

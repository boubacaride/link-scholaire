import type { HumanApiWrapper } from "../humanApi";
import type { CameraInfo, CameraSetParams, CameraOrbitParams, CameraPanParams, CameraZoomParams } from "../types";

export class CameraService {
  constructor(private api: HumanApiWrapper) {}

  info(): Promise<CameraInfo> { return this.api.send("camera.info"); }
  set(params: CameraSetParams): Promise<void> { return this.api.send("camera.set", params); }
  reset(): Promise<void> { return this.api.send("camera.reset"); }
  orbit(params: CameraOrbitParams): Promise<void> { return this.api.send("camera.orbit", params); }
  pan(params: CameraPanParams): Promise<void> { return this.api.send("camera.pan", params); }
  zoom(params: CameraZoomParams): Promise<void> { return this.api.send("camera.zoom", params); }
  lockPitch(lock: boolean): Promise<void> { return this.api.send("camera.lockPitch", { locked: lock }); }
  lockYaw(lock: boolean): Promise<void> { return this.api.send("camera.lockYaw", { locked: lock }); }

  onUpdated(handler: (data: CameraInfo) => void): void { this.api.on("camera.updated", handler); }
  offUpdated(handler?: (data: CameraInfo) => void): void { this.api.off("camera.updated", handler); }
}

import type { HumanApiWrapper } from "../humanApi";
import type { BackgroundParams, SnapshotData } from "../types";

export class UIService {
  constructor(private api: HumanApiWrapper) {}

  setBackground(params: BackgroundParams): Promise<void> { return this.api.send("ui.setBackground", params); }
  snapshot(): Promise<SnapshotData> { return this.api.send("ui.snapshot"); }
  setDisplayMode(mode: "default" | "xray" | "isolate"): Promise<void> { return this.api.send("ui.setDisplayMode", { mode }); }
  showInfo(objectId: string): Promise<void> { return this.api.send("ui.showInfo", { objectId }); }
  hideInfo(): Promise<void> { return this.api.send("ui.hideInfo"); }
}

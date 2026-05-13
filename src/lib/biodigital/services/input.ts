import type { HumanApiWrapper } from "../humanApi";
import type { PickResult } from "../types";

export class InputService {
  constructor(private api: HumanApiWrapper) {}

  setPickEnabled(enabled: boolean): Promise<void> { return this.api.send("input.setPickEnabled", { enabled }); }
  setDragEnabled(enabled: boolean): Promise<void> { return this.api.send("input.setDragEnabled", { enabled }); }

  onPicked(handler: (data: PickResult) => void): void { this.api.on("input.picked", handler); }
  onDragged(handler: (data: any) => void): void { this.api.on("input.dragged", handler); }
}

import type { HumanApiWrapper } from "../humanApi";
import type { SceneObject, HighlightParams, ColorParams } from "../types";

export class SceneService {
  constructor(private api: HumanApiWrapper) {}

  getObjects(): Promise<SceneObject[]> { return this.api.send("scene.info"); }
  selectObject(objectId: string): Promise<void> { return this.api.send("scene.selectObject", { objectId }); }
  deselectAll(): Promise<void> { return this.api.send("scene.deselectAll"); }
  showObject(objectId: string): Promise<void> { return this.api.send("scene.showObject", { objectId }); }
  hideObject(objectId: string): Promise<void> { return this.api.send("scene.hideObject", { objectId }); }
  isolateObject(objectId: string): Promise<void> { return this.api.send("scene.isolateObject", { objectId }); }
  unisolate(): Promise<void> { return this.api.send("scene.unisolate"); }
  highlight(params: HighlightParams): Promise<void> { return this.api.send("scene.highlight", params); }
  unhighlight(objectId: string): Promise<void> { return this.api.send("scene.unhighlight", { objectId }); }
  unhighlightAll(): Promise<void> { return this.api.send("scene.unhighlightAll"); }
  setColor(params: ColorParams): Promise<void> { return this.api.send("scene.setColor", params); }
  resetColors(): Promise<void> { return this.api.send("scene.resetColors"); }
  xray(enabled: boolean): Promise<void> { return this.api.send("scene.xray", { enabled }); }
  dissect(): Promise<void> { return this.api.send("scene.dissect"); }
  undissect(): Promise<void> { return this.api.send("scene.undissect"); }
  resetScene(): Promise<void> { return this.api.send("scene.reset"); }

  onObjectSelected(handler: (data: SceneObject) => void): void { this.api.on("scene.objectSelected", handler); }
  onObjectDeselected(handler: (data: any) => void): void { this.api.on("scene.objectDeselected", handler); }
}

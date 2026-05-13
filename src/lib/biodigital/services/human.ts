import type { HumanApiWrapper } from "../humanApi";

export class HumanService {
  constructor(private api: HumanApiWrapper) {}

  loadModel(modelId: string): Promise<void> { return this.api.send("human.loadModel", { modelId }); }
  getInfo(): Promise<any> { return this.api.send("human.info"); }
  reset(): Promise<void> { return this.api.send("human.reset"); }

  onReady(handler: () => void): void { this.api.on("human.ready", handler); }
  onModelLoaded(handler: (data: any) => void): void { this.api.on("human.modelLoaded", handler); }
  onError(handler: (data: { message: string }) => void): void { this.api.on("human.error", handler); }
}

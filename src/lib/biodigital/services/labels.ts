import type { HumanApiWrapper } from "../humanApi";
import type { LabelData, CreateLabelParams } from "../types";

export class LabelsService {
  constructor(private api: HumanApiWrapper) {}

  getAll(): Promise<LabelData[]> { return this.api.send("labels.info"); }
  create(params: CreateLabelParams): Promise<LabelData> { return this.api.send("labels.create", params); }
  remove(labelId: string): Promise<void> { return this.api.send("labels.remove", { labelId }); }
  removeAll(): Promise<void> { return this.api.send("labels.removeAll"); }
  show(labelId: string): Promise<void> { return this.api.send("labels.show", { labelId }); }
  hide(labelId: string): Promise<void> { return this.api.send("labels.hide", { labelId }); }
  showAll(): Promise<void> { return this.api.send("labels.showAll"); }
  hideAll(): Promise<void> { return this.api.send("labels.hideAll"); }
  setEnabled(enabled: boolean): Promise<void> { return this.api.send("labels.setEnabled", { enabled }); }

  onCreated(handler: (data: LabelData) => void): void { this.api.on("labels.created", handler); }
  onRemoved(handler: (data: { labelId: string }) => void): void { this.api.on("labels.removed", handler); }
}

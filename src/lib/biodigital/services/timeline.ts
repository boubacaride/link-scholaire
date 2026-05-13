import type { HumanApiWrapper } from "../humanApi";
import type { TimelineInfo, ChapterInfo } from "../types";

export class TimelineService {
  constructor(private api: HumanApiWrapper) {}

  info(): Promise<TimelineInfo> { return this.api.send("timeline.info"); }
  play(): Promise<void> { return this.api.send("timeline.play"); }
  pause(): Promise<void> { return this.api.send("timeline.pause"); }
  stop(): Promise<void> { return this.api.send("timeline.stop"); }
  setSpeed(speed: number): Promise<void> { return this.api.send("timeline.setSpeed", { speed }); }
  seek(time: number): Promise<void> { return this.api.send("timeline.set", { time }); }

  getChapters(): Promise<ChapterInfo[]> { return this.api.send("timeline.chapters"); }
  goToChapter(chapterId: string): Promise<void> { return this.api.send("timeline.goToChapter", { chapterId }); }
  nextChapter(): Promise<void> { return this.api.send("timeline.nextChapter"); }
  prevChapter(): Promise<void> { return this.api.send("timeline.prevChapter"); }

  onUpdated(handler: (data: TimelineInfo) => void): void { this.api.on("timeline.updated", handler); }
  onChapterChanged(handler: (data: ChapterInfo) => void): void { this.api.on("timeline.chapterChanged", handler); }
  onComplete(handler: () => void): void { this.api.on("timeline.complete", handler); }
}

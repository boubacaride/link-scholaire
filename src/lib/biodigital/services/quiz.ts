import type { HumanApiWrapper } from "../humanApi";
import type { QuizResult } from "../types";

export class QuizService {
  constructor(private api: HumanApiWrapper) {}

  start(): Promise<void> { return this.api.send("quiz.start"); }
  stop(): Promise<void> { return this.api.send("quiz.stop"); }
  getResults(): Promise<QuizResult> { return this.api.send("quiz.results"); }
  reset(): Promise<void> { return this.api.send("quiz.reset"); }

  onStarted(handler: () => void): void { this.api.on("quiz.started", handler); }
  onCompleted(handler: (data: QuizResult) => void): void { this.api.on("quiz.completed", handler); }
  onAnswered(handler: (data: { correct: boolean }) => void): void { this.api.on("quiz.answered", handler); }
}

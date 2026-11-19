import type {ReelInput} from "./schema";

export const FPS = 60;
export const TOTAL_DURATION_SECONDS = 46.2;
export const BODY_DURATION_SECONDS = 42.2;
export const ENDING_DURATION_SECONDS = 4;
export const TOTAL_FRAMES = Math.round(TOTAL_DURATION_SECONDS * FPS);
export const WORD_REVEAL_SECONDS = 0.4;

export type TimedScene = ReelInput["scenes"][number] & {
  startFrame: number;
  endFrame: number;
};

export function buildTimeline(input: ReelInput): TimedScene[] {
  let cursor = 0;
  return input.scenes.map((scene) => {
    const startFrame = Math.round(cursor * FPS);
    cursor += scene.durationSec;
    return {
      ...scene,
      startFrame,
      endFrame: Math.min(Math.round(cursor * FPS), Math.round(BODY_DURATION_SECONDS * FPS)),
    };
  });
}

export function visibleWordCount(elapsedFrames: number, wordCount: number): number {
  if (wordCount <= 0 || elapsedFrames < 0) return 0;
  const framesPerWord = WORD_REVEAL_SECONDS * FPS;
  return Math.min(wordCount, Math.floor(elapsedFrames / framesPerWord) + 1);
}

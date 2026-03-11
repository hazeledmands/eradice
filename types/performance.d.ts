// Long Animation Frames (LoAF) API — Chrome 123+
// https://developer.chrome.com/docs/web-platform/long-animation-frames
interface PerformanceLongAnimationFrameTiming extends PerformanceEntry {
  duration: number;
  blockingDuration: number;
  renderStart: number;
  styleAndLayoutStart: number;
  firstUIEventTimestamp: number;
  scripts: PerformanceScriptTiming[];
}

interface PerformanceScriptTiming extends PerformanceEntry {
  invoker: string;
  invokerType: string;
  executionStart: number;
  forcedStyleAndLayoutDuration: number;
  pauseDuration: number;
  sourceURL: string;
  sourceFunctionName: string;
  sourceCharPosition: number;
}

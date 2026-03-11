import { getTracer } from './tracing';
import { SpanStatusCode } from '@opentelemetry/api';
import { getParticleBudget, PARTICLE_BUDGET } from './particleBudget';

function budgetTier(count: number): string {
  if (count >= PARTICLE_BUDGET.full) return 'full';
  if (count >= PARTICLE_BUDGET.reduced) return 'reduced';
  return 'minimal';
}

/**
 * Record the particle budget selection as a span so we can correlate
 * device capabilities with performance in Honeycomb.
 */
function recordParticleBudget() {
  const cores = navigator.hardwareConcurrency ?? 0;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 0;
  const budget = getParticleBudget({
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as { deviceMemory?: number }).deviceMemory,
  });

  const span = getTracer().startSpan('perf.particle_budget');
  span.setAttributes({
    'perf.particle_count': budget,
    'perf.particle_tier': budgetTier(budget),
    'device.cores': cores,
    'device.memory_gb': memory,
    'device.user_agent': navigator.userAgent,
    'device.prefers_reduced_motion': window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  span.end();
}

/**
 * Observe Long Animation Frames (LoAF API).
 * Reports a span for each frame that exceeds 50ms, which is the
 * threshold for user-perceivable jank.
 */
function observeLongAnimationFrames() {
  if (typeof PerformanceObserver === 'undefined') return;

  // The LoAF API uses entryType 'long-animation-frame'
  // Check if it's supported before subscribing
  try {
    const supported = PerformanceObserver.supportedEntryTypes;
    if (!supported.includes('long-animation-frame')) return;
  } catch {
    return;
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const loaf = entry as PerformanceLongAnimationFrameTiming;
      const span = getTracer().startSpan('perf.long_animation_frame', {
        startTime: loaf.startTime,
      });
      span.setAttributes({
        'perf.frame_duration_ms': loaf.duration,
        'perf.blocking_duration_ms': loaf.blockingDuration,
        'perf.render_start_ms': loaf.renderStart,
        'perf.style_and_layout_start_ms': loaf.styleAndLayoutStart,
        'perf.first_ui_event_timestamp_ms': loaf.firstUIEventTimestamp,
      });
      if (loaf.duration > 100) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Severely long frame' });
      }
      span.end();
    }
  });

  observer.observe({ type: 'long-animation-frame', buffered: true });
}

/**
 * Periodically sample JS heap memory usage (Chrome only) and emit spans.
 * Runs every 30 seconds.
 */
function observeMemory() {
  const perfWithMemory = performance as Performance & {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };

  if (!perfWithMemory.memory) return;

  setInterval(() => {
    const mem = perfWithMemory.memory;
    if (!mem) return;

    const span = getTracer().startSpan('perf.memory_snapshot');
    span.setAttributes({
      'perf.heap_used_mb': Math.round(mem.usedJSHeapSize / 1048576),
      'perf.heap_total_mb': Math.round(mem.totalJSHeapSize / 1048576),
      'perf.heap_limit_mb': Math.round(mem.jsHeapSizeLimit / 1048576),
      'perf.heap_utilization_pct': Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100),
    });
    span.end();
  }, 30_000);
}

/**
 * Start all performance instrumentation. Call once from _app.
 */
export function initPerfInstrumentation() {
  recordParticleBudget();
  observeLongAnimationFrames();
  observeMemory();
}

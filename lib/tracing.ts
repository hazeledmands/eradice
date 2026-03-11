import { trace, type Span, SpanStatusCode } from '@opentelemetry/api';

const TRACER_NAME = 'eradice';

export function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Wraps a synchronous function in an OpenTelemetry span.
 * Automatically records exceptions and sets error status.
 */
export function withSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean>,
  fn: (span: Span) => T,
): T {
  return getTracer().startActiveSpan(name, (span) => {
    try {
      span.setAttributes(attrs);
      const result = fn(span);
      span.end();
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  });
}

/**
 * Wraps an async function in an OpenTelemetry span.
 * Automatically records exceptions and sets error status.
 */
export async function withAsyncSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return getTracer().startActiveSpan(name, async (span) => {
    try {
      span.setAttributes(attrs);
      const result = await fn(span);
      span.end();
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  });
}

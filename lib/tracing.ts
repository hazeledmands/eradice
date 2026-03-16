import { trace, type Span, SpanStatusCode } from '@opentelemetry/api';

const TRACER_NAME = 'eradice';

let _userName: string | null = null;

/** Set the current user name to be included on all subsequent spans. */
export function setSpanUserName(name: string | null) {
  _userName = name;
}

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
    if (_userName) span.setAttribute('user.name', _userName);
    span.setAttributes(attrs);
    try {
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
    if (_userName) span.setAttribute('user.name', _userName);
    span.setAttributes(attrs);
    try {
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

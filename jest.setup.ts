// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Server-side suites (API routes, the Access verifier, the migration runner)
// opt into `@jest-environment node` via a docblock, where none of the browser
// globals below exist. Guarding the whole block keeps this file usable from
// both environments rather than needing a second setup file.
if (typeof window !== 'undefined') {
  // Polyfill ResizeObserver for jsdom (used by DiceTray)
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // jsdom has no canvas implementation, so getContext logs a "Not implemented"
  // error through the virtual console on every render of a canvas-backed
  // component. FractalEffect already treats a null context as "no WebGL, skip
  // the effect", so returning null here takes that existing path quietly
  // rather than installing the heavyweight `canvas` package.
  HTMLCanvasElement.prototype.getContext = jest.fn(() => null) as unknown as
    typeof HTMLCanvasElement.prototype.getContext;

  // jsdom implements Crypto but not randomUUID, which useRollComments uses to
  // id locally-stored comments. Node's own webcrypto has it, so delegate.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => require('node:crypto').randomUUID(),
    });
  }

  // Polyfill matchMedia for jsdom (used by FractalEffect)
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

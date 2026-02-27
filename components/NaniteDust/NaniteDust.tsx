import { useEffect, useRef } from 'react';

// ── Perlin noise ──────────────────────────────────────────────────────────────
// Permutation table initialized with a deterministic shuffle (no dependency needed)
const PERM = new Uint8Array(512);
(function initPerm() {
  const p = Array.from({ length: 256 }, (_, i) => i);
  // Xorshift32 seeded LCG for a deterministic shuffle
  let s = 0xc0ffee;
  for (let i = 255; i > 0; i--) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

// Eight evenly-distributed unit gradient vectors
const GRAD: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071],
  [0.7071, -0.7071], [-0.7071, -0.7071],
];

function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a: number, b: number, t: number) { return a + t * (b - a); }

function perlin(x: number, y: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const dot = (h: number, dx: number, dy: number) => {
    const [gx, gy] = GRAD[PERM[h] & 7];
    return gx * dx + gy * dy;
  };

  const aa = PERM[PERM[xi] + yi];
  const ba = PERM[PERM[xi + 1] + yi];
  const ab = PERM[PERM[xi] + yi + 1];
  const bb = PERM[PERM[xi + 1] + yi + 1];
  return lerp(
    lerp(dot(aa, xf, yf),     dot(ba, xf - 1, yf),     u),
    lerp(dot(ab, xf, yf - 1), dot(bb, xf - 1, yf - 1), u),
    v,
  );
}

// ── Particle system ───────────────────────────────────────────────────────────
// Scale at which particle (x,y) coordinates are sampled from the noise field.
// Smaller = larger swirls; larger = tighter curls.
const FIELD_SCALE = 0.0018;
// How quickly the noise field itself evolves over time.
const TIME_SCALE = 0.000115;
// Multiplied by noise output to determine flow angle (higher = more curling).
const CURL = Math.PI * 4.2;
// Second octave weight (adds finer-grained variation on top of large swirls).
const OCTAVE2_WEIGHT = 0.45;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  size: number;
  maxOpacity: number;
  lifetime: number;
  age: number;
}

function makeParticle(w: number, h: number): Particle {
  const large = Math.random() < 0.12;
  const size = large
    ? 1.8 + Math.random() * 2.2   // occasional large glowing mote
    : 0.35 + Math.random() * Math.random() * 1.4; // biased toward tiny
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: 0,
    vy: 0,
    speed: large ? 0.18 + Math.random() * 0.3 : 0.3 + Math.random() * 0.8,
    size,
    maxOpacity: large ? 0.4 + Math.random() * 0.35 : 0.07 + Math.random() * 0.22,
    lifetime: 350 + Math.random() * 900,
    age: 0,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function NaniteDust() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) return;

    const PARTICLE_COUNT = window.innerWidth < 768 ? 180 : 380;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    window.addEventListener('resize', onResize);

    // Stagger initial ages so we don't see all particles spawn at once
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => {
      const p = makeParticle(w, h);
      p.age = Math.floor(Math.random() * p.lifetime);
      return p;
    });

    let rafId = 0;

    function frame(now: number) {
      const t = now * TIME_SCALE;

      // Fade trail: fill with near-black each frame.
      // mix-blend-mode:screen on the canvas element means this near-black fill
      // is effectively transparent against the dark page background, while
      // existing bright particle trails decay toward black (and thus vanish).
      ctx.fillStyle = 'rgba(0, 1, 3, 0.038)';
      ctx.fillRect(0, 0, w, h);

      for (const p of particles) {
        const nx = p.x * FIELD_SCALE;
        const ny = p.y * FIELD_SCALE;

        // Primary octave: large slow-rolling swirls
        const n1 = perlin(nx + t, ny + t * 0.35);
        // Secondary octave: finer variation, offset so it doesn't mirror n1
        const n2 = perlin(nx * 2.1 + 73.4 + t * 0.55, ny * 2.1 + 31.7 + t * 0.28);

        const angle = (n1 + n2 * OCTAVE2_WEIGHT) * CURL;

        // Smooth velocity with inertia (avoids jittery motion)
        p.vx = p.vx * 0.88 + Math.cos(angle) * p.speed * 0.12;
        p.vy = p.vy * 0.88 + Math.sin(angle) * p.speed * 0.12;
        p.x += p.vx;
        p.y += p.vy;
        p.age++;

        // Wrap seamlessly across viewport edges
        if (p.x < -5)  p.x += w + 10;
        if (p.x > w+5) p.x -= w + 10;
        if (p.y < -5)  p.y += h + 10;
        if (p.y > h+5) p.y -= h + 10;

        // Life arc: fade in and out via sin ramp
        const life = p.age / p.lifetime;
        const alpha = p.maxOpacity * Math.sin(life * Math.PI);

        // Color: substrate cyan, green channel varies gently with local noise
        const g = 195 + Math.round(perlin(nx * 0.4 + 200, ny * 0.4) * 60);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,${g},255,${alpha.toFixed(3)})`;
        ctx.fill();

        if (p.age >= p.lifetime) {
          Object.assign(p, makeParticle(w, h));
        }
      }

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,        // above grain texture (z:0), below content (z:2)
        mixBlendMode: 'screen', // dark canvas ≈ transparent; bright particles glow
        opacity: 0.72,
      }}
    />
  );
}

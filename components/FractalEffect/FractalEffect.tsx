import { useEffect, useRef } from 'react';
import styles from './FractalEffect.module.css';

const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Shared preamble: uniforms + palette
const FRAG_PREAMBLE = `
precision mediump float;

uniform vec2  u_resolution;
uniform vec2  u_center;
uniform float u_time;
uniform float u_opacity;

// 4-stop palette: cyan → purple → magenta → gold
vec3 palette(float t) {
  t = fract(t);
  vec3 cyan    = vec3(0.0,   1.0,   1.0);
  vec3 purple  = vec3(0.627, 0.314, 1.0);
  vec3 magenta = vec3(0.863, 0.235, 0.784);
  vec3 gold    = vec3(1.0,   0.784, 0.196);

  float s   = t * 4.0;
  float f   = fract(s);
  float seg = floor(s);

  vec3 ab  = mix(cyan,    purple,  f);
  vec3 bc  = mix(purple,  magenta, f);
  vec3 cd  = mix(magenta, gold,    f);
  vec3 da  = mix(gold,    cyan,    f);

  vec3 col = ab;
  col = mix(col, bc, step(1.0, seg));
  col = mix(col, cd, step(2.0, seg));
  col = mix(col, da, step(3.0, seg));
  return col;
}
`;

interface Algorithm {
  /** GLSL expression evaluating to vec2 c */
  c_expr:    string;
  /** Optional declarations inserted before the iteration loop */
  pre_loop?: string;
  /** GLSL statement(s) for one iteration step; may use z, c, and any pre_loop vars */
  iter:      string;
}

const ALGORITHMS: Algorithm[] = [
  {
    // Julia z² — organic spiral flowers
    c_expr:   '0.7885 * vec2(cos(st * 0.25), sin(st * 0.25))',
    iter:     'z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;',
  },
  {
    // Burning Ship Julia — angular, flame-like structures
    c_expr:   '0.75 * vec2(cos(st * 0.2), sin(st * 0.2))',
    iter:     'z = vec2(z.x*z.x - z.y*z.y, 2.0*abs(z.x)*abs(z.y)) + c;',
  },
  {
    // Julia z³ — 4-fold star symmetry, more elaborate tendrils
    c_expr:   '0.55 * vec2(cos(st * 0.18), sin(st * 0.18))',
    iter:     'z = vec2(z.x*z.x*z.x - 3.0*z.x*z.y*z.y, 3.0*z.x*z.x*z.y - z.y*z.y*z.y) + c;',
  },
  {
    // Phoenix fractal — feathery, uses previous iteration (memory)
    c_expr:    '0.57 * vec2(cos(st * 0.22), sin(st * 0.22))',
    pre_loop:  'vec2 pz = vec2(0.0);',
    iter:      'vec2 nz = vec2(z.x*z.x - z.y*z.y - 0.5*pz.x, 2.0*z.x*z.y - 0.5*pz.y) + c; pz = z; z = nz;',
  },
];

function buildFragSrc(alg: Algorithm): string {
  return `${FRAG_PREAMBLE}
void main() {
  float st    = u_time / 3.0;
  vec2 uv     = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 z      = (uv - u_center) * vec2(aspect * 1.5, 1.5);
  vec2 c      = ${alg.c_expr};
  ${alg.pre_loop ?? ''}

  const int MAX_ITER = 80;
  float smooth_iter = 0.0;
  bool  escaped     = false;

  for (int n = 0; n < MAX_ITER; n++) {
    ${alg.iter}
    if (dot(z, z) > 4.0) {
      smooth_iter = float(n) - log2(log2(dot(z, z))) + 4.0;
      escaped = true;
      break;
    }
  }

  if (!escaped) { gl_FragColor = vec4(0.0); return; }

  float t        = smooth_iter / 20.0 + st * 0.04;
  vec3  color    = palette(t);
  float vignette = 1.0 - smoothstep(0.3, 0.75, length(uv - u_center));
  float alpha    = vignette * u_opacity;
  gl_FragColor   = vec4(color * alpha, alpha);
}
`;
}

interface Props {
  opacity?: number;
  center?: { x: number; y: number };
}

export default function FractalEffect({ opacity = 1, center = { x: 0.5, y: 0.5 } }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const opacityRef  = useRef(opacity);
  const centerRef   = useRef(center);

  // Pick algorithm once per mount; stable across re-renders.
  // useRef avoids SSR hydration mismatch (useState initializer runs on server too).
  const algIndex = useRef(-1);
  if (algIndex.current === -1) {
    algIndex.current = typeof window === 'undefined'
      ? 0
      : Math.floor(Math.random() * ALGORITHMS.length);
  }

  useEffect(() => { opacityRef.current = opacity; }, [opacity]);
  useEffect(() => { centerRef.current  = center;  }, [center]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) return;

    function compileShader(type: number, src: string): WebGLShader | null {
      const shader = gl!.createShader(type);
      if (!shader) return null;
      gl!.shaderSource(shader, src);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl!.getShaderInfoLog(shader));
        gl!.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const fragSrc = buildFragSrc(ALGORITHMS[algIndex.current]);
    const vert = compileShader(gl.VERTEX_SHADER, VERT_SRC);
    const frag = compileShader(gl.FRAGMENT_SHADER, fragSrc);
    if (!vert || !frag) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const aPos    = gl.getAttribLocation(program,  'a_pos');
    const uRes    = gl.getUniformLocation(program, 'u_resolution');
    const uCenter = gl.getUniformLocation(program, 'u_center');
    const uTime   = gl.getUniformLocation(program, 'u_time');
    const uOpacity= gl.getUniformLocation(program, 'u_opacity');

    gl.useProgram(program);
    gl.enableVertexAttribArray(aPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    function resize() {
      if (!canvas || !gl) return;
      const w = Math.max(1, Math.floor(canvas.clientWidth  / 2));
      const h = Math.max(1, Math.floor(canvas.clientHeight / 2));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const startTime = performance.now();
    let raf = 0;

    function render() {
      if (!gl || !canvas) return;
      resize();
      const t = (performance.now() - startTime) * 0.001;
      gl.uniform2f(uRes,     canvas.width, canvas.height);
      gl.uniform2f(uCenter,  centerRef.current.x, centerRef.current.y);
      gl.uniform1f(uTime,    t);
      gl.uniform1f(uOpacity, opacityRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    }

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      gl.deleteBuffer(buf);
    };
  }, []); // run once; algIndex.current is set before effect runs

  return <canvas ref={canvasRef} className={styles.canvas} />;
}

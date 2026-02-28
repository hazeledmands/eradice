import { useEffect, useRef } from 'react';
import styles from './FractalEffect.module.css';

const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;

uniform vec2  u_resolution;
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
  float seg = floor(s);  // 0, 1, 2, or 3

  // Compute all four adjacent blends; select via step (no integer branching)
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

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // Map to [-1.5, 1.5] centered, maintaining aspect
  float aspect = u_resolution.x / u_resolution.y;
  vec2 z = (uv - 0.5) * vec2(aspect * 3.0, 3.0);

  // Julia parameter: c = 0.7885 * e^(i * t * 0.25)
  float angle = u_time * 0.25;
  vec2  c = 0.7885 * vec2(cos(angle), sin(angle));

  // Iterate z -> z^2 + c
  const int MAX_ITER = 80;
  float smooth_iter = 0.0;
  bool  escaped     = false;

  for (int n = 0; n < MAX_ITER; n++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 4.0) {
      // Smooth iteration count for band-free coloring
      smooth_iter = float(n) - log2(log2(dot(z, z))) + 4.0;
      escaped = true;
      break;
    }
  }

  if (!escaped) {
    // Interior: fully transparent
    gl_FragColor = vec4(0.0);
    return;
  }

  // Color from palette, cycling slowly
  float t      = smooth_iter / 20.0 + u_time * 0.04;
  vec3  color  = palette(t);

  // Radial vignette: fade to transparent at edges
  float vignette = 1.0 - smoothstep(0.3, 0.75, length(uv - 0.5));

  float alpha = vignette * u_opacity;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

interface Props {
  opacity?: number;
}

export default function FractalEffect({ opacity = 1 }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const opacityRef = useRef(opacity);

  // Keep opacity ref in sync without triggering re-setup
  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  useEffect(() => {
    // SSR guard
    if (typeof window === 'undefined') return;

    // Reduced-motion guard
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) return;

    // --- Compile shaders ---
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

    const vert = compileShader(gl.VERTEX_SHADER, VERT_SRC);
    const frag = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
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

    // Fullscreen triangle: one draw call covers all clip space
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );

    const aPos       = gl.getAttribLocation(program,  'a_pos');
    const uRes       = gl.getUniformLocation(program, 'u_resolution');
    const uTime      = gl.getUniformLocation(program, 'u_time');
    const uOpacity   = gl.getUniformLocation(program, 'u_opacity');

    gl.useProgram(program);
    gl.enableVertexAttribArray(aPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied alpha

    // --- Resize handling ---
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

    // --- Render loop ---
    const startTime = performance.now();
    let raf = 0;

    function render() {
      if (!gl || !canvas) return;
      resize();
      const t = (performance.now() - startTime) * 0.001;
      gl.uniform2f(uRes,     canvas.width, canvas.height);
      gl.uniform1f(uTime,    t);
      gl.uniform1f(uOpacity, opacityRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    }

    raf = requestAnimationFrame(render);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      gl.deleteBuffer(buf);
    };
  }, []); // run once

  return <canvas ref={canvasRef} className={styles.canvas} />;
}

import { useEffect, useRef } from "react";
import styles from "./NaniteBackground.module.css";

// --- Inline Perlin noise (no npm dependency) ---
const PERM: number[] = new Array(512);
(function buildPermTable() {
    const p: number[] = Array.from({ length: 256 }, (_, i) => i);
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a: number, b: number, t: number) {
    return a + t * (b - a);
}

function grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function noise3d(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x),
        v = fade(y),
        w = fade(z);
    const A = PERM[X] + Y,
        AA = PERM[A] + Z,
        AB = PERM[A + 1] + Z;
    const B = PERM[X + 1] + Y,
        BA = PERM[B] + Z,
        BB = PERM[B + 1] + Z;
    return lerp(
        lerp(
            lerp(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u),
            lerp(
                grad(PERM[AB], x, y - 1, z),
                grad(PERM[BB], x - 1, y - 1, z),
                u,
            ),
            v,
        ),
        lerp(
            lerp(
                grad(PERM[AA + 1], x, y, z - 1),
                grad(PERM[BA + 1], x - 1, y, z - 1),
                u,
            ),
            lerp(
                grad(PERM[AB + 1], x, y - 1, z - 1),
                grad(PERM[BB + 1], x - 1, y - 1, z - 1),
                u,
            ),
            v,
        ),
        w,
    );
}

// --- Config ---
const PARTICLE_COUNT = 4000;
const NUM_CLUSTERS = 30;
const CLUSTER_SPREAD = 105; // canvas px (~210 screen px)
const NOISE_SCALE = 0.003;
const NOISE_TIME_SCALE = 0.0005;
const SPEED = 0.35;
const TRAIL_ALPHA = 0.018;
const PARTICLE_ALPHA = 0.55;
const PARTICLE_SIZE = 0.15; // canvas px = ~0.3px visual after 2x CSS stretch
const MAGENTA_FRACTION = 0.15;
const MOUSE_ATTRACT = 0.08; // canvas px/frame pull at cursor center
const MOUSE_RADIUS = 400; // canvas px (~800 screen px) influence radius

// ~20% of particles render on the foreground canvas (above UI)
const isFg = (i: number) => ((i * 2654435761) >>> 0) % 5 === 0;

interface Particle {
    x: number;
    y: number;
    color: string;
    repel: boolean;
}

export default function NaniteBackground() {
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const fgCanvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
            return;

        const bgCanvas = bgCanvasRef.current;
        const fgCanvas = fgCanvasRef.current;
        if (!bgCanvas || !fgCanvas) return;

        const bgCtx = bgCanvas.getContext("2d");
        const fgCtx = fgCanvas.getContext("2d");
        if (!bgCtx || !fgCtx) return;

        let W = 0,
            H = 0;
        let rafId = 0;
        let startTime = performance.now();
        let mouseX = -9999;
        let mouseY = -9999;
        let particles: Particle[] = [];

        function initCanvas() {
            W = Math.ceil(window.innerWidth / 2);
            H = Math.ceil(window.innerHeight / 2);
            for (const c of [bgCanvas!, fgCanvas!]) {
                c.width = W;
                c.height = H;
                c.style.width = window.innerWidth + "px";
                c.style.height = window.innerHeight + "px";
            }
            // Fill bg void color so trails fade to dark, not transparent
            bgCtx!.fillStyle = "#0a0a0f";
            bgCtx!.fillRect(0, 0, W, H);
            // fg canvas starts transparent — trails fade to transparent via destination-out
        }

        function initParticles() {
            // Per-cluster hue jitter: cyan ~160-200°, magenta ~280-340°
            const centers = Array.from({ length: NUM_CLUSTERS }, () => {
                const isMagenta = Math.random() < MAGENTA_FRACTION;
                const hue = isMagenta
                    ? 280 + Math.random() * 60 // violet → hot pink
                    : 160 + Math.random() * 40; // teal → azure
                const lightness = 55 + Math.random() * 20; // 55–75%
                return {
                    x: Math.random() * W,
                    y: Math.random() * H,
                    color: `hsla(${hue},100%,${lightness}%,${PARTICLE_ALPHA})`,
                };
            });
            // Initialize contiguously per cluster so frame loop can batch by color change
            particles = [];
            const perCluster = Math.ceil(PARTICLE_COUNT / NUM_CLUSTERS);
            for (let ci = 0; ci < NUM_CLUSTERS; ci++) {
                const c = centers[ci];
                const count =
                    ci < NUM_CLUSTERS - 1
                        ? perCluster
                        : PARTICLE_COUNT - perCluster * (NUM_CLUSTERS - 1);
                for (let j = 0; j < count; j++) {
                    const angle = Math.random() * Math.PI * 2;
                    const radius = Math.random() * CLUSTER_SPREAD;
                    particles.push({
                        x: (((c.x + Math.cos(angle) * radius) % W) + W) % W,
                        y: (((c.y + Math.sin(angle) * radius) % H) + H) % H,
                        color: c.color,
                        repel: Math.random() < 0.5,
                    });
                }
            }
        }

        function frame() {
            const t = (performance.now() - startTime) * NOISE_TIME_SCALE;

            // Fade bg trails to dark
            bgCtx!.fillStyle = `rgba(10,10,15,${TRAIL_ALPHA})`;
            bgCtx!.fillRect(0, 0, W, H);

            // fg canvas: very short trails
            fgCtx!.globalCompositeOperation = "destination-out";
            fgCtx!.fillStyle = "rgba(0,0,0,0.1)";
            fgCtx!.fillRect(0, 0, W, H);
            fgCtx!.globalCompositeOperation = "source-over";

            // Draw bg particles (~80%)
            let lastColor = "";
            for (let i = 0; i < particles.length; i++) {
                if (isFg(i)) continue;
                const p = particles[i];
                if (p.color !== lastColor) {
                    if (lastColor !== "") bgCtx!.fill();
                    bgCtx!.beginPath();
                    bgCtx!.fillStyle = p.color;
                    lastColor = p.color;
                }
                bgCtx!.moveTo(p.x + PARTICLE_SIZE, p.y);
                bgCtx!.arc(p.x, p.y, PARTICLE_SIZE, 0, Math.PI * 2);
            }
            if (lastColor !== "") bgCtx!.fill();

            // Draw fg particles (~20%)
            lastColor = "";
            for (let i = 0; i < particles.length; i++) {
                if (!isFg(i)) continue;
                const p = particles[i];
                if (p.color !== lastColor) {
                    if (lastColor !== "") fgCtx!.fill();
                    fgCtx!.beginPath();
                    fgCtx!.fillStyle = p.color;
                    lastColor = p.color;
                }
                fgCtx!.moveTo(p.x + PARTICLE_SIZE, p.y);
                fgCtx!.arc(p.x, p.y, PARTICLE_SIZE, 0, Math.PI * 2);
            }
            if (lastColor !== "") fgCtx!.fill();

            // Update positions
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                // Mouse proximity
                const mx = p.x - mouseX;
                const my = p.y - mouseY;
                const dist = Math.sqrt(mx * mx + my * my);
                const proximity =
                    dist < MOUSE_RADIUS ? 1 - dist / MOUSE_RADIUS : 0;

                // Calm flow angle + base jitter for all particles
                const calmAngle =
                    noise3d(p.x * NOISE_SCALE, p.y * NOISE_SCALE, t) *
                        Math.PI *
                        2 +
                    (Math.random() - 0.5) * Math.PI * 0.5;
                // Chaotic angle: high-frequency noise + random jitter
                const chaoticAngle =
                    noise3d(
                        p.x * NOISE_SCALE * 18,
                        p.y * NOISE_SCALE * 18,
                        t * 6,
                    ) *
                        Math.PI *
                        2 +
                    (Math.random() - 0.5) * Math.PI * proximity * 3;
                // Blend toward chaos as mouse gets closer (quadratic so it's calm until quite close)
                const blend = proximity * proximity;
                const angle = calmAngle + (chaoticAngle - calmAngle) * blend;

                // Speed surges near mouse: all particles faster, ~25% surge even harder
                const speedMult =
                    1 +
                    proximity * 4 +
                    ((i * 2654435761) >>> 30 === 0 ? proximity * 6 : 0);
                let dx = Math.cos(angle) * SPEED * speedMult;
                let dy = Math.sin(angle) * SPEED * speedMult;

                // Mouse attractor/repeller
                if (proximity > 0 && dist > 0) {
                    const pull = MOUSE_ATTRACT * proximity;
                    const sign = p.repel ? 1 : -1;
                    dx += sign * (mx / dist) * pull;
                    dy += sign * (my / dist) * pull;
                }
                p.x += dx;
                p.y += dy;
                // Wrap edges
                if (p.x < 0) p.x += W;
                else if (p.x >= W) p.x -= W;
                if (p.y < 0) p.y += H;
                else if (p.y >= H) p.y -= H;
            }

            rafId = requestAnimationFrame(frame);
        }

        function handleResize() {
            cancelAnimationFrame(rafId);
            const prevW = W,
                prevH = H;
            initCanvas();
            // Clamp existing particle positions to new bounds
            for (const p of particles) {
                p.x = (p.x / prevW) * W;
                p.y = (p.y / prevH) * H;
            }
            startTime = performance.now();
            rafId = requestAnimationFrame(frame);
        }

        function handleMouseMove(e: MouseEvent) {
            mouseX = e.clientX / 2;
            mouseY = e.clientY / 2;
        }

        initCanvas();
        initParticles();
        rafId = requestAnimationFrame(frame);
        window.addEventListener("resize", handleResize);
        window.addEventListener("mousemove", handleMouseMove);

        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("mousemove", handleMouseMove);
        };
    }, []);

    return (
        <>
            <canvas
                ref={bgCanvasRef}
                className={styles.bgCanvas}
                aria-hidden="true"
            />
            <canvas
                ref={fgCanvasRef}
                className={styles.fgCanvas}
                aria-hidden="true"
            />
        </>
    );
}

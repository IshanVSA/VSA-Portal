import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Config
const ZOOM_FACTOR = 0.3;
const BASE_WAVE_AMPLITUDE = 0.2;
const RANDOM_WAVE_FACTOR = 0.15;
const WAVE_FREQUENCY = 4.0;
const TIME_FACTOR = 0.25;
const BASE_SWIRL_STRENGTH = 1.2;
const SWIRL_TIME_MULT = 5.0;
const NOISE_SWIRL_FACTOR = 0.2;
const FBM_OCTAVES = 6;

const seaColors: [number, number, number][] = [
  [0.0, 0.02, 0.05], [0.0, 0.04, 0.08], [0.0, 0.06, 0.12], [0.0, 0.08, 0.18],
  [0.0, 0.1, 0.24], [0.0, 0.14, 0.32], [0.0, 0.2, 0.4], [0.0, 0.24, 0.48],
  [0.0, 0.3, 0.55], [0.05, 0.35, 0.6], [0.08, 0.4, 0.65], [0.1, 0.45, 0.7],
  [0.15, 0.5, 0.75], [0.2, 0.58, 0.8], [0.25, 0.65, 0.85], [0.3, 0.72, 0.9],
  [0.4, 0.78, 0.92], [0.5, 0.85, 0.95], [0.7, 0.9, 0.97], [0.85, 0.95, 1.0],
];

function buildFragmentShader(): string {
  const fbmOctavesInt = Math.floor(FBM_OCTAVES);
  const colorArraySrc = seaColors
    .map((c) => `vec3(${c[0]}, ${c[1]}, ${c[2]})`)
    .join(",\n  ");

  return `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uResolution;
uniform float uTime;

#define NUM_COLORS 20

vec3 seaColors[NUM_COLORS] = vec3[](
  ${colorArraySrc}
);

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float noise2D(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.792843 - 0.853734 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 st) {
  float value = 0.0;
  float amplitude = 0.5;
  float freq = 1.0;
  for (int i = 0; i < ${fbmOctavesInt}; i++) {
    value += amplitude * noise2D(st * freq);
    freq *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;
  uv *= float(${ZOOM_FACTOR});

  float t = uTime * float(${TIME_FACTOR});
  float waveAmp = float(${BASE_WAVE_AMPLITUDE}) + float(${RANDOM_WAVE_FACTOR}) * noise2D(vec2(t, 27.7));
  float waveX = waveAmp * sin(uv.y * float(${WAVE_FREQUENCY}) + t);
  float waveY = waveAmp * sin(uv.x * float(${WAVE_FREQUENCY}) - t);
  uv.x += waveX;
  uv.y += waveY;

  float r = length(uv);
  float angle = atan(uv.y, uv.x);
  float swirlStrength = float(${BASE_SWIRL_STRENGTH}) * (1.0 - smoothstep(0.0, 1.0, r));
  angle += swirlStrength * sin(uTime + r * float(${SWIRL_TIME_MULT}));
  uv = vec2(cos(angle), sin(angle)) * r;

  float n = fbm(uv);
  n += float(${NOISE_SWIRL_FACTOR}) * sin(t + n * 3.0);

  float noiseVal = 0.5 * (n + 1.0);
  float idx = clamp(noiseVal, 0.0, 1.0) * float(NUM_COLORS - 1);
  int iLow = int(floor(idx));
  int iHigh = int(min(float(iLow + 1), float(NUM_COLORS - 1)));
  float f = fract(idx);
  vec3 color = mix(seaColors[iLow], seaColors[iHigh], f);

  if (iLow == 0 && iHigh == 0) {
    outColor = vec4(color, 0.0);
  } else {
    outColor = vec4(color, 1.0);
  }
}
`;
}

const vertexShaderSource = `#version 300 es
precision mediump float;
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

function createShaderProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram | null {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Link error:", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

export const WavyBackground = ({
  children,
  className,
  canvasClassName,
}: {
  children?: React.ReactNode;
  className?: string;
  canvasClassName?: string;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true }) as WebGL2RenderingContext | null;
    if (!gl) {
      container.style.background =
        "linear-gradient(160deg, hsl(210 80% 8%), hsl(215 70% 18%) 60%, hsl(200 70% 30%))";
      return;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const program = createShaderProgram(gl, vertexShaderSource, buildFragmentShader());
    if (!program) return;
    gl.useProgram(program);

    const quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    const aPositionLoc = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(aPositionLoc);
    gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0);

    const uResolutionLoc = gl.getUniformLocation(program, "uResolution");
    const uTimeLoc = gl.getUniformLocation(program, "uTime");

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const start = performance.now();
    const draw = (tSec: number) => {
      resize();
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
      gl.uniform1f(uTimeLoc, tSec);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    if (prefersReduced) {
      draw(0);
    } else {
      const loop = () => {
        if (document.hidden) {
          raf = requestAnimationFrame(loop);
          return;
        }
        draw((performance.now() - start) * 0.001);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(program);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
    };
  }, []);

  return (
    <div ref={containerRef} className={cn("relative overflow-hidden", className)}>
      <canvas
        ref={canvasRef}
        className={cn("absolute inset-0 h-full w-full block pointer-events-none", canvasClassName)}
      />
      {children}
    </div>
  );
};

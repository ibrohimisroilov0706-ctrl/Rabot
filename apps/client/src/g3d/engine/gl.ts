// apps/client/src/g3d/engine/gl.ts
// Minimal WebGL1 renderer: bitta shader (yarim-shar yorug'lik + quyosh + tuman), uch rangli mesh'lar,
// shaffof soya disklari. WebGL1 tanlangan: eski Android/iOS Telegram WebView'larida ham ishlaydi.

import type { Geo } from './mesh.js';
import { lookAt, mat4, mul, perspective, type Mat4 } from './math.js';

export interface Mesh { buf: WebGLBuffer; count: number }
export interface Env { sky: [number, number, number]; ground: [number, number, number]; sun: [number, number, number]; sunDir: [number, number, number]; fog: [number, number, number]; fogNear: number; fogFar: number }

const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uProj, uView, uModel;
varying vec3 vCol; varying vec3 vNor; varying vec3 vW;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz; vCol = aCol; vNor = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNor;
  gl_Position = uProj * uView * w;
}`;
const FS = `
precision mediump float;
varying vec3 vCol; varying vec3 vNor; varying vec3 vW;
uniform vec3 uSky, uGround, uSun, uSunDir, uFog, uCam, uTint, uFlash;
uniform float uFogNear, uFogFar, uUnlit, uAlpha;
void main() {
  vec3 n = normalize(vNor); if (!gl_FrontFacing) n = -n;
  vec3 col = vCol * uTint;
  vec3 light = mix(uGround, uSky, n.y * 0.5 + 0.5) + uSun * max(dot(n, uSunDir), 0.0);
  vec3 c = mix(col * light, col, uUnlit) + uFlash;
  float d = distance(vW, uCam);
  float f = clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(c, uFog, f * (1.0 - uUnlit * 0.6)), uAlpha);
}`;

export class Renderer {
  readonly gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private a: { pos: number; nor: number; col: number };
  proj = mat4(); view = mat4(); vp = mat4();
  cam: [number, number, number] = [0, 0, 0];
  dpr = 1;
  drawCalls = 0;

  constructor(readonly canvas: HTMLCanvasElement, quality: 'low' | 'mid' | 'high' = 'mid') {
    const gl = canvas.getContext('webgl', { antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance' }) as WebGLRenderingContext | null;
    if (!gl) throw new Error("Qurilmangiz WebGL'ni qo'llab-quvvatlamaydi");
    this.gl = gl;
    this.dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'mid' ? 1.5 : 1);
    const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader'); return s; };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    this.prog = p; gl.useProgram(p);
    for (const n of ['uProj', 'uView', 'uModel', 'uSky', 'uGround', 'uSun', 'uSunDir', 'uFog', 'uCam', 'uTint', 'uFlash', 'uFogNear', 'uFogFar', 'uUnlit', 'uAlpha']) this.u[n] = gl.getUniformLocation(p, n);
    this.a = { pos: gl.getAttribLocation(p, 'aPos'), nor: gl.getAttribLocation(p, 'aNor'), col: gl.getAttribLocation(p, 'aCol') };
    gl.enableVertexAttribArray(this.a.pos); gl.enableVertexAttribArray(this.a.nor); gl.enableVertexAttribArray(this.a.col);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  upload(g: Geo): Mesh {
    const gl = this.gl; const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.data), gl.STATIC_DRAW);
    return { buf, count: g.count };
  }
  free(m: Mesh) { this.gl.deleteBuffer(m.buf); }

  resize() {
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.gl.viewport(0, 0, w, h);
  }

  begin(env: Env, eye: [number, number, number], target: [number, number, number], fov = 1.0) {
    const gl = this.gl; this.resize();
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    perspective(this.proj, fov, this.canvas.width / this.canvas.height, 0.1, 400);
    lookAt(this.view, eye[0], eye[1], eye[2], target[0], target[1], target[2]);
    mul(this.vp, this.proj, this.view);
    this.cam = eye;
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uProj!, false, this.proj); gl.uniformMatrix4fv(this.u.uView!, false, this.view);
    gl.uniform3fv(this.u.uSky!, env.sky); gl.uniform3fv(this.u.uGround!, env.ground); gl.uniform3fv(this.u.uSun!, env.sun);
    const L = Math.hypot(...env.sunDir); gl.uniform3f(this.u.uSunDir!, env.sunDir[0] / L, env.sunDir[1] / L, env.sunDir[2] / L);
    gl.uniform3fv(this.u.uFog!, env.fog); gl.uniform1f(this.u.uFogNear!, env.fogNear); gl.uniform1f(this.u.uFogFar!, env.fogFar);
    gl.uniform3fv(this.u.uCam!, eye);
    gl.uniform3f(this.u.uTint!, 1, 1, 1); gl.uniform3f(this.u.uFlash!, 0, 0, 0); gl.uniform1f(this.u.uUnlit!, 0); gl.uniform1f(this.u.uAlpha!, 1);
    this.drawCalls = 0;
  }

  draw(m: Mesh, model: Mat4, opt?: { tint?: [number, number, number]; flash?: number; unlit?: boolean; alpha?: number }) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.u.uModel!, false, model);
    if (opt) {
      gl.uniform3fv(this.u.uTint!, opt.tint ?? [1, 1, 1]);
      const f = opt.flash ?? 0; gl.uniform3f(this.u.uFlash!, f, f * 0.25, f * 0.2);
      gl.uniform1f(this.u.uUnlit!, opt.unlit ? 1 : 0);
      const al = opt.alpha ?? 1; gl.uniform1f(this.u.uAlpha!, al);
      if (al < 1) { gl.enable(gl.BLEND); gl.depthMask(false); }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    gl.vertexAttribPointer(this.a.pos, 3, gl.FLOAT, false, 36, 0);
    gl.vertexAttribPointer(this.a.nor, 3, gl.FLOAT, false, 36, 12);
    gl.vertexAttribPointer(this.a.col, 3, gl.FLOAT, false, 36, 24);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
    this.drawCalls++;
    if (opt) {
      gl.uniform3f(this.u.uTint!, 1, 1, 1); gl.uniform3f(this.u.uFlash!, 0, 0, 0); gl.uniform1f(this.u.uUnlit!, 0); gl.uniform1f(this.u.uAlpha!, 1);
      if ((opt.alpha ?? 1) < 1) { gl.disable(gl.BLEND); gl.depthMask(true); }
    }
  }

  /** dunyo nuqtasini ekran piksellariga (CSS) proyeksiya qiladi */
  project(x: number, y: number, z: number): { x: number; y: number; vis: boolean } {
    const m = this.vp;
    const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    return { x: (cx / cw * 0.5 + 0.5) * this.canvas.clientWidth, y: (1 - (cy / cw * 0.5 + 0.5)) * this.canvas.clientHeight, vis: cw > 0 };
  }
}

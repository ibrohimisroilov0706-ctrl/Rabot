// apps/client/src/g3d/engine/mesh.ts
// Geometriya quruvchi: past-poligonli primitivlar (quti, silindr, konus, shar, bayroq), rang uchlarga yoziladi.
// Statik muhit bitta katta buferga birlashtiriladi (kam draw call -> telefonda tez).

import { compose, mat4, transformDir, transformPoint, type Mat4 } from './math.js';

export type RGB = [number, number, number];
export function hex(c: string): RGB {
  const n = parseInt(c.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const I = mat4();

export class Geo {
  data: number[] = [];
  get count() { return this.data.length / 9; }

  /** uchburchak: uchlar dunyo (yoki m bilan o'zgartirilgan) koordinatalarida, normal avtomatik */
  tri(m: Mat4, a: number[], b: number[], c: number[], col: RGB) {
    const A = transformPoint(m, a[0]!, a[1]!, a[2]!), B = transformPoint(m, b[0]!, b[1]!, b[2]!), C = transformPoint(m, c[0]!, c[1]!, c[2]!);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const P of [A, B, C]) this.data.push(P[0], P[1], P[2], nx, ny, nz, col[0], col[1], col[2]);
  }
  quad(m: Mat4, a: number[], b: number[], c: number[], d: number[], col: RGB) { this.tri(m, a, b, c, col); this.tri(m, a, c, d, col); }

  /** markazi (cx,cy,cz) bo'lgan quti */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: string | RGB, m: Mat4 = I) {
    const col = typeof color === 'string' ? hex(color) : color;
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const top = shadeC(col, 1.06), side = col, bot = shadeC(col, 0.8);
    this.quad(m, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top);
    this.quad(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], bot);
    this.quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], side);
    this.quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], side);
    this.quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], side);
    this.quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], side);
    return this;
  }

  /** silindr/konus: asosi cy da, balandligi h; rTop=0 -> konus */
  cyl(cx: number, cy: number, cz: number, rBot: number, rTop: number, h: number, seg: number, color: string | RGB, m: Mat4 = I, caps = true) {
    const col = typeof color === 'string' ? hex(color) : color;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const b0 = [cx + Math.sin(a0) * rBot, cy, cz + Math.cos(a0) * rBot], b1 = [cx + Math.sin(a1) * rBot, cy, cz + Math.cos(a1) * rBot];
      const t0 = [cx + Math.sin(a0) * rTop, cy + h, cz + Math.cos(a0) * rTop], t1 = [cx + Math.sin(a1) * rTop, cy + h, cz + Math.cos(a1) * rTop];
      if (rTop > 0) this.quad(m, b0, b1, t1, t0, col); else this.tri(m, b0, b1, [cx, cy + h, cz], col);
      if (caps) {
        this.tri(m, [cx, cy, cz], b1, b0, shadeC(col, 0.8));
        if (rTop > 0) this.tri(m, [cx, cy + h, cz], t0, t1, shadeC(col, 1.06));
      }
    }
    return this;
  }

  /** past-poligonli shar (sy - vertikal cho'zish) */
  sphere(cx: number, cy: number, cz: number, r: number, seg: number, color: string | RGB, m: Mat4 = I, sy = 1, latFrom = 0, latTo = 1) {
    const col = typeof color === 'string' ? hex(color) : color;
    const rings = Math.max(3, Math.round(seg / 2));
    const P = (i: number, j: number) => { const th = (j / rings) * Math.PI, ph = (i / seg) * Math.PI * 2; return [cx + Math.sin(th) * Math.sin(ph) * r, cy + Math.cos(th) * r * sy, cz + Math.sin(th) * Math.cos(ph) * r]; };
    for (let j = Math.floor(rings * latFrom); j < Math.ceil(rings * latTo); j++) for (let i = 0; i < seg; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      if (j === 0) this.tri(m, a, c, d, col); else if (j === rings - 1) this.tri(m, a, b, c, col); else this.quad(m, a, b, c, d, col);
    }
    return this;
  }

  /** ikki tomonlama tekis bo'lak (bayroq, mato) */
  plane(pts: number[][], color: string | RGB, m: Mat4 = I) {
    const col = typeof color === 'string' ? hex(color) : color;
    this.quad(m, pts[0]!, pts[1]!, pts[2]!, pts[3]!, col); this.quad(m, pts[3]!, pts[2]!, pts[1]!, pts[0]!, shadeC(col, 0.85));
    return this;
  }

  /** boshqa geometriyani matritsa bilan qo'shish */
  add(g: Geo, m: Mat4 = I) {
    const d = g.data;
    for (let i = 0; i < d.length; i += 9) {
      const p = transformPoint(m, d[i]!, d[i + 1]!, d[i + 2]!), n = transformDir(m, d[i + 3]!, d[i + 4]!, d[i + 5]!);
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      this.data.push(p[0], p[1], p[2], n[0] / l, n[1] / l, n[2] / l, d[i + 6]!, d[i + 7]!, d[i + 8]!);
    }
    return this;
  }
}

export function shadeC(c: RGB, f: number): RGB { return [Math.min(1, c[0] * f), Math.min(1, c[1] * f), Math.min(1, c[2] * f)]; }
export const at = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, s = 1) => compose(mat4(), x, y, z, yaw, pitch, roll, s);

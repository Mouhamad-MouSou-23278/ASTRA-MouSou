import * as THREE from "three";
import type { AstronautState, Frame, TerrainMeta, TimelineData, WorldData } from "../lib/types";

/**
 * The 3D Mars scene.
 *
 * REAL DATA      terrain heights (HiRISE DTM) and surface brightness (HiRISE ortho image).
 * PROCEDURAL     surface colour ramp and fine grain, rocks, lander, astronaut, markers,
 *                sky, haze and lighting. See docs/DATA_PROVENANCE.md.
 *
 * Simulation coordinates are x = east, y = north (metres). In three.js space
 * X = east, Y = up, Z = -north. Headings are compass degrees.
 *
 * The scene is a pure view: it renders whatever frame it is given. Camera
 * changes are local to this browser and never reach the server.
 */

export type CameraMode = "third" | "first" | "overview" | "closeup" | "rover" | "ingenuity";
export type Quality = "high" | "low";

const HORIZON = new THREE.Color(0xd9a57c);
const DECK_H = 1.5;
const HIP_H = 1.0;

/** Screen-space marker that keeps the astronaut findable in the overview camera. */
function locatorSprite(): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.lineWidth = 9;
  ctx.strokeStyle = "rgba(10,8,6,0.9)";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(64, 120); ctx.lineTo(24, 50); ctx.arc(64, 50, 40, Math.PI, 0); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.fillStyle = "#e2733c";
  ctx.beginPath(); ctx.arc(64, 50, 17, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false }));
  sprite.scale.set(0.05, 0.05, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  return sprite;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const angleDiff = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

class HeightGrid {
  constructor(readonly h: Float32Array, readonly n: number, readonly size: number) {}

  static decode(buf: ArrayBuffer, meta: { n: number; size_m: number; min_m: number; max_m: number }): HeightGrid {
    const raw = new Uint16Array(buf);
    const out = new Float32Array(raw.length);
    const k = (meta.max_m - meta.min_m) / 65535;
    for (let i = 0; i < raw.length; i++) out[i] = meta.min_m + raw[i] * k;
    return new HeightGrid(out, meta.n, meta.size_m);
  }

  contains(x: number, y: number): boolean {
    const half = this.size / 2;
    return Math.abs(x) <= half && Math.abs(y) <= half;
  }

  /** Bilinear height at east x / north y. */
  at(x: number, y: number): number {
    const half = this.size / 2;
    const step = this.size / (this.n - 1);
    const col = clamp((x + half) / step, 0, this.n - 1.0001);
    const row = clamp((half - y) / step, 0, this.n - 1.0001);
    const c0 = Math.floor(col), r0 = Math.floor(row);
    const fc = col - c0, fr = row - r0;
    const i = r0 * this.n + c0;
    const top = this.h[i] * (1 - fc) + this.h[i + 1] * fc;
    const bot = this.h[i + this.n] * (1 - fc) + this.h[i + this.n + 1] * fc;
    return top * (1 - fr) + bot * fr;
  }
}

function gridGeometry(grid: HeightGrid, stride: number, skip?: (x0: number, z0: number, x1: number, z1: number) => boolean) {
  const m = Math.floor((grid.n - 1) / stride) + 1;
  const half = grid.size / 2;
  const cell = (grid.size / (grid.n - 1)) * stride;
  const pos = new Float32Array(m * m * 3);
  const uv = new Float32Array(m * m * 2);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const p = j * m + i;
      pos[p * 3] = -half + i * cell;
      pos[p * 3 + 1] = grid.h[j * stride * grid.n + i * stride];
      pos[p * 3 + 2] = -half + j * cell;
      uv[p * 2] = i / (m - 1);
      uv[p * 2 + 1] = 1 - j / (m - 1);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < m - 1; i++) {
      const x0 = -half + i * cell, z0 = -half + j * cell;
      if (skip?.(x0, z0, x0 + cell, z0 + cell)) continue;
      const a = j * m + i, b = a + 1, c = a + m, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
  geo.computeVertexNormals();
  return geo;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

/** Colourise the panchromatic HiRISE image with a regolith ramp; optional fine grain (procedural). */
function colorize(img: HTMLImageElement, size: number, grain: number, rand: () => number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size);
  const px = data.data;
  const stops = [[78, 43, 27], [176, 104, 62], [240, 196, 152]];
  for (let i = 0; i < px.length; i += 4) {
    let l = px[i] / 255;
    if (grain) l = clamp(l + (rand() - 0.5) * grain, 0, 1);
    const s = l < 0.5 ? 0 : 1;
    const t = l < 0.5 ? l * 2 : (l - 0.5) * 2;
    px[i] = lerp(stops[s][0], stops[s + 1][0], t);
    px[i + 1] = lerp(stops[s][1], stops[s + 1][1], t);
    px[i + 2] = lerp(stops[s][2], stops[s + 1][2], t);
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function noiseTexture(size: number, rand: () => number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const data = ctx.createImageData(size, size);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 90 + rand() * 120;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function labelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "600 44px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(10,8,6,0.85)";
  ctx.strokeText(text, 256, 48);
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // sizeAttenuation off: labels keep the same on-screen size from any camera distance.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false, sizeAttenuation: false }));
  sprite.scale.set(0.2, 0.0375, 1);
  sprite.center.set(0.5, 0);
  return sprite;
}

interface Pose {
  bodyY: number; lean: number;
  hipL: number; kneeL: number; hipR: number; kneeR: number;
  shL: number; elL: number; shR: number; elR: number;
}
const STAND: Pose = { bodyY: 0, lean: 0.03, hipL: 0, kneeL: 0.04, hipR: 0, kneeR: 0.04, shL: 0.06, elL: -0.3, shR: 0.06, elR: -0.3 };
const KNEEL: Pose = { bodyY: -0.5, lean: 0.24, hipL: -1.45, kneeL: 1.55, hipR: 0.25, kneeR: 1.32, shL: -0.25, elL: -0.7, shR: -0.2, elR: -0.6 };
const POSE_KEYS = Object.keys(STAND) as (keyof Pose)[];
const mixPose = (a: Pose, b: Pose, t: number): Pose => {
  const out = { ...a };
  for (const k of POSE_KEYS) out[k] = lerp(a[k], b[k], t);
  return out;
};

class Astronaut {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private hipL = new THREE.Group(); private kneeL = new THREE.Group();
  private hipR = new THREE.Group(); private kneeR = new THREE.Group();
  private shL = new THREE.Group(); private elL = new THREE.Group();
  private shR = new THREE.Group(); private elR = new THREE.Group();
  private tool: THREE.Mesh;
  private pose: Pose = { ...STAND };
  phase = 0;

  constructor(envMap: THREE.Texture | null) {
    const suit = new THREE.MeshStandardMaterial({ color: 0xece9e2, roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xd9622b, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.8 });
    const pack = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.7 });
    // The gold visor is a mirror; without an environment to reflect it would render black.
    const visor = new THREE.MeshStandardMaterial({ color: 0xe0ad4a, roughness: 0.16, metalness: 1, envMap, envMapIntensity: 1.35 });
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };
    const limb = (len: number, r: number) => new THREE.CapsuleGeometry(r, len - 2 * r, 4, 10);

    this.root.add(this.body);
    this.body.position.y = HIP_H;
    this.body.add(this.torso, this.hipL, this.hipR);

    // torso, life-support backpack, helmet
    this.torso.add(mesh(new THREE.BoxGeometry(0.52, 0.62, 0.34), suit, 0, 0.33, 0));
    this.torso.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.06), dark, 0, 0.42, 0.19));          // chest control unit
    this.torso.add(mesh(new THREE.BoxGeometry(0.46, 0.66, 0.24), pack, 0, 0.38, -0.28));
    this.torso.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), dark, 0.17, 0.82, -0.3)); // antenna
    this.head.position.set(0, 0.84, 0.02);
    this.head.add(mesh(new THREE.SphereGeometry(0.23, 24, 18), suit));
    this.head.add(mesh(new THREE.SphereGeometry(0.2, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), visor, 0, 0.0, 0.07));
    this.head.children[1].rotation.x = Math.PI / 2;

    // NASA Spacesuit Helmet Headlamp Spotlight
    const headlamp = new THREE.SpotLight(0xfffaec, 2.5, 38, Math.PI / 5, 0.45, 1.2);
    headlamp.position.set(0, 0.12, 0.22);
    const lampTarget = new THREE.Object3D();
    lampTarget.position.set(0, -0.4, 6.0);
    this.head.add(headlamp, lampTarget);
    headlamp.target = lampTarget;

    this.torso.add(this.head);

    // arms
    for (const [sh, el, side] of [[this.shL, this.elL, 1], [this.shR, this.elR, -1]] as const) {
      sh.position.set(0.33 * side, 0.56, 0);
      sh.add(mesh(limb(0.32, 0.085), suit, 0, -0.16, 0));
      sh.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), trim, 0, -0.1, 0));
      el.position.set(0, -0.32, 0);
      el.add(mesh(limb(0.3, 0.075), suit, 0, -0.15, 0));
      el.add(mesh(new THREE.SphereGeometry(0.085, 12, 10), dark, 0, -0.32, 0));
      sh.add(el);
      this.torso.add(sh);
    }
    this.tool = mesh(new THREE.BoxGeometry(0.05, 0.34, 0.09), dark, 0, -0.5, 0.03);   // sampling scoop
    this.tool.visible = false;
    this.elR.add(this.tool);

    // legs
    for (const [hip, knee, side] of [[this.hipL, this.kneeL, 1], [this.hipR, this.kneeR, -1]] as const) {
      hip.position.set(0.14 * side, 0, 0);
      hip.add(mesh(limb(0.48, 0.105), suit, 0, -0.24, 0));
      knee.position.set(0, -0.46, 0);
      knee.add(mesh(limb(0.44, 0.09), suit, 0, -0.22, 0));
      knee.add(mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.05, 12), trim, 0, -0.1, 0));
      knee.add(mesh(new THREE.BoxGeometry(0.17, 0.11, 0.3), dark, 0, -0.485, 0.05));
      hip.add(knee);
    }
  }

  setHeadVisible(visible: boolean): void {
    this.head.visible = visible;
  }

  /** Blend the skeleton toward the pose implied by the simulation state. */
  animate(state: AstronautState, moved: number, dt: number, clock: number): void {
    let target: Pose;
    const p = state.pose;
    this.tool.visible = p === "collect";
    if (p === "walk" || p === "egress" || p === "turn") {
      this.phase += p === "turn" ? dt * 5 : (moved / 0.72) * Math.PI;
      const amp = p === "turn" ? 0.18 : 0.46;
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      target = {
        bodyY: 0.025 * Math.abs(c) - 0.01, lean: p === "turn" ? 0.03 : 0.09,
        hipL: -amp * s, kneeL: 0.12 + 0.75 * amp * Math.max(0, c),
        hipR: amp * s, kneeR: 0.12 + 0.75 * amp * Math.max(0, -c),
        shL: 0.32 * amp * 2 * s, elL: -0.5, shR: -0.32 * amp * 2 * s, elR: -0.5,
      };
    } else if (p === "kneel_down") {
      target = mixPose(STAND, KNEEL, smooth(clamp(state.pose_t * 1.15, 0, 1)));
    } else if (p === "stand_up") {
      target = mixPose(KNEEL, STAND, smooth(clamp(state.pose_t * 1.15, 0, 1)));
    } else if (p === "kneeling") {
      target = KNEEL;
    } else if (p === "collect") {
      const w = Math.sin(clock * 3.2);
      target = { ...KNEEL, lean: 0.46 + 0.05 * w, shR: -0.95 + 0.3 * w, elR: -0.55 - 0.3 * Math.sin(clock * 3.2 + 1.1),
                 shL: -0.4, elL: -0.9 };
    } else {
      const breathe = Math.sin(clock * 1.4) * 0.008;
      target = { ...STAND, bodyY: breathe, shL: 0.06 + breathe * 2, shR: 0.06 - breathe * 2 };
    }
    const k = 1 - Math.exp(-dt * 11);
    for (const key of POSE_KEYS) this.pose[key] = lerp(this.pose[key], target[key], k);
    const q = this.pose;
    this.body.position.y = HIP_H + q.bodyY;
    this.torso.rotation.x = q.lean;
    this.hipL.rotation.x = q.hipL; this.kneeL.rotation.x = q.kneeL;
    this.hipR.rotation.x = q.hipR; this.kneeR.rotation.x = q.kneeR;
    this.shL.rotation.x = q.shL; this.elL.rotation.x = q.elL;
    this.shR.rotation.x = q.shR; this.elR.rotation.x = q.elR;
  }
}

/** NASA Mars 2020 Perseverance Rover procedural 3D model */
class PerseveranceRover {
  readonly root = new THREE.Group();
  private mast = new THREE.Group();
  private wheels: THREE.Mesh[] = [];

  constructor(envMap: THREE.Texture | null) {
    const white = new THREE.MeshStandardMaterial({ color: 0xefede8, roughness: 0.65 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4aa3c, roughness: 0.35, metalness: 0.85, envMap, envMapIntensity: 1.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24282f, roughness: 0.75, metalness: 0.6 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.85, metalness: 0.4 });
    const lens = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9, envMap });

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      return m;
    };

    // Main Chassis
    const chassis = mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), white, 0, 0.7, 0);
    this.root.add(chassis);

    // MMRTG (Radioisotope Thermoelectric Generator at rear)
    const rtg = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 12), dark, 0, 0.9, -1.3);
    rtg.rotation.x = Math.PI / 4;
    this.root.add(rtg);

    // High Gain Antenna (Hexagonal Dish)
    const hga = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 6), white, 0.45, 1.15, -0.4);
    hga.rotation.x = 0.3;
    this.root.add(hga);

    // Remote Sensing Mast (RSM)
    this.mast.position.set(-0.5, 1.0, 0.8);
    const mastPole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), dark, 0, 0.6, 0);
    const mastHead = mesh(new THREE.BoxGeometry(0.28, 0.22, 0.25), white, 0, 1.25, 0);
    const superCamLens = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12), lens, 0, 1.25, 0.14);
    superCamLens.rotation.x = Math.PI / 2;
    this.mast.add(mastPole, mastHead, superCamLens);
    this.root.add(this.mast);

    // Robotic Arm (with drill turret & PIXL/SHERLOC instruments)
    const armGroup = new THREE.Group();
    armGroup.position.set(0.55, 0.65, 1.0);
    const arm1 = mesh(new THREE.BoxGeometry(0.08, 0.08, 0.6), dark, 0, 0, 0.3);
    const turret = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 12), gold, 0, -0.15, 0.6);
    armGroup.add(arm1, turret);
    this.root.add(armGroup);

    // 6-Wheel Rocker-Bogie Suspension
    const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.22, 16);
    const wheelOffsets: [number, number, number][] = [
      [-0.95, 0.26, 0.9],
      [0.95, 0.26, 0.9],
      [-1.05, 0.26, 0.0],
      [1.05, 0.26, 0.0],
      [-0.95, 0.26, -0.9],
      [0.95, 0.26, -0.9],
    ];
    for (const [wx, wy, wz] of wheelOffsets) {
      const w = mesh(wheelGeo, wheelMat, wx, wy, wz);
      w.rotation.z = Math.PI / 2;
      this.wheels.push(w);
      this.root.add(w);
    }
  }

  animate(clock: number): void {
    this.mast.rotation.y = Math.sin(clock * 0.45) * 0.4;
  }
}

/** NASA Ingenuity Mars Helicopter (Ginny) procedural 3D model */
class IngenuityHelicopter {
  readonly root = new THREE.Group();
  private rotorTop = new THREE.Group();
  private rotorBottom = new THREE.Group();
  isFlying = true;

  constructor() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.8 });
    const solarMat = new THREE.MeshStandardMaterial({ color: 0x1a284e, roughness: 0.3, metalness: 0.8 });
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6, metalness: 0.7 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc89d38, roughness: 0.4, metalness: 0.85 });

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      return m;
    };

    // Fuselage
    const body = mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), gold, 0, 0.3, 0);
    this.root.add(body);

    // Solar Panel on top
    const solar = mesh(new THREE.BoxGeometry(0.3, 0.015, 0.16), solarMat, 0, 0.72, 0);
    this.root.add(solar);

    // Mast
    const mast = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 8), dark, 0, 0.5, 0);
    this.root.add(mast);

    // 4 Carbon-Composite Landing Legs
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const leg = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.42, 6), dark, Math.cos(angle) * 0.18, 0.14, Math.sin(angle) * 0.18);
      leg.rotation.z = Math.cos(angle) * 0.55;
      leg.rotation.x = Math.sin(angle) * -0.55;
      this.root.add(leg);
    }

    // Coaxial Counter-Rotating Blades
    const bladeGeo = new THREE.BoxGeometry(1.1, 0.008, 0.06);
    this.rotorBottom.position.y = 0.52;
    this.rotorBottom.add(mesh(bladeGeo, bladeMat));
    this.rotorTop.position.y = 0.64;
    this.rotorTop.add(mesh(bladeGeo, bladeMat));

    this.root.add(this.rotorBottom, this.rotorTop);
  }

  animate(dt: number, clock: number): void {
    if (this.isFlying) {
      this.rotorBottom.rotation.y += dt * 40;
      this.rotorTop.rotation.y -= dt * 40;
      this.root.position.y += Math.sin(clock * 3.2) * 0.003;
    }
  }
}

/** Mars Jezero Dust Devil Particle Vortex */
class DustDevilVortex {
  readonly root = new THREE.Group();
  private points: THREE.Points;
  private velocities: Float32Array;

  constructor() {
    const count = 350;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const h = Math.random() * 45;
      const radius = 0.6 + (h / 45) * 6.0;
      const angle = Math.random() * Math.PI * 2;

      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = Math.sin(angle) * radius;

      const c = 0.75 + Math.random() * 0.25;
      colors[i * 3] = c;
      colors[i * 3 + 1] = c * 0.6;
      colors[i * 3 + 2] = c * 0.4;

      this.velocities[i * 3] = angle;
      this.velocities[i * 3 + 1] = 2.5 + Math.random() * 4.5;
      this.velocities[i * 3 + 2] = radius;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.42,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      fog: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.root.add(this.points);
  }

  animate(dt: number): void {
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let angle = this.velocities[i * 3] + dt * 6.5;
      this.velocities[i * 3] = angle;
      let y = pos.getY(i) + this.velocities[i * 3 + 1] * dt;
      if (y > 45) y = 0.3;
      const radius = 0.6 + (y / 45) * 6.0;

      pos.setXYZ(i, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
    pos.needsUpdate = true;
  }
}

export interface SceneOptions {
  terrain: TerrainMeta;
  world: WorldData;
  timeline: TimelineData;
  quality: Quality;
  onQuality?: (q: Quality) => void;
}

export class MarsScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 9000);
  private sun = new THREE.DirectionalLight(0xfff0dc, 3.1);
  private sky!: THREE.Mesh;
  private near!: HeightGrid;
  private far!: HeightGrid;
  private astronaut!: Astronaut;
  private envMap: THREE.Texture | null = null;
  private locator = locatorSprite();
  private hatch!: THREE.Mesh;
  private trail!: THREE.Mesh;
  private trailLine!: THREE.Line;
  private dig!: THREE.Mesh;
  private ring: THREE.Mesh | null = null;
  private disposables: { dispose(): void }[] = [];
  private raf = 0;
  private last = -1;
  private clock = 0;
  private disposed = false;
  private quality: Quality;

  private prev: AstronautState | null = null;
  private curr: AstronautState | null = null;
  private setAt = 0;
  private interval = 500;
  private pos = new THREE.Vector3();
  private heading = 90;
  private camHeading = 90;
  private drawn = { x: 0, z: 0 };

  private mode: CameraMode = "third";
  private cams: Record<CameraMode, { yaw: number; pitch: number; dist: number }> = {
    third: { yaw: 0, pitch: 0.3, dist: 7.5 },
    first: { yaw: 0, pitch: -0.04, dist: 0 },
    overview: { yaw: 0.7, pitch: 0.85, dist: 200 },
    closeup: { yaw: 2.55, pitch: 0.1, dist: 3.4 },
    rover: { yaw: 0.6, pitch: 0.35, dist: 5.5 },
    ingenuity: { yaw: 0.2, pitch: 0.45, dist: 3.8 },
  };
  private camPos = new THREE.Vector3(12, 6, 12);
  private camTarget = new THREE.Vector3();
  private overviewCenter = new THREE.Vector3();
  private overviewDist = 200;
  private frames = 0;
  private slowMs = 0;

  // NASA Graphics Upgrades
  private dustParticles?: THREE.Points;
  private dustVelocities = new Float32Array(0);
  private stormMode: "clear" | "hazy" | "storm" = "clear";
  private instrumentsGroup = new THREE.Group();
  private contourMesh?: THREE.LineSegments;
  private rover!: PerseveranceRover;
  private helicopter!: IngenuityHelicopter;
  private dustDevil!: DustDevilVortex;

  constructor(private canvas: HTMLCanvasElement, private opts: SceneOptions) {
    this.quality = opts.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;   // keeps the sky shader and the fog colour identical
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyQuality();
    this.scene.fog = new THREE.Fog(HORIZON, 120, 1750);
    this.scene.background = HORIZON;
    this.bindPointer();
  }

  // ------------------------------------------------------------------ loading
  async load(): Promise<void> {
    const t = this.opts.terrain;
    const [nearBuf, farBuf, nearImg, farImg] = await Promise.all([
      fetch(`/terrain/${t.near.file}`).then((r) => { if (!r.ok) throw new Error("terrain heights missing"); return r.arrayBuffer(); }),
      fetch(`/terrain/${t.far.file}`).then((r) => { if (!r.ok) throw new Error("terrain heights missing"); return r.arrayBuffer(); }),
      loadImage(`/terrain/${t.near.texture}`),
      loadImage(`/terrain/${t.far.texture}`),
    ]);
    if (this.disposed) return;
    this.near = HeightGrid.decode(nearBuf, t.near);
    this.far = HeightGrid.decode(farBuf, t.far);
    const rand = mulberry32(20260218);

    // --- terrain: real HiRISE topography ----------------------------------
    const nearTex = colorize(nearImg, 2048, 0.07, rand);
    const farTex = colorize(farImg, 2048, 0, rand);
    const bump = noiseTexture(256, rand);
    bump.repeat.set(170, 170);
    const nearMat = new THREE.MeshStandardMaterial({ map: nearTex, bumpMap: bump, bumpScale: 0.9, roughness: 1 });
    const farMat = new THREE.MeshStandardMaterial({ map: farTex, roughness: 1 });
    const nearMesh = new THREE.Mesh(gridGeometry(this.near, this.quality === "high" ? 1 : 2), nearMat);
    nearMesh.receiveShadow = true;
    // The near patch replaces the far cells it covers; its border was blended onto
    // the far surface by the terrain builder, so the two meshes meet without cracks.
    const halfNear = this.near.size / 2 + 0.01;
    const farMesh = new THREE.Mesh(
      gridGeometry(this.far, 1, (x0, z0, x1, z1) => x0 >= -halfNear && x1 <= halfNear && z0 >= -halfNear && z1 <= halfNear),
      farMat,
    );
    this.scene.add(nearMesh, farMesh);
    this.disposables.push(nearTex, farTex, bump, nearMat, farMat, nearMesh.geometry, farMesh.geometry);

    this.buildSky();
    this.buildLights();
    this.buildEnvironment();
    this.buildRocks(rand);
    this.buildLander();
    this.buildMarkers();
    this.buildAtmosphericDust();
    this.buildScientificInstruments();

    // NASA Mars 2020 Perseverance Rover
    const l = this.opts.world.lander;
    this.rover = new PerseveranceRover(this.envMap);
    const roverX = l.x - 17.5, roverY = l.y + 14.0;
    const roverGround = this.heightAt(roverX, roverY);
    this.rover.root.position.set(roverX, roverGround, -roverY);
    this.rover.root.rotation.y = 0.85;
    const roverLabel = labelSprite("NASA Perseverance Rover", "#ffffff");
    roverLabel.position.set(roverX, roverGround + 2.5, -roverY);
    this.scene.add(this.rover.root, roverLabel);

    // NASA Titanium Sample Caching Tube
    const tubeGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 12);
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xe0b246, metalness: 0.9, roughness: 0.2, envMap: this.envMap });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(roverX + 1.4, this.heightAt(roverX + 1.4, roverY + 0.6) + 0.04, -(roverY + 0.6));
    const tubeLabel = labelSprite("NASA Sample Tube #04", "#ffd276");
    tubeLabel.position.set(roverX + 1.4, this.heightAt(roverX + 1.4, roverY + 0.6) + 0.6, -(roverY + 0.6));
    this.scene.add(tube, tubeLabel);

    // NASA Ingenuity Mars Helicopter (hovering reconnaissance view)
    this.helicopter = new IngenuityHelicopter();
    const heliX = l.x - 24.0, heliY = l.y + 22.0;
    const heliGround = this.heightAt(heliX, heliY);
    this.helicopter.root.position.set(heliX, heliGround + 3.2, -heliY);
    const heliLabel = labelSprite("NASA Ingenuity Helicopter", "#9fe8ff");
    heliLabel.position.set(heliX, heliGround + 4.2, -heliY);
    this.scene.add(this.helicopter.root, heliLabel);

    // Jezero Basin Dust Devil Vortex
    this.dustDevil = new DustDevilVortex();
    const devilX = l.x + 95.0, devilY = l.y + 115.0;
    this.dustDevil.root.position.set(devilX, this.heightAt(devilX, devilY), -devilY);
    this.scene.add(this.dustDevil.root);

    this.astronaut = new Astronaut(this.envMap);
    this.scene.add(this.astronaut.root, this.locator);
    this.astronaut.root.visible = false;
    this.locator.visible = false;

    const path = this.opts.timeline.path;
    const pts = path.length ? path : [[0, 0] as [number, number]];
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x; cy += y; }
    cx /= pts.length; cy /= pts.length;
    this.overviewCenter.set(cx, this.heightAt(cx, cy), -cy);
    let reach = 60;
    for (const [x, y] of pts) reach = Math.max(reach, Math.hypot(x - cx, y - cy));
    this.cams.overview.dist = this.overviewDist = clamp(reach * 2.0, 80, 520);

    const door = this.doorPosition();
    this.pos.set(door.x, this.deckY(), door.z);
    this.heading = this.camHeading = this.opts.world.lander.hatch_heading;
    this.camTarget.copy(this.pos);
    this.camPos.set(this.pos.x + 14, this.pos.y + 7, this.pos.z + 14);
    this.resize();
    this.last = -1;
    this.raf = requestAnimationFrame(this.tick);
  }

  private heightAt(x: number, y: number): number {
    return this.near.contains(x, y) ? this.near.at(x, y) : this.far.at(x, y);
  }

  private deckY(): number {
    const l = this.opts.world.lander;
    return this.heightAt(l.x, l.y) + DECK_H;
  }

  private forward(headingDeg: number): THREE.Vector3 {
    const r = THREE.MathUtils.degToRad(headingDeg);
    return new THREE.Vector3(Math.sin(r), 0, -Math.cos(r));
  }

  private doorPosition(): THREE.Vector3 {
    const l = this.opts.world.lander;
    const f = this.forward(l.hatch_heading);
    return new THREE.Vector3(l.x + f.x * 1.6, 0, -l.y + f.z * 1.6);
  }

  private buildSky(): void {
    const geo = new THREE.SphereGeometry(7000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { horizon: { value: HORIZON }, zenith: { value: new THREE.Color(0x9a6f55) }, sunDir: { value: new THREE.Vector3() } },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = mix(horizon, zenith, pow(max(d.y, 0.0), 0.55));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(0.42, 0.5, 0.62) * pow(s, 10.0) * 0.28;   // bluish forward-scatter glow around the sun
          col += vec3(1.0, 0.97, 0.92) * pow(s, 900.0) * 2.0;   // solar disc
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;

    // Mars Moon 1: Phobos (triaxial asteroid shape)
    const phobosGeo = new THREE.DodecahedronGeometry(45, 1);
    const pPos = phobosGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pPos.count; i++) {
      pPos.setXYZ(i, pPos.getX(i) * 1.35, pPos.getY(i) * 0.9, pPos.getZ(i) * 1.15);
    }
    phobosGeo.computeVertexNormals();
    const phobosMat = new THREE.MeshBasicMaterial({ color: 0xb5aba2, fog: false });
    const phobos = new THREE.Mesh(phobosGeo, phobosMat);
    phobos.position.set(1600, 2400, -3200);
    this.sky.add(phobos);

    // Mars Moon 2: Deimos (small orbital point)
    const deimosGeo = new THREE.SphereGeometry(18, 8, 8);
    const deimosMat = new THREE.MeshBasicMaterial({ color: 0xd4ccc4, fog: false });
    const deimos = new THREE.Mesh(deimosGeo, deimosMat);
    deimos.position.set(-2400, 3100, -2600);
    this.sky.add(deimos);

    this.scene.add(this.sky);
    this.disposables.push(geo, mat, phobosGeo, phobosMat, deimosGeo, deimosMat);
  }

  private buildLights(): void {
    const dir = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();   // sun in the south-west, mid-afternoon
    (this.sky.material as THREE.ShaderMaterial).uniforms.sunDir.value.copy(dir);
    this.sun.userData.dir = dir;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -36; cam.right = cam.top = 36; cam.near = 1; cam.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xe8c4a4, 0x6b3d28, 1.15));
  }

  /** Prefiltered copy of the sky, reflected by the metallic materials (visor, foil, panels). */
  private buildEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(this.sky.geometry, this.sky.material));
    this.envMap = pmrem.fromScene(envScene, 0, 1, 10000).texture;
    pmrem.dispose();
    this.disposables.push(this.envMap);
  }

  private buildRocks(rand: () => number): void {
    const count = this.quality === "high" ? 1500 : 600;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.75 + rand() * 0.5), p.getY(i) * (0.5 + rand() * 0.4), p.getZ(i) * (0.75 + rand() * 0.5));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    const rocks = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    const color = new THREE.Color();
    const path = this.opts.timeline.path;
    const l = this.opts.world.lander;
    for (let i = 0; i < count; i++) {
      let x: number, y: number;
      if (i % 3 === 0 && path.length > 1) {          // a third of the rocks line the route for scale cues
        const k = Math.floor(rand() * (path.length - 1));
        const t = rand();
        x = lerp(path[k][0], path[k + 1][0], t) + (rand() - 0.5) * 36;
        y = lerp(path[k][1], path[k + 1][1], t) + (rand() - 0.5) * 36;
      } else {
        x = (rand() - 0.5) * 470;
        y = (rand() - 0.5) * 470;
      }
      if (Math.hypot(x - l.x, y - l.y) < 9) { x += 14; y -= 11; }
      const size = 0.05 + Math.pow(rand(), 3.2) * 0.75;
      v.set(x, this.near.at(x, y) + size * 0.18, -y);
      q.setFromEuler(new THREE.Euler(rand() * 0.6, rand() * 6.28, rand() * 0.6));
      s.setScalar(size);
      rocks.setMatrixAt(i, m.compose(v, q, s));
      const shade = 0.32 + rand() * 0.26;
      rocks.setColorAt(i, color.setRGB(shade * 1.08, shade * 0.74, shade * 0.6));
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.scene.add(rocks);
    this.disposables.push(geo, mat);
  }

  private buildLander(): void {
    const l = this.opts.world.lander;
    const g = new THREE.Group();
    const ground = this.heightAt(l.x, l.y);
    g.position.set(l.x, ground, -l.y);
    g.rotation.y = Math.PI - THREE.MathUtils.degToRad(l.hatch_heading);   // local +Z = hatch direction
    const env = this.envMap;
    const foil = new THREE.MeshStandardMaterial({ color: 0xd4aa3c, roughness: 0.42, metalness: 0.8, envMap: env, envMapIntensity: 1.4 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e3dc, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.75, metalness: 0.3 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x24397a, roughness: 0.3, metalness: 0.7, envMap: env, envMapIntensity: 1.2 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x9fe8ff, emissiveIntensity: 1.6 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      this.disposables.push(geo);
      return mesh;
    };
    add(new THREE.CylinderGeometry(2.5, 2.7, 0.22, 8), dark, 0, DECK_H - 0.11, 0);              // deck
    add(new THREE.CylinderGeometry(1.35, 1.5, 2.1, 8), foil, 0, DECK_H + 1.05, -0.2);            // crew cabin
    add(new THREE.CylinderGeometry(0.75, 1.35, 0.55, 8), white, 0, DECK_H + 2.37, -0.2);
    add(new THREE.CylinderGeometry(1.0, 0.5, 0.7, 12), dark, 0, DECK_H - 0.55, 0);              // descent engine
    add(new THREE.BoxGeometry(1.02, 1.75, 0.1), dark, 0, DECK_H + 0.92, 1.2);                   // hatch frame
    this.hatch = add(new THREE.BoxGeometry(0.86, 1.6, 0.08), white, 0, DECK_H + 0.86, 1.27);     // hatch door (slides up)
    add(new THREE.BoxGeometry(0.9, 0.05, 0.05), glow, 0, DECK_H + 1.83, 1.27);
    for (const side of [-1, 1]) {                                                               // solar wings
      add(new THREE.BoxGeometry(2.6, 0.05, 1.3), panel, side * 3.1, DECK_H + 1.5, -0.4).rotation.z = side * -0.18;
      add(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), dark, side * 1.7, DECK_H + 1.45, -0.4).rotation.z = Math.PI / 2;
    }
    const dish = add(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), white, -0.6, DECK_H + 3.0, -0.6);
    dish.rotation.x = Math.PI * 0.82;
    add(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), dark, 0.7, DECK_H + 3.2, -0.5);          // instrument mast
    add(new THREE.BoxGeometry(0.22, 0.14, 0.14), dark, 0.7, DECK_H + 3.95, -0.5);
    for (let i = 0; i < 4; i++) {                                                               // landing legs on real terrain
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const lx = Math.sin(a) * 3.3, lz = Math.cos(a) * 3.3;
      const world = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y);
      const padY = this.heightAt(l.x + world.x, l.y - world.z) - ground;
      add(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12), dark, lx, padY + 0.04, lz);
      const top = new THREE.Vector3(Math.sin(a) * 2.2, DECK_H - 0.1, Math.cos(a) * 2.2);
      const bottom = new THREE.Vector3(lx, padY + 0.08, lz);
      const strut = add(new THREE.CylinderGeometry(0.07, 0.07, top.distanceTo(bottom), 8), white, 0, 0, 0);
      strut.position.copy(top).add(bottom).multiplyScalar(0.5);
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bottom.clone().sub(top).normalize());
    }
    // egress ramp from the deck to the real ground at the ramp foot
    const f = this.forward(l.hatch_heading);
    const footGround = this.heightAt(l.x + f.x * 6.2, l.y - f.z * 6.2) - ground;
    const run = 4.6, drop = DECK_H - footGround;
    const ramp = add(new THREE.BoxGeometry(1.25, 0.07, Math.hypot(run, drop)), white, 0, DECK_H - drop / 2 - 0.04, 1.6 + run / 2);
    ramp.rotation.x = Math.atan2(drop, run);
    for (const side of [-1, 1]) {
      const rail = add(new THREE.BoxGeometry(0.04, 0.04, Math.hypot(run, drop)), dark, side * 0.62, DECK_H - drop / 2 + 0.85, 1.6 + run / 2);
      rail.rotation.x = Math.atan2(drop, run);
    }
    this.scene.add(g);
    this.disposables.push(foil, white, dark, panel, glow);
  }

  private buildAtmosphericDust(): void {
    const count = this.quality === "high" ? 750 : 320;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.dustVelocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 360;
      positions[i * 3 + 1] = Math.random() * 32 + 0.3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 360;

      const c = 0.72 + Math.random() * 0.28;
      colors[i * 3] = c;
      colors[i * 3 + 1] = c * 0.65;
      colors[i * 3 + 2] = c * 0.45;

      this.dustVelocities[i * 3] = 1.4 + Math.random() * 2.8;
      this.dustVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
      this.dustVelocities[i * 3 + 2] = -0.6 + (Math.random() - 0.5) * 1.5;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      fog: true,
      sizeAttenuation: true,
    });

    this.dustParticles = new THREE.Points(geo, mat);
    this.scene.add(this.dustParticles);
    this.disposables.push(geo, mat);
  }

  private updateDustParticles(dt: number): void {
    if (!this.dustParticles) return;
    const pos = this.dustParticles.geometry.attributes.position as THREE.BufferAttribute;
    const mult = this.stormMode === "storm" ? 4.8 : this.stormMode === "hazy" ? 2.2 : 0.9;
    for (let i = 0; i < pos.count; i++) {
      let px = pos.getX(i) + this.dustVelocities[i * 3] * dt * mult;
      let py = pos.getY(i) + this.dustVelocities[i * 3 + 1] * dt * mult;
      let pz = pos.getZ(i) + this.dustVelocities[i * 3 + 2] * dt * mult;

      if (px > 180) px = -180;
      if (py < 0.2) py = 32;
      if (py > 35) py = 0.5;
      if (pz > 180) pz = -180;
      if (pz < -180) pz = 180;

      pos.setXYZ(i, px, py, pz);
    }
    pos.needsUpdate = true;
  }

  private buildScientificInstruments(): void {
    const l = this.opts.world.lander;
    const g = this.instrumentsGroup;
    this.scene.add(g);

    const foil = new THREE.MeshStandardMaterial({ color: 0xd4aa3c, roughness: 0.35, metalness: 0.85, envMap: this.envMap });
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e3dc, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.7, metalness: 0.5 });
    const glowBlue = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x4dc9f0, emissiveIntensity: 1.8 });

    // 1. MEDA Environmental Station (Mars Environmental Dynamics Analyzer)
    const medaX = l.x + 8.5, medaY = l.y + 6.0;
    const medaGround = this.heightAt(medaX, medaY);
    const medaMast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.8, 8), dark);
    medaMast.position.set(medaX, medaGround + 1.4, -medaY);
    const medaHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.28), white);
    medaHead.position.set(medaX, medaGround + 2.7, -medaY);
    const medaLabel = labelSprite("NASA MEDA Weather Mast", "#4dc9f0");
    medaLabel.position.set(medaX, medaGround + 3.2, -medaY);
    g.add(medaMast, medaHead, medaLabel);

    // 2. MOXIE Oxygen In-Situ Resource Generator
    const moxX = l.x + 7.0, moxY = l.y - 7.5;
    const moxGround = this.heightAt(moxX, moxY);
    const moxBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.6), foil);
    moxBox.position.set(moxX, moxGround + 0.35, -moxY);
    const moxVent = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 12), glowBlue);
    moxVent.position.set(moxX, moxGround + 0.75, -moxY);
    const moxLabel = labelSprite("NASA MOXIE O2 Unit", "#e0ad4a");
    moxLabel.position.set(moxX, moxGround + 1.3, -moxY);
    g.add(moxBox, moxVent, moxLabel);

    // 3. RIMFAX Subsurface Radar Antenna
    const rimX = l.x - 9.0, rimY = l.y + 7.0;
    const rimGround = this.heightAt(rimX, rimY);
    const rimAnt = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.4), dark);
    rimAnt.position.set(rimX, rimGround + 0.4, -rimY);
    rimAnt.rotation.y = 0.4;
    const rimLabel = labelSprite("NASA RIMFAX Radar", "#80e0a0");
    rimLabel.position.set(rimX, rimGround + 1.1, -rimY);
    g.add(rimAnt, rimLabel);

    // 4. Radioisotope Thermoelectric Generator (RTG)
    const rtgX = l.x - 14.0, rtgY = l.y - 4.0;
    const rtgGround = this.heightAt(rtgX, rtgY);
    const rtgCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 16), dark);
    rtgCyl.position.set(rtgX, rtgGround + 0.55, -rtgY);
    const rtgLabel = labelSprite("RTG Power Unit", "#ffaa44");
    rtgLabel.position.set(rtgX, rtgGround + 1.6, -rtgY);
    g.add(rtgCyl, rtgLabel);

    this.disposables.push(foil, white, dark, glowBlue);
  }

  setDustStorm(level: "clear" | "hazy" | "storm"): void {
    this.stormMode = level;
    const fog = this.scene.fog as THREE.Fog;
    const skyMat = this.sky.material as THREE.ShaderMaterial;

    if (level === "clear") {
      fog.near = 120;
      fog.far = 1750;
      fog.color.copy(HORIZON);
      skyMat.uniforms.horizon.value.copy(HORIZON);
      if (this.dustParticles) (this.dustParticles.material as THREE.PointsMaterial).opacity = 0.35;
    } else if (level === "hazy") {
      fog.near = 60;
      fog.far = 850;
      const hazeColor = new THREE.Color(0xcfa07a);
      fog.color.copy(hazeColor);
      skyMat.uniforms.horizon.value.copy(hazeColor);
      if (this.dustParticles) (this.dustParticles.material as THREE.PointsMaterial).opacity = 0.70;
    } else if (level === "storm") {
      fog.near = 15;
      fog.far = 280;
      const stormColor = new THREE.Color(0xb8734a);
      fog.color.copy(stormColor);
      skyMat.uniforms.horizon.value.copy(stormColor);
      if (this.dustParticles) (this.dustParticles.material as THREE.PointsMaterial).opacity = 0.95;
    }
  }

  setContours(enabled: boolean): void {
    if (enabled && !this.contourMesh && this.near) {
      const geo = new THREE.WireframeGeometry(gridGeometry(this.near, 2));
      const mat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.28, fog: true });
      this.contourMesh = new THREE.LineSegments(geo, mat);
      this.contourMesh.position.y += 0.08;
      this.scene.add(this.contourMesh);
      this.disposables.push(geo, mat);
    }
    if (this.contourMesh) {
      this.contourMesh.visible = enabled;
    }
  }

  setInstrumentsVisible(visible: boolean): void {
    this.instrumentsGroup.visible = visible;
  }

  private ribbon(points: [number, number][], width: number, lift: number): THREE.BufferGeometry {
    const dense: [number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i], [x1, y1] = points[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.0));
      for (let k = 0; k < n; k++) dense.push([lerp(x0, x1, k / n), lerp(y0, y1, k / n)]);
    }
    if (points.length) dense.push(points[points.length - 1]);
    const pos: number[] = [], index: number[] = [];
    for (let i = 0; i < dense.length; i++) {
      const [x, y] = dense[i];
      const [ax, ay] = dense[Math.max(0, i - 1)], [bx, by] = dense[Math.min(dense.length - 1, i + 1)];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = (-(by - ay) / len) * width * 0.5, ny = ((bx - ax) / len) * width * 0.5;
      const h = this.heightAt(x, y) + lift;
      pos.push(x + nx, h, -(y + ny), x - nx, h, -(y - ny));
      if (i < dense.length - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    return geo;
  }

  private polyline(points: [number, number][], lift: number): THREE.BufferGeometry {
    const pos: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[Math.min(i + 1, points.length - 1)];
      const n = i < points.length - 1 ? Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2)) : 1;
      for (let k = 0; k < n; k++) {
        const x = lerp(x0, x1, k / n), y = lerp(y0, y1, k / n);
        pos.push(x, this.heightAt(x, y) + lift, -y);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return geo;
  }

  private buildMarkers(): void {
    const { world, timeline } = this.opts;
    const flat = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, fog: true });
    // planned route
    const pathMat = flat(0x4dc9f0, 0.55);
    const route = new THREE.Mesh(this.ribbon(timeline.path, 0.35, 0.12), pathMat);
    // One-pixel lines stay visible from the overview camera, where the ribbons become sub-pixel.
    const routeLineMat = new THREE.LineBasicMaterial({ color: 0x9fe8ff, fog: false });
    const routeLine = new THREE.Line(this.polyline(timeline.path, 0.3), routeLineMat);
    const trailLineMat = new THREE.LineBasicMaterial({ color: 0xffb070, fog: false });
    this.trailLine = new THREE.Line(new THREE.BufferGeometry(), trailLineMat);
    this.scene.add(route, routeLine, this.trailLine);
    this.disposables.push(routeLineMat, trailLineMat, routeLine.geometry);
    // travelled trail (grows during the run)
    const trailMat = flat(0xffa55c, 0.9);
    this.trail = new THREE.Mesh(new THREE.BufferGeometry(), trailMat);
    this.scene.add(this.trail);
    // sample excavation mark
    const digGeo = new THREE.CircleGeometry(0.55, 20);
    const digMat = flat(0x2a160d, 0);
    this.dig = new THREE.Mesh(digGeo, digMat);
    this.dig.rotation.x = -Math.PI / 2;
    this.dig.visible = false;
    this.scene.add(this.dig);
    this.disposables.push(pathMat, route.geometry, trailMat, digGeo, digMat);

    const onPath = new Set(timeline.segments.map((s) => s.waypoint).filter(Boolean));
    // Marker poles stand 1.6 m to the right of the arriving path, so the astronaut never walks into one.
    const side = new Map<string, [number, number]>();
    for (const s of timeline.segments) {
      if (!s.waypoint) continue;
      const dx = s.to[0] - s.from[0], dy = s.to[1] - s.from[1];
      const len = Math.hypot(dx, dy) || 1;
      side.set(s.waypoint, [(dy / len) * 1.6, (-dx / len) * 1.6]);
    }
    const poleGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6);
    const beaconGeo = new THREE.SphereGeometry(0.16, 12, 10);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.6 });
    this.disposables.push(poleGeo, beaconGeo, poleMat);
    for (const w of world.waypoints) {
      const active = onPath.has(w.key);
      const hex = w.kind === "sample_site" ? 0xff8a3d : active ? 0x4dc9f0 : 0x9aa3ad;
      const [ox, oy] = side.get(w.key) ?? [1.6, 0];
      const px = w.x + ox, py = w.y + oy;
      const ground = this.heightAt(px, py);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(px, ground + 1.2, -py);
      pole.castShadow = true;
      const beaconMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: hex, emissiveIntensity: active ? 2.2 : 0.7 });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(px, ground + 2.5, -py);
      const label = labelSprite(w.name, "#" + hex.toString(16).padStart(6, "0"));
      label.position.set(px, ground + 2.85, -py);
      this.scene.add(pole, beacon, label);
      this.disposables.push(beaconMat, label.material, (label.material as THREE.SpriteMaterial).map!);
      if (w.kind === "sample_site") {
        const ringGeo = new THREE.RingGeometry(2.6, 3.0, 48);
        const ringMat = flat(0xff8a3d, 0.85);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(w.x, this.heightAt(w.x, w.y) + 0.14, -w.y);
        this.scene.add(ring);
        this.disposables.push(ringGeo, ringMat);
        if (active) this.ring = ring;
      }
    }
  }

  // ------------------------------------------------------------------- inputs
  /** Feed the newest simulation frame. `speed` is the playback rate (for interpolation timing). */
  setFrame(frame: Frame, speed: number): void {
    const a = frame.astronaut;
    if (!this.curr || Math.hypot(a.x - this.curr.x, a.y - this.curr.y) > 6) this.prev = a;   // first frame or restart: snap
    else this.prev = this.curr;
    this.curr = a;
    this.setAt = performance.now();
    this.interval = clamp(500 / Math.max(speed, 0.25), 30, 2000);
    if (frame.t < 1.5) {
      this.dig.visible = false;
      (this.dig.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }

  setTrail(points: [number, number][]): void {
    if (!this.near) return;
    this.trail.geometry.dispose();
    this.trail.geometry = points.length > 1 ? this.ribbon(points, 0.16, 0.16) : new THREE.BufferGeometry();
    this.trailLine.geometry.dispose();
    this.trailLine.geometry = points.length > 1 ? this.polyline(points, 0.34) : new THREE.BufferGeometry();
  }

  setCamera(mode: CameraMode): void {
    this.mode = mode;
  }

  resetCamera(): void {
    const d = {
      third: [0, 0.3, 7.5],
      first: [0, -0.04, 0],
      overview: [0.7, 0.85, this.overviewDist],
      closeup: [2.55, 0.1, 3.4],
      rover: [0.6, 0.35, 5.5],
      ingenuity: [0.2, 0.45, 3.8],
    }[this.mode];
    if (this.mode === "first") { this.camera.fov = 55; this.camera.updateProjectionMatrix(); }
    Object.assign(this.cams[this.mode], { yaw: d[0], pitch: d[1], dist: d[2] });
  }

  private bindPointer(): void {
    const el = this.canvas;
    let drag: { id: number; x: number; y: number } | null = null;
    const pinch = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;
    el.addEventListener("pointerdown", (e) => {
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 1) drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      else { drag = null; const [a, b] = [...pinch.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!pinch.has(e.pointerId)) return;
      pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const cam = this.cams[this.mode];
      if (pinch.size >= 2) {
        const [a, b] = [...pinch.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) this.zoom(pinchDist / d);
        pinchDist = d;
      } else if (drag && drag.id === e.pointerId) {
        cam.yaw -= (e.clientX - drag.x) * 0.006;
        cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.005, this.mode === "first" ? -1.1 : 0.03, this.mode === "first" ? 1.1 : 1.45);
        drag.x = e.clientX; drag.y = e.clientY;
      }
    });
    const end = (e: PointerEvent) => { pinch.delete(e.pointerId); if (drag?.id === e.pointerId) drag = null; pinchDist = 0; };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", (e) => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  }

  private zoom(factor: number): void {
    const cam = this.cams[this.mode];
    if (this.mode === "first") this.camera.fov = clamp(this.camera.fov * factor, 25, 80);
    else if (this.mode === "overview") cam.dist = clamp(cam.dist * factor, 40, 900);
    else cam.dist = clamp(cam.dist * factor, 2.2, 40);
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------- render
  private applyQuality(): void {
    const high = this.quality === "high";
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25));
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = Math.max(1, parent.clientWidth), h = Math.max(1, parent.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tick = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    // The first callback's timestamp can be OLDER than the end of the (long, synchronous)
    // scene build, so the step is measured only between animation frames and never negative:
    // a negative step would turn the exponential smoothing below into runaway extrapolation.
    const dt = this.last < 0 ? 0 : clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    this.clock += dt;

    // Automatic fallback: if the first seconds are slow, drop shadows and resolution.
    if (this.quality === "high" && this.frames < 150) {
      this.frames++;
      if (this.frames > 30) this.slowMs += dt * 1000;
      if (this.frames === 150 && this.slowMs / 120 > 38) {
        this.quality = "low";
        this.applyQuality();
        this.scene.traverse((o) => { if ((o as THREE.Mesh).material) ((o as THREE.Mesh).material as THREE.Material).needsUpdate = true; });
        this.opts.onQuality?.("low");
      }
    }

    this.updateAstronaut(dt, now);
    this.updateCamera(dt);
    this.updateDustParticles(dt);
    if (this.rover) this.rover.animate(this.clock);
    if (this.helicopter) this.helicopter.animate(dt, this.clock);
    if (this.dustDevil) this.dustDevil.animate(dt);
    if (this.ring) {
      const pulse = 1 + 0.05 * Math.sin(this.clock * 2.4);
      this.ring.scale.set(pulse, pulse, 1);
    }
    this.sky.position.copy(this.camera.position);
    const dir = this.sun.userData.dir as THREE.Vector3;
    this.sun.target.position.copy(this.pos);
    this.sun.position.copy(this.pos).addScaledVector(dir, 120);
    this.renderer.render(this.scene, this.camera);
  };

  private updateAstronaut(dt: number, now: number): void {
    const a = this.curr, p = this.prev;
    if (!a || !p) return;
    const alpha = clamp((now - this.setAt) / this.interval, 0, 1);
    const x = lerp(p.x, a.x, alpha), y = lerp(p.y, a.y, alpha);
    const egress = lerp(p.egress, a.egress, alpha);
    this.heading = (p.heading + angleDiff(p.heading, a.heading) * alpha + 360) % 360;
    const groundFoot = this.heightAt(x, y);
    const height = a.outside && egress >= 1 ? groundFoot : lerp(this.deckY(), groundFoot, smooth(clamp(egress, 0, 1)));
    this.pos.set(x, height, -y);

    const root = this.astronaut.root;
    // Inside the cabin the astronaut is hidden; they appear in the hatchway as egress begins.
    root.visible = a.pose !== "inside";
    const appear = a.pose === "egress" ? clamp(egress * 12, 0.001, 1) : 1;
    root.scale.setScalar(appear);
    root.position.copy(this.pos);
    root.rotation.y = Math.PI - THREE.MathUtils.degToRad(this.heading);

    const moved = Math.hypot(x - this.drawn.x, -y - this.drawn.z);
    this.drawn.x = x; this.drawn.z = -y;
    this.astronaut.animate(a, moved > 5 ? 0 : moved, dt, this.clock);
    this.astronaut.setHeadVisible(this.mode !== "first");
    this.locator.visible = this.mode === "overview" && root.visible;
    this.locator.position.set(this.pos.x, this.pos.y + 2.4, this.pos.z);

    this.hatch.position.y = DECK_H + 0.86 + a.hatch_open * 1.55;

    if (a.pose === "collect") {
      const f = this.forward(this.heading);
      this.dig.visible = true;
      this.dig.position.set(this.pos.x + f.x * 0.75, this.heightAt(x + f.x * 0.75, y - f.z * 0.75) + 0.06, this.pos.z + f.z * 0.75);
      (this.dig.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.6 * a.pose_t;
    }
  }

  private updateCamera(dt: number): void {
    const cam = this.cams[this.mode];
    // Follow the astronaut's heading smoothly so turns do not whip the camera around.
    this.camHeading = (this.camHeading + angleDiff(this.camHeading, this.heading) * (1 - Math.exp(-dt * 2.2)) + 360) % 360;
    const wantPos = new THREE.Vector3(), wantTarget = new THREE.Vector3();
    const orbit = (center: THREE.Vector3, yawRad: number) => {
      wantTarget.copy(center);
      wantPos.set(
        center.x + Math.sin(yawRad) * Math.cos(cam.pitch) * cam.dist,
        center.y + Math.sin(cam.pitch) * cam.dist,
        center.z + Math.cos(yawRad) * Math.cos(cam.pitch) * cam.dist,
      );
    };
    const facing = Math.PI - THREE.MathUtils.degToRad(this.camHeading);   // yaw of the astronaut's forward axis
    if (this.mode === "rover") {
      const rp = this.rover.root.position;
      const center = rp.clone().add(new THREE.Vector3(0, 1.2, 0));
      orbit(center, cam.yaw);
    } else if (this.mode === "ingenuity") {
      const hp = this.helicopter.root.position;
      const center = hp.clone().add(new THREE.Vector3(0, -0.4, 0));
      orbit(center, cam.yaw);
    } else if (this.mode === "overview") {
      orbit(this.overviewCenter, cam.yaw);
    } else if (this.mode === "first") {
      const yaw = Math.PI - THREE.MathUtils.degToRad(this.heading) + cam.yaw;
      const eye = this.pos.clone().add(new THREE.Vector3(0, HIP_H + 0.82 + (this.curr?.pose.startsWith("kneel") || this.curr?.pose === "collect" ? -0.5 : 0), 0));
      eye.x += Math.sin(yaw) * 0.14; eye.z += Math.cos(yaw) * 0.14;
      wantPos.copy(eye);
      wantTarget.set(eye.x + Math.sin(yaw) * Math.cos(cam.pitch), eye.y - Math.sin(cam.pitch), eye.z + Math.cos(yaw) * Math.cos(cam.pitch));
    } else {
      const chest = this.pos.clone().add(new THREE.Vector3(0, this.mode === "closeup" ? 1.15 : 1.3, 0));
      orbit(chest, facing + Math.PI + cam.yaw);    // yaw 0 = directly behind the astronaut
    }
    if (this.mode !== "first") {
      const floor = this.heightAt(wantPos.x, -wantPos.z) + 0.35;
      if (wantPos.y < floor) wantPos.y = floor;
    }
    const k = this.mode === "first" ? 1 : 1 - Math.exp(-dt * 6);
    this.camPos.lerp(wantPos, k);
    this.camTarget.lerp(wantTarget, this.mode === "first" ? 1 : 1 - Math.exp(-dt * 9));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  /** Elevation (metres relative to the landing site) under the astronaut. */
  groundElevation(x: number, y: number): number | null {
    return this.near ? this.heightAt(x, y) : null;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
  }
}

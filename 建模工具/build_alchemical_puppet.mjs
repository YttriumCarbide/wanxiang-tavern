import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function resolveThreeModule(subpath) {
  const candidates = [
    path.join(repoRoot, "测试", "node_modules", "three", subpath),
    path.join("d:\\万界酒馆", "测试", "node_modules", "three", subpath),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  throw new Error(`Cannot locate three/${subpath} in 测试/node_modules`);
}

const T = await import(resolveThreeModule("build/three.module.js"));
const { mergeGeometries } = await import(
  resolveThreeModule("examples/jsm/utils/BufferGeometryUtils.js")
);
const { RoundedBoxGeometry } = await import(
  resolveThreeModule("examples/jsm/geometries/RoundedBoxGeometry.js")
);
const { GLTFExporter } = await import(
  resolveThreeModule("examples/jsm/exporters/GLTFExporter.js")
);

class BlobReader {
  result = null;
  onloadend = null;
  onload = null;
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onload?.();
    this.onloadend?.();
  }
  async readAsDataURL(blob) {
    this.result =
      "data:" +
      blob.type +
      ";base64," +
      Buffer.from(await blob.arrayBuffer()).toString("base64");
    this.onload?.();
    this.onloadend?.();
  }
}
Object.assign(globalThis, { FileReader: BlobReader });

const TAU = Math.PI * 2;
const V3 = (p) => new T.Vector3(...p);
const sphereGeo = new T.SphereGeometry(1, 16, 12);
const boxGeo = new RoundedBoxGeometry(1, 1, 1, 1, 0.065);
const sharpBoxGeo = new T.BoxGeometry(1, 1, 1);
const octaGeo = new T.OctahedronGeometry(1, 1);

function material(
  name,
  color,
  metallic = 0.4,
  roughness = 0.4,
  glow = null,
  glowIntensity = 1.65,
) {
  const m = new T.MeshStandardMaterial({
    color,
    metalness: metallic,
    roughness,
    emissive: glow || "#000000",
    emissiveIntensity: glow ? glowIntensity : 0,
    side: T.DoubleSide,
  });
  m.name = name;
  return m;
}

const porcelain = material("Porcelain_mask", "#ebe3d3", 0.08, 0.28);
const bisque = material("Porcelain_bisque", "#cabfa8", 0.06, 0.54);
const obsidian = material("Obsidian_crack", "#111017", 0.36, 0.24);
const brass = material("Tarnished_brass", "#c29b50", 0.84, 0.29);
const bronze = material("Antique_bronze", "#735534", 0.76, 0.42);
const iron = material("Cast_iron", "#353c42", 0.81, 0.42);
const rustIron = material("Rusted_pincer", "#614539", 0.68, 0.56);
const oak = material("Weathered_oak", "#594531", 0.1, 0.83);
const splinter = material("Splintered_timber", "#7b6246", 0.09, 0.77);
const violet = material(
  "Antigrav_violet",
  "#c584ff",
  0.16,
  0.2,
  "#8f3ef0",
  1.85,
);
const emerald = material(
  "Alchemical_emerald",
  "#62f5b5",
  0.16,
  0.2,
  "#1eb87a",
  1.75,
);
const plinthMat = material("Engraved_obsidian_plinth", "#23292c", 0.64, 0.4);
const trimMat = material("Faction_inlay", "#a786df", 0.75, 0.32);

function add(
  parent,
  geo,
  mat,
  pos = [0, 0, 0],
  scale = [1, 1, 1],
  rot = [0, 0, 0],
) {
  const mesh = new T.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rot);
  parent.add(mesh);
  return mesh;
}

function ball(parent, at, s, mat, rot = [0, 0, 0]) {
  return add(parent, sphereGeo, mat, at, s, rot);
}

function box(parent, at, s, mat, rot = [0, 0, 0]) {
  return add(parent, boxGeo, mat, at, s, rot);
}

function tooth(parent, at, s, mat, rot = [0, 0, 0]) {
  return add(parent, sharpBoxGeo, mat, at, s, rot);
}

function group(parent, name, at = [0, 0, 0], part = undefined) {
  const g = new T.Group();
  g.name = name;
  g.position.set(...at);
  if (part !== undefined) g.userData.anatomyIndex = part;
  parent.add(g);
  return g;
}

function tube(
  parent,
  points,
  radii,
  mat,
  segments = 20,
  sides = 10,
  ellipticity = 1,
) {
  const crv = new T.CatmullRomCurve3(points.map(V3));
  const frames = crv.computeFrenetFrames(segments, false);
  const pts = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const center = crv.getPointAt(u);
    const f = u * (radii.length - 1);
    const k = Math.min(Math.floor(f), radii.length - 2);
    const radius = Math.max(
      0.0008,
      T.MathUtils.lerp(radii[k], radii[k + 1], f - k),
    );
    for (let j = 0; j < sides; j++) {
      const a = (TAU * j) / sides;
      const pt = center
        .clone()
        .addScaledVector(frames.normals[i], Math.cos(a) * radius * ellipticity)
        .addScaledVector(frames.binormals[i], Math.sin(a) * radius);
      pts.push(pt.x, pt.y, pt.z);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const c = a + sides;
      const d = b + sides;
      indices.push(a, b, c, b, d, c);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return add(parent, g, mat);
}

function link(parent, a, b, r1, r2, mat, sides = 14) {
  const va = V3(a);
  const vb = V3(b);
  const d = vb.clone().sub(va);
  const g = new T.CylinderGeometry(r2, r1, d.length(), sides);
  const mesh = add(parent, g, mat);
  mesh.position.copy(va.add(vb).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  return mesh;
}

function ring(parent, at, r, thick, mat, axis = [0, 0, 1], segments = 36) {
  const mesh = add(parent, new T.TorusGeometry(r, thick, 8, segments), mat, at);
  mesh.quaternion.setFromUnitVectors(
    new T.Vector3(0, 0, 1),
    V3(axis).normalize(),
  );
  return mesh;
}

function glowRibbon(parent, points, width, mat) {
  const c = new T.CatmullRomCurve3(points.map(V3));
  const v = [];
  const idx = [];
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    const a = c.getPoint(t);
    const w = Math.sin(t * Math.PI) * width;
    v.push(a.x, a.y + w, a.z, a.x, a.y - w, a.z + 0.025);
    if (i) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return add(parent, g, mat);
}

function gearWheel(
  parent,
  radius,
  thickness,
  teeth,
  rimMat,
  hubMat,
  sawtooth = false,
) {
  ring(
    parent,
    [0, 0, 0],
    radius * 0.88,
    thickness * 0.55,
    rimMat,
    [0, 0, 1],
    Math.max(28, teeth * 2),
  );
  ring(
    parent,
    [0, 0, 0],
    radius * 0.34,
    thickness * 0.62,
    hubMat,
    [0, 0, 1],
    20,
  );
  link(
    parent,
    [0, 0, -thickness * 0.75],
    [0, 0, thickness * 0.75],
    radius * 0.2,
    radius * 0.2,
    hubMat,
    14,
  );
  const spokes = Math.min(6, Math.max(4, Math.floor(teeth / 3)));
  for (let s = 0; s < spokes; s++) {
    const a = (s * TAU) / spokes;
    box(
      parent,
      [Math.cos(a) * radius * 0.58, Math.sin(a) * radius * 0.58, 0],
      [radius * 0.56, thickness * 0.48, thickness * 0.62],
      hubMat,
      [0, 0, a],
    );
  }
  for (let i = 0; i < teeth; i++) {
    const a = (i * TAU) / teeth;
    const r = radius * 0.99;
    const tilt = sawtooth ? a + 0.36 : a;
    tooth(
      parent,
      [Math.cos(a) * r, Math.sin(a) * r, 0],
      [
        radius * (sawtooth ? 0.22 : 0.16),
        (TAU * radius) / (teeth * 2.15),
        thickness * 0.85,
      ],
      rimMat,
      [0, 0, tilt],
    );
  }
}

function buildPorcelainMask(head) {
  // Sculpted porcelain mask shell with slight asymmetrical contour and fractured right temple
  const rows = [
    [-0.24, -0.08, 0.11, 0.1],
    [-0.17, -0.02, 0.2, 0.18],
    [-0.08, 0.04, 0.265, 0.24],
    [0.03, 0.07, 0.295, 0.27],
    [0.14, 0.08, 0.285, 0.26],
    [0.24, 0.06, 0.24, 0.23],
    [0.32, 0.02, 0.15, 0.16],
  ];
  const pts = [];
  const idx = [];
  const cols = 26;
  rows.forEach(([y, zOff, rx, rz], rIdx) => {
    for (let j = 0; j < cols; j++) {
      const a = -Math.PI * 0.12 + (j / (cols - 1)) * Math.PI * 1.24;
      let x = Math.cos(a) * rx;
      let z = zOff + Math.sin(a) * rz;
      // Chip away upper-left/right temple asymmetrically to expose internal brass skull
      if (y > 0.1 && x > 0.09) {
        x *= 0.84;
        z -= 0.045;
      }
      // Subtle cheek & brow sculpting
      if (Math.sin(a) > 0.45 && Math.abs(y - 0.05) < 0.09) {
        z += 0.022 * Math.cos(x * 9);
      }
      pts.push(x, y, z);
      if (rIdx > 0 && j > 0) {
        const cur = rIdx * cols + j;
        const prev = cur - cols;
        idx.push(prev - 1, prev, cur - 1, prev, cur, cur - 1);
      }
    }
  });
  const maskGeo = new T.BufferGeometry();
  maskGeo.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
  maskGeo.setIndex(idx);
  maskGeo.computeVertexNormals();
  add(head, maskGeo, porcelain);

  // Exposed internal riveted tarnished-brass & cast-iron cranium behind the mask
  ball(head, [0.02, 0.07, -0.04], [0.265, 0.285, 0.26], iron);
  ball(
    head,
    [0.06, 0.13, 0.01],
    [0.245, 0.235, 0.22],
    brass,
    [0.1, 0.2, -0.22],
  );
  ring(head, [0.04, 0.12, -0.02], 0.255, 0.022, bronze, [0.25, 1, -0.15], 28);
  for (let k = 0; k < 7; k++) {
    const a = -0.6 + k * 0.36;
    ball(
      head,
      [
        Math.sin(a) * 0.24,
        0.18 + Math.cos(a) * 0.07,
        Math.cos(a) * 0.21 - 0.04,
      ],
      [0.018, 0.018, 0.018],
      iron,
    );
  }
  // Broken bisque rim along the chipped temple fracture
  tube(
    head,
    [
      [0.04, 0.29, 0.17],
      [0.14, 0.21, 0.21],
      [0.23, 0.11, 0.18],
      [0.26, -0.01, 0.12],
    ],
    [0.024, 0.028, 0.022, 0.014],
    bisque,
    14,
    8,
  );

  // Sculpted nose bridge & brow ridge
  tube(
    head,
    [
      [0, 0.14, 0.29],
      [-0.008, 0.04, 0.335],
      [-0.012, -0.045, 0.345],
    ],
    [0.036, 0.028, 0.022],
    porcelain,
    10,
    8,
  );

  // Asymmetrical empty/hollow eye sockets (歪斜无神空洞眼眶)
  // Left socket: drooping large hollow abyss
  ball(
    head,
    [-0.118, 0.055, 0.275],
    [0.068, 0.082, 0.046],
    obsidian,
    [0.08, -0.22, 0.18],
  );
  ring(
    head,
    [-0.118, 0.058, 0.288],
    0.068,
    0.013,
    bisque,
    [-0.22, 0.06, 1],
    20,
  );
  ball(head, [-0.122, 0.048, 0.258], [0.014, 0.014, 0.01], violet);

  // Right socket: skewed lower, jagged narrow crack-rimmed void
  ball(
    head,
    [0.122, 0.018, 0.268],
    [0.058, 0.046, 0.044],
    obsidian,
    [-0.06, 0.26, -0.28],
  );
  ring(head, [0.122, 0.018, 0.28], 0.054, 0.012, bisque, [0.26, -0.08, 1], 18);
  ball(head, [0.115, 0.016, 0.254], [0.011, 0.011, 0.009], emerald);

  // Jagged porcelain fissure cracks & faint alchemical seepage lines across mask
  const cracks = [
    [
      [-0.11, 0.26, 0.21],
      [-0.08, 0.17, 0.285],
      [-0.115, 0.11, 0.302],
    ],
    [
      [-0.125, -0.01, 0.3],
      [-0.155, -0.09, 0.275],
      [-0.11, -0.16, 0.235],
    ],
    [
      [0.12, 0.06, 0.29],
      [0.07, 0.14, 0.295],
      [0.09, 0.23, 0.23],
    ],
    [
      [0.135, -0.02, 0.285],
      [0.185, -0.095, 0.245],
      [0.16, -0.165, 0.195],
    ],
  ];
  cracks.forEach((ptsList, idxCrack) => {
    tube(head, ptsList, [0.009, 0.012, 0.006], obsidian, 10, 6);
    if (idxCrack % 2 === 0) {
      tube(
        head,
        ptsList.map(([x, y, z]) => [x, y, z - 0.004]),
        [0.005, 0.007, 0.003],
        idxCrack === 0 ? violet : emerald,
        8,
        5,
      );
    }
  });

  // Escaping alchemical brass/emerald tubes curling from back of cranium
  for (const s of [-1, 1]) {
    tube(
      head,
      [
        [s * 0.16, 0.08, -0.18],
        [s * 0.27, 0.19, -0.28],
        [s * 0.21, 0.33, -0.22],
      ],
      [0.022, 0.018, 0.014],
      s < 0 ? emerald : brass,
      12,
      8,
    );
  }
}

export function buildAlchemicalPuppet() {
  const root = new T.Group();
  root.name = "alchemical_puppet";
  root.userData = {
    archive: "005",
    name: "失败的炼金傀偶",
    parts: [
      "龟裂白瓷面具与铜颅",
      "逆重炼金核心与发条躯干",
      "不对称棘轮木杆与锈铁钳臂",
    ],
    modelType: "Articulated procedural creature",
    author: "Plane Threat Archive",
    nonVoxel: true,
    voxelBoxes: 0,
  };

  const joints = [];
  const joint = (node, role, side = 1, phase = 0) => {
    joints.push({
      node,
      role,
      side,
      phase,
      p: node.position.clone(),
      r: node.rotation.clone(),
    });
    return node;
  };

  // Pivot Entity_Root at the chest anti-gravity core [0, 2.08, 0] so inverted 180-deg ceiling flip stays airborne
  const rig = joint(group(root, "Entity_Root", [0, 2.08, 0]), "root");

  // ==================== PART 1 (anatomyIndex = 1): RIBCAGE, CORE & BACK CLOCKWORK ====================
  const torso = group(rig, "Bronze_Iron_Ribcage", [0, 0, 0], 1);
  // Spine column & vertebral discs behind open chest cavity
  tube(
    torso,
    [
      [0, -0.66, -0.18],
      [0, -0.22, -0.24],
      [0, 0.24, -0.25],
      [0, 0.68, -0.14],
    ],
    [0.095, 0.11, 0.115, 0.09],
    iron,
    18,
    12,
  );
  for (let k = 0; k < 7; k++) {
    const y = -0.56 + k * 0.19;
    const z = -0.19 - Math.sin((k / 6) * Math.PI) * 0.07;
    ring(torso, [0, y, z], 0.115, 0.024, bronze, [0, 1, 0.15], 18);
  }
  // Collar yoke & shoulder beam
  tube(
    torso,
    [
      [-0.68, 0.46, 0.02],
      [-0.34, 0.58, 0.08],
      [0, 0.62, 0.11],
      [0.34, 0.56, 0.08],
      [0.7, 0.4, 0.02],
    ],
    [0.095, 0.11, 0.12, 0.11, 0.095],
    bronze,
    22,
    12,
  );
  box(torso, [0, 0.6, 0.06], [0.54, 0.16, 0.28], iron, [0.12, 0, -0.04]);
  // Open cast-iron & tarnished-bronze ribcage arches framing the exposed chest core
  for (const s of [-1, 1]) {
    for (let r = 0; r < 5; r++) {
      const y = 0.42 - r * 0.165;
      const w = 0.52 - r * 0.042 + (r === 1 ? 0.04 : 0);
      const zFront = 0.34 - Math.abs(r - 1.5) * 0.045;
      tube(
        torso,
        [
          [s * 0.08, y + 0.02, -0.23],
          [s * (w * 0.78), y + 0.01, -0.08],
          [s * w, y - 0.02, 0.14],
          [s * (0.22 + r * 0.018), y - 0.05, zFront],
        ],
        [0.045, 0.042, 0.038, 0.03],
        r % 2 === 0 ? iron : bronze,
        14,
        9,
      );
      ball(
        torso,
        [s * (0.22 + r * 0.018), y - 0.05, zFront],
        [0.036, 0.036, 0.036],
        brass,
      );
    }
    // Side brass structural struts connecting collar to pelvis
    link(
      torso,
      [s * 0.48, 0.48, -0.05],
      [s * 0.32, -0.52, -0.04],
      0.034,
      0.028,
      brass,
      10,
    );
  }
  // Open clockwork pelvis cage & dangling broken chains
  ring(torso, [0, -0.54, -0.02], 0.36, 0.048, iron, [0, 1, 0.08], 28);
  ring(torso, [0, -0.68, -0.01], 0.28, 0.038, bronze, [0, 1, -0.06], 24);
  box(torso, [0, -0.62, 0.24], [0.24, 0.22, 0.1], brass, [0.15, 0, 0]);
  for (let c = 0; c < 5; c++) {
    const a = (c * TAU) / 5 + 0.3;
    const cx = Math.cos(a) * 0.31;
    const cz = Math.sin(a) * 0.28;
    for (let l = 0; l < 4; l++) {
      ring(
        torso,
        [cx, -0.74 - l * 0.075, cz],
        0.034,
        0.009,
        l % 2 ? iron : brass,
        l % 2 ? [1, 0, 0] : [0, 0, 1],
        12,
      );
    }
  }

  // Exposed Anti-Gravity Alchemical Core (泛着紫绿幽光的反重力炼金核心 + 悬浮黄铜陀螺仪环)
  const core = joint(
    group(rig, "Antigravity_Alchemy_Core", [0, 0.09, 0.06], 1),
    "core",
  );
  add(core, octaGeo, violet, [0, 0, 0], [0.165, 0.225, 0.165]);
  add(
    core,
    octaGeo,
    emerald,
    [0, 0, 0],
    [0.115, 0.155, 0.115],
    [0.4, 0.8, 0.3],
  );
  link(core, [0, 0.21, 0], [0, 0.26, 0], 0.055, 0.025, brass, 10);
  link(core, [0, -0.21, 0], [0, -0.26, 0], 0.055, 0.025, brass, 10);
  for (let s = 0; s < 2; s++) {
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const a = t * TAU * 1.5 + s * Math.PI;
      const r = 0.17 * Math.sin(t * Math.PI) + 0.04;
      pts.push([Math.cos(a) * r, -0.19 + t * 0.38, Math.sin(a) * r]);
    }
    tube(
      core,
      pts,
      [0.01, 0.022, 0.024, 0.01],
      s === 0 ? emerald : violet,
      20,
      7,
    );
  }

  const gyroOuter = joint(
    group(rig, "Brass_Gyro_Ring_Outer", [0, 0.09, 0.06], 1),
    "gyroOuter",
  );
  gyroOuter.rotation.set(0.32, 0.18, -0.24);
  gyroOuter.userData.restSet = true;
  joints.at(-1).r.copy(gyroOuter.rotation);
  ring(gyroOuter, [0, 0, 0], 0.33, 0.024, brass, [0, 0, 1], 40);
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12;
    box(
      gyroOuter,
      [Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0],
      [0.048, 0.018, 0.042],
      i % 3 === 0 ? emerald : bronze,
      [0, 0, a],
    );
  }

  const gyroInner = joint(
    group(rig, "Brass_Gyro_Ring_Inner", [0, 0.09, 0.06], 1),
    "gyroInner",
  );
  gyroInner.rotation.set(-0.42, 0.35, 0.52);
  joints.at(-1).r.copy(gyroInner.rotation);
  ring(gyroInner, [0, 0, 0], 0.245, 0.019, brass, [1, 0, 0], 34);
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    ball(
      gyroInner,
      [0, Math.cos(a) * 0.245, Math.sin(a) * 0.245],
      [0.024, 0.024, 0.024],
      i % 2 ? violet : brass,
    );
  }

  // Back Interlocking Clockwork Gear Cluster (背部咬合时钟齿轮组)
  const backMount = group(torso, "Clockwork_Back_Bracket", [0, 0.18, -0.28]);
  box(backMount, [0, 0, 0], [0.58, 0.68, 0.12], iron);
  for (const s of [-1, 1]) {
    link(
      backMount,
      [s * 0.22, -0.28, -0.02],
      [s * 0.22, 0.34, -0.02],
      0.032,
      0.032,
      bronze,
      10,
    );
  }

  const gearMain = joint(
    group(rig, "Clockwork_Gear_Main", [0.02, 0.22, -0.38], 1),
    "gear",
    1,
    0,
  );
  gearWheel(gearMain, 0.44, 0.065, 18, brass, bronze, false);

  const gearUpper = joint(
    group(rig, "Clockwork_Gear_Upper", [-0.31, 0.55, -0.35], 1),
    "gear",
    -1,
    1.2,
  );
  gearWheel(gearUpper, 0.27, 0.058, 12, bronze, iron, false);

  const gearLower = joint(
    group(rig, "Clockwork_Gear_Lower", [0.29, -0.14, -0.36], 1),
    "gear",
    -1,
    2.4,
  );
  gearWheel(gearLower, 0.31, 0.06, 14, brass, iron, true);

  const windKey = joint(
    group(rig, "Mainspring_Wind_Key", [0.02, 0.22, -0.49], 1),
    "windkey",
    1,
    0,
  );
  link(windKey, [0, 0, 0.08], [0, 0, -0.24], 0.042, 0.034, brass, 12);
  box(windKey, [0, 0, -0.24], [0.34, 0.055, 0.05], brass);
  for (const s of [-1, 1]) {
    ring(windKey, [s * 0.17, 0, -0.28], 0.11, 0.026, brass, [0, 1, 0], 24);
    ball(windKey, [s * 0.27, 0, -0.28], [0.03, 0.03, 0.03], emerald);
  }

  // ==================== PART 0 (anatomyIndex = 0): NECK & CRACKED PORCELAIN MASK ====================
  const neck = joint(
    group(rig, "Crooked_Brass_Neck", [0, 0.66, 0.02], 0),
    "neck",
  );
  neck.rotation.set(0.06, 0, -0.09);
  joints.at(-1).r.copy(neck.rotation);
  link(neck, [0, -0.04, 0], [-0.02, 0.28, 0.03], 0.072, 0.058, iron, 12);
  for (let k = 0; k < 3; k++) {
    ring(
      neck,
      [-0.006 * k, 0.04 + k * 0.08, 0.01 * k],
      0.088,
      0.018,
      brass,
      [0.1, 1, -0.12],
      18,
    );
  }
  tube(
    neck,
    [
      [0.09, -0.02, -0.04],
      [0.14, 0.13, 0.02],
      [0.08, 0.28, -0.03],
    ],
    [0.018, 0.016, 0.014],
    emerald,
    12,
    7,
  );

  const head = joint(
    group(neck, "Cracked_Porcelain_Mask", [-0.02, 0.36, 0.04], 0),
    "head",
  );
  head.rotation.set(0.09, -0.06, -0.15);
  joints.at(-1).r.copy(head.rotation);
  buildPorcelainMask(head);

  const jaw = joint(
    group(head, "Fractured_Puppet_Jaw", [0, -0.18, 0.08]),
    "jaw",
  );
  ball(jaw, [0, -0.035, 0.1], [0.125, 0.065, 0.135], porcelain);
  box(jaw, [0.04, -0.02, 0.13], [0.09, 0.048, 0.11], bisque, [0, 0.2, -0.18]);
  for (const s of [-1, 1]) {
    link(
      jaw,
      [s * 0.12, 0.02, -0.02],
      [s * 0.12, -0.03, 0.06],
      0.016,
      0.014,
      brass,
      8,
    );
    ball(jaw, [s * 0.13, 0.01, 0.02], [0.022, 0.022, 0.022], iron);
  }
  // Marionette split mouth seam
  box(jaw, [0, 0.022, 0.165], [0.14, 0.018, 0.05], obsidian);

  // ==================== PART 2 (anatomyIndex = 2): ASYMMETRIC WOODEN-POLE ARMS & HOVERING LEGS ====================
  // Left Arm (viewer-left, x < 0): Oversized Ratchet + Clumsy Long Wooden Pole & Knocker Mallet (大号棘轮与木杆敲锤)
  const armL = joint(
    group(rig, "Left_Ratchet_Pole_Arm", [-0.7, 0.44, 0.02], 2),
    "armL",
    -1,
  );
  armL.rotation.set(0.08, 0.05, 0.11);
  joints.at(-1).r.copy(armL.rotation);
  ball(armL, [0, 0, 0], [0.16, 0.16, 0.16], iron);
  box(armL, [-0.14, 0.06, 0], [0.34, 0.26, 0.34], bronze, [0, 0, 0.22]);

  const ratchetL = joint(
    group(armL, "Oversized_Shoulder_Ratchet", [-0.22, -0.04, 0.06]),
    "ratchet",
    -1,
  );
  ratchetL.rotation.set(0, Math.PI * 0.5, 0);
  joints.at(-1).r.copy(ratchetL.rotation);
  gearWheel(ratchetL, 0.35, 0.068, 16, brass, rustIron, true);
  // Pawl stopper claw above ratchet
  box(armL, [-0.22, 0.32, 0.12], [0.08, 0.12, 0.24], rustIron, [-0.35, 0, 0]);

  // Rough-hewn upper oak timber spar
  tube(
    armL,
    [
      [-0.14, -0.06, 0.02],
      [-0.24, -0.44, 0.06],
      [-0.3, -0.86, 0.1],
    ],
    [0.095, 0.084, 0.078],
    oak,
    16,
    9,
  );
  for (const yBand of [-0.26, -0.62]) {
    ring(
      armL,
      [-0.22 - yBand * 0.1, yBand, 0.06],
      0.092,
      0.018,
      iron,
      [0.14, 1, 0],
      16,
    );
  }

  const forearmL = joint(
    group(armL, "Left_Mallet_Pole", [-0.3, -0.86, 0.1]),
    "forearmL",
    -1,
  );
  forearmL.rotation.set(-0.28, 0.08, -0.06);
  joints.at(-1).r.copy(forearmL.rotation);
  // Secondary elbow ratchet & iron clevis
  ball(forearmL, [0, 0, 0], [0.125, 0.125, 0.125], iron);
  ring(forearmL, [-0.08, 0, 0], 0.18, 0.026, brass, [1, 0, 0], 22);
  // Extra-long crooked wooden pole shaft + heavy timber/iron knocker hammerhead
  tube(
    forearmL,
    [
      [0, 0, 0],
      [-0.06, -0.52, 0.14],
      [-0.03, -1.04, 0.28],
      [0.02, -1.48, 0.38],
    ],
    [0.078, 0.072, 0.068, 0.076],
    oak,
    22,
    9,
  );
  // Splintered reinforcing wood lath strapped along shaft
  box(
    forearmL,
    [-0.07, -0.72, 0.2],
    [0.045, 0.88, 0.065],
    splinter,
    [-0.24, 0, 0.04],
  );
  for (const t of [0.28, 0.58, 0.84]) {
    ring(
      forearmL,
      [-0.03 * (1 - t), -1.45 * t, 0.36 * t],
      0.084,
      0.016,
      rustIron,
      [0, 1, -0.25],
      16,
    );
  }
  // Heavy Wooden-Beam Knocker Mallet Head (木杆敲锤)
  const malletPos = [0.02, -1.48, 0.42];
  box(forearmL, malletPos, [0.36, 0.34, 0.78], oak, [0.18, 0.08, -0.06]);
  box(
    forearmL,
    [0.02, -1.48, 0.78],
    [0.39, 0.37, 0.11],
    brass,
    [0.18, 0.08, -0.06],
  );
  box(
    forearmL,
    [0.02, -1.48, 0.06],
    [0.38, 0.36, 0.1],
    iron,
    [0.18, 0.08, -0.06],
  );
  for (const zOff of [0.22, 0.62]) {
    box(
      forearmL,
      [0.02, -1.48, zOff],
      [0.4, 0.38, 0.055],
      rustIron,
      [0.18, 0.08, -0.06],
    );
  }
  // Protruding iron strike studs on mallet face
  for (const sx of [-0.1, 0.1]) {
    for (const sy of [-0.09, 0.09]) {
      ball(
        forearmL,
        [0.02 + sx, -1.48 + sy, 0.84],
        [0.035, 0.035, 0.028],
        iron,
      );
    }
  }

  // Right Arm (viewer-right, x > 0): Rusted Iron Pincer & Brass Lever Linkage (生锈铁钳与黄铜杠杆)
  const armR = joint(
    group(rig, "Right_Pincer_Lever_Arm", [0.72, 0.38, 0.02], 2),
    "armR",
    1,
  );
  armR.rotation.set(0.12, -0.06, -0.14);
  joints.at(-1).r.copy(armR.rotation);
  ball(armR, [0, 0, 0], [0.15, 0.15, 0.15], iron);
  box(armR, [0.12, 0.04, 0], [0.28, 0.22, 0.3], rustIron, [0, 0, -0.25]);
  // Upper wooden pole + parallel offset brass bell-crank & lever bar (黄铜杠杆)
  tube(
    armR,
    [
      [0.12, -0.04, 0],
      [0.24, -0.42, 0.05],
      [0.32, -0.82, 0.1],
    ],
    [0.082, 0.074, 0.068],
    oak,
    16,
    9,
  );
  // Protruding brass lever triangle & linkage rod
  box(armR, [0.34, -0.16, -0.06], [0.32, 0.055, 0.07], brass, [0, 0.15, -0.52]);
  ball(armR, [0.47, -0.25, -0.08], [0.042, 0.042, 0.042], brass);
  link(
    armR,
    [0.47, -0.25, -0.08],
    [0.48, -0.84, 0.06],
    0.024,
    0.022,
    brass,
    10,
  );
  link(armR, [0.28, -0.46, 0.04], [0.47, -0.25, -0.08], 0.02, 0.02, bronze, 8);

  const forearmR = joint(
    group(armR, "Right_Pincer_Forearm", [0.32, -0.82, 0.1]),
    "forearmR",
    1,
  );
  forearmR.rotation.set(-0.22, -0.08, 0.08);
  joints.at(-1).r.copy(forearmR.rotation);
  ball(forearmR, [0, 0, 0], [0.115, 0.115, 0.115], brass);
  // Elongated crooked wooden forearm + brass sliding scissor-lever rod
  tube(
    forearmR,
    [
      [0, 0, 0],
      [0.08, -0.48, 0.12],
      [0.05, -0.98, 0.26],
      [0.02, -1.32, 0.36],
    ],
    [0.072, 0.066, 0.062, 0.07],
    splinter,
    20,
    9,
  );
  link(
    forearmR,
    [0.16, 0.02, -0.04],
    [0.14, -1.24, 0.32],
    0.024,
    0.02,
    brass,
    10,
  );
  box(forearmR, [0.09, -0.64, 0.16], [0.18, 0.05, 0.06], brass, [0, 0, 0.12]);
  box(forearmR, [0.04, -1.32, 0.37], [0.24, 0.2, 0.26], rustIron, [0.2, 0, 0]);
  ring(forearmR, [0.04, -1.32, 0.37], 0.13, 0.025, brass, [1, 0, 0], 18);

  // Articulated Rusted Cast-Iron Pincer Claws (生锈铁钳)
  for (const jawSide of [-1, 1]) {
    const pincer = joint(
      group(forearmR, `Rusted_Pincer_Jaw_${jawSide < 0 ? "A" : "B"}`, [
        0.04 + jawSide * 0.075,
        -1.36,
        0.42,
      ]),
      "pincer",
      jawSide,
    );
    tube(
      pincer,
      [
        [0, 0, 0],
        [jawSide * 0.14, -0.16, 0.16],
        [jawSide * 0.16, -0.34, 0.31],
        [jawSide * 0.03, -0.48, 0.42],
      ],
      [0.068, 0.062, 0.046, 0.014],
      rustIron,
      16,
      8,
      0.65,
    );
    // Serrated inner iron teeth
    for (let t = 0; t < 3; t++) {
      box(
        pincer,
        [jawSide * (0.09 - t * 0.015), -0.18 - t * 0.08, 0.18 + t * 0.07],
        [0.055, 0.032, 0.045],
        iron,
        [0.2, 0, jawSide * 0.4],
      );
    }
  }

  // Held Clockwork Alchemical Time-Bomb Flask between pincers (visible during Bomb_Toss)
  const bombFx = joint(
    group(forearmR, "Clockwork_Time_Bomb", [0.04, -1.62, 0.66]),
    "bombfx",
  );
  ball(bombFx, [0, 0, 0], [0.18, 0.21, 0.18], emerald);
  ring(bombFx, [0, 0, 0], 0.21, 0.022, brass, [0, 1, 0], 22);
  ring(bombFx, [0, 0, 0], 0.21, 0.018, violet, [1, 0.35, 0], 22);
  box(bombFx, [0, 0.24, 0], [0.09, 0.11, 0.09], brass, [0, 0.4, 0]);
  ball(bombFx, [0, 0.34, 0], [0.06, 0.06, 0.06], violet);

  // Hovering Anti-Gravity Lower Limbs (悬空虚踏的反重力下肢)
  for (const s of [-1, 1]) {
    const leg = joint(
      group(
        rig,
        `Antigrav_Leg_${s < 0 ? "L" : "R"}`,
        [s * 0.27, -0.66, s < 0 ? 0.05 : -0.04],
        2,
      ),
      "leg",
      s,
      s < 0 ? 0 : 1.6,
    );
    // Asymmetric weightless stepping pose
    leg.rotation.set(s < 0 ? -0.26 : 0.14, 0, s * 0.06);
    joints.at(-1).r.copy(leg.rotation);
    ball(leg, [0, 0, 0], [0.125, 0.125, 0.125], brass);
    tube(
      leg,
      [
        [0, 0, 0],
        [s * 0.05, -0.32, s < 0 ? 0.12 : 0.04],
        [s * 0.07, -0.62, s < 0 ? 0.18 : 0.06],
      ],
      [0.092, 0.078, 0.068],
      iron,
      14,
      10,
    );
    // Splintered wood thigh splint
    box(leg, [s * 0.09, -0.32, s < 0 ? 0.1 : 0.03], [0.05, 0.46, 0.09], oak, [
      s < 0 ? -0.24 : -0.08,
      0,
      0,
    ]);

    const shin = joint(
      group(leg, `Antigrav_Shin_${s < 0 ? "L" : "R"}`, [
        s * 0.07,
        -0.62,
        s < 0 ? 0.18 : 0.06,
      ]),
      "shin",
      s,
      s < 0 ? 0 : 1.6,
    );
    shin.rotation.set(s < 0 ? 0.48 : 0.22, 0, 0);
    joints.at(-1).r.copy(shin.rotation);
    ball(shin, [0, 0, 0], [0.105, 0.105, 0.105], brass);
    ring(shin, [0, 0, 0], 0.125, 0.018, bronze, [1, 0, 0], 18);
    tube(
      shin,
      [
        [0, 0, 0],
        [0, -0.36, -0.06],
        [0, -0.7, -0.02],
        [0, -0.92, 0.12],
      ],
      [0.074, 0.058, 0.042, 0.022],
      oak,
      16,
      9,
    );
    // Pointed brass-shod marionette foot dangling downward (虚踏)
    tube(
      shin,
      [
        [0, -0.88, 0.08],
        [0, -1.04, 0.2],
        [0, -1.14, 0.26],
      ],
      [0.052, 0.036, 0.01],
      brass,
      10,
      8,
    );
    ring(shin, [0, -0.82, 0.04], 0.072, 0.015, violet, [0, 1, 0.2], 18);
  }

  // Subtle ambient anti-gravity levitation field right above card surface (keeps min.y ~ 0.04)
  const hoverField = joint(
    group(root, "Antigrav_Levitation_Field", [0, 0.07, 0], 1),
    "hoverfx",
  );
  ring(hoverField, [0, 0, 0], 0.68, 0.014, violet, [0, 1, 0], 42);
  ring(hoverField, [0, 0.05, 0], 0.44, 0.011, emerald, [0, 1, 0], 32);
  for (let k = 0; k < 6; k++) {
    const a = (k * TAU) / 6;
    box(
      hoverField,
      [Math.cos(a) * 0.56, 0.08 + (k % 2) * 0.05, Math.sin(a) * 0.56],
      [0.045, 0.045, 0.045],
      k % 2 ? brass : violet,
      [0.4, a, 0.3],
    );
  }

  // ==================== COLLECTIBLE PLINTH (Archive_Battle_Card, hidden at battle runtime) ====================
  const stand = group(root, "Archive_Battle_Card");
  const r = 1.64;
  add(
    stand,
    new T.CylinderGeometry(r, r * 0.94, 0.15, 8),
    plinthMat,
    [0, -0.095, 0],
  );
  add(
    stand,
    new T.CylinderGeometry(r * 1.015, r * 1.015, 0.032, 8),
    trimMat,
    [0, -0.045, 0],
  );
  add(
    stand,
    new T.CylinderGeometry(r * 0.973, r * 1.015, 0.055, 8),
    iron,
    [0, -0.003, 0],
  );
  ring(stand, [0, 0.029, 0], r * 0.823, 0.013, trimMat, [0, 1, 0], 64);
  ring(stand, [0, 0.029, 0], r * 0.793, 0.006, emerald, [0, 1, 0], 64);
  for (let k = 0; k < 32; k++) {
    const a = (TAU * k) / 32;
    tooth(
      stand,
      [Math.sin(a) * r * 0.77, 0.028, Math.cos(a) * r * 0.77],
      [0.014, 0.008, k % 4 === 0 ? 0.102 : 0.038],
      k % 8 === 0 ? emerald : trimMat,
      [0, a, 0],
    );
  }

  // ==================== COMBAT ACTION VFX NODES ====================
  // 1. Normal_Attack VFX: Pole Sweep Afterglow (木杆横扫)
  const normalFx = joint(
    group(root, "Pole_Sweep_Afterglow", [0, 1.35, 0.25]),
    "normalfx",
  );
  glowRibbon(
    normalFx,
    [
      [-2.05, 0.35, -0.15],
      [-1.05, 0.05, 1.35],
      [0.35, -0.12, 1.78],
      [1.85, 0.22, 0.72],
    ],
    0.068,
    violet,
  );
  glowRibbon(
    normalFx,
    [
      [-1.85, 0.2, 0.05],
      [-0.85, -0.06, 1.48],
      [0.48, -0.2, 1.86],
      [1.72, 0.1, 0.88],
    ],
    0.044,
    emerald,
  );

  // 2. Special_Attack VFX: Inverse Gravity Gear Crash (逆重齿轮坠击)
  const specialFx = joint(
    group(root, "Inverse_Gravity_Shockwave", [0, 0.09, 0.22]),
    "specialfx",
  );
  for (let k = 0; k < 4; k++) {
    ring(
      specialFx,
      [0, 0.03 + k * 0.045, 0],
      0.62 + k * 0.42,
      0.042 - k * 0.007,
      k % 2 === 0 ? violet : emerald,
      [0, 1, 0],
      48,
    );
  }
  for (let k = 0; k < 6; k++) {
    const a = (k * TAU) / 6 + 0.25;
    const gx = Math.cos(a) * 1.05;
    const gz = Math.sin(a) * 0.95;
    const gShard = group(specialFx, `Crash_Gear_Shard_${k}`, [
      gx,
      0.22 + (k % 2) * 0.14,
      gz,
    ]);
    gShard.rotation.set(0.7 + k * 0.3, a, 0.4);
    gearWheel(gShard, 0.22, 0.04, 10, brass, violet, true);
  }

  // 3. Special_Action VFX: Clockwork Overwind Resonance Halo (发条错位重整)
  const actionFx = joint(
    group(root, "Resonance_Halo", [0, 0.08, 0]),
    "actionfx",
  );
  ring(actionFx, [0, 0.04, 0], r * 0.88, 0.02, emerald, [0, 1, 0], 60);
  ring(actionFx, [0, 1.95, 0], 1.18, 0.018, violet, [0.22, 1, -0.18], 52);
  for (let k = 0; k < 14; k++) {
    const a = k * 2.39996;
    const rad = 1.15 + (k % 3) * 0.16;
    link(
      actionFx,
      [Math.cos(a) * rad, 0.06, Math.sin(a) * rad],
      [Math.cos(a) * rad, 0.65 + (k % 4) * 0.38, Math.sin(a) * rad],
      0.014,
      0.002,
      k % 2 ? emerald : violet,
      6,
    );
  }

  // ==================== 48-SAMPLE SKELETAL ANIMATION CLIPS ====================
  // Exact clip names & durations required:
  // 0: Idle (4.6s)
  // 1: Normal_Attack (2.4s - 木杆横扫)
  // 2: Special_Attack (4.2s - 逆重齿轮坠击, inverted ceiling hover + gravity gear slam)
  // 3: Special_Action (3.2s - 发条错位重整, non-attack clockwork overwind & core charge)
  // 4: Bomb_Toss (2.4s - 定式投弹 · 炼金怀表)
  const clipSpecs = [
    ["Idle", 4.6],
    ["Normal_Attack", 2.4],
    ["Special_Attack", 4.2],
    ["Special_Action", 3.2],
    ["Bomb_Toss", 2.4],
  ];
  const clips = [];
  const samples = 48;

  const smoothWindow = (t, t0, t1) => {
    if (t <= t0 || t >= t1) return 0;
    const u = (t - t0) / (t1 - t0);
    return Math.sin(u * Math.PI) ** 2;
  };
  const smoothPlateau = (t, a, b, c, d) => {
    if (t <= a || t >= d) return 0;
    if (t < b) {
      const u = (t - a) / (b - a);
      return u * u * (3 - 2 * u);
    }
    if (t <= c) return 1;
    const u = (t - c) / (d - c);
    return 1 - u * u * (3 - 2 * u);
  };

  for (let c = 0; c < clipSpecs.length; c++) {
    const [clipName, duration] = clipSpecs[c];
    const tracks = [];
    const isIdle = c === 0;
    const isNormal = c === 1;
    const isSpecial = c === 2;
    const isAction = c === 3;
    const isBomb = c === 4;

    for (const j of joints) {
      const times = [];
      const ps = [];
      const qs = [];
      const ss = [];
      let hasP = false;
      let hasR = false;
      let hasS = false;

      for (let f = 0; f <= samples; f++) {
        const t = f / samples;
        const a = t * TAU;
        const s = Math.sin(a);
        const s2 = Math.sin(a * 2);
        const bell = Math.sin(t * Math.PI) ** 2;
        const prep = Math.exp(-(((t - 0.25) / 0.12) ** 2));
        const hit = Math.exp(-(((t - 0.52) / 0.11) ** 2));
        const recoil = Math.exp(-(((t - 0.72) / 0.11) ** 2));
        // Inverted hover envelope for Special_Attack (flips upside-down onto "attic ceiling" & slams down)
        const invHold = smoothPlateau(t, 0.08, 0.28, 0.68, 0.9);
        const slamDip = Math.exp(-(((t - 0.54) / 0.085) ** 2));
        const slamPrep = Math.exp(-(((t - 0.38) / 0.09) ** 2));
        // Ratcheting stutter wave (periodic at t=0 and t=1)
        const twitch = Math.sin(a * 3) ** 7;

        const p = j.p.clone();
        const rot = j.r.clone();
        const scl = new T.Vector3(1, 1, 1);

        if (j.role === "root") {
          // Weightless anti-gravity hover + micro-tremor
          p.y +=
            0.085 * (1 - Math.cos(a)) + (isIdle ? 0.014 * Math.sin(a * 4) : 0);
          rot.z += 0.032 * s;
          rot.x += 0.024 * s2;

          if (isNormal) {
            // Wind-up twist right, then clumsy lunging wide sweep left-to-front
            p.z += -0.24 * prep + 0.58 * hit - 0.12 * recoil;
            p.y += 0.12 * prep - 0.16 * hit;
            rot.y += -0.58 * prep + 1.12 * hit - 0.18 * recoil;
            rot.x += -0.16 * prep + 0.28 * hit;
            rot.z += 0.14 * prep - 0.22 * hit;
          } else if (isSpecial) {
            // Anti-gravity surge: rise up, flip 180 deg upside-down, loom forward & slam downward!
            p.y += 0.62 * invHold + 0.32 * slamPrep - 0.52 * slamDip;
            p.z += 0.42 * invHold + 0.24 * slamDip;
            rot.z += Math.PI * invHold;
            rot.x += 0.26 * invHold + 0.28 * slamDip - 0.18 * slamPrep;
          } else if (isAction) {
            // Clockwork overwind: levitate slightly, shudder with ratcheting ticks
            p.y += 0.28 * bell + 0.025 * Math.sin(a * 8) * bell;
            rot.y += 0.12 * Math.sin(a * 2) * bell;
            rot.z += 0.06 * Math.sin(a * 6) * bell;
          } else if (isBomb) {
            // Reach into chest core, wind back, then hurl flask toward player side
            const wind = smoothWindow(t, 0.08, 0.36);
            const hurl = Math.exp(-(((t - 0.52) / 0.11) ** 2));
            p.y += 0.22 * prep - 0.08 * hurl;
            p.z += -0.18 * wind + 0.44 * hurl;
            rot.y += 0.42 * wind - 0.55 * hurl;
            rot.x += -0.22 * wind + 0.3 * hurl;
          }
        } else if (j.role === "core") {
          rot.y += isAction || isBomb ? a * 3 : isSpecial ? a * 2 : a;
          rot.x += 0.35 * s;
          if (isAction) {
            const pulse = 1 + 0.38 * bell + 0.14 * Math.sin(a * 6) * bell;
            scl.setScalar(pulse);
          } else if (isBomb) {
            scl.setScalar(1 + 0.35 * smoothWindow(t, 0.08, 0.42));
          } else if (isSpecial) {
            scl.setScalar(1 + 0.34 * invHold + 0.25 * slamDip);
          }
        } else if (j.role === "gyroOuter") {
          rot.z += isAction ? a * 3 : isSpecial ? a * 2 : a;
          rot.x += 0.22 * s;
        } else if (j.role === "gyroInner") {
          rot.y -= isAction ? a * 4 : isSpecial ? a * 3 : a * 2;
          rot.z += 0.28 * s2;
        } else if (j.role === "gear") {
          // Counter-rotating back clockwork gears (seamless integer multiples of TAU)
          const turns = isAction || isBomb ? 4 : isSpecial ? 3 : isNormal ? 2 : 1;
          rot.z +=
            j.side * a * turns +
            (isAction ? j.side * 0.16 * Math.sin(a * 8) * bell : 0);
        } else if (j.role === "windkey") {
          const turns = isAction || isBomb ? 5 : isSpecial ? 2 : 1;
          rot.z -= a * turns;
        } else if (j.role === "ratchet") {
          rot.z += isNormal
            ? -1.2 * prep + 2.8 * hit
            : isAction
              ? a * 2
              : 0.22 * s;
        } else if (j.role === "neck") {
          rot.z += 0.05 * s + (isIdle ? -0.09 * twitch : 0);
          rot.x += 0.04 * s2 + (isNormal ? -0.14 * prep + 0.22 * hit : 0);
          if (isSpecial) rot.x -= 0.32 * invHold;
          if (isAction) rot.z += 0.14 * Math.sin(a * 4) * bell;
        } else if (j.role === "head") {
          // Uncanny broken-doll tilt & sudden twitch
          rot.z += 0.07 * s + (isIdle ? -0.18 * twitch : 0);
          rot.y += 0.06 * s2 + (isNormal ? -0.25 * prep + 0.35 * hit : 0);
          rot.x +=
            0.04 * s + (isSpecial ? -0.38 * invHold + 0.24 * slamDip : 0);
          if (isAction) {
            rot.z += -0.26 * Math.sin(a * 3) * bell;
            rot.x += 0.18 * bell;
          }
        } else if (j.role === "jaw") {
          rot.x +=
            0.05 * (1 - Math.cos(a * 2)) +
            (isIdle ? 0.16 * Math.abs(twitch) : 0) +
            (isNormal ? 0.34 * hit : 0) +
            (isSpecial ? 0.42 * invHold : 0) +
            (isAction ? 0.22 * Math.abs(Math.sin(a * 5)) * bell : 0);
        } else if (j.role === "armL") {
          // Clumsy heavy wooden-pole knocker arm
          rot.x += 0.09 * s;
          rot.z += 0.05 * s2;
          if (isNormal) {
            rot.x += -1.18 * prep + 1.42 * hit - 0.22 * recoil;
            rot.z += 0.68 * prep - 0.92 * hit;
            rot.y += -0.45 * prep + 0.88 * hit;
          } else if (isSpecial) {
            // Splay wide while inverted, then hurl downward on slamDip
            rot.z += 0.72 * invHold - 0.55 * slamDip;
            rot.x += -0.48 * slamPrep + 1.05 * slamDip;
          } else if (isAction) {
            // Fold inward across chest to shield core during overwind
            rot.x += -0.78 * bell;
            rot.z += -0.62 * bell;
            rot.y += 0.55 * bell;
          } else if (isBomb) {
            // Pull wooden pole arm back & inward to balance throw
            rot.x += 0.42 * prep - 0.18 * hit;
            rot.z += 0.38 * smoothWindow(t, 0.08, 0.72);
          }
        } else if (j.role === "forearmL") {
          rot.x += 0.07 * Math.sin(a - 0.8);
          if (isNormal) {
            rot.x += -0.62 * prep + 0.85 * hit + 0.14 * Math.sin(a * 6) * hit;
          } else if (isSpecial) {
            rot.x += -0.35 * invHold + 0.72 * slamDip;
          } else if (isAction) {
            rot.x += -0.68 * bell;
            rot.z += -0.35 * bell;
          }
        } else if (j.role === "armR") {
          // Rusted iron pincer & brass lever arm
          rot.x += -0.08 * s;
          rot.z += -0.05 * s2;
          if (isNormal) {
            rot.x += -0.75 * prep + 1.08 * hit;
            rot.z += -0.45 * prep + 0.58 * hit;
            rot.y += -0.38 * prep + 0.64 * hit;
          } else if (isSpecial) {
            rot.z += -0.72 * invHold + 0.55 * slamDip;
            rot.x += -0.48 * slamPrep + 1.05 * slamDip;
          } else if (isAction) {
            rot.x += -0.76 * bell;
            rot.z += 0.62 * bell;
            rot.y += -0.55 * bell;
          } else if (isBomb) {
            const reach = smoothWindow(t, 0.06, 0.36);
            const cock = smoothWindow(t, 0.24, 0.46);
            const snapForward = Math.exp(-(((t - 0.52) / 0.1) ** 2));
            rot.x += -0.55 * reach - 0.85 * cock + 1.55 * snapForward;
            rot.z += 0.52 * reach - 0.25 * snapForward;
            rot.y += -0.45 * reach + 0.35 * snapForward;
          }
        } else if (j.role === "forearmR") {
          rot.x += -0.07 * Math.sin(a - 0.6);
          if (isNormal) {
            rot.x += -0.42 * prep + 0.66 * hit;
          } else if (isSpecial) {
            rot.x += -0.35 * invHold + 0.72 * slamDip;
          } else if (isAction) {
            rot.x += -0.66 * bell;
            rot.z += 0.35 * bell;
          } else if (isBomb) {
            const reach = smoothWindow(t, 0.06, 0.36);
            const snapForward = Math.exp(-(((t - 0.52) / 0.1) ** 2));
            rot.x += -0.82 * reach + 0.95 * snapForward;
          }
        } else if (j.role === "pincer") {
          const snap =
            (isNormal ? -0.32 * prep + 0.44 * hit : 0) +
            (isSpecial ? -0.28 * slamPrep + 0.42 * slamDip : 0) +
            (isAction ? 0.25 * Math.sin(a * 4) * bell : 0) +
            (isBomb
              ? -0.34 * smoothWindow(t, 0.14, 0.44) +
                0.56 * Math.exp(-(((t - 0.54) / 0.09) ** 2))
              : 0.08 * s2);
          rot.z += -j.side * snap;
        } else if (j.role === "leg") {
          // Weightless anti-gravity pedaling drift
          rot.x += 0.14 * (Math.sin(a + j.phase) - Math.sin(j.phase));
          rot.z += j.side * 0.04 * s;
          if (isNormal) rot.x += -0.28 * hit + 0.18 * prep;
          if (isSpecial) rot.x += 0.36 * invHold - 0.28 * slamDip;
          if (isAction) rot.x += -0.22 * bell;
        } else if (j.role === "shin") {
          rot.x += 0.12 * (Math.cos(a + j.phase) - Math.cos(j.phase));
          if (isSpecial) rot.x += 0.28 * invHold;
          if (isAction) rot.x += 0.26 * bell;
        } else if (j.role === "hoverfx") {
          rot.y += a;
          const pulse =
            1 +
            0.08 * s2 +
            (isSpecial ? 0.35 * slamDip : isAction ? 0.22 * bell : 0);
          scl.set(pulse, 1, pulse);
        } else if (j.role.endsWith("fx")) {
          let v = 0.00001;
          if (j.role === "normalfx" && isNormal) {
            v = Math.max(0.00001, hit);
          } else if (j.role === "specialfx" && isSpecial) {
            const wave = smoothWindow(t, 0.44, 0.86);
            v = Math.max(0.00001, wave);
            scl.set(v * (0.75 + t * 0.85), v, v * (0.75 + t * 0.85));
            rot.y += a * 2;
          } else if (j.role === "actionfx" && isAction) {
            v = Math.max(0.00001, bell);
            rot.y += a * 2;
          } else if (j.role === "bombfx" && isBomb) {
            const held = smoothPlateau(t, 0.14, 0.22, 0.48, 0.54);
            const launch = Math.max(0, (t - 0.48) / 0.08);
            v = Math.max(0.00001, held);
            if (t >= 0.48 && t <= 0.56) {
              p.z += launch * 1.15;
              p.y += launch * 0.55;
            }
            rot.y += a * 3;
          }
          if (!(j.role === "specialfx" && isSpecial)) {
            scl.setScalar(v);
          }
        }

        times.push(Number((t * duration).toFixed(5)));
        ps.push(...p.toArray());
        qs.push(...new T.Quaternion().setFromEuler(rot).toArray());
        ss.push(...scl.toArray());
        hasP ||= p.distanceToSquared(j.p) > 0.0000001;
        hasR ||=
          Math.abs(rot.x - j.r.x) +
            Math.abs(rot.y - j.r.y) +
            Math.abs(rot.z - j.r.z) >
          0.000001;
        hasS ||= scl.distanceToSquared(new T.Vector3(1, 1, 1)) > 0.000001;
      }

      if (hasP)
        tracks.push(
          new T.VectorKeyframeTrack(j.node.name + ".position", times, ps),
        );
      if (hasR)
        tracks.push(
          new T.QuaternionKeyframeTrack(j.node.name + ".quaternion", times, qs),
        );
      if (hasS)
        tracks.push(
          new T.VectorKeyframeTrack(j.node.name + ".scale", times, ss),
        );
      if (j.role.endsWith("fx") && j.role !== "hoverfx")
        j.node.scale.setScalar(0.00001);
    }

    clips.push(new T.AnimationClip(clipName, duration, tracks).optimize());
  }

  function optimizeGroup(g) {
    g.children.filter((x) => x.isGroup).forEach((x) => optimizeGroup(x));
    const byMat = new Map();
    [...g.children].forEach((obj) => {
      if (!obj.isMesh) return;
      obj.updateMatrix();
      const geo = obj.geometry.clone().applyMatrix4(obj.matrix);
      for (const attr of Object.keys(geo.attributes)) {
        if (attr !== "position" && attr !== "normal") geo.deleteAttribute(attr);
      }
      if (!geo.index) {
        geo.setIndex(
          Array.from({ length: geo.attributes.position.count }, (_, i) => i),
        );
      }
      let list = byMat.get(obj.material);
      if (!list) {
        list = [];
        byMat.set(obj.material, list);
      }
      list.push(geo);
      g.remove(obj);
    });
    byMat.forEach((geos, mat) => {
      const merged = mergeGeometries(geos, false);
      if (merged) {
        const mesh = new T.Mesh(merged, mat);
        mesh.name = g.name + "_" + mat.name;
        g.add(mesh);
      }
      geos.forEach((geo) => geo.dispose());
    });
  }

  optimizeGroup(root);
  root.animations = clips;
  root.updateMatrixWorld(true);
  return { root, clips };
}

async function main() {
  const { root, clips } = buildAlchemicalPuppet();
  const arrayBuf = await new GLTFExporter().parseAsync(root, {
    binary: true,
    animations: clips,
    onlyVisible: false,
    trs: true,
  });
  const bytes = Buffer.from(arrayBuf);
  const assetsOut = path.join(
    repoRoot,
    "万象酒馆-Demo",
    "assets",
    "alchemical-puppet.glb",
  );
  const atelierOut = path.join(
    repoRoot,
    "万象异境-体素模型",
    "alchemical-puppet.glb",
  );
  await mkdir(path.dirname(assetsOut), { recursive: true });
  await mkdir(path.dirname(atelierOut), { recursive: true });
  await writeFile(assetsOut, bytes);
  await writeFile(atelierOut, bytes);

  let triangles = 0;
  let meshes = 0;
  root.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      triangles +=
        (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
    }
  });
  console.log(
    `alchemical-puppet (raw geometry): ${Math.round(triangles).toLocaleString()} triangles, ${meshes} meshes, ${clips.length} clips, ${(bytes.byteLength / 1048576).toFixed(2)} MB`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}

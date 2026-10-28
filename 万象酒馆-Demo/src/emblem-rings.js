import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const RING_DESIGNS = Object.freeze({
  'tan-hongyu': {
    name: '溯源之衡',
    color: '#78d9cd',
    metal: '#d2ad68',
    detail: '双金属圆润戒臂托起低位六爪镶座。主石与两侧小钻保持对称，天平纹缩进戒肩浮雕里。',
  },
  'mizunatsuki-ran': {
    name: '灵能棱核',
    color: '#8e91e9',
    metal: '#657087',
    detail: '宽戒肩收进窄戒底，阶梯灵晶横卧于包镶托。三道导能槽沿外壁排开，内圈完整抛光。',
  },
  kamui: {
    name: '双龙归脉',
    color: '#76c9a0',
    metal: '#d6e4e2',
    detail: '银龙顺戒臂盘至戒面，两枚贴伏的龙首环抱翡翠。龙角向外回卷，鳞纹只落在外肩。',
  },
  'wind-dance': {
    name: '双相之祭',
    color: '#c8517c',
    metal: '#d9a18f',
    detail: '玫瑰金扭臂汇入低矮的双相假面戒面。黑白珐琅与榴红石相嵌，所有边缘收圆。',
  },
  'jiu-qi': {
    name: '寂月之瞳',
    color: '#9bb2ec',
    metal: '#dce4f2',
    detail: '渐宽的白金印戒肩承托月瞳包镶面。弦月与七粒星钻嵌于外沿，深蓝珐琅藏在外壁凹槽。',
  },
});

/** Finger axis is Z. A smooth, continuous radius-0.63 bore stays free of ornaments.
 * Gem tables face radially outward (+Y), not toward the finger's tip. */
export function createEmblemRing(id) {
  const design = RING_DESIGNS[id];
  if (!design) throw Error('Unknown ring: ' + id);
  const group = new THREE.Group();
  group.name = 'Emblem_Ring_' + id;
  const batches = new Map();
  const metal = new THREE.MeshStandardMaterial({
    color: design.metal,
    metalness: 0.98,
    roughness: 0.17,
  });
  const pale = new THREE.MeshStandardMaterial({
    color: '#eee9dc',
    metalness: 0.96,
    roughness: 0.2,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: '#cda567',
    metalness: 0.97,
    roughness: 0.22,
  });
  const enamel = new THREE.MeshPhysicalMaterial({
    color: '#101b31',
    roughness: 0.18,
    metalness: 0.15,
    clearcoat: 1,
  });
  const ivory = new THREE.MeshPhysicalMaterial({ color: '#eee6d8', roughness: 0.2, clearcoat: 1 });
  const stone = new THREE.MeshPhysicalMaterial({
    color: design.color,
    metalness: 0,
    roughness: 0.025,
    transmission: 0.64,
    thickness: 0.2,
    ior: 2.1,
    attenuationColor: design.color,
    attenuationDistance: 0.5,
    clearcoat: 1,
    flatShading: true,
    specularIntensity: 1.5,
  });
  const diamond = new THREE.MeshPhysicalMaterial({
    color: '#e6f2ff',
    roughness: 0.025,
    metalness: 0.15,
    clearcoat: 1,
    flatShading: true,
  });
  const materials = [metal, pale, gold, enamel, ivory, stone, diamond];
  function part(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      ),
    );
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    if (plain !== geometry) geometry.dispose();
    for (const key of Object.keys(plain.attributes))
      if (!['position', 'normal'].includes(key)) plain.deleteAttribute(key);
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push(plain);
  }
  function wire(points, radius = 0.014, material = metal) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    part(new THREE.TubeGeometry(curve, 56, radius, 10, false), material);
    for (const p of [points[0], points.at(-1)])
      part(new THREE.SphereGeometry(radius, 12, 8), material, p);
  }
  function bead(p, radius = 0.02, material = diamond) {
    part(new THREE.IcosahedronGeometry(radius, 1), material, p);
  }
  function band(topWidth) {
    const positions = [],
      indices = [];
    const segments = 256,
      cross = 40;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const width = 0.095 + topWidth * Math.max(0, Math.sin(a)) ** 6;
      for (let j = 0; j <= cross; j++) {
        const b = (j / cross) * Math.PI * 2,
          r = 0.71 + 0.08 * Math.cos(b);
        positions.push(Math.cos(a) * r, Math.sin(a) * r, width * Math.sin(b));
        if (i < segments && j < cross) {
          const n = i * (cross + 1) + j;
          indices.push(n, n + cross + 1, n + 1, n + 1, n + cross + 1, n + cross + 2);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    part(geometry, metal);
  }
  function gem(x, y, z, rx, rz, depth, sides = 16, material = stone, tilt = 0) {
    const positions = [];
    const levels = [
      [0.48, depth * 0.38],
      [0.74, depth * 0.23],
      [1, 0],
      [0.99, -depth * 0.07],
      [0.64, -depth * 0.37],
      [0.04, -depth * 0.72],
    ];
    const point = (level, step) => {
      const a =
        (step / sides) * Math.PI * 2 + Math.PI / sides + (level === 1 ? Math.PI / sides : 0);
      return [
        Math.cos(a) * rx * levels[level][0],
        levels[level][1],
        Math.sin(a) * rz * levels[level][0],
      ];
    };
    for (let i = 0; i < sides; i++) {
      positions.push(0, levels[0][1], 0, ...point(0, i + 1), ...point(0, i));
      for (let level = 0; level < levels.length - 1; level++) {
        const a = point(level, i),
          b = point(level, i + 1),
          c = point(level + 1, i + 1),
          d = point(level + 1, i);
        positions.push(...a, ...b, ...d, ...b, ...c, ...d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    part(geometry, material, [x, y, z], [0, 0, tilt]);
  }
  function stepGem(x, y, z, rx, rz, depth) {
    const outline = [
      [-0.72, -1],
      [0.72, -1],
      [1, -0.72],
      [1, 0.72],
      [0.72, 1],
      [-0.72, 1],
      [-1, 0.72],
      [-1, -0.72],
    ];
    const levels = [
      [0.57, depth * 0.37],
      [0.76, depth * 0.21],
      [1, 0],
      [0.98, -depth * 0.08],
      [0.64, -depth * 0.36],
      [0.12, -depth * 0.72],
    ];
    const positions = [];
    function point(level, step) {
      const p = outline[step % 8];
      return [p[0] * rx * levels[level][0], levels[level][1], p[1] * rz * levels[level][0]];
    }
    for (let i = 0; i < 8; i++) {
      positions.push(0, levels[0][1], 0, ...point(0, i + 1), ...point(0, i));
      for (let level = 0; level < levels.length - 1; level++) {
        const a = point(level, i),
          b = point(level, i + 1),
          c = point(level + 1, i + 1),
          d = point(level + 1, i);
        positions.push(...a, ...b, ...d, ...b, ...c, ...d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    part(geometry, stone, [x, y, z]);
  }
  function milgrain(rx, rz, y, count, material = pale, cx = 0, cz = 0, radius = 0.009) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      bead([cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz], radius, material);
    }
  }
  function shoulderScroll(sign, z, material = gold) {
    for (let i = 0; i < 3; i++) {
      const x = sign * (0.35 + i * 0.076),
        y = 0.73 - i * 0.068;
      wire(
        Array.from({ length: 25 }, (_, step) => {
          const a = (step / 24) * Math.PI * 2.2,
            r = 0.034 * (1 - step / 31);
          return [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
        }),
        0.005,
        material,
      );
    }
  }
  function outerRails(topWidth, material = pale) {
    for (const sign of [-1, 1]) {
      wire(
        Array.from({ length: 97 }, (_, i) => {
          const a = Math.PI * 0.07 + (i / 96) * Math.PI * 0.86;
          const width = 0.095 + topWidth * Math.max(0, Math.sin(a)) ** 6;
          return [Math.cos(a) * 0.763, Math.sin(a) * 0.763, sign * width * 0.7];
        }),
        0.008,
        material,
      );
    }
  }
  function oval(
    rx,
    rz,
    y,
    material = metal,
    tube = 0.018,
    cx = 0,
    cz = 0,
    start = 0,
    arc = Math.PI * 2,
  ) {
    wire(
      Array.from({ length: 65 }, (_, i) => {
        const a = start + (i / 64) * arc;
        return [cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz];
      }),
      tube,
      material,
    );
  }
  function basket(rx, rz, y, count, material = metal) {
    oval(rx * 0.67, rz * 0.67, y - 0.15, material, 0.02);
    oval(rx, rz, y - 0.025, material, 0.012);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      wire(
        [
          [Math.cos(a) * rx * 0.48, y - 0.2, Math.sin(a) * rz * 0.48],
          [Math.cos(a) * rx, y - 0.06, Math.sin(a) * rz],
          [Math.cos(a) * rx * 0.98, y + 0.03, Math.sin(a) * rz * 0.98],
          [Math.cos(a) * rx * 0.86, y + 0.06, Math.sin(a) * rz * 0.86],
        ],
        0.017,
        material,
      );
      const middle = a + Math.PI / count;
      wire(
        [
          [Math.cos(a) * rx * 0.65, y - 0.15, Math.sin(a) * rz * 0.65],
          [Math.cos(middle) * rx * 0.91, y - 0.075, Math.sin(middle) * rz * 0.91],
          [
            Math.cos(middle + Math.PI / count) * rx * 0.65,
            y - 0.15,
            Math.sin(middle + Math.PI / count) * rz * 0.65,
          ],
        ],
        0.007,
        material,
      );
    }
  }
  function shoulder(sign, split, material = metal) {
    for (const z of split ? [-0.105, 0.105] : [0])
      wire(
        [
          [sign * 0.58, 0.48, z],
          [sign * 0.44, 0.66, z],
          [sign * 0.25, 0.79, z],
          [sign * 0.1, 0.82, z],
        ],
        split ? 0.037 : 0.07,
        material,
      );
  }
  function shoulderPave(sign, material = diamond) {
    for (let i = 0; i < 11; i++) {
      const a = 0.55 + i * 0.057,
        x = sign * Math.cos(a),
        y = Math.sin(a);
      const tilt = Math.atan2(y, x) - Math.PI / 2;
      gem(x * 0.805, y * 0.805, 0, 0.027, 0.027, 0.035, 12, material, tilt);
      for (const z of [-0.037, 0.037]) bead([x * 0.804, y * 0.804, z], 0.009, metal);
    }
  }
  if (id === 'tan-hongyu') {
    band(0.035);
    outerRails(0.035);
    for (const sign of [-1, 1]) {
      shoulder(sign, true, sign < 0 ? pale : metal);
      shoulderPave(sign);
      gem(sign * 0.28, 0.84, 0, 0.086, 0.1, 0.1, 10, diamond);
      oval(0.09, 0.104, 0.834, pale, 0.012, sign * 0.28);
      wire(
        [
          [sign * 0.29, 0.75, 0.13],
          [sign * 0.21, 0.8, 0.15],
          [sign * 0.14, 0.75, 0.13],
        ],
        0.01,
        pale,
      );
      for (const z of [-0.133, 0.133]) shoulderScroll(sign, z, pale);
    }
    basket(0.21, 0.225, 0.98, 6, pale);
    gem(0, 0.98, 0, 0.21, 0.225, 0.22, 24);
    oval(0.24, 0.255, 0.922, pale, 0.012);
    milgrain(0.255, 0.27, 0.924, 48, metal);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      gem(Math.cos(a) * 0.237, 0.941, Math.sin(a) * 0.251, 0.017, 0.017, 0.022, 12, diamond);
    }
  } else if (id === 'mizunatsuki-ran') {
    band(0.11);
    outerRails(0.11, metal);
    for (const sign of [-1, 1]) {
      shoulder(sign, false);
      for (const z of [-0.1, 0, 0.1])
        wire(
          [
            [sign * 0.65, 0.45, z],
            [sign * 0.52, 0.62, z],
            [sign * 0.3, 0.77, z],
          ],
          0.011,
          enamel,
        );
      for (let i = 0; i < 5; i++) {
        const a = 0.62 + i * 0.11;
        const x = sign * Math.cos(a) * 0.802,
          y = Math.sin(a) * 0.802;
        wire(
          [
            [x, y, -0.11],
            [x - sign * 0.012, y + 0.012, 0],
            [x, y, 0.11],
          ],
          0.006,
          pale,
        );
        bead([x, y + 0.012, 0], 0.012, stone);
      }
    }
    const shape = new THREE.Shape();
    shape.moveTo(-0.21, -0.25);
    shape.lineTo(0.21, -0.25);
    shape.quadraticCurveTo(0.27, -0.25, 0.27, -0.19);
    shape.lineTo(0.27, 0.19);
    shape.quadraticCurveTo(0.27, 0.25, 0.21, 0.25);
    shape.lineTo(-0.21, 0.25);
    shape.quadraticCurveTo(-0.27, 0.25, -0.27, 0.19);
    shape.lineTo(-0.27, -0.19);
    shape.quadraticCurveTo(-0.27, -0.25, -0.21, -0.25);
    const hole = new THREE.Path();
    hole.moveTo(-0.22, -0.2);
    hole.lineTo(-0.22, 0.2);
    hole.lineTo(0.22, 0.2);
    hole.lineTo(0.22, -0.2);
    hole.closePath();
    shape.holes.push(hole);
    part(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.12,
        bevelEnabled: true,
        bevelThickness: 0.018,
        bevelSize: 0.015,
        bevelSegments: 8,
        steps: 1,
      }),
      metal,
      [0, 0.83, 0],
      [-Math.PI / 2, 0, 0],
    );
    stepGem(0, 0.975, 0, 0.214, 0.194, 0.21);
    for (const sign of [-1, 1]) {
      wire(
        [
          [sign * 0.235, 0.978, -0.175],
          [sign * 0.245, 0.978, 0],
          [sign * 0.235, 0.978, 0.175],
        ],
        0.006,
        pale,
      );
      for (const z of [-0.22, 0.22]) {
        bead([sign * 0.22, 0.967, z], 0.012, pale);
        gem(sign * 0.22, 0.982, z, 0.008, 0.008, 0.012, 8, stone);
      }
    }
  } else if (id === 'kamui') {
    band(0.075);
    outerRails(0.075, gold);
    for (const sign of [-1, 1]) {
      wire(
        [
          [sign * 0.65, 0.37, 0],
          [sign * 0.57, 0.62, sign * 0.1],
          [sign * 0.34, 0.82, sign * 0.13],
          [sign * 0.15, 0.88, sign * 0.19],
        ],
        0.066,
      );
      part(
        new THREE.SphereGeometry(0.1, 40, 24),
        metal,
        [sign * 0.16, 0.89, sign * 0.22],
        [0, 0, sign * 0.3],
        [0.85, 0.55, 1.35],
      );
      part(
        new THREE.SphereGeometry(0.056, 32, 20),
        metal,
        [sign * 0.14, 0.875, sign * 0.318],
        [0, 0, sign * 0.2],
        [0.9, 0.55, 1.15],
      );
      for (const offset of [-1, 1]) {
        bead([sign * 0.14 + offset * 0.018, 0.903, sign * 0.339], 0.006, enamel);
        wire(
          [
            [sign * 0.16 + offset * 0.04, 0.899, sign * 0.24],
            [sign * 0.15 + offset * 0.035, 0.882, sign * 0.3],
            [sign * 0.13 + offset * 0.025, 0.873, sign * 0.337],
          ],
          0.004,
          enamel,
        );
      }
      wire(
        [
          [sign * 0.13, 0.926, sign * 0.27],
          [sign * 0.19, 0.949, sign * 0.29],
          [sign * 0.23, 0.929, sign * 0.26],
        ],
        0.009,
        gold,
      );
      wire(
        [
          [sign * 0.19, 0.91, sign * 0.24],
          [sign * 0.3, 0.94, sign * 0.27],
          [sign * 0.35, 0.9, sign * 0.24],
        ],
        0.015,
        gold,
      );
      bead([sign * 0.115, 0.937, sign * 0.21], 0.017, stone);
      for (let row = -1; row <= 1; row++) {
        for (let i = 0; i < 10; i++) {
          const a = 0.5 + i * 0.069 + (Math.abs(row) ? 0.025 : 0);
          const x = sign * Math.cos(a) * 0.795,
            y = Math.sin(a) * 0.795,
            z = row * 0.047;
          wire(
            [
              [x - sign * 0.021, y - 0.018, z - 0.022],
              [x, y + 0.014, z],
              [x - sign * 0.021, y - 0.018, z + 0.022],
            ],
            0.0045,
            gold,
          );
        }
      }
    }
    basket(0.175, 0.23, 0.985, 4);
    gem(0, 0.985, 0, 0.175, 0.23, 0.21, 28);
    milgrain(0.191, 0.248, 0.957, 42, gold, 0, 0, 0.006);
  } else if (id === 'wind-dance') {
    band(0.055);
    outerRails(0.055, pale);
    for (const sign of [-1, 1]) {
      wire(
        [
          [sign * 0.64, 0.4, 0],
          [sign * 0.46, 0.66, sign * 0.075],
          [sign * 0.18, 0.81, sign * 0.12],
        ],
        0.045,
        sign < 0 ? pale : metal,
      );
      shoulderPave(sign, stone);
      for (const z of [-0.13, 0.13]) shoulderScroll(sign, z, metal);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.23);
      shape.bezierCurveTo(sign * 0.16, 0.29, sign * 0.29, 0.17, sign * 0.22, -0.03);
      shape.bezierCurveTo(sign * 0.18, -0.15, sign * 0.07, -0.22, 0, -0.25);
      shape.closePath();
      part(
        new THREE.ExtrudeGeometry(shape, {
          depth: 0.055,
          bevelEnabled: true,
          bevelSize: 0.023,
          bevelThickness: 0.02,
          bevelSegments: 8,
          steps: 1,
          curveSegments: 48,
        }),
        metal,
        [0, 0.845, 0],
        [-Math.PI / 2, 0, 0],
      );
      const face = new THREE.ShapeGeometry(shape, 48);
      const facePositions = face.attributes.position;
      for (let i = 0; i < facePositions.count; i++) {
        const x = facePositions.getX(i),
          z = facePositions.getY(i);
        facePositions.setZ(
          i,
          0.014 * Math.max(0, 1 - (x / 0.27) ** 2) * Math.max(0, 1 - (z / 0.3) ** 2),
        );
      }
      face.computeVertexNormals();
      part(face, sign < 0 ? ivory : enamel, [0, 0.925, 0], [-Math.PI / 2, 0, 0], [0.92, 0.92, 1]);
      const border = shape.getSpacedPoints(70);
      wire(
        border.map((p) => [p.x * 1.015, 0.925, -p.y * 1.015]),
        0.0045,
        gold,
      );
      for (let i = 0; i < border.length; i += 2)
        bead([border[i].x * 1.04, 0.925, -border[i].y * 1.04], 0.0038, pale);
      gem(sign * 0.105, 0.933, -0.05, 0.043, 0.022, 0.03, 8, sign < 0 ? enamel : diamond);
      wire(
        [
          [sign * 0.05, 0.932, -0.11],
          [sign * 0.13, 0.942, -0.105],
          [sign * 0.18, 0.93, -0.07],
        ],
        0.006,
        gold,
      );
      wire(
        [
          [sign * 0.05, 0.942, 0.005],
          [sign * 0.14, 0.943, 0.015],
          [sign * 0.18, 0.935, 0.065],
          [sign * 0.12, 0.94, 0.095],
          [sign * 0.09, 0.942, 0.065],
        ],
        0.0035,
        gold,
      );
    }
    wire(
      [
        [0, 0.94, -0.14],
        [0, 0.951, -0.02],
        [0, 0.951, 0.055],
        [0, 0.935, 0.19],
      ],
      0.0045,
      gold,
    );
    gem(0, 0.949, -0.15, 0.045, 0.063, 0.06, 20);
    oval(0.05, 0.068, 0.943, metal, 0.006, 0, -0.15);
    milgrain(0.055, 0.073, 0.945, 24, pale, 0, -0.15, 0.004);
    wire(
      [
        [-0.035, 0.936, 0.123],
        [0, 0.942, 0.135],
        [0.035, 0.936, 0.123],
      ],
      0.003,
      enamel,
    );
  } else {
    band(0.16);
    outerRails(0.16, pale);
    for (const sign of [-1, 1]) {
      shoulder(sign, false);
      for (const z of [-0.16, 0.16])
        wire(
          [
            [sign * 0.49, 0.65, z * 0.55],
            [sign * 0.36, 0.77, z],
            [sign * 0.18, 0.85, z],
          ],
          0.017,
          pale,
        );
      for (const z of [-0.19, 0.19]) shoulderScroll(sign, z, pale);
    }
    oval(0.27, 0.32, 0.88, metal, 0.05);
    oval(0.265, 0.315, 0.91, enamel, 0.025);
    gem(0, 0.94, 0, 0.2, 0.245, 0.15, 32);
    milgrain(0.293, 0.342, 0.907, 66, pale, 0, 0, 0.006);
    milgrain(0.238, 0.286, 0.929, 54, gold, 0, 0, 0.004);
    oval(0.225, 0.27, 0.96, pale, 0.017, -0.015, 0, Math.PI * 0.45, Math.PI * 1.1);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.4 + (i / 6) * Math.PI * 0.8,
        x = Math.cos(a) * 0.27,
        z = Math.sin(a) * 0.31;
      gem(x, 0.936, z, 0.023, 0.023, 0.03, 8, diamond);
      oval(0.026, 0.026, 0.93, metal, 0.006, x, z);
      for (const rotation of [0, Math.PI / 2])
        wire(
          [
            [x - Math.cos(rotation) * 0.039, 0.936, z - Math.sin(rotation) * 0.039],
            [x, 0.94, z],
            [x + Math.cos(rotation) * 0.039, 0.936, z + Math.sin(rotation) * 0.039],
          ],
          0.003,
          pale,
        );
    }
    gem(0, 1.003, 0, 0.035, 0.09, 0.025, 12, enamel);
    oval(0.049, 0.107, 1.003, gold, 0.0035);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      wire(
        [
          [Math.cos(a) * 0.053, 1.002, Math.sin(a) * 0.114],
          [Math.cos(a) * 0.075, 0.997, Math.sin(a) * 0.147],
        ],
        0.0018,
        pale,
      );
    }
  }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach((item) => item.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = id + '_' + group.children.length;
    group.add(mesh);
  }
  for (const material of materials) if (!batches.has(material)) material.dispose();
  group.userData.emblemId = id;
  group.userData.boreRadius = 0.63;
  return group;
}

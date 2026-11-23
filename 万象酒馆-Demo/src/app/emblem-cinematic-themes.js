import * as THREE from 'three';

const TAU = Math.PI * 2;

function freezeTheme(theme) {
  return Object.freeze({
    color: theme.color,
    secondary: theme.secondary,
    kind: theme.kind,
  });
}

export const EMBLEM_CINEMATIC_THEMES = Object.freeze({
  'tan-hongyu': freezeTheme({ color: '#f3cd76', secondary: '#f6efdc', kind: 'balance' }),
  'mizunatsuki-ran': freezeTheme({ color: '#9f9bff', secondary: '#84ddff', kind: 'lightning' }),
  kamui: freezeTheme({ color: '#6ce6b0', secondary: '#e2e5a5', kind: 'dragon' }),
  'wind-dance': freezeTheme({ color: '#ee5b96', secondary: '#f0e1e8', kind: 'mask' }),
  'jiu-qi': freezeTheme({ color: '#8eaefa', secondary: '#e8f2ff', kind: 'moon' }),
  'cang-ming': freezeTheme({ color: '#ff9c49', secondary: '#ffd67c', kind: 'shatter' }),
});

function drawPath(ctx, points, close) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  if (close) ctx.closePath();
}

function strokePoly(ctx, points, close) {
  drawPath(ctx, points, close);
  ctx.stroke();
}

function glowStroke(ctx, color, width, blur) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function drawBalance(ctx, theme) {
  const gold = theme.color;
  const ivory = theme.secondary;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (let i = -1; i <= 1; i += 1) {
    const x = 512 + i * 150;
    glowStroke(ctx, gold, 4, 6);
    ctx.beginPath();
    ctx.moveTo(x, 190);
    ctx.lineTo(x, 820);
    ctx.stroke();
  }

  glowStroke(ctx, ivory, 5, 6);
  ctx.beginPath();
  ctx.moveTo(512, 250);
  ctx.lineTo(512, 760);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(300, 330);
  ctx.lineTo(724, 330);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(512, 250);
  ctx.lineTo(512, 210);
  ctx.stroke();

  glowStroke(ctx, gold, 5, 7);
  strokePoly(
    ctx,
    [
      [512, 150],
      [560, 210],
      [512, 270],
      [464, 210],
    ],
    true,
  );

  const pans = [
    [300, 330],
    [724, 330],
  ];
  for (let p = 0; p < pans.length; p += 1) {
    const px = pans[p][0];
    const py = pans[p][1];
    glowStroke(ctx, ivory, 4, 5);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - 90, py + 150);
    ctx.moveTo(px, py);
    ctx.lineTo(px + 90, py + 150);
    ctx.stroke();

    glowStroke(ctx, gold, 5, 6);
    ctx.beginPath();
    ctx.moveTo(px - 110, py + 150);
    ctx.quadraticCurveTo(px, py + 260, px + 110, py + 150);
    ctx.stroke();

    for (let layer = 1; layer <= 3; layer += 1) {
      const spread = 110 - layer * 26;
      const drop = 150 + layer * 26;
      glowStroke(ctx, layer === 2 ? ivory : gold, 4, 4);
      ctx.beginPath();
      ctx.moveTo(px - spread, py + drop);
      ctx.quadraticCurveTo(px, py + drop + 70 - layer * 12, px + spread, py + drop);
      ctx.stroke();
    }
  }

  glowStroke(ctx, gold, 4, 6);
  for (let i = -3; i <= 3; i += 1) {
    const a = -Math.PI / 2 + i * 0.16;
    ctx.beginPath();
    ctx.moveTo(512 + Math.cos(a) * 90, 800 + Math.sin(a) * 40);
    ctx.lineTo(512 + Math.cos(a) * 200, 800 + Math.sin(a) * 120);
    ctx.stroke();
  }

  glowStroke(ctx, ivory, 4, 5);
  ctx.beginPath();
  ctx.arc(512, 760, 46, 0, TAU);
  ctx.stroke();
}

function drawLightning(ctx, theme) {
  const violet = theme.color;
  const ice = theme.secondary;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const hex = [];
  for (let i = 0; i < 6; i += 1) {
    const a = -Math.PI / 2 + (i * TAU) / 6;
    hex.push([512 + Math.cos(a) * 120, 512 + Math.sin(a) * 120]);
  }

  glowStroke(ctx, ice, 4, 5);
  strokePoly(ctx, hex, true);
  for (let i = 0; i < 6; i += 1) {
    const p = hex[i];
    const q = hex[(i + 1) % 6];
    ctx.beginPath();
    ctx.moveTo(512, 512);
    ctx.lineTo(p[0], p[1]);
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  }

  glowStroke(ctx, violet, 6, 7);
  for (let ring = 0; ring < 2; ring += 1) {
    const r = 210 + ring * 90;
    for (let seg = 0; seg < 6; seg += 1) {
      const a0 = -Math.PI / 2 + (seg * TAU) / 6 + 0.12;
      const a1 = a0 + TAU / 6 - 0.24;
      ctx.beginPath();
      ctx.arc(512, 512, r, a0, a1);
      ctx.stroke();
    }
  }

  glowStroke(ctx, ice, 5, 6);
  for (let d = 0; d < 6; d += 1) {
    const base = -Math.PI / 2 + (d * TAU) / 6;
    const pts = [[512, 512]];
    let x = 512 + Math.cos(base) * 140;
    let y = 512 + Math.sin(base) * 140;
    pts.push([x, y]);
    for (let s = 1; s <= 4; s += 1) {
      const wobble = Math.sin(d * 2.3 + s * 1.7) * 34;
      const dist = 140 + s * 62;
      const ang = base + wobble * 0.004;
      x = 512 + Math.cos(ang) * dist + Math.cos(base + Math.PI / 2) * wobble;
      y = 512 + Math.sin(ang) * dist + Math.sin(base + Math.PI / 2) * wobble;
      pts.push([x, y]);
    }
    strokePoly(ctx, pts, false);
  }

  glowStroke(ctx, violet, 4, 5);
  ctx.beginPath();
  ctx.moveTo(150, 300);
  ctx.lineTo(150, 724);
  ctx.moveTo(874, 300);
  ctx.lineTo(874, 724);
  ctx.stroke();

  glowStroke(ctx, ice, 4, 4);
  ctx.beginPath();
  ctx.moveTo(512, 470);
  ctx.lineTo(548, 512);
  ctx.lineTo(512, 554);
  ctx.lineTo(476, 512);
  ctx.closePath();
  ctx.stroke();
}

function drawDragon(ctx, theme) {
  const jade = theme.color;
  const pale = theme.secondary;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  glowStroke(ctx, pale, 4, 5);
  ctx.beginPath();
  ctx.arc(512, 512, 150, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(512, 512, 96, 0, TAU);
  ctx.stroke();

  for (let side = -1; side <= 1; side += 2) {
    glowStroke(ctx, jade, 6, 7);
    ctx.beginPath();
    ctx.moveTo(512 + side * 60, 760);
    ctx.bezierCurveTo(512 + side * 320, 640, 512 + side * 40, 420, 512 + side * 260, 300);
    ctx.stroke();

    const hx = 512 + side * 260;
    const hy = 300;
    glowStroke(ctx, pale, 5, 6);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.bezierCurveTo(hx + side * 70, hy - 40, hx + side * 90, hy + 30, hx + side * 40, hy + 60);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hx + side * 10, hy - 20);
    ctx.lineTo(hx + side * 60, hy - 90);
    ctx.lineTo(hx + side * 30, hy - 10);
    ctx.stroke();

    glowStroke(ctx, jade, 4, 4);
    ctx.beginPath();
    ctx.arc(hx + side * 20, hy + 6, 10, 0, TAU);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(hx + side * 40, hy + 40);
    ctx.lineTo(hx + side * 78, hy + 52);
    ctx.stroke();
  }

  glowStroke(ctx, pale, 5, 6);
  for (let b = -1; b <= 1; b += 1) {
    const bx = 512 + b * 70;
    ctx.beginPath();
    ctx.moveTo(512, 700);
    ctx.quadraticCurveTo(bx, 560, bx, 400);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, 400);
    ctx.lineTo(bx - 30, 340);
    ctx.moveTo(bx, 400);
    ctx.lineTo(bx + 30, 340);
    ctx.stroke();
  }

  glowStroke(ctx, jade, 4, 5);
  ctx.beginPath();
  ctx.arc(512, 512, 40, 0, TAU);
  ctx.stroke();
}

function drawMask(ctx, theme) {
  const rose = theme.color;
  const white = theme.secondary;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  glowStroke(ctx, white, 5, 6);
  ctx.beginPath();
  ctx.moveTo(512, 220);
  ctx.bezierCurveTo(360, 240, 300, 380, 320, 520);
  ctx.bezierCurveTo(340, 640, 420, 720, 512, 780);
  ctx.stroke();

  glowStroke(ctx, rose, 5, 6);
  ctx.beginPath();
  ctx.moveTo(512, 260);
  ctx.bezierCurveTo(660, 280, 720, 400, 700, 540);
  ctx.bezierCurveTo(680, 660, 600, 740, 512, 800);
  ctx.stroke();

  glowStroke(ctx, white, 4, 5);
  ctx.beginPath();
  ctx.moveTo(360, 470);
  ctx.quadraticCurveTo(420, 440, 470, 480);
  ctx.stroke();

  glowStroke(ctx, rose, 4, 5);
  ctx.beginPath();
  ctx.moveTo(560, 500);
  ctx.quadraticCurveTo(620, 470, 670, 510);
  ctx.stroke();

  glowStroke(ctx, white, 4, 4);
  ctx.beginPath();
  ctx.moveTo(400, 620);
  ctx.quadraticCurveTo(440, 600, 480, 620);
  ctx.stroke();

  glowStroke(ctx, rose, 4, 4);
  ctx.beginPath();
  ctx.moveTo(560, 640);
  ctx.quadraticCurveTo(600, 660, 640, 640);
  ctx.stroke();

  glowStroke(ctx, white, 5, 6);
  ctx.beginPath();
  ctx.moveTo(512, 200);
  ctx.lineTo(500, 400);
  ctx.lineTo(524, 560);
  ctx.lineTo(508, 800);
  ctx.stroke();

  glowStroke(ctx, rose, 4, 5);
  for (let i = 0; i < 7; i += 1) {
    const a = (i * TAU) / 7 + 0.4;
    const r = 300 + (i % 3) * 40;
    const cx = 512 + Math.cos(a) * r;
    const cy = 512 + Math.sin(a) * r;
    strokePoly(
      ctx,
      [
        [cx, cy - 22],
        [cx + 16, cy],
        [cx, cy + 22],
        [cx - 16, cy],
      ],
      true,
    );
  }

  glowStroke(ctx, white, 4, 4);
  for (let i = 0; i < 3; i += 1) {
    const a = -Math.PI / 2 + i * 0.9;
    const cx = 512 + Math.cos(a) * 250;
    const cy = 512 + Math.sin(a) * 250;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 18);
    ctx.quadraticCurveTo(cx + 14, cy, cx, cy + 24);
    ctx.quadraticCurveTo(cx - 14, cy, cx, cy - 18);
    ctx.stroke();
  }
}

function drawMoon(ctx, theme) {
  const blue = theme.color;
  const silver = theme.secondary;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  glowStroke(ctx, silver, 5, 6);
  ctx.beginPath();
  ctx.arc(512, 512, 300, 0, TAU);
  ctx.stroke();

  glowStroke(ctx, silver, 6, 7);
  ctx.beginPath();
  ctx.arc(512, 512, 240, -Math.PI * 0.62, Math.PI * 0.62);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(560, 512, 210, Math.PI * 0.55, -Math.PI * 0.55, true);
  ctx.stroke();

  glowStroke(ctx, silver, 5, 6);
  ctx.beginPath();
  ctx.moveTo(360, 512);
  ctx.bezierCurveTo(430, 440, 594, 440, 664, 512);
  ctx.bezierCurveTo(594, 584, 430, 584, 360, 512);
  ctx.stroke();

  glowStroke(ctx, blue, 5, 7);
  ctx.beginPath();
  ctx.moveTo(512, 430);
  ctx.bezierCurveTo(540, 480, 540, 544, 512, 594);
  ctx.bezierCurveTo(484, 544, 484, 480, 512, 430);
  ctx.stroke();

  ctx.fillStyle = blue;
  ctx.shadowColor = blue;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.ellipse(512, 512, 16, 34, 0, 0, TAU);
  ctx.fill();

  glowStroke(ctx, silver, 4, 5);
  for (let i = 0; i < 7; i += 1) {
    const a = -Math.PI * 0.85 + (i * Math.PI * 1.7) / 6;
    const r = 340;
    const cx = 512 + Math.cos(a) * r;
    const cy = 512 + Math.sin(a) * r;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx + 6, cy - 4);
    ctx.lineTo(cx + 18, cy);
    ctx.lineTo(cx + 6, cy + 4);
    ctx.lineTo(cx, cy + 16);
    ctx.lineTo(cx - 6, cy + 4);
    ctx.lineTo(cx - 18, cy);
    ctx.lineTo(cx - 6, cy - 4);
    ctx.closePath();
    ctx.stroke();
  }
}

function drawShatter(ctx, theme) {
  const copper = theme.color;
  const gold = theme.secondary;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const plates = [
    [
      [512, 300],
      [600, 340],
      [580, 430],
      [500, 420],
    ],
    [
      [600, 340],
      [700, 380],
      [660, 470],
      [580, 430],
    ],
    [
      [580, 430],
      [660, 470],
      [620, 560],
      [540, 520],
    ],
    [
      [500, 420],
      [580, 430],
      [540, 520],
      [460, 500],
    ],
    [
      [460, 500],
      [540, 520],
      [500, 620],
      [420, 580],
    ],
    [
      [420, 580],
      [500, 620],
      [460, 700],
      [380, 660],
    ],
    [
      [380, 660],
      [460, 700],
      [420, 760],
      [340, 720],
    ],
    [
      [540, 520],
      [620, 560],
      [580, 660],
      [500, 620],
    ],
  ];

  for (let i = 0; i < plates.length; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,156,73,0.18)' : 'rgba(255,214,124,0.12)';
    drawPath(ctx, plates[i], true);
    ctx.fill();
    glowStroke(ctx, gold, 5, 6);
    strokePoly(ctx, plates[i], true);
  }

  glowStroke(ctx, copper, 6, 7);
  for (let i = 0; i < 8; i += 1) {
    const a = (i * TAU) / 8 + 0.2;
    const x0 = 512 + Math.cos(a) * 200;
    const y0 = 512 + Math.sin(a) * 200;
    const x1 = 512 + Math.cos(a) * 360;
    const y1 = 512 + Math.sin(a) * 360;
    const nx = Math.cos(a + Math.PI / 2) * 26;
    const ny = Math.sin(a + Math.PI / 2) * 26;
    strokePoly(
      ctx,
      [
        [x0 + nx, y0 + ny],
        [x1, y1],
        [x0 - nx, y0 - ny],
      ],
      false,
    );
  }

  glowStroke(ctx, gold, 5, 6);
  ctx.beginPath();
  ctx.arc(512, 512, 70, 0, TAU);
  ctx.stroke();

  ctx.fillStyle = copper;
  ctx.shadowColor = copper;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(512, 512, 34, 0, TAU);
  ctx.fill();
}

const DRAWERS = Object.freeze({
  balance: drawBalance,
  lightning: drawLightning,
  dragon: drawDragon,
  mask: drawMask,
  moon: drawMoon,
  shatter: drawShatter,
});

export function createEmblemMotif(resources, id, mobile = false) {
  const theme = EMBLEM_CINEMATIC_THEMES[id];
  if (!theme) {
    throw new Error(`Unknown emblem cinematic theme: ${id}`);
  }
  const drawer = DRAWERS[theme.kind];
  if (!drawer) {
    throw new Error(`Unknown emblem motif kind: ${theme.kind}`);
  }

  const size = mobile ? 512 : 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for emblem motif');
  }

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  const scale = size / 1024;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  drawer(ctx, theme);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  if (resources && typeof resources.track === 'function') {
    resources.track(texture);
  }
  return texture;
}

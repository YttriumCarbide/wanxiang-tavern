import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { shade, renderVoxelEnemyPortrait } from './voxel-enemy-art.mjs';
import { createVoxelBuilder, finalizeVoxelComplexity } from './expanded-voxel-helpers.mjs';

export const MILL_VOXEL_ENEMIES = Object.freeze([
  // 7 Mobs (52..80 boxes)
  {
    id: 'millMossBug',
    name: '苔背甲虫',
    portrait: 'mill-moss-bug',
    model: 'mill-moss-bug.glb',
    color: '#6b9456',
  },
  {
    id: 'millCanalFrog',
    name: '水渠青蛙',
    portrait: 'mill-canal-frog',
    model: 'mill-canal-frog.glb',
    color: '#528a6e',
  },
  {
    id: 'millShellBeetle',
    name: '大壳甲虫',
    portrait: 'mill-shell-beetle',
    model: 'mill-shell-beetle.glb',
    color: '#697882',
  },
  {
    id: 'millNettle',
    name: '伤人荨麻',
    portrait: 'mill-nettle',
    model: 'mill-nettle.glb',
    color: '#5a8f49',
  },
  {
    id: 'millVolePup',
    name: '巨型田鼠幼崽',
    portrait: 'mill-vole-pup',
    model: 'mill-vole-pup.glb',
    color: '#9c7e63',
  },
  {
    id: 'millStrayCat',
    name: '流浪野猫',
    portrait: 'mill-stray-cat',
    model: 'mill-stray-cat.glb',
    color: '#6e737d',
  },
  {
    id: 'millDustBat',
    name: '灰尘蝠',
    portrait: 'mill-dust-bat',
    model: 'mill-dust-bat.glb',
    color: '#8c857b',
  },
  // 3 Elites (115..160 boxes)
  {
    id: 'millGiantVole',
    name: '巨型田鼠',
    portrait: 'mill-giant-vole',
    model: 'mill-giant-vole.glb',
    color: '#8a684c',
    elite: true,
  },
  {
    id: 'millMiniMoldSlime',
    name: '小型霉斑史莱姆',
    portrait: 'mill-mini-mold-slime',
    model: 'mill-mini-mold-slime.glb',
    color: '#68a36f',
    elite: true,
  },
  {
    id: 'millPaleSlug',
    name: '灰白蛞蝓',
    portrait: 'mill-pale-slug',
    model: 'mill-pale-slug.glb',
    color: '#cbc6ba',
    elite: true,
  },
  // 4 Bosses (205..285 boxes)
  {
    id: 'millVoleAlpha',
    name: '田鼠头鼠',
    portrait: 'mill-vole-alpha',
    model: 'mill-vole-alpha.glb',
    color: '#9e744f',
    boss: true,
  },
  {
    id: 'millRoachSwarm',
    name: '硬翅蟑螂群',
    portrait: 'mill-roach-swarm',
    model: 'mill-roach-swarm.glb',
    color: '#7a4e35',
    boss: true,
  },
  {
    id: 'millVampireBat',
    name: '吸血灰尘蝠',
    portrait: 'mill-vampire-bat',
    model: 'mill-vampire-bat.glb',
    color: '#9e3b4c',
    boss: true,
  },
  {
    id: 'millMoldSlimeBoss',
    name: '霉斑史莱姆',
    portrait: 'mill-mold-slime-boss',
    model: 'mill-mold-slime-boss.glb',
    color: '#5bb86e',
    boss: true,
  },
]);

const TIER_BOUNDS = {
  mob: [52, 80],
  elite: [115, 160],
  boss: [205, 285],
};

export function millEnemyBlocks(enemy) {
  const b = createVoxelBuilder(enemy);
  const {
    add,
    pair,
    line,
    eyes,
    limbPair,
    wingPair,
    hornPair,
    tailSweep,
    spineRidge,
    orbitingShards,
  } = b;
  const chitin = '#353e38';
  const iron = '#68737a';
  const steel = '#9faab0';
  const brass = '#c9a356';
  const burlap = '#a89068';
  const flour = '#ebe5d5';
  const bone = '#e3dac4';
  const crimson = '#d93b52';
  const sporeGlow = '#b6f77e';
  const amberGlow = '#ffe082';

  switch (enemy.id) {
    // ======================== 7 MOBS (52..80 boxes) ========================
    case 'millMossBug': {
      // Domed chitin pillbug overgrown with lush moss cushions & tall glowing fern-spore stalks
      for (let i = -1; i <= 1; i++) {
        limbPair('Legs', i * 0.9, 0.85, 1.32, 0.85, 0.34, chitin, '#4a574d');
      }
      add('Carapace', 0, 0.72, 0, 3.1, 2.35, 0.88, chitin);
      add('Carapace', 0.05, 1.52, 0, 2.75, 2.1, 0.62, '#47544a');
      // Cushion moss pads & sprouting fern shoots rising to y ~ 3.55
      for (let k = 0; k < 5; k++) {
        const mx = -1.0 + k * 0.5;
        const my = 2.02 + Math.sin((k / 4) * Math.PI) * 0.25;
        add(
          'MossBack',
          mx,
          my,
          (k % 2 ? 1 : -1) * 0.22,
          0.82,
          1.55,
          0.46,
          k % 2 ? '#6b9456' : '#82b065',
        );
      }
      line('FernStalk', [-0.35, 2.35, 0.18], [-0.75, 3.42, 0.36], 0.2, '#588748', 4);
      line('FernStalk', [0.28, 2.38, -0.2], [0.52, 3.5, -0.32], 0.2, '#6fa158', 4);
      add('Spores', -0.78, 3.45, 0.36, 0.34, 0.34, 0.28, sporeGlow);
      add('Spores', 0.54, 3.52, -0.32, 0.36, 0.36, 0.3, sporeGlow);
      add('Head', 1.68, 0.78, 0, 0.95, 1.35, 0.76, chitin);
      eyes(2.15, 1.16, 0.42, 0.22, sporeGlow);
      hornPair('Antennae', 2.05, 1.35, 0.32, 3, 0.28, 0.24, 0.16, 0.2, '#82b065');
      break;
    }

    case 'millCanalFrog': {
      // Plump canal bullfrog with inflated cream vocal sac, folded hind-jumpers & reed-crest splash
      limbPair('HindLegs', -0.78, 1.15, 1.28, 1.18, 0.56, '#335c49', '#467a62');
      limbPair('ForeLegs', 0.95, 0.98, 0.95, 0.98, 0.4, '#335c49', '#528a6e');
      add('Body', 0, 0.88, 0, 2.55, 2.15, 1.28, '#487d63');
      add('Belly', 0.38, 0.72, 0, 2.05, 1.75, 0.78, '#cfc49b');
      add('VocalSac', 1.32, 0.82, 0, 1.15, 1.48, 0.96, '#e6dbb0');
      add('Head', 0.92, 1.78, 0, 1.65, 1.92, 0.88, '#589677');
      pair('EyeDomes', 1.18, 2.58, 0.58, 0.54, 0.48, 0.48, '#6aad8a');
      eyes(1.46, 2.72, 0.62, 0.24, amberGlow);
      spineRidge('Warts', -0.95, 2.1, 0.42, 5, 0.34, '#38634e');
      // Canal cattail reed rising beside its back so height > 3.45
      line('CanalReed', [-1.15, 0.2, -0.82], [-1.28, 3.15, -0.92], 0.18, '#5d7d47', 6);
      add('ReedHead', -1.28, 3.05, -0.92, 0.32, 0.32, 0.68, '#6b4c35');
      break;
    }

    case 'millShellBeetle': {
      // Heavy slate-iron carapace beetle dusted with flour, crowned by a tall forked stag-horn
      for (let i = -1; i <= 1; i++) {
        limbPair('Legs', i * 0.88, 0.95, 1.36, 0.96, 0.38, '#2b3338', '#4f5d66');
      }
      add('Shell', -0.15, 0.88, 0, 3.05, 2.42, 1.18, '#53626b');
      add('Shell', -0.1, 1.98, 0, 2.55, 2.02, 0.54, '#738591');
      add('Seam', -0.1, 2.48, 0, 2.45, 0.18, 0.14, '#2d373d');
      pair('FlourDust', -0.35, 2.42, 0.56, 0.88, 0.58, 0.16, flour);
      add('Head', 1.55, 1.05, 0, 1.15, 1.55, 0.96, '#39444b');
      eyes(2.12, 1.52, 0.48, 0.22, amberGlow);
      pair('Mandibles', 2.25, 1.02, 0.46, 0.68, 0.24, 0.26, steel);
      // Sweeping upward rhinoceros horn reaching y ~ 3.68
      line('Horn', [1.85, 1.72, 0], [2.55, 3.35, 0], 0.28, '#46535c', 5);
      pair('HornFork', 2.62, 3.38, 0.36, 0.38, 0.36, 0.36, steel);
      break;
    }

    case 'millNettle': {
      // Predatory thorny nettle cluster with snapping barbed pod-head & acid spines
      for (let r = 0; r < 4; r++) {
        const a = (r * Math.PI) / 2 + 0.4;
        line(
          'Roots',
          [0, 0.35, 0],
          [Math.cos(a) * 1.45, 0.08, Math.sin(a) * 1.45],
          0.26,
          '#594530',
          3,
        );
      }
      line('MainStalk', [0, 0.28, 0], [-0.35, 1.85, 0], 0.38, '#2e5c34', 4);
      line('MainStalk', [-0.35, 1.85, 0], [0.45, 3.25, 0], 0.34, '#3d7540', 4);
      for (const side of [-1, 1]) {
        line('SideVines', [0, 0.65, 0], [side * 0.35, 2.45, side * 1.15], 0.24, '#4b8546', 4);
        pair('SerratedLeaves', 0.15, 1.55, 0.92, 0.95, 0.72, 0.22, '#5a9649');
        pair('SerratedLeaves', -0.1, 2.42, 0.82, 0.85, 0.68, 0.2, '#6eb056');
      }
      add('PodHead', 0.65, 3.05, 0, 1.18, 1.12, 0.86, '#487d3e');
      add('Maw', 1.18, 3.12, 0, 0.45, 0.82, 0.42, '#281d26');
      eyes(1.05, 3.62, 0.36, 0.2, sporeGlow);
      hornPair('Thorns', 0.55, 3.78, 0.28, 3, 0.12, 0.22, 0.12, 0.22, '#dcf779');
      break;
    }

    case 'millVolePup': {
      // Chubby-cheeked giant vole pup reared up on hind paws clutching a stolen wheat ear
      limbPair('HindPaws', -0.15, 1.05, 0.62, 1.05, 0.46, '#cfa593', '#806248');
      add('Body', 0, 0.92, 0, 1.68, 1.58, 1.62, '#9c7e63');
      add('Belly', 0.48, 1.02, 0, 0.58, 1.22, 1.32, '#e3d3be');
      add('Head', 0.28, 2.38, 0, 1.38, 1.44, 1.12, '#ab8b6e');
      pair('Cheeks', 0.72, 2.42, 0.56, 0.62, 0.54, 0.56, '#bfa082');
      add('Snout', 1.08, 2.52, 0, 0.52, 0.64, 0.48, '#e3b6a4');
      add('Teeth', 1.18, 2.24, 0, 0.18, 0.34, 0.32, '#f5c76b');
      eyes(0.88, 2.98, 0.46, 0.22, '#241c18');
      pair('Ears', -0.05, 3.25, 0.64, 0.28, 0.58, 0.58, '#d9a796');
      pair('ForePaws', 0.78, 1.78, 0.58, 0.48, 0.38, 0.38, '#cfa593');
      // Stolen golden wheat stalk held diagonally up to y ~ 3.68
      line('WheatStalk', [0.88, 1.55, 0.45], [1.18, 3.55, -0.35], 0.16, '#dec068', 5);
      add('WheatEar', 1.22, 3.25, -0.35, 0.38, 0.38, 0.62, '#f2d574');
      tailSweep('Tail', -0.88, 0.75, 5, -0.34, 0.14, 0.22, 0.32, '#cfa593', null);
      break;
    }

    case 'millStrayCat': {
      // Lean scarred alley/mill stray cat with arched back, bottleneck tail & emerald slit eyes
      limbPair('ForeLegs', 0.98, 1.32, 0.52, 1.32, 0.36, flour, '#585d66');
      limbPair('HindLegs', -0.95, 1.38, 0.56, 1.38, 0.4, flour, '#4b5059');
      // High arched spine torso
      add('Torso', 0.42, 1.28, 0, 1.35, 1.08, 0.98, '#636873');
      add('Torso', -0.38, 1.52, 0, 1.38, 1.06, 1.08, '#535863');
      spineRidge('Bristles', -0.85, 2.48, 0.36, 5, 0.38, '#373b42');
      add('Head', 1.42, 1.92, 0, 1.12, 1.16, 0.98, '#6e737d');
      add('Muzzle', 1.98, 1.95, 0, 0.46, 0.72, 0.46, flour);
      eyes(1.94, 2.42, 0.36, 0.22, '#8ef772');
      // Left ear intact, right ear notched
      add('Ears', 1.32, 2.86, 0.42, 0.32, 0.32, 0.48, '#4b5059');
      add('Ears', 1.32, 2.86, -0.42, 0.32, 0.32, 0.28, '#4b5059');
      // Raised bristling bottleneck tail reaching y ~ 3.72
      line('Tail', [-1.05, 1.95, 0], [-1.42, 3.58, 0.12], 0.34, '#454a54', 5);
      add('TailTip', -1.44, 3.52, 0.12, 0.42, 0.42, 0.34, flour);
      break;
    }

    case 'millDustBat': {
      // Soot-and-flour-coated attic bat hovering mid-flap above dust motes
      limbPair('Claws', -0.08, 1.28, 0.48, 1.28, 0.34, '#36322e', '#69625a');
      add('Body', 0, 1.38, 0, 1.48, 1.32, 1.58, '#787168');
      add('FlourFur', 0.48, 1.55, 0, 0.56, 1.12, 1.18, '#cfc8b8');
      add('Head', 0.52, 2.82, 0, 1.15, 1.12, 0.98, '#8c857b');
      add('Snout', 1.12, 2.88, 0, 0.42, 0.58, 0.46, '#5c4d49');
      eyes(1.08, 3.32, 0.34, 0.22, crimson);
      pair('Fangs', 1.14, 2.74, 0.22, 0.16, 0.14, 0.26, bone);
      hornPair('Ears', 0.35, 3.68, 0.42, 3, -0.06, 0.26, 0.12, 0.28, '#59534c');
      wingPair('Wings', -0.12, 2.38, 0.68, 2.45, 1.2, '#69625a', '#cfc8b8', 6);
      orbitingShards('DustMotes', 0.1, 1.05, 0, 1.65, 6, 0.2, flour, 0.24);
      break;
    }

    // ======================== 3 ELITES (115..160 boxes) ========================
    case 'millGiantVole': {
      // Hulking scarred adult dire-vole tearing open a grain sack strip
      limbPair('HindLegs', -0.82, 1.48, 1.08, 1.48, 0.64, '#b88f7d', '#6e5038');
      limbPair('ForeLegs', 1.05, 1.42, 0.96, 1.42, 0.58, '#b88f7d', '#7d5c41');
      add('Body', -0.15, 1.28, 0, 2.95, 2.25, 1.85, '#8a684c');
      add('Hunch', 0.35, 2.65, 0, 2.15, 1.98, 0.95, '#75563d');
      add('Belly', 0.25, 1.08, 0, 2.35, 1.78, 0.85, '#d6c2ab');
      spineRidge('BristleMane', -1.15, 3.15, 0.36, 7, 0.62, '#543c2a');
      add('Head', 1.68, 2.25, 0, 1.62, 1.68, 1.32, '#997558');
      pair('Jowls', 2.05, 2.18, 0.68, 0.82, 0.64, 0.72, '#ab8668');
      add('Snout', 2.58, 2.35, 0, 0.78, 0.92, 0.72, '#c99b88');
      pair('Incisors', 2.78, 1.82, 0.22, 0.24, 0.28, 0.62, '#f2be5c');
      eyes(2.28, 2.98, 0.56, 0.26, '#ff6e4a');
      pair('Ears', 1.25, 3.42, 0.78, 0.34, 0.68, 0.68, '#bf907e');
      for (const side of [-1, 1]) {
        line('Whiskers', [2.55, 2.48, side * 0.45], [2.75, 2.65, side * 1.35], 0.12, flour, 3);
        line('Claws', [1.45, 0.22, side * 0.96], [2.05, 0.14, side * 1.02], 0.18, bone, 3);
      }
      // Torn burlap sack shred pinned under forepaw
      add('TornSack', 1.95, 0.08, 0.15, 1.15, 1.45, 0.24, burlap);
      add('SpilledGrain', 2.25, 0.28, -0.1, 0.68, 0.78, 0.22, '#ebd178');
      tailSweep('Tail', -1.68, 1.25, 10, -0.38, 0.18, 0.34, 0.56, '#be9382', '#7d5c41');
      orbitingShards('FlourMotes', 0.3, 2.2, 0, 2.15, 10, 0.2, flour, 0.35);
      break;
    }

    case 'millMiniMoldSlime': {
      // Multi-layered putrid-jade mold slime with floating wooden cog, toxic core & spore stalks
      add('SlimeFoot', 0, 0.04, 0, 3.85, 3.75, 0.48, '#2d543a');
      add('SlimeBody', 0, 0.52, 0, 3.45, 3.35, 1.08, '#467d54');
      add('SlimeBody', 0.08, 1.58, 0, 2.88, 2.82, 1.02, '#68a36f');
      add('SlimeDome', 0.15, 2.55, 0, 2.12, 2.08, 0.78, '#85c488');
      // Velvety white-teal penicillin mold patches dotting surface
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r = 1.48 - (i % 3) * 0.26;
        add(
          'MoldPatches',
          Math.cos(a) * r,
          0.95 + (i % 4) * 0.58,
          Math.sin(a) * r,
          0.52,
          0.52,
          0.26,
          i % 2 ? '#cbe8d4' : '#9cc7b2',
        );
      }
      // Glowing toxic nucleus + trapped wooden mill cog inside body
      add('Core', 0.32, 1.35, 0, 1.25, 1.25, 1.25, sporeGlow);
      for (let t = 0; t < 6; t++) {
        const a = (t / 6) * Math.PI * 2;
        add(
          'TrappedCog',
          -0.35 + Math.cos(a) * 0.65,
          1.75 + Math.sin(a) * 0.65,
          0.42,
          0.28,
          0.24,
          0.28,
          '#7a5d3e',
        );
      }
      eyes(1.22, 2.38, 0.52, 0.3, amberGlow);
      // Sprouting fruiting mold-mushroom stalks rising to y ~ 3.98
      for (const [sx, sz, sh] of [
        [-0.25, 0.38, 3.85],
        [0.35, -0.35, 3.62],
        [-0.55, -0.25, 3.42],
      ]) {
        line('SporeStalks', [sx * 0.6, 2.95, sz * 0.6], [sx, sh, sz], 0.18, '#d6e3c8', 4);
        add('SporeCaps', sx, sh, sz, 0.58, 0.58, 0.28, '#6f5285');
        add('Spores', sx, sh + 0.24, sz, 0.28, 0.28, 0.16, sporeGlow);
      }
      // Lashing slime pseudopods
      for (const side of [-1, 1]) {
        line('Tendrils', [0.45, 0.95, side * 1.45], [1.55, 2.15, side * 2.05], 0.28, '#559160', 5);
      }
      orbitingShards('Spores', 0.1, 2.25, 0, 2.1, 12, 0.2, sporeGlow, 0.42);
      break;
    }

    case 'millPaleSlug': {
      // Cellar pallid giant slug reared in an S-curve with 4 glowing eye-stalks & purple mucus veins
      // Undulating muscular slime-skirt foot from x = -2.4 to +1.8
      for (let i = 0; i < 9; i++) {
        const fx = -2.2 + i * 0.48;
        const fw = 1.95 - Math.abs(i - 4) * 0.16;
        add(
          'FootSkirt',
          fx,
          0.04,
          Math.sin(i * 0.8) * 0.18,
          0.62,
          fw + 0.45,
          0.36,
          i % 2 ? '#9c968b' : '#b3ada0',
        );
      }
      // Thick corrugated mantle & S-curved reared upper body
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const bx = -1.85 + t * 2.85;
        const by = 0.36 + Math.pow(t, 1.45) * 2.25;
        const rad = 1.65 - t * 0.42;
        add('Mantle', bx, by, 0, 0.78, rad, 0.88 - t * 0.12, i % 2 ? '#cbc6ba' : '#dedad0');
        pair(
          'MucusVeins',
          bx,
          by + 0.32,
          rad * 0.48,
          0.34,
          0.22,
          0.32,
          i % 2 ? '#7d6b8a' : '#9382a1',
        );
      }
      add('Head', 1.22, 2.75, 0, 1.18, 1.24, 0.96, '#e3dfd5');
      add('RadulaMaw', 1.78, 2.68, 0, 0.36, 0.68, 0.52, '#4a3245');
      // Pair of tall upper optic stalks (reaching y ~ 4.18) + lower sensory feelers
      for (const side of [-1, 1]) {
        line(
          'OpticStalks',
          [1.35, 3.42, side * 0.34],
          [1.92, 4.12, side * 0.68],
          0.18,
          '#cbc6ba',
          4,
        );
        add('Eyes', 1.98, 4.08, side * 0.72, 0.32, 0.32, 0.32, '#9ef5ff');
        line('Feelers', [1.62, 2.72, side * 0.38], [2.18, 2.42, side * 0.76], 0.16, '#b8b2a6', 3);
      }
      spineRidge('DorsalFrill', -1.65, 1.15, 0.38, 7, 0.55, '#8a7896');
      orbitingShards('Glow', 0.2, 1.85, 0, 2.05, 10, 0.2, '#b8f2e6', 0.36);
      break;
    }

    // ======================== 4 BOSSES (205..285 boxes) ========================
    case 'millVoleAlpha': {
      // Scarred Rat-King Brute clad in scavenged scrap-iron plates, notched ear & iron-cog warclub
      limbPair('HindLegs', -0.35, 1.72, 0.98, 1.72, 0.68, '#b58b79', '#6e4e36');
      add('Torso', 0.08, 1.58, 0, 1.95, 2.35, 2.15, '#8c6546');
      add('Belly', 0.68, 1.65, 0, 0.88, 1.82, 1.72, '#d4bfa6');
      // Scavenged mill stove-iron breastplate, brass rivets & asymmetric pauldron
      add('ScrapArmor', 0.72, 2.15, 0, 0.96, 2.12, 1.28, '#4a5359');
      pair('ScrapArmor', 0.88, 2.35, 0.62, 0.36, 0.62, 0.86, iron);
      pair('BrassBuckles', 1.18, 2.05, 0.42, 0.22, 0.34, 0.32, brass);
      // Huge spiked scrap-iron left pauldron vs leather-strapped right shoulder
      add('Pauldron', 0.15, 3.35, -1.35, 1.38, 1.18, 0.78, '#535d66');
      hornPair('ArmorSpikes', 0.18, 3.85, 1.28, 4, 0.05, 0.24, 0.14, 0.26, steel);
      add('ShoulderStrap', 0.15, 3.28, 1.28, 1.18, 0.96, 0.56, '#5c4632');
      // Tattered burlap grain-sack war cape draped down back
      for (let row = 0; row < 4; row++) {
        for (let col = -2; col <= 2; col++) {
          add(
            'BurlapCape',
            -0.95 - row * 0.12,
            3.15 - row * 0.65,
            col * 0.46,
            0.28,
            0.48,
            0.72,
            (row + Math.abs(col)) % 2 ? burlap : '#856f4d',
          );
        }
      }
      // Scarred Alpha Vole Head + Notched Ear + Chisel Tusks
      add('Head', 0.58, 3.55, 0, 1.72, 1.78, 1.32, '#9e744f');
      pair('Jowls', 1.08, 3.52, 0.72, 0.85, 0.68, 0.74, '#b38862');
      add('Snout', 1.62, 3.65, 0, 0.86, 0.96, 0.76, '#cfa08c');
      // Diagonal crimson-pink battle scar slashing across snout & brow
      line('BattleScar', [1.45, 4.35, -0.52], [1.98, 3.72, 0.48], 0.16, '#d96b78', 5);
      pair('Tusks', 1.88, 3.12, 0.26, 0.26, 0.3, 0.68, '#f5c862');
      eyes(1.36, 4.22, 0.58, 0.28, '#ff4757');
      // Intact right ear + torn/notched left ear
      add('Ears', 0.22, 4.62, 0.86, 0.34, 0.78, 0.78, '#c79381');
      add('Ears', 0.22, 4.62, -0.86, 0.34, 0.72, 0.42, '#c79381');
      add('IronHelm', 0.18, 4.78, 0, 1.22, 1.28, 0.38, '#464f57');
      // Muscular arms + massive Mill-Spoke & Iron-Cog Warclub held high (y ~ 5.25)
      pair('Arms', 0.45, 2.35, 1.38, 0.68, 0.68, 1.15, '#8c6546');
      pair('Wrists', 0.82, 2.15, 1.38, 0.56, 0.56, 0.48, iron);
      line('ClubShaft', [0.92, 1.45, 1.42], [1.68, 4.95, 1.05], 0.26, '#5e452e', 10);
      add('CogMace', 1.72, 4.55, 1.02, 1.08, 1.08, 0.96, '#4a5359');
      for (let t = 0; t < 8; t++) {
        const a = (t / 8) * Math.PI * 2;
        add(
          'CogTeeth',
          1.72 + Math.cos(a) * 0.72,
          4.55 + Math.sin(a) * 0.72,
          1.02,
          0.32,
          0.34,
          0.32,
          brass,
        );
      }
      // Armored segmented rat-tail sweeping behind
      tailSweep('Tail', -0.95, 1.15, 12, -0.38, 0.16, 0.42, 0.62, '#bd9180', iron);
      break;
    }

    case 'millRoachSwarm': {
      // Toppled Burst Flour Sack disgorging a cresting tidal wave of armored hard-wing cockroaches!
      // Giant toppled split burlap sack on back-left (-X)
      add('BurstSack', -1.45, 0.12, 0, 2.15, 2.65, 1.55, burlap);
      add('BurstSack', -1.75, 1.58, 0, 1.65, 2.25, 1.15, '#947c56');
      add('SackTie', -2.35, 2.15, 0, 0.65, 0.95, 0.85, '#786240');
      add('SpilledFlour', -0.35, 0.06, 0, 2.45, 2.85, 0.48, flour);
      add('SpilledFlour', 0.45, 0.48, 0, 1.85, 2.25, 0.42, '#dfd8c5');

      // Surging swarm wave pillar & ground tide supporting dozens of distinct roach bodies
      for (let tier = 0; tier < 6; tier++) {
        const wx = -0.85 + tier * 0.42;
        const wy = 0.35 + tier * 0.56;
        const ww = 2.65 - tier * 0.24;
        add('SwarmMass', wx, wy, 0, 0.95, ww, 0.62, tier % 2 ? '#3d2218' : '#522e20');
      }

      // 22 distinct sculpted armored cockroaches clambering over the wave & sack!
      for (let r = 0; r < 22; r++) {
        const layer = Math.floor(r / 4);
        const slot = r % 4;
        const rx = -1.35 + layer * 0.56 + (slot % 2) * 0.22;
        const ry = 0.42 + layer * 0.58 + (slot === 1 || slot === 2 ? 0.24 : 0);
        const rz = (slot - 1.5) * (0.78 - layer * 0.06);
        const col = r % 3 === 0 ? '#8c5135' : r % 3 === 1 ? '#6e3c26' : '#a66542';
        add('RoachShells', rx, ry, rz, 0.68, 0.46, 0.28, col);
        add('RoachHeads', rx + 0.36, ry + 0.04, rz, 0.26, 0.32, 0.22, '#291610');
        if (r % 2 === 0) {
          add('RoachWings', rx - 0.08, ry + 0.24, rz + 0.08, 0.52, 0.22, 0.12, '#bd7b52');
          add('Eyes', rx + 0.46, ry + 0.14, rz, 0.12, 0.24, 0.12, '#ff5938');
        }
      }

      // Giant Winged Brood-Matriarch Roach crowning the wave crest at y ~ 3.8..4.85!
      add('QueenThorax', 1.18, 3.55, 0, 1.45, 1.32, 0.68, '#7a442b');
      add('QueenElytra', 0.85, 4.05, 0, 1.65, 1.42, 0.42, '#b06d46');
      wingPair('QueenWings', 0.75, 4.15, 0.52, 1.85, 0.95, '#d4956a', '#59301e', 4);
      add('QueenHead', 1.92, 3.72, 0, 0.78, 0.92, 0.62, '#361c14');
      eyes(2.28, 4.05, 0.34, 0.24, '#ff3b3b');
      pair('Mandibles', 2.38, 3.68, 0.28, 0.44, 0.18, 0.2, brass);
      // Long sweeping whip antennae arcing forward & high
      for (const side of [-1, 1]) {
        line(
          'QueenAntennae',
          [2.18, 4.22, side * 0.28],
          [2.95, 4.92, side * 1.15],
          0.14,
          '#c98559',
          6,
        );
        for (let leg = -1; leg <= 1; leg++) {
          line(
            'QueenLegs',
            [1.15 + leg * 0.38, 3.55, side * 0.62],
            [1.45 + leg * 0.42, 2.85, side * 1.18],
            0.16,
            '#291610',
            3,
          );
        }
      }
      orbitingShards('FlyingRoaches', 0.4, 3.15, 0, 2.35, 14, 0.24, '#8c5135', 0.65);
      break;
    }

    case 'millVampireBat': {
      // Apex Vampire Dust-Bat swooping above a swirling flour-ash cyclone with giant crimson wings
      // Swirling dust & flour vortex rings at base (y = 0.08..0.95)
      orbitingShards('DustVortex', 0, 0.28, 0, 2.15, 14, 0.28, flour, 0.16);
      orbitingShards('DustVortex', 0.1, 0.78, 0, 1.55, 10, 0.24, '#9e9689', 0.22);

      // Suspended clawed raptorial hind legs hovering at y ~ 1.05..2.15
      limbPair('Talons', -0.12, 2.05, 0.64, 1.35, 0.44, '#24181e', '#593b44');
      add('Torso', 0.08, 2.05, 0, 1.75, 1.68, 1.88, '#452b36');
      add('CrimsonMane', 0.42, 2.85, 0, 1.58, 1.88, 0.96, '#7a283b');
      add('RibChest', 0.78, 2.22, 0, 0.56, 1.36, 1.24, '#cfc5b8');
      spineRidge('BackSpikes', -0.82, 2.65, 0.34, 6, 0.58, crimson);

      // Grotesque Nosferatu Bat Head, Leaf-Nose, Scarlet Eyes, Bloodied Fangs & Serrated Ears
      add('Head', 0.78, 3.58, 0, 1.42, 1.44, 1.18, '#5c3846');
      add('LeafNose', 1.52, 3.72, 0, 0.52, 0.68, 0.68, '#8f3045');
      add('Jaw', 1.35, 3.22, 0, 0.78, 0.92, 0.42, '#382029');
      pair('CrimsonFangs', 1.58, 3.08, 0.28, 0.22, 0.18, 0.52, '#f5eee6');
      pair('FangTips', 1.58, 2.94, 0.28, 0.18, 0.16, 0.2, crimson);
      eyes(1.38, 4.16, 0.46, 0.28, '#ff2e4c');
      hornPair('BatEars', 0.48, 4.55, 0.56, 5, -0.12, 0.28, 0.16, 0.34, '#382029');

      // Gargantuan Multi-Strutted Tattered Crimson-Membrane Wings
      wingPair('OuterWings', -0.12, 3.15, 0.85, 3.15, 1.55, '#6e2236', '#2b1b22', 9);
      wingPair('InnerMembrane', 0.15, 2.55, 0.75, 2.35, 1.15, '#9e324a', '#cfc5b8', 6);
      for (const side of [-1, 1]) {
        // Hooked wing-thumb claws at wing wrists
        hornPair('WingClaws', 0.55, 3.95, 1.85, 3, 0.22, 0.24, 0.08, 0.26, bone);
        line(
          'BloodStreamers',
          [-0.35, 2.65, side * 2.15],
          [-1.25, 1.75, side * 2.75],
          0.18,
          crimson,
          4,
        );
      }
      tailSweep('WhipTail', -0.88, 1.88, 7, -0.38, -0.08, 0.26, 0.36, '#382029', crimson);
      orbitingShards('CrimsonMotes', 0.25, 3.35, 0, 2.75, 14, 0.2, crimson, 0.58);
      break;
    }

    case 'millMoldSlimeBoss': {
      // Colossal Cellar Mold-Slime Matriarch engulfing half an old iron-bound strongbox & spore-mushroom grove!
      add('SlimeTide', 0, 0.04, 0, 4.55, 4.45, 0.55, '#254a32');
      add('SlimeMass', -0.05, 0.58, 0, 4.05, 3.95, 1.25, '#3b734b');
      add('SlimeMass', 0.05, 1.82, 0, 3.45, 3.35, 1.22, '#529c64');
      add('SlimeCrown', 0.12, 3.02, 0, 2.55, 2.48, 0.92, '#6ec47e');

      // Mottled necrotic-teal & powdery mold plaques across matriarch body
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = 1.85 - (i % 3) * 0.34;
        add(
          'MoldPlaques',
          Math.cos(a) * r,
          0.95 + (i % 4) * 0.68,
          Math.sin(a) * r,
          0.58,
          0.58,
          0.3,
          i % 2 ? '#c4e6ce' : '#85b8a4',
        );
      }

      // Half-engulfed Old Iron-Bound Strongbox jutting out of front-right chest + spilling gold coins!
      add('Strongbox', 1.38, 1.18, 0.68, 1.35, 1.22, 0.92, '#5c442d');
      add('StrongboxIron', 1.4, 1.16, 0.68, 1.42, 1.28, 0.18, '#323a40');
      add('StrongboxLid', 1.42, 2.08, 0.68, 1.38, 1.24, 0.34, '#6e5237');
      add('StrongboxLock', 2.08, 1.68, 0.68, 0.18, 0.32, 0.34, brass);
      for (let c = 0; c < 8; c++) {
        add(
          'Coins',
          1.78 + (c % 3) * 0.22,
          1.88 - Math.floor(c / 3) * 0.28,
          0.45 + (c % 2) * 0.35,
          0.22,
          0.22,
          0.14,
          '#f5d061',
        );
      }

      // Glowing Abyssal Mold Nucleus & Glaring Asymmetric Slime Eyes
      add('Core', 0.15, 1.75, -0.15, 1.48, 1.48, 1.48, sporeGlow);
      eyes(1.42, 3.18, 0.64, 0.36, amberGlow);
      add('Eyes', 1.55, 3.48, -0.08, 0.22, 0.28, 0.28, sporeGlow);

      // Towering Spore-Mushroom Grove sprouting across shoulders & crest (y ~ 3.85..5.15)
      const mushrooms = [
        [-0.15, 0.05, 3.88, 4.95, 1.15, '#76458a'],
        [-0.75, 0.68, 3.55, 4.52, 0.88, '#5d3d78'],
        [0.45, -0.72, 3.52, 4.45, 0.85, '#874f99'],
        [-0.95, -0.58, 2.95, 3.92, 0.76, '#684480'],
        [0.65, 0.85, 2.92, 3.78, 0.72, '#76458a'],
      ];
      for (const [mx, mz, y0, y1, capW, capCol] of mushrooms) {
        line('MushroomStalks', [mx * 0.75, y0, mz * 0.75], [mx, y1, mz], 0.24, '#ded9c8', 4);
        add('MushroomCaps', mx, y1, mz, capW, capW, 0.38, capCol);
        add('MushroomCaps', mx, y1 + 0.34, mz, capW * 0.62, capW * 0.62, 0.24, shade(capCol, 1.18));
        pair('Spores', mx, y1 + 0.38, capW * 0.28, 0.2, 0.2, 0.16, sporeGlow);
      }

      // Sweeping Slime Tentacle Waves on flanks
      for (const side of [-1, 1]) {
        line(
          'SlimeWaves',
          [0.25, 0.85, side * 1.85],
          [1.65, 2.45, side * 2.55],
          0.36,
          '#4a915b',
          6,
        );
        line(
          'SlimeWaves',
          [-0.85, 0.75, side * 1.75],
          [-1.85, 2.15, side * 2.35],
          0.32,
          '#3b734b',
          5,
        );
      }
      orbitingShards('Spores', 0.1, 3.25, 0, 2.55, 16, 0.22, sporeGlow, 0.55);
      break;
    }

    default:
      throw new Error(`Unhandled Greenfern Mill voxel enemy id: ${enemy.id}`);
  }

  const tier = enemy.boss ? 'boss' : enemy.elite ? 'elite' : 'mob';
  const targetOffsets = {
    millMossBug: 58,
    millCanalFrog: 62,
    millShellBeetle: 66,
    millNettle: 60,
    millVolePup: 64,
    millStrayCat: 68,
    millDustBat: 72,
    millGiantVole: 132,
    millMiniMoldSlime: 140,
    millPaleSlug: 148,
    millVoleAlpha: 236,
    millRoachSwarm: 258,
    millVampireBat: 246,
    millMoldSlimeBoss: 266,
  };
  const [, maxBoxes] = TIER_BOUNDS[tier];
  finalizeVoxelComplexity(b, enemy, targetOffsets[enemy.id], maxBoxes);
  return b.blocks;
}

function resolvePythonExecutable(repoRoot) {
  const candidates = [
    process.env.PYTHON_EXECUTABLE,
    path.join(repoRoot, '建模工具', '.venv', 'Scripts', 'python.exe'),
    path.join('d:\\万界酒馆', '建模工具', '.venv', 'Scripts', 'python.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('Cannot locate 建模工具/.venv/Scripts/python.exe');
}

async function main() {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const jsonDir = new URL('../../万象异境-体素模型/绿蕨磨坊怪物/', import.meta.url);
  const portraitDir = new URL('../assets/portraits/', import.meta.url);
  await mkdir(jsonDir, { recursive: true });
  await mkdir(portraitDir, { recursive: true });

  const stats = [];
  for (const enemy of MILL_VOXEL_ENEMIES) {
    const blocks = millEnemyBlocks(enemy);
    const tier = enemy.boss ? 'boss' : enemy.elite ? 'elite' : 'mob';
    const [minBoxes, maxBoxes] = TIER_BOUNDS[tier];
    const groups = new Set(blocks.map((block) => block.group));
    const minY = Math.min(...blocks.map((block) => block.y));
    const maxY = Math.max(...blocks.map((block) => block.y + block.h));
    const height = +(maxY - minY).toFixed(2);

    if (blocks.length < minBoxes || blocks.length > maxBoxes) {
      throw new Error(
        `Tier box count out of bounds for ${enemy.id} (${tier}): ${blocks.length} not in [${minBoxes}, ${maxBoxes}]`,
      );
    }
    if (groups.size < 5) {
      throw new Error(`Expected >= 5 voxel groups for ${enemy.id}, got ${groups.size}`);
    }
    if ([...groups].some((g) => /plinth|pedestal|base/i.test(g))) {
      throw new Error(`Forbidden plinth/base group in ${enemy.id}`);
    }
    if (height <= 3.2) {
      throw new Error(`Height too small for ${enemy.id}: ${height}`);
    }

    await writeFile(
      new URL(`${enemy.portrait}.json`, jsonDir),
      JSON.stringify(
        {
          id: enemy.id,
          name: enemy.name,
          portrait: enemy.portrait,
          model: enemy.model,
          tier,
          blocks,
        },
        null,
        2,
      ) + '\n',
    );
    await writeFile(
      new URL(`${enemy.portrait}.svg`, portraitDir),
      renderVoxelEnemyPortrait(enemy, blocks),
    );
    stats.push({
      id: enemy.id,
      name: enemy.name,
      slug: enemy.portrait,
      tier,
      boxes: blocks.length,
      groups: groups.size,
      height,
    });
  }

  console.log(`Built ${stats.length} Greenfern Mill voxel definitions & 600x900 SVGs:`);
  for (const tier of ['mob', 'elite', 'boss']) {
    const subset = stats.filter((s) => s.tier === tier);
    const counts = subset.map((s) => s.boxes);
    console.log(
      `  ${tier}: count=${subset.length}, boxes=[${Math.min(...counts)}..${Math.max(...counts)}], minHeight=${Math.min(...subset.map((s) => s.height))}`,
    );
  }

  const py = resolvePythonExecutable(repoRoot);
  const script = fileURLToPath(new URL('../../建模工具/build_mill_enemies.py', import.meta.url));
  const result = spawnSync(py, [script], { cwd: repoRoot, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`build_mill_enemies.py failed with exit code ${result.status}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

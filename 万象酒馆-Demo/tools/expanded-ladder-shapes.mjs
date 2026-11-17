import { shade } from './voxel-enemy-art.mjs';
import { createVoxelBuilder, finalizeVoxelComplexity } from './expanded-voxel-helpers.mjs';

/** Build progressive voxel anatomies for all 20 non-Overlord Jacob's Ladder monsters. */
export function buildLadderVoxelBlocks(enemy) {
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
  const gold = '#e7cf7a';
  const obsidian = '#23202a';
  const bone = '#dfd5bc';
  const crimson = '#c94c5e';
  const glowCyan = '#a4f4e8';
  const glowAmber = '#ffe28f';

  switch (enemy.id) {
    // ======================== TIER 1: MOBS (46..78) ========================
    case 'drakeBadlandSlime': {
      add('Body', 0, 0.04, 0, 3.6, 3.5, 0.48, shade(b.dark, 0.9));
      add('Body', 0, 0.52, 0, 3.3, 3.2, 1.05, b.mid);
      add('Body', 0.1, 1.55, 0, 2.75, 2.75, 0.95, b.base);
      add('Body', 0.15, 2.45, 0, 2.0, 1.95, 0.65, b.light);
      add('Core', 0.25, 1.2, 0, 1.2, 1.2, 1.2, glowAmber);
      add('Head', 0.45, 2.8, 0, 1.35, 1.45, 0.72, b.light);
      eyes(1.18, 2.95, 0.42, 0.26, glowAmber);
      hornPair('Horns', 0.1, 3.35, 0.45, 4, -0.18, 0.28, 0.16, 0.34, bone);
      spineRidge('Scales', -1.3, 2.6, 0.42, 6, 0.52, gold);
      tailSweep('Tail', -1.7, 0.75, 7, -0.45, 0.28, 0.28, 0.7, b.mid, gold);
      orbitingShards('Runes', 0.1, 1.3, 0, 2.05, 8, 0.24, b.light, 0.32);
      break;
    }

    case 'drakeBadlandScorpion': {
      add('Body', 0, 0.95, 0, 2.9, 2.2, 0.85, b.base);
      add('Armor', 0.1, 1.72, 0, 2.55, 2.05, 0.45, b.light);
      add('Head', 1.6, 1.05, 0, 1.25, 1.5, 0.88, b.dark);
      eyes(2.26, 1.45, 0.42, 0.22, glowAmber);
      for (let i = -1; i <= 1; i++) limbPair('Legs', i * 0.85, 1.0, 1.35, 0.95, 0.38, gold, b.dark);
      for (const side of [-1, 1]) {
        line('Pincers', [1.4, 1.15, side * 1.15], [2.7, 1.15, side * 1.75], 0.42, b.mid, 3);
        add('Pincers', 3.1, 1.12, side * 1.85, 0.95, 0.75, 0.65, b.light);
        add('Claws', 3.7, 1.28, side * 1.65, 0.65, 0.24, 0.24, gold);
        add('Claws', 3.7, 0.95, side * 2.02, 0.65, 0.24, 0.24, gold);
      }
      // Tall arched dragon-barbed tail (raises height > 3.5)
      for (let i = 0; i < 9; i++) {
        const a = (i / 8) * Math.PI * 1.15;
        const x = -1.4 - Math.sin(a) * 1.1 + i * 0.16;
        const y = 1.4 + Math.sin(a * 0.5) * 1.9 + i * 0.14;
        const s = 0.68 - i * 0.045;
        add('Tail', x, y, 0, s, s, s, i % 2 ? b.mid : b.base);
        add('Scales', x, y + s * 0.45, 0, 0.24, 0.24, 0.32, gold);
      }
      add('Core', 0.2, 3.55, 0, 0.8, 0.42, 0.56, crimson);
      add('Claws', 0.72, 3.62, 0, 0.62, 0.18, 0.24, glowAmber);
      break;
    }

    case 'drakeRattlesnake': {
      for (let i = 0; i < 16; i++) {
        const a = i * 0.48;
        const r = 1.6 - i * 0.055;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const y = 0.22 + i * 0.18;
        const s = 0.74 - i * 0.018;
        add('Body', x, y, z, s, s, s * 0.92, i % 3 === 0 ? gold : b.base);
        if (i % 2 === 0) add('Scales', x, y + s * 0.5, z, s * 0.6, s * 0.4, 0.22, b.light);
      }
      add('Neck', 0.55, 2.7, 0, 0.82, 0.85, 0.8, b.base);
      pair('Hood', 0.42, 2.85, 0.65, 0.35, 0.55, 1.05, crimson);
      add('Head', 1.15, 3.35, 0, 1.38, 1.18, 0.85, b.light);
      add('Head', 1.65, 3.25, 0, 0.72, 0.88, 0.42, b.mid);
      eyes(1.62, 3.85, 0.38, 0.22, glowAmber);
      hornPair('Horns', 0.85, 4.15, 0.35, 3, -0.22, 0.26, 0.14, 0.26, bone);
      // Raised rattle rings on left
      for (let i = 0; i < 6; i++) {
        add(
          'Tail',
          -1.55 - i * 0.08,
          0.8 + i * 0.36,
          -0.65,
          0.42 - i * 0.03,
          0.42 - i * 0.03,
          0.32,
          i % 2 ? bone : gold,
        );
      }
      break;
    }

    case 'drakeBadlandFalcon': {
      limbPair('Talons', 0.05, 1.45, 0.55, 1.45, 0.42, obsidian, gold);
      add('Body', 0, 1.45, 0, 1.85, 1.45, 1.75, b.base);
      add('Armor', 0.62, 1.65, 0, 0.65, 1.28, 1.35, gold);
      add('Head', 0.85, 3.15, 0, 1.25, 1.05, 1.02, b.light);
      add('Beak', 1.65, 3.35, 0, 0.68, 0.42, 0.44, gold);
      add('Beak', 1.88, 3.15, 0, 0.32, 0.3, 0.3, obsidian);
      eyes(1.22, 3.68, 0.42, 0.2, glowAmber);
      hornPair('Crest', 0.65, 4.08, 0.24, 3, -0.35, 0.24, 0.12, 0.26, crimson);
      wingPair('Wings', -0.1, 2.7, 0.75, 2.35, 1.15, b.light, obsidian, 6);
      tailSweep('Tail', -1.0, 1.5, 6, -0.45, 0.18, 0.12, 0.52, crimson, gold);
      break;
    }

    case 'ladderCarrionBat': {
      limbPair('Legs', -0.1, 1.35, 0.52, 1.35, 0.38, obsidian, b.dark);
      add('Body', 0, 1.3, 0, 1.55, 1.35, 1.75, b.base);
      add('Armor', 0.55, 1.5, 0, 0.45, 1.15, 1.2, b.mid);
      add('Head', 0.55, 2.95, 0, 1.18, 1.12, 1.05, b.light);
      eyes(1.16, 3.45, 0.32, 0.22, crimson);
      pair('Fangs', 1.12, 2.98, 0.24, 0.18, 0.14, 0.28, bone);
      hornPair('Ears', 0.38, 3.9, 0.42, 4, -0.05, 0.28, 0.12, 0.28, b.dark);
      wingPair('Wings', -0.15, 2.45, 0.72, 2.55, 1.25, b.dark, b.light, 7);
      tailSweep('Tail', -0.85, 1.35, 5, -0.38, -0.05, 0.15, 0.32, b.dark, null);
      break;
    }

    case 'ladderCliffLizard': {
      add('Body', 0, 1.15, 0, 3.3, 1.65, 1.15, b.base);
      add('Armor', 0.1, 2.2, 0, 2.8, 1.45, 0.38, b.light);
      for (const x of [-1.1, 1.1]) limbPair('Limbs', x, 1.25, 1.05, 1.2, 0.5, obsidian, b.mid);
      add('Head', 1.95, 1.6, 0, 1.45, 1.25, 0.95, b.base);
      add('Head', 2.65, 1.62, 0, 0.65, 0.85, 0.55, b.dark);
      eyes(2.38, 2.18, 0.45, 0.22, glowAmber);
      spineRidge('Crest', -1.2, 2.55, 0.45, 7, 0.95, crimson);
      hornPair('Horns', 1.65, 2.55, 0.38, 3, -0.25, 0.32, 0.14, 0.28, bone);
      tailSweep('Tail', -1.75, 1.25, 8, -0.45, 0.32, 0.35, 0.68, b.base, crimson);
      break;
    }

    case 'ladderWebSpider': {
      add('Body', 0.65, 1.35, 0, 1.3, 1.25, 0.95, b.dark);
      add('Abdomen', -1.15, 1.45, 0, 2.25, 2.15, 1.85, b.base);
      add('Markings', -1.15, 2.85, 0, 1.25, 1.3, 0.62, crimson);
      add('Core', -2.25, 2.15, 0, 0.5, 0.65, 0.65, glowAmber);
      eyes(1.34, 1.85, 0.36, 0.18, crimson);
      eyes(1.36, 1.6, 0.18, 0.15, glowAmber);
      pair('Fangs', 1.32, 1.22, 0.24, 0.35, 0.2, 0.45, obsidian);
      for (let i = 0; i < 4; i++) {
        const x = 0.85 - i * 0.52;
        const zA = 0.72;
        const zB = 1.95 + (i === 1 || i === 2 ? 0.5 : 0);
        for (const side of [-1, 1]) {
          add('Legs', x, 1.85, side * ((zA + zB) * 0.48), 0.28, 1.1, 0.28, b.mid);
          add('Legs', x, 1.05, side * zB, 0.26, 0.28, 1.45, b.dark);
          add('Feet', x + 0.1, 0.06, side * (zB + 0.18), 0.38, 0.38, 0.25, obsidian);
        }
      }
      // Web spire above abdomen so vertical height > 3.5
      line('Crest', [-1.15, 3.3, 0], [-1.35, 4.1, 0], 0.22, b.light, 3);
      break;
    }

    case 'drakeCrystalBeetle': {
      for (let i = -1; i <= 1; i++)
        limbPair('Legs', i * 1.15, 1.15, 1.45, 1.15, 0.44, obsidian, b.dark);
      add('Body', 0, 1.05, 0, 3.6, 2.75, 1.1, b.dark);
      for (let i = -2; i <= 2; i++) {
        pair(
          'Shell',
          i * 0.65,
          2.05 + (2 - Math.abs(i)) * 0.24,
          0.68,
          0.62,
          1.28,
          0.85,
          shade(b.base, i % 2 ? 1.05 : 0.88),
        );
      }
      add('Head', 2.05, 1.28, 0, 1.18, 1.55, 1.05, b.mid);
      eyes(2.65, 1.72, 0.48, 0.24, glowCyan);
      hornPair('Horns', 2.45, 1.78, 0.12, 4, 0.34, 0.48, 0.05, 0.3, glowCyan);
      // Dorsal dragon crystal clusters > 3.8 height
      for (let i = 0; i < 6; i++) {
        const cx = -1.1 + i * 0.48;
        add(
          'Core',
          cx,
          2.8,
          (i % 2 ? 1 : -1) * 0.42,
          0.38,
          0.38,
          1.25 + (i % 3) * 0.35,
          i % 2 ? glowCyan : b.light,
        );
      }
      break;
    }

    case 'pureCreationElemental': {
      add('Pedestal', 0, 0.05, 0, 1.85, 1.85, 0.25, gold);
      add('Core', 0, 2.15, 0, 1.55, 1.55, 1.55, '#fff6df');
      add('Body', 0, 1.65, 0, 1.1, 1.1, 2.55, b.base);
      add('Body', 0, 2.38, 0, 2.35, 2.35, 1.15, b.light);
      eyes(1.18, 2.78, 0.38, 0.26, '#ffffff');
      wingPair('Fins', -0.25, 2.65, 0.85, 1.65, 0.72, '#fff5d1', gold, 5);
      orbitingShards('Runes', 0, 2.7, 0, 1.85, 12, 0.26, gold, 0.58);
      add('Crown', 0, 4.15, 0, 0.65, 0.65, 0.65, glowAmber);
      break;
    }

    case 'pureDestructionElemental': {
      add('Base', 0, 0.05, 0, 1.9, 1.9, 0.28, obsidian);
      add('Core', 0, 2.15, 0, 1.48, 1.48, 1.55, crimson);
      add('Body', 0, 1.6, 0, 1.25, 1.25, 2.45, obsidian);
      add('Armor', 0.1, 2.35, 0, 2.15, 2.15, 0.95, shade(b.base, 0.8));
      eyes(1.08, 2.75, 0.36, 0.25, '#ff8d7a');
      spineRidge('Spikes', -1.2, 3.25, 0.45, 6, 1.05, crimson);
      orbitingShards('Shards', 0, 2.6, 0, 1.9, 12, 0.28, crimson, 0.65);
      hornPair('Horns', 0.2, 3.65, 0.45, 4, -0.1, 0.35, 0.15, 0.3, obsidian);
      break;
    }

    // ======================== TIER 2: ELITES (108..158) ========================
    case 'chaosBadlandFalcon': {
      limbPair('Talons', 0.1, 1.6, 0.62, 1.6, 0.46, obsidian, gold);
      add('Body', 0, 1.55, 0, 2.1, 1.65, 2.05, b.base);
      add('Core', 0.95, 2.3, 0, 0.55, 0.85, 0.95, '#ff6fe8');
      add('Head', 0.95, 3.45, 0, 1.38, 1.22, 1.15, b.light);
      add('Beak', 1.85, 3.62, 0, 0.78, 0.48, 0.46, gold);
      eyes(1.38, 4.02, 0.42, 0.24, '#ff8ef5');
      eyes(1.24, 3.72, 0.56, 0.18, glowAmber);
      hornPair('Horns', 0.65, 4.4, 0.32, 5, -0.28, 0.28, 0.16, 0.26, obsidian);
      // Four sweeping mutated chaos wings
      wingPair('Wings', -0.05, 3.2, 0.85, 3.1, 1.25, b.light, obsidian, 9);
      wingPair('LowerWings', -0.25, 2.15, 0.82, 2.55, 1.05, crimson, '#573678', 8);
      tailSweep('Tail', -1.05, 1.6, 9, -0.42, 0.24, 0.24, 0.52, '#623a82', '#ff8ef5');
      orbitingShards('Runes', 0.1, 2.8, 0, 2.35, 12, 0.22, '#ff8ef5', 0.48);
      break;
    }

    case 'relicHermitCrab': {
      // Ancient carved temple ruin shell on back + asymmetric giant crusher claw
      for (let i = 0; i < 3; i++)
        limbPair('Legs', 1.1 - i * 0.9, 1.1, 1.65, 1.1, 0.42, obsidian, b.mid);
      add('Body', 0.4, 0.95, 0, 2.9, 2.5, 1.2, b.base);
      add('Head', 1.95, 1.25, 0, 1.1, 1.5, 0.92, b.light);
      eyes(2.55, 1.8, 0.44, 0.24, glowCyan);
      // Enormous right crusher claw
      line('CrusherArm', [1.4, 1.3, 1.25], [2.9, 1.5, 2.05], 0.52, b.base, 4);
      add('CrusherClaw', 3.3, 1.15, 2.1, 1.55, 1.25, 1.25, b.light);
      add('CrusherClaw', 4.2, 1.65, 1.95, 0.95, 0.55, 0.45, bone);
      add('CrusherClaw', 4.2, 1.05, 2.15, 0.88, 0.48, 0.42, bone);
      // Smaller left pincer
      line('LeftArm', [1.4, 1.3, -1.25], [2.5, 1.25, -1.75], 0.36, b.mid, 3);
      add('LeftClaw', 2.8, 1.1, -1.8, 0.95, 0.72, 0.65, b.light);
      // Stepped carved ruin relic shell reaching y ~ 5.0
      add('RelicShell', -0.65, 1.85, 0, 3.25, 3.15, 1.15, '#7e867c');
      add('RelicShell', -0.78, 2.95, 0, 2.55, 2.45, 0.95, '#919a8f');
      add('RelicShell', -0.92, 3.88, 0, 1.75, 1.75, 0.78, '#a3ab9f');
      for (const sx of [-1.45, -0.3]) {
        pair('Pillars', sx, 2.15, 1.25, 0.42, 0.42, 2.55, '#c2bda8');
      }
      add('Arch', -0.88, 4.62, 0, 1.4, 2.4, 0.42, gold);
      add('Core', -0.1, 3.3, 0, 0.52, 0.95, 0.85, glowCyan);
      orbitingShards('Runes', -0.7, 3.5, 0, 2.25, 14, 0.22, glowCyan, 0.55);
      break;
    }

    case 'bicolorScalePython': {
      // Twin intertwined gold-creation and crimson-destruction serpent coils
      for (let i = 0; i < 24; i++) {
        const a = i * 0.42;
        const r = 1.85 - i * 0.045;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const y = 0.25 + i * 0.16;
        const s = 0.66 - i * 0.012;
        const goldSide = i % 2 === 0;
        add('Body', x, y, z, s, s, s, goldSide ? gold : crimson);
        add('Scales', x, y + s * 0.45, z, s * 0.6, s * 0.6, 0.24, goldSide ? '#fff3c4' : obsidian);
      }
      add('Neck', 0.45, 3.65, 0, 0.92, 1.05, 0.95, gold);
      add('Head', 1.25, 4.25, 0, 1.65, 1.38, 1.02, b.base);
      add('Head', 1.95, 4.18, 0, 0.85, 1.02, 0.52, gold);
      add('Core', 0.25, 4.35, 0, 0.65, 1.65, 0.72, glowAmber);
      eyes(1.75, 4.82, 0.45, 0.24, glowAmber);
      hornPair('Horns', 0.95, 5.05, 0.42, 6, -0.24, 0.22, 0.15, 0.26, obsidian);
      tailSweep('Tail', -1.8, 0.7, 10, -0.35, 0.28, 0.35, 0.55, crimson, gold);
      break;
    }

    case 'overloadCreationElemental': {
      add('Pedestal', 0, 0.06, 0, 2.2, 2.2, 0.28, gold);
      add('Core', 0, 2.65, 0, 1.75, 1.75, 1.75, '#ffffff');
      add('Body', 0, 1.65, 0, 1.25, 1.25, 3.25, '#f6ebd0');
      add('Armor', 0, 2.55, 0, 2.55, 2.55, 1.2, gold);
      eyes(1.3, 3.25, 0.42, 0.28, glowCyan);
      wingPair('Fins', -0.2, 3.15, 0.95, 2.65, 0.95, '#fff9e6', gold, 10);
      wingPair('LowerFins', -0.25, 1.85, 0.85, 1.95, 0.75, glowCyan, gold, 7);
      orbitingShards('Rings', 0, 2.95, 0, 2.45, 20, 0.26, gold, 0.75);
      orbitingShards('Runes', 0, 4.2, 0, 1.25, 10, 0.22, glowCyan, 0.35);
      add('Crown', 0, 4.95, 0, 0.75, 0.75, 0.75, glowAmber);
      break;
    }

    case 'overloadDestructionElemental': {
      add('Base', 0, 0.06, 0, 2.3, 2.3, 0.3, obsidian);
      add('Core', 0, 2.65, 0, 1.65, 1.65, 1.75, '#ff5268');
      add('Body', 0, 1.55, 0, 1.35, 1.35, 3.2, obsidian);
      add('Armor', 0.1, 2.5, 0, 2.35, 2.35, 1.15, crimson);
      eyes(1.2, 3.2, 0.4, 0.28, '#ff9c8a');
      spineRidge('Spikes', -1.6, 3.8, 0.38, 10, 1.25, crimson);
      hornPair('Horns', 0.15, 4.2, 0.55, 7, -0.16, 0.32, 0.16, 0.3, obsidian);
      orbitingShards('Shards', 0, 2.95, 0, 2.5, 22, 0.28, '#ff4d6d', 0.85);
      orbitingShards('Cage', 0, 2.5, 0, 1.95, 16, 0.24, '#342c3e', 0.5);
      break;
    }

    case 'ladderRockGiant': {
      limbPair('Legs', 0, 1.85, 0.88, 1.85, 0.95, obsidian, '#606669');
      add('Torso', 0, 1.9, 0, 2.15, 2.95, 2.25, '#6a7074');
      add('Core', 0.88, 2.75, 0, 0.45, 0.92, 0.92, gold);
      add('Armor', 0.55, 2.05, 0, 1.25, 2.55, 0.45, obsidian);
      pair('Shoulders', 0, 3.75, 1.85, 1.65, 1.35, 1.18, '#7e8689');
      for (const side of [-1, 1]) {
        add('Arms', 0.22, 2.15, side * 1.95, 0.95, 0.92, 1.65, '#596063');
        add('Fists', 0.45, 0.85, side * 2.05, 1.28, 1.22, 1.25, '#899092');
        for (let k = 0; k < 4; k++) {
          add('Runes', 0.45 + k * 0.12, 1.1 + k * 0.72, side * 2.52, 0.22, 0.18, 0.24, gold);
        }
      }
      add('Head', 0.2, 4.18, 0, 1.35, 1.45, 1.15, '#585e61');
      eyes(0.92, 4.65, 0.36, 0.25, glowAmber);
      for (let i = 0; i < 8; i++) {
        add(
          'Shards',
          -0.95 + (i % 4) * 0.52,
          4.45 + (i % 3) * 0.35,
          ((i % 3) - 1) * 0.82,
          0.44,
          0.44,
          0.95,
          i % 2 ? '#8f989b' : gold,
        );
      }
      orbitingShards('Runes', 0, 2.9, 0, 2.5, 14, 0.22, glowAmber, 0.45);
      break;
    }

    // ======================== TIER 3: BOSSES (198..285) ========================
    case 'bicolorSingularityLizard': {
      // Dual-polarity frilled giant dragon-lizard with swirling gold/crimson dorsal singularity
      for (const x of [-1.45, 1.45]) limbPair('Limbs', x, 1.65, 1.45, 1.65, 0.78, obsidian, b.mid);
      add('Body', 0, 1.55, 0, 4.5, 2.5, 1.75, '#4c4654');
      add('Armor', 0.2, 2.95, 0, 3.85, 2.15, 0.58, obsidian);
      add('Head', 2.65, 2.45, 0, 1.85, 1.65, 1.35, '#585060');
      add('Head', 3.65, 2.42, 0, 0.95, 1.25, 0.75, gold);
      eyes(3.25, 3.25, 0.56, 0.28, glowAmber);
      // Giant gold/crimson fanned neck frill
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI * 0.45 + (i / 13) * Math.PI * 0.9;
        add(
          'Frill',
          2.05 - Math.abs(Math.sin(a)) * 0.3,
          3.25 + Math.cos(a) * 1.1,
          Math.sin(a) * 1.75,
          0.24,
          0.48,
          0.55,
          i % 2 ? gold : crimson,
        );
      }
      hornPair('Horns', 2.15, 3.65, 0.55, 7, -0.35, 0.3, 0.18, 0.34, gold);
      // Towering dorsal Singularity Core + dual orbiting helixes
      add('Core', -0.1, 4.15, 0, 1.15, 1.15, 1.15, '#fff2c2');
      orbitingShards('GoldRing', -0.1, 4.25, 0, 2.25, 18, 0.26, gold, 0.9);
      orbitingShards('CrimsonRing', -0.1, 4.25, 0, 2.65, 18, 0.26, crimson, -0.9);
      spineRidge('Crest', -1.8, 3.4, 0.35, 11, 1.1, gold);
      tailSweep('Tail', -2.3, 1.55, 14, -0.36, 0.24, 0.48, 0.85, '#4c4654', crimson);
      for (let i = 0; i < 20; i++) {
        add(
          'Scales',
          -1.8 + (i % 10) * 0.42,
          2.1 + (i % 3) * 0.42,
          (i % 2 ? 1 : -1) * 1.25,
          0.32,
          0.22,
          0.36,
          i % 2 ? gold : crimson,
        );
      }
      break;
    }

    case 'eclipseWatcher': {
      // Floating monolith sentinel with solar-eclipse halo, stone ocular wings, giant eye core
      add('Base', 0, 0.08, 0, 2.8, 2.8, 0.35, obsidian);
      for (let i = 0; i < 5; i++) {
        add(
          'Body',
          0,
          1.0 + i * 0.72,
          0,
          1.85 - i * 0.16,
          1.45 - i * 0.12,
          0.7,
          i % 2 ? '#434957' : '#585f70',
        );
      }
      add('Core', 0, 3.35, 0, 1.25, 1.25, 1.35, '#19141d');
      add('Eyes', 0.68, 3.65, 0, 0.22, 0.85, 0.85, gold);
      add('Eyes', 0.82, 3.88, 0, 0.16, 0.36, 0.36, '#fff8d4');
      // Giant eclipsed ring halo behind monolith
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        add(
          'Halo',
          -0.45,
          3.95 + Math.cos(a) * 2.15,
          Math.sin(a) * 2.15,
          0.26,
          0.34,
          0.34,
          i % 3 === 0 ? glowAmber : gold,
        );
        add(
          'OuterHalo',
          -0.58,
          3.95 + Math.cos(a) * 2.65,
          Math.sin(a) * 2.65,
          0.2,
          0.24,
          0.24,
          obsidian,
        );
      }
      wingPair('Wings', -0.25, 3.35, 1.1, 3.2, 1.15, '#596175', gold, 11);
      wingPair('LowerWings', -0.35, 2.1, 0.95, 2.4, 0.9, gold, obsidian, 8);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          add(
            'SatelliteEyes',
            0.45,
            2.2 + i * 0.75,
            side * (1.55 + i * 0.45),
            0.38,
            0.38,
            0.38,
            '#2b2535',
          );
          add('Eyes', 0.68, 2.3 + i * 0.75, side * (1.55 + i * 0.45), 0.14, 0.18, 0.18, glowAmber);
        }
      }
      orbitingShards('Runes', 0, 3.4, 0, 2.95, 20, 0.24, gold, 0.7);
      break;
    }

    case 'abyssDevourerPython': {
      // Colossal abyssal void maw serpent with rib-cage scale plates
      for (let i = 0; i < 30; i++) {
        const a = i * 0.38;
        const r = 2.15 - i * 0.042;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const y = 0.24 + i * 0.15;
        const s = 0.84 - i * 0.013;
        add('Body', x, y, z, s, s, s, i % 3 === 0 ? '#503969' : '#2a2235');
        add('Spines', x, y + s * 0.5, z, 0.28, 0.28, 0.45, i % 2 ? '#b08be8' : crimson);
      }
      add('Neck', 0.45, 4.2, 0, 1.25, 1.35, 1.25, '#3b2b4d');
      add('Head', 1.45, 4.95, 0, 2.15, 1.85, 1.42, '#281e36');
      add('Jaw', 1.75, 4.45, 0, 1.75, 1.45, 0.55, '#4b3763');
      add('Core', 2.05, 4.82, 0, 0.75, 0.95, 0.75, '#f078ff');
      eyes(2.05, 5.75, 0.56, 0.28, '#ff98ff');
      for (let f = -2; f <= 2; f++) {
        add('Fangs', 2.48, 4.95, f * 0.26, 0.18, 0.14, 0.42, bone);
        add('Fangs', 2.48, 4.58, f * 0.24, 0.18, 0.14, 0.34, bone);
      }
      hornPair('Horns', 1.0, 5.95, 0.56, 7, -0.3, 0.28, 0.18, 0.34, '#b894e8');
      tailSweep('Tail', -2.1, 0.8, 12, -0.35, 0.32, 0.45, 0.72, '#3b2b4d', '#f078ff');
      orbitingShards('Runes', 0.2, 3.8, 0, 2.6, 20, 0.24, '#e588ff', 0.65);
      break;
    }

    case 'dragonscaleSandworm': {
      // Towering segmented golden-dragonscale sandworm rising in an S-arch with 3-jawed tooth maw
      const segs = 26;
      for (let i = 0; i < segs; i++) {
        const t = i / (segs - 1);
        const x = -2.2 + t * 3.8 + Math.sin(t * Math.PI * 1.4) * 0.65;
        const y = 0.35 + Math.sin(t * Math.PI * 0.85) * 4.2 + t * 0.8;
        const z = Math.sin(t * Math.PI * 2.2) * 0.75;
        const s = 1.45 - Math.abs(t - 0.45) * 0.45;
        add('Body', x, y, z, s * 1.05, s, s, i % 2 ? '#8f724d' : '#6e573b');
        pair('Scales', x, y + s * 0.25, z + s * 0.48, s * 0.55, 0.24, s * 0.65, gold);
        add('Crest', x, y + s * 0.72, z, 0.32, 0.28, 0.52, '#ebd182');
      }
      // Circular gaping triple-jawed dragon maw at top
      const mx = 1.95,
        my = 4.65;
      add('Head', mx, my, 0, 1.55, 1.85, 1.75, '#7a5e3c');
      add('Core', mx + 0.55, my + 0.4, 0, 0.65, 1.05, 1.05, crimson);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        add(
          'Teeth',
          mx + 0.85,
          my + 0.8 + Math.cos(a) * 0.72,
          Math.sin(a) * 0.72,
          0.52,
          0.2,
          0.2,
          bone,
        );
      }
      for (const a of [0.2, 2.3, 4.4]) {
        add(
          'Jaws',
          mx + 0.75,
          my + 0.8 + Math.cos(a) * 1.05,
          Math.sin(a) * 1.05,
          0.95,
          0.45,
          0.45,
          gold,
        );
      }
      orbitingShards('SandStorm', 0.2, 1.6, 0, 2.8, 22, 0.28, '#d4b375', 0.55);
      break;
    }

    default:
      break;
  }

  const limits = enemy.boss ? [200, 282] : enemy.elite ? [108, 156] : [48, 76];
  return finalizeVoxelComplexity(b, enemy, limits[0], limits[1]);
}

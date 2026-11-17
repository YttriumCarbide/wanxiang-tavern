import { shade } from './voxel-enemy-art.mjs';
import { createVoxelBuilder, finalizeVoxelComplexity } from './expanded-voxel-helpers.mjs';

/** Build progressive voxel anatomies for all 18 Bandits, Goblins, and Erosion-Scales units. */
export function buildCommonVoxelBlocks(enemy) {
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
    addBipedFrame,
  } = b;
  const leather = '#5c4b3b';
  const iron = '#8d969c';
  const steel = '#cbd1d6';
  const skinHuman = '#c7a48a';
  const goblinSkin = '#708f5a';
  const voidPurple = '#a66df0';
  const riftPink = '#ee7eff';
  const obsidian = '#23202b';
  const gold = '#dec476';
  const bone = '#e0d6be';

  switch (enemy.id) {
    // ======================== BANDITS (MOBS x4, ELITE x1, BOSS x1) ========================
    case 'banditCutthroat': {
      addBipedFrame({
        cloth: '#353844',
        armor: leather,
        skin: skinHuman,
        trim: steel,
        eyeColor: '#ffe0a3',
        scale: 0.94,
        hooded: true,
      });
      // Flowing cloak & mask + twin daggers
      add('Mask', 0.72, 3.3, 0, 0.2, 0.92, 0.42, '#5c262e');
      add('Cloak', -0.78, 1.35, 0, 0.25, 1.55, 2.25, '#2b2530');
      for (const side of [-1, 1]) {
        line('Weapon', [0.55, 2.0, side * 1.15], [1.65, 2.45, side * 0.95], 0.18, steel, 4);
        add('Hilt', 0.45, 1.9, side * 1.15, 0.22, 0.22, 0.35, leather);
      }
      break;
    }

    case 'banditPoacher': {
      addBipedFrame({
        cloth: '#3b4f3d',
        armor: leather,
        skin: skinHuman,
        trim: '#b89f68',
        scale: 0.94,
        hooded: true,
      });
      // Quiver on back + vertical curved bow
      add('Quiver', -0.72, 2.35, -0.45, 0.48, 0.48, 1.45, leather);
      pair('Arrows', -0.72, 3.82, -0.35, 0.14, 0.14, 0.42, bone);
      line('Bow', [0.85, 3.45, 1.15], [1.28, 2.45, 1.15], 0.18, '#7a593c', 4);
      line('Bow', [1.28, 2.45, 1.15], [0.85, 1.45, 1.15], 0.18, '#7a593c', 4);
      line('Bowstring', [0.82, 3.42, 1.15], [0.82, 1.48, 1.15], 0.08, bone, 5);
      add('Cape', -0.75, 1.65, 0.2, 0.26, 1.35, 1.9, '#2e3e30');
      break;
    }

    case 'banditBruiser': {
      addBipedFrame({
        cloth: '#4b3b36',
        armor: iron,
        skin: skinHuman,
        trim: '#b8905e',
        scale: 1.04,
      });
      pair('Armor', 0.05, 3.55, 1.3, 1.15, 1.1, 0.45, steel);
      add('Head', 0.8, 4.1, 0, 0.22, 1.1, 0.4, '#6e3232');
      // Heavy two-handed iron maul
      line('Shaft', [0.82, 1.25, 1.1], [1.1, 3.95, 0.3], 0.22, '#694e35', 7);
      add('MaulHead', 1.12, 3.85, 0.25, 1.05, 1.45, 0.95, iron);
      pair('Spikes', 1.12, 4.15, 0.95, 0.35, 0.28, 0.35, steel);
      break;
    }

    case 'banditAlchemist': {
      addBipedFrame({
        cloth: '#453c4f',
        armor: leather,
        skin: skinHuman,
        trim: '#7ad4b0',
        scale: 0.92,
        hooded: true,
      });
      // Brass goggles + glowing acid/fire flasks on bandolier and held in hand
      pair('Goggles', 0.8, 3.55, 0.32, 0.18, 0.34, 0.3, '#84f5c8');
      add('Belt', 0.72, 2.25, 0, 0.24, 1.5, 0.3, leather);
      for (const z of [-0.55, 0, 0.55]) {
        add('Flasks', 0.88, 2.15, z, 0.24, 0.24, 0.42, z < 0 ? '#7ef5a8' : '#ffb861');
      }
      add('Backpack', -0.78, 2.05, 0, 0.68, 1.15, 1.25, iron);
      add('Core', -0.82, 3.35, 0.28, 0.38, 0.38, 0.55, '#8effb2');
      add('Flasks', 0.75, 2.15, 1.18, 0.42, 0.42, 0.52, '#ff8e52');
      break;
    }

    case 'banditExecutioner': {
      addBipedFrame({
        cloth: '#382a2e',
        armor: '#585c66',
        skin: skinHuman,
        trim: '#d4af6a',
        scale: 1.08,
        fine: true,
      });
      // Iron skull half-mask + wolf-fur shoulder mantle + colossal executioner greataxe
      add('Mask', 0.85, 3.45, 0, 0.24, 1.15, 0.72, steel);
      add('Horns', 0.1, 4.65, 0, 1.45, 1.45, 0.36, '#362d38');
      hornPair('Horns', 0.15, 4.55, 0.65, 5, 0.08, 0.24, 0.14, 0.28, iron);
      for (let i = -3; i <= 3; i++) {
        add('Mantle', -0.25, 3.55, i * 0.42, 1.25, 0.45, 0.52, i % 2 ? '#54463b' : '#6e5c4e');
      }
      add('Cloak', -0.92, 1.05, 0, 0.32, 1.95, 2.75, '#47232c');
      line('AxeShaft', [0.75, 0.9, 1.25], [1.45, 4.9, 0.85], 0.24, '#5e432c', 10);
      for (let i = 0; i < 6; i++) {
        add(
          'AxeBlade',
          1.48 + i * 0.14,
          3.6 + (5 - i) * 0.08,
          0.85,
          0.28,
          0.18,
          1.45 - i * 0.12,
          i >= 4 ? '#f0ede4' : iron,
        );
      }
      break;
    }

    case 'banditSyndicateKing': {
      // Dark-alley syndicate king: raven-plume coat, tricorn/beaked crown mask, cane-rapier + twin flintlocks
      addBipedFrame({
        cloth: '#23202c',
        armor: '#4b3844',
        skin: skinHuman,
        trim: gold,
        eyeColor: '#ff526f',
        scale: 1.12,
        fine: true,
      });
      // Beaked raven mask + wide tricorn hat
      add('Mask', 0.95, 3.72, 0, 0.52, 0.92, 0.55, steel);
      add('Beak', 1.38, 3.78, 0, 0.65, 0.28, 0.28, gold);
      add('Hat', 0.05, 4.82, 0, 2.15, 2.35, 0.34, '#1b1824');
      add('Hat', 0, 5.15, 0, 1.38, 1.38, 0.68, '#292235');
      hornPair('Plumes', -0.25, 5.35, 0.45, 6, -0.32, 0.22, 0.18, 0.28, '#ff4d6d');
      // High collar + sprawling layered raven-feather longcoat
      for (let row = 0; row < 4; row++) {
        for (let col = -3; col <= 3; col++) {
          add(
            'Cloak',
            -0.88 - row * 0.08,
            3.35 - row * 0.72,
            col * 0.38,
            0.28,
            0.44,
            0.78,
            (row + Math.abs(col)) % 2 ? '#292436' : '#3b2434',
          );
        }
      }
      // Twin golden flintlock & rapier
      line('Rapier', [0.75, 2.2, 1.38], [2.85, 3.25, 0.78], 0.16, '#f7f3df', 10);
      add('Guard', 0.88, 2.15, 1.32, 0.42, 0.42, 0.48, gold);
      line('Pistol', [0.75, 2.15, -1.35], [1.95, 2.45, -1.25], 0.22, gold, 6);
      orbitingShards('BannerCrest', -0.5, 4.2, 0, 2.45, 18, 0.22, gold, 0.55);
      break;
    }

    // ======================== GOBLINS (MOBS x4, ELITE x1, BOSS x1) ========================
    case 'goblinScavenger': {
      addBipedFrame({
        cloth: '#584c3d',
        armor: '#70777a',
        skin: goblinSkin,
        trim: iron,
        eyeColor: '#ffea75',
        scale: 0.85,
        hunch: 0.32,
      });
      pair('Ears', 0.25, 3.25, 0.75, 0.28, 0.85, 0.26, goblinSkin);
      // Scrap pot-lid buckler on left arm + jagged scrap spear on right
      add('Shield', 0.45, 1.75, -1.22, 0.22, 0.22, 0.22, iron);
      add('Shield', 0.52, 1.35, -1.35, 1.1, 0.22, 1.1, '#7f878a');
      line('Spear', [0.55, 0.8, 1.1], [1.55, 3.7, 0.88], 0.16, '#6e5237', 7);
      add('SpearTip', 1.65, 3.72, 0.85, 0.32, 0.18, 0.68, steel);
      add('Pack', -0.68, 1.8, 0, 0.65, 1.05, 0.95, leather);
      break;
    }

    case 'goblinSlinger': {
      addBipedFrame({
        cloth: '#6e5b42',
        armor: leather,
        skin: goblinSkin,
        trim: '#d66e4e',
        eyeColor: '#ffe878',
        scale: 0.82,
        hunch: 0.28,
      });
      pair('Ears', 0.22, 3.1, 0.72, 0.26, 0.82, 0.24, goblinSkin);
      add('Headband', 0.2, 3.55, 0, 1.15, 1.2, 0.25, '#c94c4c');
      // Overhead whirling sling loop
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(
          'Sling',
          0.45 + Math.cos(a) * 0.62,
          3.85 + Math.sin(a) * 0.22,
          0.95 + Math.sin(a) * 0.62,
          0.14,
          0.14,
          0.14,
          leather,
        );
      }
      add('Pouch', -0.45, 1.45, -0.82, 0.55, 0.55, 0.62, '#9c8360');
      break;
    }

    case 'goblinShaman': {
      addBipedFrame({
        cloth: '#4b3b5c',
        armor: '#70584a',
        skin: goblinSkin,
        trim: bone,
        eyeColor: '#8dffcb',
        scale: 0.88,
        hunch: 0.22,
      });
      pair('Ears', 0.22, 3.3, 0.78, 0.28, 0.92, 0.28, goblinSkin);
      // Beast skull mask with horns + glowing bone-totem staff
      add('Mask', 0.78, 3.15, 0, 0.35, 1.05, 0.95, bone);
      hornPair('Horns', 0.62, 3.95, 0.35, 4, -0.1, 0.26, 0.15, 0.24, bone);
      line('Staff', [0.68, 0.4, 1.18], [1.12, 4.15, 1.05], 0.18, '#694b34', 8);
      add('Totem', 1.12, 4.15, 1.05, 0.68, 0.68, 0.62, bone);
      add('Core', 1.12, 4.35, 1.05, 0.42, 0.42, 0.42, '#8dffcb');
      break;
    }

    case 'goblinSapper': {
      addBipedFrame({
        cloth: '#543c32',
        armor: iron,
        skin: goblinSkin,
        trim: '#ff9c42',
        eyeColor: '#ffcf61',
        scale: 0.86,
        hunch: 0.36,
      });
      pair('Ears', 0.25, 3.25, 0.72, 0.25, 0.75, 0.24, goblinSkin);
      add('Helmet', 0.16, 3.72, 0, 1.25, 1.25, 0.45, iron);
      pair('Goggles', 0.75, 3.45, 0.32, 0.18, 0.32, 0.26, '#ffb24f');
      // Huge powder keg strapped on back with burning fuse
      add('Keg', -0.95, 1.55, 0, 1.15, 1.25, 1.55, '#6e4930');
      add('Keg', -0.95, 1.85, 0, 1.22, 1.3, 0.2, iron);
      add('Keg', -0.95, 2.65, 0, 1.22, 1.3, 0.2, iron);
      line('Fuse', [-0.95, 3.15, 0], [-1.35, 4.05, 0.25], 0.14, '#c4b89d', 3);
      add('Core', -1.35, 4.08, 0.25, 0.34, 0.34, 0.34, '#ff7e38');
      line('Torch', [0.75, 1.9, 1.12], [1.22, 3.15, 1.12], 0.18, leather, 4);
      add('Core', 1.22, 3.18, 1.12, 0.38, 0.38, 0.45, '#ff8e42');
      break;
    }

    case 'goblinWolfRider': {
      // Dire warg mount + armored goblin lancer riding on top (Elite)
      for (const x of [-1.25, 1.15])
        limbPair('WolfLegs', x, 1.45, 0.88, 1.45, 0.48, obsidian, '#464a52');
      add('WolfBody', -0.1, 1.42, 0, 3.1, 1.55, 1.25, '#545963');
      add('Armor', 0.2, 2.55, 0, 2.15, 1.65, 0.42, iron);
      add('WolfHead', 1.75, 2.05, 0, 1.38, 1.18, 0.98, '#646a75');
      add('WolfSnout', 2.48, 2.02, 0, 0.72, 0.68, 0.55, '#4c5059');
      eyes(2.25, 2.65, 0.4, 0.22, '#ff6868');
      hornPair('WolfEars', 1.35, 3.0, 0.38, 3, -0.1, 0.24, 0.08, 0.26, '#5c616b');
      tailSweep('WolfTail', -1.75, 1.95, 7, -0.36, 0.12, 0.22, 0.48, '#545963', '#8b929e');
      // Rider goblin seated at y=2.65
      add('Saddle', -0.15, 2.7, 0, 1.2, 1.25, 0.35, leather);
      add('Torso', -0.15, 3.0, 0, 0.95, 1.15, 1.2, '#7d3b32');
      add('Head', -0.05, 4.18, 0, 0.95, 1.0, 0.92, goblinSkin);
      pair('Ears', -0.05, 4.58, 0.68, 0.22, 0.75, 0.22, goblinSkin);
      eyes(0.45, 4.58, 0.28, 0.18, '#ffe66d');
      add('Helmet', -0.12, 4.95, 0, 1.05, 1.05, 0.35, iron);
      line('Lance', [0.2, 3.25, 0.92], [3.15, 4.35, 0.78], 0.18, '#6e5237', 11);
      add('LanceTip', 3.22, 4.38, 0.78, 0.65, 0.24, 0.24, steel);
      add('Banner', 1.85, 3.15, 0.85, 0.22, 0.16, 0.85, '#c94c4c');
      break;
    }

    case 'goblinKingGorg': {
      // Massive scrap-iron goblin warboss with jagged crown, shoulder trophy racks & mega-cleaver
      addBipedFrame({
        cloth: '#4d2b28',
        armor: '#686e73',
        skin: shade(goblinSkin, 0.88),
        trim: gold,
        eyeColor: '#ff694f',
        scale: 1.38,
        hunch: 0.24,
        fine: true,
      });
      pair('Ears', 0.35, 4.95, 1.18, 0.34, 1.15, 0.36, goblinSkin);
      // Crown of welded iron teeth & gold spikes
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        add(
          'Crown',
          0.15 + Math.cos(a) * 0.72,
          6.05 + (i % 2) * 0.28,
          Math.sin(a) * 0.72,
          0.24,
          0.24,
          0.65,
          i % 2 ? gold : steel,
        );
      }
      // Back-mounted iron trophy rack with skulls & war-banner poles
      add('TrophyRack', -0.95, 3.85, 0, 0.45, 2.85, 0.45, iron);
      for (const side of [-1, 1]) {
        line('BannerPole', [-0.95, 3.9, side * 1.25], [-1.15, 6.65, side * 1.38], 0.18, iron, 9);
        add('Banner', -1.2, 4.85, side * 1.35, 0.18, 0.75, 1.45, '#9c3232');
        add('Skulls', -0.75, 4.35, side * 1.25, 0.55, 0.55, 0.58, bone);
      }
      // Enormous notched scrap-iron Boss Cleaver
      line('WeaponHaft', [0.88, 1.05, 1.65], [1.85, 5.2, 1.25], 0.26, '#5c432c', 12);
      for (let i = 0; i < 10; i++) {
        add(
          'Weapon',
          1.82 + (i % 2) * 0.38,
          2.95 + Math.floor(i / 2) * 0.46,
          1.22,
          0.75,
          0.24,
          0.48,
          i % 2 ? iron : steel,
        );
      }
      orbitingShards('Runes', 0.2, 3.6, 0, 2.8, 16, 0.22, '#ff8e47', 0.55);
      break;
    }

    // ======================== EROSION-SCALES (MOBS x4, ELITE x1, BOSS x1) ========================
    case 'erosionCrawler': {
      for (let i = -1; i <= 1; i++)
        limbPair('Legs', i * 1.05, 1.0, 1.25, 0.98, 0.4, obsidian, '#3f324d');
      add('Body', 0, 0.95, 0, 3.45, 1.75, 0.98, '#362c44');
      add('Shell', 0, 1.88, 0, 2.95, 1.55, 0.48, '#554173');
      add('Head', 2.05, 1.22, 0, 1.25, 1.25, 0.85, '#3b2f4d');
      eyes(2.68, 1.68, 0.38, 0.22, riftPink);
      for (let i = 0; i < 6; i++) {
        add(
          'Core',
          -1.1 + i * 0.45,
          2.32,
          (i % 2 ? 1 : -1) * 0.32,
          0.32,
          0.32,
          0.95 + (i % 2) * 0.4,
          i % 2 ? voidPurple : riftPink,
        );
      }
      tailSweep('Tail', -1.85, 1.05, 8, -0.4, 0.25, 0.3, 0.58, '#3b2f4d', riftPink);
      break;
    }

    case 'erosionSpitter': {
      limbPair('Legs', -0.1, 1.25, 0.68, 1.25, 0.48, obsidian, '#423554');
      add('Body', 0, 1.2, 0, 1.85, 1.75, 1.55, '#392e4a');
      add('Core', 0.72, 1.45, 0, 0.95, 1.25, 1.15, '#c463ff');
      add('Head', 0.55, 2.75, 0, 1.35, 1.35, 1.05, '#4b3b63');
      eyes(1.22, 3.3, 0.42, 0.22, riftPink);
      // Flared spore-frill around neck raising above y=4.0
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        add(
          'Frill',
          0.22,
          3.15 + Math.cos(a) * 1.15,
          Math.sin(a) * 1.15,
          0.24,
          0.38,
          0.38,
          i % 2 ? voidPurple : riftPink,
        );
      }
      tailSweep('Tail', -1.1, 1.3, 6, -0.4, 0.18, 0.2, 0.48, '#392e4a', voidPurple);
      break;
    }

    case 'erosionHound': {
      for (const x of [-1.1, 1.0])
        limbPair('Limbs', x, 1.45, 0.78, 1.45, 0.42, obsidian, '#3f3250');
      add('Body', 0, 1.38, 0, 2.75, 1.32, 1.08, '#382c47');
      add('Armor', 0.2, 2.38, 0, 2.25, 1.15, 0.38, '#5b447a');
      add('Head', 1.68, 2.15, 0, 1.35, 1.08, 0.92, '#413354');
      add('Jaw', 2.25, 1.98, 0, 0.68, 0.85, 0.34, riftPink);
      eyes(2.18, 2.72, 0.36, 0.22, riftPink);
      hornPair('Horns', 1.25, 2.95, 0.35, 4, -0.25, 0.28, 0.12, 0.24, voidPurple);
      spineRidge('Spikes', -1.0, 2.68, 0.4, 7, 0.85, voidPurple);
      tailSweep('Tail', -1.45, 1.7, 7, -0.38, 0.28, 0.22, 0.44, '#382c47', riftPink);
      break;
    }

    case 'erosionWing': {
      limbPair('Talons', -0.05, 1.35, 0.5, 1.35, 0.35, obsidian, '#3d304f');
      add('Body', 0, 1.3, 0, 1.5, 1.25, 1.65, '#3b2e4d');
      add('Core', 0.55, 1.75, 0, 0.48, 0.72, 0.75, riftPink);
      add('Head', 0.58, 2.85, 0, 1.12, 1.05, 0.95, '#4b3b63');
      eyes(1.15, 3.35, 0.32, 0.22, '#ffa1ff');
      hornPair('Horns', 0.35, 3.72, 0.32, 4, -0.18, 0.3, 0.14, 0.24, voidPurple);
      wingPair('Wings', -0.15, 2.45, 0.72, 2.55, 1.2, voidPurple, obsidian, 7);
      tailSweep('Tail', -0.85, 1.45, 7, -0.4, 0.25, 0.28, 0.38, '#3b2e4d', riftPink);
      break;
    }

    case 'erosionJuggernaut': {
      // Towering void-crusted bipedal brute with giant asymmetric rift-crystal arm (Elite)
      limbPair('Legs', 0, 1.95, 0.92, 1.95, 0.92, obsidian, '#382c49');
      add('Torso', 0.1, 1.95, 0, 2.25, 2.85, 2.25, '#3d3050');
      add('Armor', 0.65, 2.2, 0, 1.1, 2.5, 1.7, '#584478');
      add('Core', 1.25, 2.95, 0, 0.42, 0.92, 0.95, riftPink);
      pair('Shoulders', 0.1, 3.85, 1.85, 1.75, 1.45, 1.25, '#4c3a66');
      // Normal left claw arm
      add('LeftArm', 0.35, 2.2, -1.9, 0.85, 0.85, 1.65, '#382c49');
      add('Claws', 0.65, 0.95, -1.9, 1.15, 1.0, 1.15, '#584478');
      // Colossal crystal-encrusted right crusher arm
      add('CrusherArm', 0.55, 2.15, 2.05, 1.25, 1.25, 1.85, '#4c3a66');
      add('CrusherFist', 0.95, 0.65, 2.15, 1.65, 1.55, 1.55, obsidian);
      for (let i = 0; i < 10; i++) {
        add(
          'Rift',
          0.65 + (i % 3) * 0.45,
          1.4 + Math.floor(i / 2) * 0.55,
          2.35 + (i % 2) * 0.35,
          0.36,
          0.36,
          0.88,
          i % 2 ? riftPink : voidPurple,
        );
      }
      add('Head', 0.65, 4.18, 0, 1.28, 1.38, 1.08, '#382c49');
      eyes(1.32, 4.65, 0.35, 0.24, riftPink);
      hornPair('Horns', 0.35, 4.95, 0.55, 6, -0.18, 0.32, 0.16, 0.32, '#8b5ed1');
      spineRidge('Scales', -1.1, 3.2, 0.35, 9, 1.15, voidPurple);
      orbitingShards('Shards', 0.1, 3.1, 0, 2.55, 14, 0.22, riftPink, 0.5);
      break;
    }

    case 'erosionRiftTyrant': {
      // Horned abyssal scale-tyrant with dorsal dimensional rift portal spires & twin void-blade claws (Boss)
      limbPair('Legs', -0.15, 2.15, 1.05, 2.15, 0.95, obsidian, '#362a47');
      add('Torso', 0.1, 2.15, 0, 2.55, 3.15, 2.55, '#3b2e4d');
      add('Armor', 0.95, 2.45, 0, 0.95, 2.65, 2.05, '#594278');
      add('Core', 1.48, 3.2, 0, 0.45, 1.15, 1.25, '#ff96ff');
      pair('Shoulders', 0, 4.35, 2.05, 1.95, 1.65, 1.25, '#543e73');
      for (const side of [-1, 1]) {
        add('Arms', 0.38, 2.55, side * 2.15, 0.95, 0.95, 1.85, '#3b2e4d');
        add('Gauntlet', 0.85, 1.65, side * 2.2, 1.15, 1.1, 1.1, obsidian);
        line('VoidBlade', [1.15, 1.85, side * 2.25], [2.75, 0.65, side * 1.95], 0.26, riftPink, 8);
        line(
          'VoidBlade',
          [1.15, 2.35, side * 2.35],
          [2.45, 1.35, side * 2.15],
          0.22,
          voidPurple,
          6,
        );
      }
      add('Head', 0.72, 4.65, 0, 1.55, 1.55, 1.35, '#2e223d');
      eyes(1.52, 5.25, 0.42, 0.28, '#ffa8ff');
      hornPair('Horns', 0.35, 5.65, 0.55, 8, -0.22, 0.32, 0.2, 0.34, '#b882ff');
      // Towering dorsal Rift Portal Ring & Spires above back (height ~ 6.7)
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        add(
          'Rift',
          -0.95,
          4.75 + Math.cos(a) * 1.75,
          Math.sin(a) * 1.75,
          0.26,
          0.32,
          0.32,
          i % 3 === 0 ? '#ffa6ff' : voidPurple,
        );
      }
      wingPair('RiftWings', -0.65, 3.85, 1.15, 2.85, 1.05, voidPurple, obsidian, 9);
      tailSweep('Tail', -1.25, 1.4, 12, -0.4, 0.16, 0.45, 0.85, '#3b2e4d', riftPink);
      orbitingShards('Runes', 0.1, 3.8, 0, 2.95, 20, 0.26, riftPink, 0.72);
      break;
    }

    default:
      break;
  }

  const limits = enemy.boss ? [200, 282] : enemy.elite ? [108, 156] : [48, 76];
  return finalizeVoxelComplexity(b, enemy, limits[0], limits[1]);
}

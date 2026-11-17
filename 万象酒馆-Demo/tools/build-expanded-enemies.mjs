import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { LADDER_ENEMIES, LADDER_BOSSES } from '../src/content/ladder-adversaries.js';
import { COMMON_ENEMIES, COMMON_BOSSES } from '../src/content/common-adversaries.js';
import { buildLadderVoxelBlocks } from './expanded-ladder-shapes.mjs';
import { buildCommonVoxelBlocks } from './expanded-common-shapes.mjs';
import { renderVoxelEnemyPortrait } from './voxel-enemy-art.mjs';

const TIER_BOUNDS = {
  mob: [45, 80],
  elite: [105, 165],
  boss: [195, 290],
};

async function main() {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const jsonDir = new URL('../../万象异境-体素模型/扩展怪物/', import.meta.url);
  const portraitDir = new URL('../assets/portraits/', import.meta.url);
  await mkdir(jsonDir, { recursive: true });
  await mkdir(portraitDir, { recursive: true });

  const ladderUnits = [...LADDER_ENEMIES, ...LADDER_BOSSES].filter((e) => !e.overlord);
  const commonUnits = [...COMMON_ENEMIES, ...COMMON_BOSSES].filter((e) => !e.overlord);
  const all = [
    ...ladderUnits.map((enemy) => ({ enemy, build: buildLadderVoxelBlocks })),
    ...commonUnits.map((enemy) => ({ enemy, build: buildCommonVoxelBlocks })),
  ];

  const stats = [];
  for (const { enemy, build } of all) {
    const blocks = build(enemy);
    const tier = enemy.boss ? 'boss' : enemy.elite ? 'elite' : 'mob';
    const [minBoxes, maxBoxes] = TIER_BOUNDS[tier];
    const groups = new Set(blocks.map((b) => b.group));
    const minY = Math.min(...blocks.map((b) => b.y));
    const maxY = Math.max(...blocks.map((b) => b.y + b.h));
    const height = +(maxY - minY).toFixed(2);
    if (blocks.length < minBoxes || blocks.length > maxBoxes) {
      throw Error(
        `Tier box count out of bounds for ${enemy.id} (${tier}): ${blocks.length} not in [${minBoxes}, ${maxBoxes}]`,
      );
    }
    if (groups.size < 4) {
      throw Error(`Expected >= 4 voxel groups for ${enemy.id}, got ${groups.size}`);
    }
    if (height <= 3.2) {
      throw Error(`Height too small for ${enemy.id}: ${height}`);
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
    stats.push({ id: enemy.id, tier, boxes: blocks.length, groups: groups.size, height });
  }

  console.log(`Built ${stats.length} voxel definitions & SVGs:`);
  for (const tier of ['mob', 'elite', 'boss']) {
    const subset = stats.filter((s) => s.tier === tier);
    const counts = subset.map((s) => s.boxes);
    console.log(
      `  ${tier}: count=${subset.length}, boxes=[${Math.min(...counts)}..${Math.max(...counts)}], minHeight=${Math.min(...subset.map((s) => s.height))}`,
    );
  }

  const py = fileURLToPath(new URL('../../建模工具/.venv/Scripts/python.exe', import.meta.url));
  const script = fileURLToPath(
    new URL('../../建模工具/build_expanded_enemies.py', import.meta.url),
  );
  const result = spawnSync(py, [script], { cwd: repoRoot, encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) {
    throw Error(`Python exporter failed with exit code ${result.status}`);
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

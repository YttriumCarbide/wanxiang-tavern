import test from 'node:test';
import assert from 'node:assert/strict';
import { officialSummonPool, summonSource } from '../src/summoning.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';

test('official summons use worldbook prose, skip owned characters and ignore arbitrary imported identities', () => {
  const library = newCampaign(defaultProtagonist());
  const book = {
    entries: {
      0: {
        content: '用户编辑的官设正文',
        extensions: { wanxiang: { characterId: 'official-aegis' } },
      },
      1: {
        content: '已经拥有的伊蒂丝',
        extensions: { wanxiang: { characterId: 'official-edith' } },
      },
      2: {
        content: '不受信任的角色',
        extensions: { wanxiang: { characterId: 'official-unknown' } },
      },
    },
  };
  const pool = officialSummonPool(library, book);
  assert.equal(pool.length, 1);
  assert.equal(pool[0].id, 'official-aegis');
  assert.equal(pool[0].setting.worldbook, '用户编辑的官设正文');
  assert.equal(pool[0].combat.name, '长景月汐');
  library.characters.push(pool[0]);
  assert.deepEqual(officialSummonPool(library, book), []);
});

test('chaos keeps equal thirds and never silently changes the chosen summoning method', () => {
  assert.equal(summonSource('chaos', 0), 'official');
  assert.equal(summonSource('chaos', 0.33332), 'official');
  assert.equal(summonSource('chaos', 1 / 3), 'npc');
  assert.equal(summonSource('chaos', 0.5), 'npc');
  assert.equal(summonSource('chaos', 2 / 3), 'infinite');
  assert.equal(summonSource('chaos', 0.99999), 'infinite');
  assert.equal(summonSource('official', 0.9), 'official');
  assert.equal(summonSource('infinite', 0.1), 'infinite');
  assert.throws(() => summonSource('unknown', 0));
});

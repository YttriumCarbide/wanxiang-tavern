import assert from 'node:assert/strict';
import path from 'node:path';

/** Inspect all effect styles in one page using actual engine events, then dispose every owner. */
export async function presentationChecks({ page, output }) {
  const result = await page.evaluate(async () => {
    const load = (file) => import(new URL(`./src/${file}.js`, location.href).href);
    const [{ createEffects }, { icon }, { HEROES, ENEMIES, BOSSES, BUFFS }, engine] =
      await Promise.all([load('effects'), load('buff-art'), load('data'), load('engine')]);
    const gallery = document.createElement('section');
    gallery.id = 'presentation-gallery';
    gallery.style.cssText =
      'position:fixed;inset:0;z-index:1000;background:#13242b;color:#eedfba;padding:24px;overflow:auto;font:14px Segoe UI';
    gallery.innerHTML =
      '<h2 style="margin:0 0 16px">状态图标 · 外框尺寸保持不变 / 64px内部绘制</h2>';
    const strip = document.createElement('div');
    strip.style.cssText = 'display:flex;gap:24px;margin-bottom:28px';
    for (const key of [...Object.keys(BUFFS), 'shield']) {
      const cell = document.createElement('div');
      cell.style.cssText = 'display:grid;justify-items:center;gap:8px;width:100px';
      cell.innerHTML = `<span class="buff-icon">${icon(key)}<b>1</b></span><div style="width:64px;height:64px">${icon(key)}</div><span>${BUFFS[key]?.name || '护盾'}</span>`;
      strip.append(cell);
    }
    gallery.append(strip);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px';
    gallery.append(grid);
    const playingSlot = document.createElement('div');
    playingSlot.className = 'time-cell playing';
    playingSlot.style.cssText = 'position:fixed;left:36px;bottom:24px;width:70px;height:42px';
    playingSlot.textContent = '1';
    gallery.append(playingSlot);
    document.body.append(gallery);
    const fxOwners = [];
    const cases = [HEROES[0], HEROES[2], HEROES[5], ...ENEMIES, ...BOSSES];
    const seen = [];
    for (const def of cases) {
      const hero = !!def.weapon;
      const card = document.createElement('section');
      card.style.cssText =
        'position:relative;height:160px;border:1px solid #688184;background:#1d3036';
      card.innerHTML = `<div style="padding:8px">${def.name} · ${def.weapon || def.attackStyle}</div><div style="position:absolute;left:25px;top:85px;width:25px;height:36px;background:${def.color}"></div><div style="position:absolute;left:220px;top:85px;width:25px;height:36px;background:#7b8b80"></div>`;
      const layer = document.createElement('div');
      layer.className = 'battle-effects';
      card.append(layer);
      grid.append(card);
      let state = engine.newBattle(hero ? ['pebble'] : [def.id]);
      let event;
      if (hero) {
        const at = state.formation.indexOf(def.id);
        [state.formation[0], state.formation[at]] = [state.formation[at], state.formation[0]];
        state.units.pebble.block = 3;
        event = engine
          .preview(state, [engine.makeAction(state, def.id, 'attack', 'pebble', 0)])
          .events.find((item) => item.type === 'hero');
      } else {
        state = engine.advance(engine.preview(state, []));
        event = engine.preview(state, []).events.find((item) => item.type === 'enemy');
      }
      const owner = createEffects(
        layer,
        (id) => ({ x: id === def.id ? 40 : 232, y: 102 }),
        () => 1,
      );
      const duration = owner.play(event, state, []);
      const animations = layer.getAnimations({ subtree: true });
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = duration * 0.35;
      }
      seen.push({
        style: def.weapon || def.attackStyle,
        sprites: layer.querySelectorAll('[data-effect]').length,
        duration,
        groundMark: layer.querySelectorAll('[data-effect="ground-trace"]').length,
        timelineThread: layer.querySelectorAll('[data-effect="timeline-thread"]').length,
        shieldBreak: layer.querySelectorAll('[data-effect="shield-break"]').length,
      });
      fxOwners.push({ owner, layer, duration });
    }
    window.presentationGallery = {
      impact() {
        fxOwners.forEach(({ layer, duration }) =>
          layer.getAnimations({ subtree: true }).forEach((animation) => {
            animation.currentTime = duration * 0.77;
          }),
        );
      },
      dispose() {
        fxOwners.forEach(({ owner }) => owner.dispose());
        const remaining = fxOwners.reduce((count, { layer }) => count + layer.childElementCount, 0);
        gallery.remove();
        delete window.presentationGallery;
        return remaining;
      },
    };
    return {
      seen,
      iconSizes: [...strip.querySelectorAll('.buff-icon')].map((chip) => ({
        width: chip.offsetWidth,
        height: chip.offsetHeight,
        viewBox: chip.querySelector('svg').getAttribute('viewBox'),
      })),
    };
  });
  try {
    assert(
      result.seen.length >= 15,
      'Keep the original effect gallery and include newly registered enemies',
    );
    for (const effect of result.seen) {
      assert(effect.sprites > 0, effect.style);
      assert(effect.duration >= 600, effect.style);
      assert(effect.groundMark > 0, `${effect.style}: hit leaves a fading mark`);
      assert(effect.timelineThread > 0, `${effect.style}: active slot connects to actor`);
      if (['sword', 'staff', 'bow'].includes(effect.style))
        assert(effect.shieldBreak > 0, `${effect.style}: actual shield break has its own feedback`);
    }
    for (const icon of result.iconSizes) {
      assert.equal(icon.width, 25);
      assert.equal(icon.height, 25);
      assert.equal(icon.viewBox, '0 0 64 64');
    }
    await page.screenshot({ path: path.join(output, 'combat-windup-and-buffs.png') });
    await page.evaluate(() => window.presentationGallery.impact());
    await page.screenshot({ path: path.join(output, 'combat-impact-and-buffs.png') });
  } finally {
    assert.equal(await page.evaluate(() => window.presentationGallery.dispose()), 0);
  }
}

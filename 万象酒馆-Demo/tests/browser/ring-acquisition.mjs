import assert from 'node:assert/strict';
import path from 'node:path';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { compileRoster } from '../../src/ai/library.js';
import { newExpedition, beginEncounter } from '../../src/expedition.js';
import { DRAGON_EMBLEM_ID, EMBLEMS } from '../../src/emblems.js';
import { DEVELOPER_COPY_KEY } from '../../src/developer-rules.js';
import { developerCopySeed } from '../../src/storage/developer-copy.js';
import { finishGalDialogue } from './legacy-session.mjs';

const RING_SELECTOR = '#battle .ring-feedback[data-actor]';
const ACTOR_SELECTOR = '#stage [data-unit], #battle .rear-card[data-rear]';
const NARROW_VIEWPORT = { width: 844, height: 390 };
const CHARGE_LAYERS = ['meter', 'trail'];
const AWARD_LAYERS = ['focus', 'meter', 'trail'];

/** Install before navigation so transient ring effects are never missed. */
export async function installRingObserver(page) {
  await page.addInitScript(
    ({ ringSelector, actorSelector }) => {
      const log = [];
      window.__ringLog = log;
      const seen = new WeakMap();
      const readAnimations = Element.prototype.getAnimations;
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
      function layerNames(root) {
        const prefix = 'ring-feedback__';
        return Array.from(root.querySelectorAll('.ring-feedback__piece'), (layer) =>
          [...layer.classList]
            .find((name) => name !== 'ring-feedback__piece' && name.startsWith(prefix))
            ?.slice(prefix.length),
        ).sort();
      }
      function hasPaintedBox(node, style) {
        const bounds = node.getBoundingClientRect();
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          style.visibility === 'visible' &&
          Number(style.opacity) > 0.08
        );
      }
      function samplePresentation(root, phase) {
        const meter = root.querySelector('.ring-feedback__meter');
        const rim = root.querySelector('.ring-feedback__rim');
        const gem = root.querySelector('.ring-feedback__core');
        const sweep = root.querySelector('.ring-feedback__sweep');
        const meterStyle = getComputedStyle(meter);
        const bounds = meter.getBoundingClientRect();
        const rimStyle = rim && getComputedStyle(rim);
        const gemStyle = gem && getComputedStyle(gem);
        const haloStyle = phase === 'full' && getComputedStyle(meter, '::after');
        const trail = root.querySelector('.ring-feedback__trail');
        const trailStyle = trail && getComputedStyle(trail);
        const focus = root.querySelector('.ring-feedback__focus');
        const focusStyle = focus && getComputedStyle(focus);
        const visible =
          bounds.width > 0 && meterStyle.visibility === 'visible' && Number(meterStyle.opacity) > 0;
        const settling =
          phase === 'settle'
            ? readAnimations
                ?.call(meter)
                .find((effect) => effect.animationName === meterStyle.animationName)
            : null;
        const end = settling?.effect.getKeyframes().at(-1);
        const endScale = /(?:scale|matrix)\(([\d.]+)/.exec(end?.transform ?? '')?.[1];
        return {
          visible,
          ringVisible:
            visible &&
            Boolean(
              rimStyle?.backgroundImage.includes('conic-gradient') &&
              rim.getBoundingClientRect().width > 0,
            ),
          gemVisible:
            visible &&
            Boolean(
              gemStyle?.clipPath.startsWith('polygon(') &&
              gem.getBoundingClientRect().width > 0 &&
              Number(gemStyle.opacity) > 0,
            ),
          meterBounds: {
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
            width: bounds.width,
          },
          trailVisible: Boolean(
            trailStyle?.backgroundImage.includes('radial-gradient') &&
            hasPaintedBox(trail, trailStyle),
          ),
          focusVisible: Boolean(
            focusStyle?.borderTopStyle === 'solid' &&
            parseFloat(focusStyle.borderTopWidth) > 0 &&
            hasPaintedBox(focus, focusStyle),
          ),
          focusAnimationName: focusStyle?.animationName ?? null,
          meterAnimationName: meterStyle.animationName,
          sweepAnimationName: sweep ? getComputedStyle(sweep).animationName : null,
          settleEnd: endScale ? { scale: Number(endScale), opacity: Number(end.opacity) } : null,
          haloVisible: visible && Number(haloStyle?.opacity) > 0,
          haloAnimationName: haloStyle?.animationName ?? null,
        };
      }
      function record(root) {
        const actor = root.dataset.actor;
        const anchor = actor
          ? [...document.querySelectorAll(actorSelector)].find(
              (candidate) => candidate.dataset.unit === actor || candidate.dataset.rear === actor,
            ) || null
          : null;
        const rect = anchor?.getBoundingClientRect();
        const origin = root.getBoundingClientRect();
        const board = root.parentElement?.getBoundingClientRect();
        const phase = root.dataset.phase || null;
        const charge = root.dataset.charge ?? null;
        const lit = root.querySelectorAll('.ring-feedback__cell.is-lit').length;
        const signature = `${phase}:${charge}:${lit}:${root.className}`;
        if (seen.get(root) === signature) return;
        seen.set(root, signature);
        if (!phase) return;
        const snapshot = {
          at: performance.now(),
          actor,
          emblem: root.dataset.emblem ?? null,
          phase,
          lit,
          cells: root.querySelectorAll('.ring-feedback__cell').length,
          layers: layerNames(root),
          hasOverlay: Boolean(root.querySelector('svg, canvas, dialog')),
          accessible:
            root.getAttribute('aria-hidden') === 'true' &&
            getComputedStyle(root).pointerEvents === 'none',
          anchor: rect
            ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
            : null,
          feedbackOrigin: { left: origin.left, top: origin.top },
          board: board
            ? { left: board.left, top: board.top, width: board.width, height: board.height }
            : null,
          ...samplePresentation(root, phase),
        };
        log.push(snapshot);
        // A phase mutation can precede the first visible frame of its CSS effects.
        const flight = phase === 'flight' && !reducedMotion.matches;
        const burst =
          phase === 'full' && root.classList.contains('is-award') && !reducedMotion.matches;
        const deadline = performance.now() + 300;
        function sampleFrame() {
          requestAnimationFrame(() => {
            if (!root.isConnected || seen.get(root) !== signature) return;
            const frame = samplePresentation(root, phase);
            snapshot.frame = frame;
            if (
              performance.now() < deadline &&
              (flight ? !frame.trailVisible : !frame.visible || (burst && !frame.haloVisible))
            ) {
              sampleFrame();
            }
          });
        }
        sampleFrame();
      }
      function scan() {
        for (const root of document.querySelectorAll(ringSelector)) record(root);
      }
      new MutationObserver(scan).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-phase', 'data-charge', 'class'],
      });
      scan();
    },
    {
      ringSelector: RING_SELECTOR,
      actorSelector: ACTOR_SELECTOR,
    },
  );
}

function buildSnapshot() {
  const library = newCampaign(defaultProtagonist());
  library.campaign.completed = true;
  library.campaign.tutorial = 'complete';
  library.inventory.summonContracts = 1;
  firstCompanion(library);
  library.campaign.tutorial = 'complete';
  library.seenOverlordTutorials = ['darkscaleWarlord'];
  const expedition = newExpedition('darkscaleWarlord', compileRoster(library));
  expedition.partyIds = [...library.party];
  expedition.developerEncounter = {
    name: 'darkscaleWarlord',
    boss: true,
    enemyIds: ['darkscaleWarlord'],
  };
  const state = beginEncounter(expedition);
  return {
    version: 1,
    library,
    state,
    plan: [],
    history: [],
    journey: { bossChoice: 'darkscaleWarlord', regionMap: 'forest', expedition },
    activeScript: null,
    storyView: { page: 0, latest: 0, pages: Array.from({ length: 5 }, () => []) },
    quick: [],
  };
}

async function seedCopy(page, snapshot) {
  const entries = developerCopySeed(
    { ai: { library: snapshot.library, generationOptions: {} } },
    snapshot,
  );
  await page.addInitScript(
    ({ key, rows }) => {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, JSON.stringify(rows));
    },
    { key: DEVELOPER_COPY_KEY, rows: entries },
  );
}

async function openBattle(page, baseURL) {
  await page.goto(`${baseURL}/?developerSandbox`);
  await page.waitForFunction(() => window.demo?.getStatus().mode === 'battle');
  await page.waitForFunction(() => !window.demo.getStatus().animating);
}

async function commitRound(page) {
  await page.locator('#commit').click();
  await page.waitForFunction(() => window.demo.getStatus().playing);
  await page.waitForFunction(() => !window.demo.getStatus().playing);
  await page.waitForFunction(() => !window.demo.getStatus().animating);
}

async function triggerChargeFeedback(page, actor, previousCharge) {
  return page.evaluate(
    async ({ actor, previousCharge }) => {
      const { createRingFeedback } = await import('/src/app/ring-feedback.js');
      const state = demo.getState();
      const before = structuredClone(state);
      const after = structuredClone(state);
      before.units[actor].emblemCharge = previousCharge;
      after.units[actor].emblemCharge = 6;
      const cues = [];
      const feedback = createRingFeedback({
        session: { runtime: { mode: 'battle', disposed: false }, battle: { state: after } },
        audio: { play: (cue) => cues.push(cue) },
      });
      try {
        return { played: await feedback.event({ after }, before), cues };
      } finally {
        feedback.dispose();
      }
    },
    { actor, previousCharge },
  );
}

async function interruptAcquisition(page, actor, method, timedFallback) {
  return page.evaluate(
    async ({ actor, method, timedFallback, ringSelector }) => {
      const { createRingFeedback } = await import('/src/app/ring-feedback.js');
      const state = demo.getState();
      const emblemId = state.heroDefinitions[actor].emblemId;
      const cues = [];
      const feedback = createRingFeedback({
        session: { runtime: { mode: 'battle', disposed: false }, battle: { state } },
        audio: { play: (cue) => cues.push(cue) },
      });
      const { getAnimations } = Element.prototype;
      try {
        if (timedFallback) Element.prototype.getAnimations = undefined;
        const pending = feedback.acquired(emblemId, actor);
        const root = document.querySelector(ringSelector);
        feedback[method]();
        const removed = root?.isConnected === false;
        const result = await Promise.race([
          pending,
          new Promise((resolve) => window.setTimeout(() => resolve('pending'), 0)),
        ]);
        const restarted = method === 'dispose' ? await feedback.acquired(emblemId, actor) : null;
        return { removed, result, phase: root?.dataset.phase, restarted, cues };
      } finally {
        if (timedFallback) Element.prototype.getAnimations = getAnimations;
        feedback.dispose();
      }
    },
    { actor, method, timedFallback, ringSelector: RING_SELECTOR },
  );
}
async function rejectAcquisitionDuringEntry(page, actor) {
  return page.evaluate(async (actor) => {
    const { createRingFeedback } = await import('/src/app/ring-feedback.js');
    const battle = document.querySelector('#battle');
    const state = demo.getState();
    const cues = [];
    const feedback = createRingFeedback({
      session: { runtime: { mode: 'battle', disposed: false }, battle: { state } },
      audio: { play: (cue) => cues.push(cue) },
    });
    battle.classList.add('entering');
    try {
      const played = await feedback.acquired(state.heroDefinitions[actor].emblemId, actor);
      return { played, cues, effects: battle.querySelectorAll('.ring-feedback').length };
    } finally {
      battle.classList.remove('entering');
      feedback.dispose();
    }
  }, actor);
}
async function playAcquisitionFeedback(page, actor, disableWebAnimations = false, skip = false) {
  return page.evaluate(
    async ({ actor, ringSelector, disableWebAnimations, skip }) => {
      const { createRingFeedback } = await import('/src/app/ring-feedback.js');
      const state = demo.getState();
      const cues = [];
      const feedback = createRingFeedback({
        session: { runtime: { mode: 'battle', disposed: false }, battle: { state } },
        audio: {
          play: (cue) =>
            cues.push({ cue, phase: document.querySelector(ringSelector)?.dataset.phase }),
        },
      });
      const { getAnimations } = Element.prototype;
      try {
        // Only disable animation inspection. CSS must still run on the fallback clock.
        if (disableWebAnimations) Element.prototype.getAnimations = undefined;
        const start = window.__ringLog.length;
        const pending = feedback.acquired(state.heroDefinitions[actor].emblemId, actor);
        const root = document.querySelector(ringSelector);
        const skipButton = document.querySelector('.ring-feedback-skip');
        const skipLabel = skipButton?.textContent || null;
        if (skip) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          skipButton?.click();
        }
        const meter = root?.querySelector('.ring-feedback__meter');
        const flight = meter
          ? {
              animationName: getComputedStyle(meter).animationName,
              animationDuration: getComputedStyle(meter).animationDuration,
            }
          : null;
        const result = await pending;
        const log = window.__ringLog.slice(start);
        return {
          result,
          removed: root?.isConnected === false,
          flight,
          cues,
          skipLabel,
          phases: [...new Set(log.map((entry) => entry.phase))],
          full: log.find((entry) => entry.phase === 'full') || null,
          settle: log.find((entry) => entry.phase === 'settle') || null,
        };
      } finally {
        if (disableWebAnimations) Element.prototype.getAnimations = getAnimations;
        feedback.dispose();
      }
    },
    { actor, ringSelector: RING_SELECTOR, disableWebAnimations, skip },
  );
}

async function waitForRing(page, phase, actor = null) {
  await page.waitForFunction(
    ({ phase, actor }) =>
      window.__ringLog.some((entry) => entry.phase === phase && (!actor || entry.actor === actor)),
    { phase, actor },
    { timeout: 15000 },
  );
}
async function captureAwardFrames(page, output) {
  for (const phase of ['flight', 'charging', 'full', 'settle']) {
    const frame = await page.waitForFunction(
      ({ selector, phase }) => {
        const root = document.querySelector(selector);
        if (!root?.classList.contains('is-award') || root.dataset.phase !== phase) return false;
        const visible = (part) => Number(getComputedStyle(root.querySelector(part)).opacity) > 0.15;
        // Only the star is in flight; the dial becomes visible on contact with the wearer.
        if (!visible(phase === 'flight' ? '.ring-feedback__trail' : '.ring-feedback__meter'))
          return false;
        if (phase === 'charging' && Number(root.dataset.charge) < 3) return false;
        if (
          phase === 'full' &&
          Number(getComputedStyle(root.querySelector('.ring-feedback__meter'), '::after').opacity) <
            0.3
        )
          return false;
        const running = root
          .getAnimations({ subtree: true })
          .filter((ani) => ani.playState === 'running');
        for (const ani of running) ani.pause();
        return running;
      },
      { selector: RING_SELECTOR, phase },
      { timeout: 15000 },
    );
    try {
      await page.screenshot({ path: path.join(output, 'ring-award-' + phase + '.png') });
    } finally {
      await frame.evaluate((animations) => {
        for (const ani of animations) if (ani.playState === 'paused') ani.play();
      });
      await frame.dispose();
    }
  }
}
export async function ringAcquisitionChecks({ browser, baseURL, output }) {
  const results = {};

  // --- Award path: real mid-battle DRAGON_EMBLEM_ID grant ---
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installRingObserver(page);
    const snapshot = buildSnapshot();
    await seedCopy(page, snapshot);
    try {
      await openBattle(page, baseURL);
      const before = await page.evaluate(() => demo.getLibrary());
      assert.equal(before.emblems?.includes(DRAGON_EMBLEM_ID), false);
      const party = before.party.filter(Boolean);
      const fullBefore = await page.evaluate(
        (ids) => ids.map((id) => demo.getState().units[id]?.emblemCharge ?? 0),
        party,
      );
      assert(
        fullBefore.every((charge) => charge === 0),
        'rings start empty',
      );

      // The real reward predicate requires crossing the encounter's round-two threshold.
      await commitRound(page);
      await Promise.all([captureAwardFrames(page, output), commitRound(page)]);
      await waitForRing(page, 'full');

      const after = await page.evaluate(() => demo.getLibrary());
      assert(after.emblems.includes(DRAGON_EMBLEM_ID), 'dragon emblem granted');
      const wearer = after.characters.find((member) => member.emblemId === DRAGON_EMBLEM_ID);
      assert(wearer, 'a real member wears the ring');
      const state = await page.evaluate(() => demo.getState());
      const actor = Object.keys(state.heroDefinitions || {}).find(
        (id) => state.heroDefinitions[id].emblemId === DRAGON_EMBLEM_ID,
      );
      assert(actor, 'battle hero definition carries emblem');
      assert.equal(state.units[actor].emblemCharge, 6, 'wearer starts full');

      await waitForRing(page, 'settle', actor);
      const log = await page.evaluate(() => window.__ringLog);
      const actorLog = log.filter((entry) => entry.actor === actor);
      const phases = actorLog.map((entry) => entry.phase);
      const arrival = actorLog.find((entry) => entry.phase === 'flight');
      assert(arrival?.anchor && arrival.board, 'award resolves the actual wearer card');
      const expectedLeft = Math.max(
        51.2,
        Math.min(
          arrival.board.width - 51.2,
          arrival.anchor.left - arrival.board.left + arrival.anchor.width / 2,
        ),
      );
      const expectedTop = Math.max(
        51.2,
        Math.min(
          arrival.board.height - 51.2,
          arrival.anchor.top - arrival.board.top + arrival.anchor.height * 0.48,
        ),
      );
      assert(Math.abs(arrival.feedbackOrigin.left - (arrival.board.left + expectedLeft)) < 1.5);
      assert(Math.abs(arrival.feedbackOrigin.top - (arrival.board.top + expectedTop)) < 1.5);
      assert.deepEqual(
        arrival.layers,
        AWARD_LAYERS,
        'one star travels to the localized award dial',
      );
      assert(arrival.frame?.trailVisible, 'the arrival trail is visible during flight');
      assert(phases.includes('flight'), 'flight phase observed');
      assert(phases.includes('charging'), 'charging phase observed');
      assert(phases.includes('full'), 'full phase observed');
      assert(phases.includes('settle'), 'ring visibly contracts before cleanup');
      const charging = actorLog.filter((entry) => entry.phase === 'charging');
      const litSteps = [...new Set(charging.map((entry) => entry.lit))];
      assert.deepEqual(litSteps, [1, 2, 3, 4, 5, 6], 'charging reveals each of six cells in order');
      const fallback = charging.find((entry) => entry.frame?.visible);
      assert(fallback, 'CSS feedback stays visible while charging');
      assert.equal(fallback.visible, true, 'the CSS ring remains visible while charging');
      assert.deepEqual(fallback.layers, AWARD_LAYERS, 'charging stays on the wearer');
      assert.equal(fallback.frame.focusVisible, true, 'the wearer is framed during charging');
      assert.equal(fallback.frame.trailVisible, false, 'the trail is limited to arrival');
      assert.equal(
        fallback.hasOverlay,
        false,
        'the CSS presentation adds no SVG or canvas overlay',
      );
      assert.equal(
        fallback.accessible,
        true,
        'feedback stays decorative and cannot intercept input',
      );
      const full = log.find((entry) => entry.actor === actor && entry.phase === 'full');
      const settle = log.find((entry) => entry.actor === actor && entry.phase === 'settle');
      const chargeMs = Math.round(full.at - charging[0].at);
      assert(chargeMs >= 1400, 'the six award beats are readable before the burst');
      assert.equal(full.lit, 6, 'six cells lit at full');
      assert.equal(full.cells, 6, 'six cells rendered');
      assert.deepEqual(
        full.layers,
        AWARD_LAYERS,
        'full charge does not open a separate effect stage',
      );
      assert(full.frame?.focusVisible, 'the wearer remains framed at full charge');
      assert(full.frame.haloVisible, 'the full award releases a visible halo on the wearer');
      assert.equal(full.frame.haloAnimationName, 'ring-feedback-burst');
      assert.equal(full.frame.trailVisible, false, 'the full award does not replay the trail');
      assert.equal(full.ringVisible, true, 'a metallic ring is legible at full charge');
      assert.equal(full.gemVisible, true, 'the ring retains its central jewel');
      assert.equal(full.sweepAnimationName, 'ring-feedback-sweep');
      assert(settle?.settleEnd, 'settling animation exposes its terminal keyframe');
      assert(
        Math.abs(settle.settleEnd.scale - 0.32) < 0.01,
        'ring contracts at its terminal scale',
      );
      assert.equal(settle.settleEnd.opacity, 0, 'settled ring fades before cleanup');
      assert(full.anchor && full.anchor.width > 0, 'real anchor had size');

      await page.waitForFunction(
        () => document.querySelectorAll('#battle .ring-feedback').length === 0,
      );
      assert.equal(
        await page.evaluate(() => document.querySelectorAll('#battle .ring-feedback').length),
        0,
        'feedback cleaned up',
      );

      // Complete the real award narration before exercising subsequent battle events.
      // Gal deliberately hides the battle feedback layer until the narration closes.
      await page.locator('#gal-stage[data-owner="emblem-dialogue"]').waitFor({ state: 'visible' });
      await finishGalDialogue(page, 'emblem-dialogue');
      await page.waitForFunction(() => !document.body.classList.contains('gal-playing'));

      await page.setViewportSize(NARROW_VIEWPORT);
      const narrowAward = await playAcquisitionFeedback(page, actor);
      assert.equal(narrowAward.result, true, 'ring acquisition completes in a narrow viewport');
      assert(narrowAward.full?.ringVisible, 'narrow layout keeps the ring legible');
      assert(narrowAward.full?.gemVisible, 'narrow layout keeps the jewel legible');
      const narrowBounds = narrowAward.full?.meterBounds;
      assert(narrowBounds && narrowBounds.width > 0 && narrowBounds.width < 56);
      assert(narrowBounds.left >= 0 && narrowBounds.right <= NARROW_VIEWPORT.width);
      assert(narrowBounds.top >= 0 && narrowBounds.bottom <= NARROW_VIEWPORT.height);
      await page.setViewportSize({ width: 1440, height: 836 });

      const entering = await rejectAcquisitionDuringEntry(page, actor);
      assert.equal(entering.played, false, 'award effects stay out of the battle entrance');
      assert.deepEqual(entering.cues, []);
      assert.equal(entering.effects, 0);

      // Redraw must not duplicate.
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForFunction(() => !window.demo.getStatus().animating);
      assert.equal(
        await page.evaluate(() => document.querySelectorAll('#battle .ring-feedback').length),
        0,
        'no duplicate on redraw',
      );

      const chargeStart = await page.evaluate(() => window.__ringLog.length);
      const chargeFeedback = await triggerChargeFeedback(page, actor, 4);
      assert.equal(chargeFeedback.played, true, 'charge-to-full feedback is presented');
      assert.deepEqual(chargeFeedback.cues, ['ring-charge-full']);
      const chargeEntries = (
        await page.evaluate((start) => window.__ringLog.slice(start), chargeStart)
      ).filter((entry) => entry.actor === actor);
      const chargeFull = chargeEntries.find((entry) => entry.phase === 'full');
      assert(chargeFull?.frame?.ringVisible, 'ordinary full charge keeps the ring visible');
      for (const entry of chargeEntries) {
        assert.deepEqual(
          entry.layers,
          CHARGE_LAYERS,
          'ordinary charging has no award frame or shards',
        );
        assert.equal(entry.trailVisible, false, 'ordinary charging does not show an arrival trail');
      }
      assert.deepEqual(
        chargeEntries.map((entry) => entry.phase),
        ['full'],
        'combat goes straight to its completion flash',
      );
      assert.equal(chargeFull.lit, 6);
      assert.deepEqual(
        await triggerChargeFeedback(page, actor, 6),
        { played: false, cues: [] },
        'remaining full does not replay the cue',
      );

      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reducedFeedback = await triggerChargeFeedback(page, actor, 5);
      assert.equal(reducedFeedback.played, true);
      const reducedFull = (await page.evaluate(() => window.__ringLog))
        .filter((entry) => entry.actor === actor && entry.phase === 'full')
        .at(-1);
      assert(reducedFull, 'reduced motion reaches the full phase');
      assert.equal(reducedFull.lit, 6);
      assert.deepEqual(
        reducedFull.layers,
        CHARGE_LAYERS,
        'reduced ordinary charging has no award layers',
      );
      const frame = reducedFull.frame;
      assert(
        frame,
        `reduced motion cue was not sampled on a frame: ${JSON.stringify(reducedFull)}`,
      );
      assert.equal(
        frame.visible,
        true,
        `reduced motion keeps the ordinary ring visible: ${JSON.stringify(reducedFull)}`,
      );
      assert.equal(frame.ringVisible, true, 'reduced motion keeps the ring legible');
      assert.equal(frame.gemVisible, true, 'reduced motion keeps the ring jewel visible');
      assert.equal(frame.haloVisible, true, 'reduced motion retains a static completion halo');
      assert.equal(frame.sweepAnimationName, 'none', 'reduced motion disables the metal sweep');
      assert.equal(frame.haloAnimationName, 'none', 'reduced motion keeps the halo static');
      assert.equal(frame.meterAnimationName, 'none', 'reduced motion disables award choreography');

      const reducedAward = await playAcquisitionFeedback(page, actor);
      assert.equal(reducedAward.result, true, 'reduced-motion acquisition completes');
      assert.equal(reducedAward.removed, true, 'reduced-motion acquisition removes its feedback');
      assert.deepEqual(
        reducedAward.phases,
        ['charging', 'full'],
        'reduced motion skips flight and contraction',
      );
      assert(reducedAward.full, 'reduced-motion acquisition reaches a full ring');
      assert.deepEqual(
        reducedAward.full.layers,
        AWARD_LAYERS,
        'reduced motion retains the award structure',
      );
      assert.equal(reducedAward.full.lit, 6);
      const awardFrame = reducedAward.full.frame;
      assert(awardFrame?.ringVisible, 'reduced motion retains the metal ring');
      assert.equal(awardFrame.gemVisible, true, 'reduced motion retains the jewel');
      assert.equal(awardFrame.haloVisible, true, 'reduced motion retains the completion halo');
      assert.equal(awardFrame.focusVisible, true, 'reduced motion retains wearer focus');
      assert.equal(awardFrame.meterAnimationName, 'none');
      assert.equal(awardFrame.focusAnimationName, 'none');
      assert.equal(awardFrame.sweepAnimationName, 'none');
      assert.equal(awardFrame.haloAnimationName, 'none');
      assert.equal(awardFrame.trailVisible, false);
      assert.deepEqual(reducedAward.cues, [
        { cue: 'ring-arrival', phase: 'charging' },
        { cue: 'ring-charge-full', phase: 'full' },
      ]);
      await page.emulateMedia({ reducedMotion: 'no-preference' });

      const fallbackSuccess = await playAcquisitionFeedback(page, actor, true);
      assert.equal(fallbackSuccess.result, true, 'fallback acquisition completes successfully');
      assert.equal(fallbackSuccess.removed, true, 'successful fallback removes its feedback');
      assert.equal(fallbackSuccess.flight.animationName, 'ring-feedback-award-flight');
      assert.equal(fallbackSuccess.flight.animationDuration, '0.48s');
      assert(
        fallbackSuccess.phases.includes('settle'),
        'CSS-timed fallback completes the contraction',
      );
      assert(Math.abs(fallbackSuccess.settle.settleEnd.scale - 0.32) < 0.01);
      assert.equal(fallbackSuccess.full?.lit, 6, 'CSS-timed fallback reaches all six charge cuts');
      assert.deepEqual(fallbackSuccess.cues, [
        { cue: 'ring-arrival', phase: 'flight' },
        { cue: 'ring-charge-full', phase: 'full' },
      ]);

      const skippedAward = await playAcquisitionFeedback(page, actor, false, true);
      assert.equal(skippedAward.skipLabel, '跳过演出', 'the award provides a visible skip control');
      assert.equal(skippedAward.result, false, 'skipping cancels only the visual award wait');
      assert.equal(skippedAward.removed, true, 'skipping removes the ring and its control');
      assert.deepEqual(skippedAward.phases, ['flight'], 'skipping stops before later phases');
      assert.deepEqual(skippedAward.cues, [{ cue: 'ring-arrival', phase: 'flight' }]);

      for (const method of ['cancel', 'dispose']) {
        const interrupted = await interruptAcquisition(page, actor, method, true);
        assert.equal(interrupted.removed, true, method + ' detaches the award immediately');
        assert.equal(interrupted.result, false, method + ' cancels the pending animation');
        assert.equal(interrupted.phase, 'flight', method + ' stops during the award flight');
        assert.deepEqual(interrupted.cues, ['ring-arrival'], method + ' suppresses the full cue');
      }

      // Real reload: no reseed, no duplicate feedback.
      await page.evaluate(() => demo.flushStorage());
      await page.reload();
      await page.waitForFunction(() => window.demo?.getStatus().mode === 'battle');
      await page.waitForFunction(() => !window.demo.getStatus().animating);
      const reloaded = await page.evaluate(() => demo.getLibrary());
      assert(reloaded.emblems.includes(DRAGON_EMBLEM_ID), 'emblem persisted');
      assert.equal(
        await page.evaluate(() => document.querySelectorAll('#battle .ring-feedback').length),
        0,
        'no feedback on reload',
      );
      assert.deepEqual(errors, []);
      results.award = { actor, wearer: wearer.id, chargeMs, phases };
    } catch (failure) {
      await page.screenshot({ path: path.join(output, 'ring-award-failure.png') }).catch(() => {});
      throw failure;
    } finally {
      await page.close();
    }
  }

  // --- No-wearer path: all members pre-equipped with distinct non-dragon rings ---
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installRingObserver(page);
    const snapshot = buildSnapshot();
    const nonDragon = Object.keys(EMBLEMS).filter((id) => id !== DRAGON_EMBLEM_ID);
    const members = snapshot.library.characters.filter((member) =>
      snapshot.library.party.includes(member.id),
    );
    members.forEach((member, index) => {
      member.emblemId = nonDragon[index % nonDragon.length];
    });
    snapshot.library.emblems = [...new Set(members.map((member) => member.emblemId))];
    await seedCopy(page, snapshot);
    try {
      await openBattle(page, baseURL);
      // Exercise the same real mid-battle reward threshold without inventing a grant.
      await commitRound(page);
      await commitRound(page);
      await page.waitForFunction(() => !window.demo.getStatus().animating);
      const after = await page.evaluate(() => demo.getLibrary());
      assert(after.emblems.includes(DRAGON_EMBLEM_ID), 'dragon emblem collected');
      const wearer = after.characters.find((member) => member.emblemId === DRAGON_EMBLEM_ID);
      assert.equal(wearer, undefined, 'no member wears dragon ring');
      const log = await page.evaluate(() => window.__ringLog);
      assert.equal(log.length, 0, 'no feedback when no wearer');
      assert.deepEqual(errors, []);
      results.noWearer = { collected: true, feedback: 0 };
    } catch (failure) {
      await page
        .screenshot({ path: path.join(output, 'ring-nowearer-failure.png') })
        .catch(() => {});
      throw failure;
    } finally {
      await page.close();
    }
  }

  // --- Restore path: persisted arrival shown:false must narrate on reload, no queue ---
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installRingObserver(page);
    const snapshot = buildSnapshot();
    snapshot.library.emblems = [DRAGON_EMBLEM_ID];
    snapshot.journey.expedition.emblemArrival = {
      id: DRAGON_EMBLEM_ID,
      shown: false,
      recipient: null,
      midBattle: true,
    };
    await seedCopy(page, snapshot);
    try {
      await openBattle(page, baseURL);
      await page.waitForFunction(() => !window.demo.getStatus().animating);
      const log = await page.evaluate(() => window.__ringLog);
      assert.equal(log.length, 0, 'no feedback on restore');
      const arrival = await page.evaluate(() => demo.getExpedition()?.emblemArrival);
      assert(arrival, 'arrival still tracked');
      assert.deepEqual(errors, []);
      results.restore = { feedback: 0, arrivalShown: arrival.shown };
    } catch (failure) {
      await page
        .screenshot({ path: path.join(output, 'ring-restore-failure.png') })
        .catch(() => {});
      throw failure;
    } finally {
      await page.close();
    }
  }

  return results;
}

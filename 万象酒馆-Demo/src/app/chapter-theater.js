import { stripGalTags } from '../gal.js';
import { createEventScope } from '../shared/events.js';
import { query as $ } from './dom.js';
import {
  buildAstrolabeBackdropSvg,
  buildCornerFiligreeSvg,
  buildDividerDiamondSvg,
  buildEpilogueLaurelSvg,
  buildEventOpeningCrestSvg,
  buildFinCalligraphySvg,
  buildQuestOpeningCrestSvg,
  buildTheaterParticles,
  buildTheaterPetals,
  buildWaxSealSvg,
  resolveTheaterTheme,
  theaterCurtainCue,
} from './theater-themes.js';

const CEREMONY_DURATION_MS = 6600;
const SEAL_IMPACT_DELAY_MS = 3500;
const SINGLE_SEAL_IMPACT_MS = 750;
const VEIL_PEAK_MS = 900;
const VEIL_CLEAR_MS = 2300;
const FIRST_PARA_DELAY_S = 0.42;
const PARA_GAP_DELAY_S = 0.15;
const TYPE_CHAR_S = 0.068;
const TYPE_SPACE_S = 0.022;
const TYPE_COMMA_PAUSE_S = 0.11;
const TYPE_STOP_PAUSE_S = 0.21;
const SINGLE_CHAR_S = 0.022;
const SINGLE_STOP_PAUSE_S = 0.07;

/** Wrap each character in a span with calm human reading pacing; full text stays in the DOM. */
function appendTypedText(target, text, startSeconds, fast = false) {
  const chars = Array.from(text);
  const charStep = fast ? SINGLE_CHAR_S : TYPE_CHAR_S;
  const spaceStep = fast ? 0.01 : TYPE_SPACE_S;
  const commaStep = fast ? 0.04 : TYPE_COMMA_PAUSE_S;
  const stopStep = fast ? SINGLE_STOP_PAUSE_S : TYPE_STOP_PAUSE_S;
  let cursor = startSeconds;
  for (let index = 0; index < chars.length; index++) {
    const character = chars[index];
    const next = chars[index + 1] || '';
    const span = document.createElement('span');
    span.className = 'chapter-theater-char';
    span.style.setProperty('--char-delay', `${cursor.toFixed(2)}s`);
    span.textContent = character;
    target.append(span);

    if (/[\s“‘「『（(《【]/u.test(character)) {
      cursor += spaceStep;
      continue;
    }
    cursor += charStep;
    if (/[…]/u.test(character) && /[…]/u.test(next)) continue;
    if (/[。！？!?…]/u.test(character) && !/[”’」』）)]/u.test(next)) {
      cursor += stopStep;
    } else if (
      /[”’」』）)]/u.test(character) &&
      index > 0 &&
      /[。！？!?…]/u.test(chars[index - 1])
    ) {
      cursor += stopStep;
    } else if (/[，、；：,;:]/u.test(character)) {
      cursor += commaStep;
    }
  }
  return Math.max(300, Math.round((cursor + 0.18) * 1000));
}

function reducedMotionEnabled() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function splitParagraphs(prose) {
  const clean = stripGalTags(String(prose || ''))
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!clean) return [];
  const rawParagraphs = clean
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (rawParagraphs.length > 1) return rawParagraphs;
  const sentences = clean.split(/(?<=[。！？…])/u).filter((item) => item.trim());
  if (sentences.length < 2 || (sentences.length === 2 && clean.length < 64)) return [clean];
  const midpoint = Math.ceil(sentences.length / 2);
  return [sentences.slice(0, midpoint).join(''), sentences.slice(midpoint).join('')].filter(
    Boolean,
  );
}

function parseHeadingParts(heading, theme = {}) {
  const fallbackKicker = theme.isEpilogue
    ? '尾声余韵'
    : theme.isEventOpening
      ? '旅途片刻 · 抉择'
      : theme.isQuestOpening
        ? '歧路之间 · 探索'
        : '篇章序幕';
  const raw = String(heading || '').trim();
  const divider = raw.indexOf('｜') !== -1 ? '｜' : raw.indexOf('|') !== -1 ? '|' : '';
  if (!divider) {
    return {
      kicker: fallbackKicker,
      title: raw || (theme.isEpilogue ? '余波未平' : '新章开启'),
    };
  }
  const index = raw.indexOf(divider);
  return {
    kicker: raw.slice(0, index).trim() || fallbackKicker,
    title: raw.slice(index + 1).trim() || raw,
  };
}

function createDivider({ delay = '0.2s', compact = false } = {}) {
  const divider = document.createElement('div');
  divider.className = compact ? 'chapter-theater-divider is-compact' : 'chapter-theater-divider';
  divider.setAttribute('aria-hidden', 'true');
  divider.style.setProperty('--rule-delay', delay);
  divider.innerHTML = `<span class="chapter-theater-divider-line is-left"></span>${buildDividerDiamondSvg()}<span class="chapter-theater-divider-line is-right"></span>`;
  return divider;
}

function createCornerDecor(compact = false) {
  const layer = document.createElement('div');
  layer.className = compact ? 'chapter-theater-corners is-compact' : 'chapter-theater-corners';
  layer.setAttribute('aria-hidden', 'true');
  for (const pos of ['tl', 'tr', 'bl', 'br']) {
    const corner = document.createElement('span');
    corner.className = `chapter-theater-corner is-${pos}`;
    corner.innerHTML = buildCornerFiligreeSvg();
    layer.append(corner);
  }
  return layer;
}

function createAtmosphericParticles(theme) {
  const wrap = document.createElement('div');
  wrap.className = 'chapter-theater-atmosphere';
  wrap.setAttribute('aria-hidden', 'true');

  const beams = document.createElement('div');
  beams.className = `chapter-theater-beams is-${theme.beamIntensity || 'soft'}`;
  beams.innerHTML =
    '<span class="chapter-theater-beam is-a"></span><span class="chapter-theater-beam is-b"></span><span class="chapter-theater-beam is-c"></span>';

  const petals = document.createElement('div');
  petals.className = `chapter-theater-petals is-${theme.petalVariant || 'crimson'}`;
  for (const p of buildTheaterPetals(theme.petalVariant, 18)) {
    const node = document.createElement('span');
    node.className = 'chapter-theater-petal';
    node.style.left = `${p.left}%`;
    node.style.width = `${p.width}px`;
    node.style.height = `${p.height}px`;
    node.style.setProperty('--petal-drift', `${p.drift}px`);
    node.style.setProperty('--petal-opacity', p.opacity);
    node.style.animationDuration = `${p.duration}s`;
    node.style.animationDelay = `${p.delay}s`;
    petals.append(node);
  }

  const motes = document.createElement('div');
  motes.className = `chapter-theater-motes is-${theme.moteTone || 'gold'}`;
  for (const m of buildTheaterParticles(theme.moteTone, 24)) {
    const node = document.createElement('span');
    node.className = 'chapter-theater-mote';
    node.style.left = `${m.left}%`;
    node.style.width = `${m.size}px`;
    node.style.height = `${m.size}px`;
    node.style.filter = `blur(${m.blur}px)`;
    node.style.setProperty('--mote-sway', `${m.sway}px`);
    node.style.setProperty('--mote-opacity', m.opacity);
    node.style.animationDuration = `${m.duration}s`;
    node.style.animationDelay = `${m.delay}s`;
    motes.append(node);
  }

  wrap.append(beams, petals, motes);
  return wrap;
}

function createParagraphClauses(
  prose,
  { startDelay = FIRST_PARA_DELAY_S, gapDelay = PARA_GAP_DELAY_S, fast = false } = {},
) {
  const container = document.createElement('div');
  container.className = fast ? 'chapter-theater-prose is-single' : 'chapter-theater-prose';
  const paragraphs = [];
  for (const [index, paragraph] of splitParagraphs(prose).entries()) {
    const p = document.createElement('p');
    p.className = 'chapter-theater-clause';
    const leadDelay = index === 0 ? startDelay : gapDelay;
    const durationMs = appendTypedText(p, paragraph, leadDelay, fast);
    container.append(p);
    paragraphs.push({ element: p, durationMs });
  }
  return { container, paragraphs };
}

function createTitlePlaque(parts, theme, singlePage = false) {
  const titleRow = document.createElement('div');
  titleRow.className = 'chapter-theater-title-row';

  const leftBracket = document.createElement('span');
  leftBracket.className = 'chapter-theater-bracket is-left';
  leftBracket.textContent = '「';

  const ceremonyTitle = document.createElement('h2');
  ceremonyTitle.className = singlePage
    ? 'chapter-theater-ceremony-title chapter-theater-title text-gold-shimmer'
    : 'chapter-theater-ceremony-title text-gold-shimmer';
  ceremonyTitle.textContent = parts.title;

  const rightBracket = document.createElement('span');
  rightBracket.className = 'chapter-theater-bracket is-right';
  rightBracket.textContent = '」';

  const seal = document.createElement('div');
  seal.className = 'chapter-theater-seal';
  seal.innerHTML = buildWaxSealSvg(
    theme.seal,
    `${theme.key}-${theme.mode}`,
    theme.isQuestOpening ? 'teal' : 'crimson',
  );

  titleRow.append(leftBracket, ceremonyTitle, rightBracket, seal);
  return titleRow;
}

function buildSingleOpeningPanel({ heading, prose, parts, theme }) {
  const single = document.createElement('section');
  single.className = 'chapter-theater-single';

  const panel = document.createElement('div');
  panel.className = 'chapter-theater-single-panel';

  const crest = document.createElement('div');
  crest.className = 'chapter-theater-single-crest';
  crest.setAttribute('aria-hidden', 'true');
  crest.innerHTML = theme.isEventOpening
    ? buildEventOpeningCrestSvg()
    : buildQuestOpeningCrestSvg();

  const actDesignation = document.createElement('div');
  actDesignation.className = 'chapter-theater-act';
  actDesignation.innerHTML = `
    <span class="chapter-theater-act-en">${theme.actEn}</span>
    <span class="chapter-theater-act-cn">${parts.kicker}</span>
  `;

  const rawHeading = String(heading || '').trim();
  const cleanProse = String(prose || '').trim();
  const bodySource =
    cleanProse && cleanProse !== rawHeading && cleanProse !== parts.title
      ? cleanProse
      : theme.subtitle;
  const { container: proseBox, paragraphs } = createParagraphClauses(bodySource, {
    startDelay: 0.45,
    gapDelay: 0.14,
    fast: true,
  });

  const footer = document.createElement('div');
  footer.className = 'chapter-theater-single-foot';
  footer.innerHTML = `
    <div class="chapter-theater-stamp-pill">
      <span class="chapter-theater-stamp-diamond"></span>
      <span class="chapter-theater-stamp-date">${theme.badge}</span>
      <span class="chapter-theater-stamp-diamond"></span>
    </div>
    <p class="chapter-theater-single-hint">点击任意处或按空白键进入 ›</p>
  `;

  panel.append(
    createCornerDecor(true),
    crest,
    actDesignation,
    createDivider({ delay: '0.24s', compact: true }),
    createTitlePlaque(parts, theme, true),
    createDivider({ delay: '0.4s', compact: true }),
    proseBox,
    footer,
  );
  single.append(panel);
  return { element: single, paragraphs };
}

/** Fullscreen JRPG cinematic Theater for chapter intros, overland marches, and epilogues. */
export function createChapterTheater(context) {
  const { session } = context;
  const events = createEventScope();
  const root = $('#chapter-theater');
  let active = null;

  function clearDataset() {
    if (!root) return;
    delete root.dataset.enhanced;
    delete root.dataset.phase;
    delete root.dataset.revealed;
    delete root.dataset.single;
    delete root.dataset.mode;
    delete root.dataset.theme;
    delete root.dataset.automatic;
    delete root.dataset.testScript;
    delete root.dataset.veiled;
  }

  function clearActiveTimers(current) {
    if (!current) return;
    clearTimeout(current.ceremonyTimer);
    clearTimeout(current.sealTimer);
    clearTimeout(current.veilPeakTimer);
    clearTimeout(current.veilDoneTimer);
    clearTimeout(current.paragraphTimer);
  }

  function markAllTyped() {
    if (!active) return;
    if (!active.typed) {
      active.typed = true;
      clearTimeout(active.paragraphTimer);
      for (const entry of active.paragraphs) {
        entry.element.classList.remove('is-typing');
        entry.element.classList.add('is-done');
      }
      root?.classList.add('is-typed');
    }
    root?.classList.add('is-settled');
  }

  function startParagraph(index) {
    if (!active || active.closing || active.typed) return;
    clearTimeout(active.paragraphTimer);
    if (index >= active.paragraphs.length) {
      markAllTyped();
      return;
    }
    active.paragraphIndex = index;
    const entry = active.paragraphs[index];
    entry.element.classList.add('is-typing');
    const current = active;
    current.paragraphTimer = setTimeout(() => {
      if (active !== current || current.closing) return;
      entry.element.classList.remove('is-typing');
      entry.element.classList.add('is-done');
      startParagraph(index + 1);
    }, entry.durationMs);
  }

  function completeActiveParagraph() {
    if (!active || active.typed) return;
    clearTimeout(active.paragraphTimer);
    const index = active.paragraphIndex;
    const entry = active.paragraphs[index];
    if (entry) {
      entry.element.classList.remove('is-typing');
      entry.element.classList.add('is-done');
    }
    if (index + 1 >= active.paragraphs.length) {
      markAllTyped();
    } else {
      startParagraph(index + 1);
    }
  }

  function advance() {
    if (!active || active.closing) return;
    if (active.singlePage) {
      if (!active.typed) markAllTyped();
      else finish(true);
    } else if (active.ceremonyOnly) finish(true);
    else if (!active.revealed) revealNow();
    else if (!active.typed) completeActiveParagraph();
    else finish(true);
  }

  function revealNow() {
    if (!active || active.closing || active.revealed) return;
    active.revealed = true;
    clearTimeout(active.ceremonyTimer);
    clearTimeout(active.sealTimer);
    if (root) {
      root.dataset.phase = 'reading';
      root.dataset.revealed = 'true';
      root.classList.add('is-revealed');
    }
    if (active.typed) markAllTyped();
    else startParagraph(0);
  }

  function finish(completed) {
    if (!active || active.closing) return;
    const current = active;
    current.closing = true;
    clearTimeout(current.ceremonyTimer);
    clearTimeout(current.sealTimer);

    const instant = !completed || reducedMotionEnabled() || !root;
    if (instant) {
      active = null;
      clearActiveTimers(current);
      if (root) {
        root.classList.remove('is-visible', 'is-closing', 'is-revealed', 'is-typed', 'is-settled');
        root.hidden = true;
        clearDataset();
        root.replaceChildren();
      }
      current.resolve(completed);
      return;
    }

    root.classList.remove('is-visible');
    root.classList.add('is-closing');
    root.dataset.phase = 'closing';
    context.audio?.play?.('theater-transition');

    current.veilPeakTimer = setTimeout(() => {
      if (active !== current) return;
      root.dataset.veiled = 'true';
      current.resolve(completed);
    }, VEIL_PEAK_MS);

    current.veilDoneTimer = setTimeout(() => {
      if (active !== current) return;
      active = null;
      clearActiveTimers(current);
      root.hidden = true;
      root.classList.remove('is-closing', 'is-revealed', 'is-typed', 'is-settled');
      clearDataset();
      root.replaceChildren();
    }, VEIL_CLEAR_MS);
  }

  function renderStage({ heading, prose, theme, singlePage = false }) {
    const parts = parseHeadingParts(heading, theme);

    const topBar = document.createElement('div');
    topBar.className = 'chapter-theater-bar is-top';
    topBar.setAttribute('aria-hidden', 'true');
    topBar.innerHTML = `<span class="chapter-theater-bar-en">${theme.barLeft}</span><span class="chapter-theater-bar-cn">${theme.barRight}</span>`;

    const viewport = document.createElement('div');
    viewport.className = 'chapter-theater-viewport';
    viewport.setAttribute('role', 'dialog');
    viewport.setAttribute('aria-modal', 'true');
    viewport.setAttribute('aria-label', heading || '章节序幕');

    const artWrap = document.createElement('div');
    artWrap.className = 'chapter-theater-art-wrap';
    if (theme.artwork) {
      const art = document.createElement('img');
      art.className = theme.isEpilogue ? 'chapter-theater-art is-epilogue' : 'chapter-theater-art';
      art.src = theme.artwork;
      art.alt = '';
      art.decoding = 'async';
      art.addEventListener('error', () => art.remove(), { once: true });
      artWrap.append(art);
    }

    const gradH = document.createElement('div');
    gradH.className = 'chapter-theater-grad-h';
    const gradV = document.createElement('div');
    gradV.className = 'chapter-theater-grad-v';
    const glow = document.createElement('div');
    glow.className = 'chapter-theater-glow';
    glow.style.background = theme.glow;
    const vignette = document.createElement('div');
    vignette.className = 'chapter-theater-vignette';
    artWrap.append(gradH, gradV, glow, vignette);

    const fogA = document.createElement('div');
    fogA.className = 'chapter-theater-fog-a';
    fogA.setAttribute('aria-hidden', 'true');
    const fogB = document.createElement('div');
    fogB.className = 'chapter-theater-fog-b';
    fogB.setAttribute('aria-hidden', 'true');
    const grain = document.createElement('div');
    grain.className = 'chapter-theater-grain';
    grain.setAttribute('aria-hidden', 'true');

    const sheen = document.createElement('div');
    sheen.className = 'chapter-theater-sheen';
    sheen.setAttribute('aria-hidden', 'true');

    const borderOuter = document.createElement('div');
    borderOuter.className = 'chapter-theater-border-outer';
    borderOuter.setAttribute('aria-hidden', 'true');
    const borderInner = document.createElement('div');
    borderInner.className = 'chapter-theater-border-inner';
    borderInner.setAttribute('aria-hidden', 'true');

    const astrolabe = document.createElement('div');
    astrolabe.className = 'chapter-theater-astrolabe';
    astrolabe.setAttribute('aria-hidden', 'true');
    astrolabe.innerHTML = buildAstrolabeBackdropSvg();

    let paragraphs;
    const stageContent = [];

    if (singlePage) {
      const single = buildSingleOpeningPanel({ heading, prose, parts, theme });
      paragraphs = single.paragraphs;
      stageContent.push(single.element);
    } else {
      const ceremony = document.createElement('div');
      ceremony.className = 'chapter-theater-ceremony';

      if (theme.isEpilogue) {
        const laurel = document.createElement('div');
        laurel.className = 'chapter-theater-laurel';
        laurel.innerHTML = buildEpilogueLaurelSvg();
        ceremony.append(laurel);
      }

      const actDesignation = document.createElement('div');
      actDesignation.className = 'chapter-theater-act';
      actDesignation.innerHTML = `
        <span class="chapter-theater-act-en">${theme.actEn}</span>
        <span class="chapter-theater-act-cn">${parts.kicker}</span>
      `;

      const stamp = document.createElement('div');
      stamp.className = 'chapter-theater-stamp';
      stamp.innerHTML = `
        <div class="chapter-theater-stamp-pill">
          <span class="chapter-theater-stamp-diamond"></span>
          <span class="chapter-theater-stamp-date">${theme.badge}</span>
          <span class="chapter-theater-stamp-diamond"></span>
        </div>
        <p class="chapter-theater-subtitle">${theme.subtitle}</p>
      `;

      ceremony.append(
        actDesignation,
        createDivider({ delay: '1.5s' }),
        createTitlePlaque(parts, theme, false),
        createDivider({ delay: '2.9s' }),
        stamp,
      );

      const proseWrap = document.createElement('div');
      proseWrap.className = 'chapter-theater-prose-wrap';

      const panel = document.createElement('div');
      panel.className = 'chapter-theater-panel';

      const header = document.createElement('header');
      header.className = 'chapter-theater-header';
      const metaRow = document.createElement('div');
      metaRow.className = 'chapter-theater-meta';
      metaRow.innerHTML = `
        <span class="chapter-theater-place">${theme.subtitle}</span>
        <span class="chapter-theater-badge">${theme.badge}</span>
      `;
      const title = document.createElement('h2');
      title.className = 'chapter-theater-title text-gold-foil';
      title.textContent = heading || parts.title;
      header.append(metaRow, title);

      const builtProse = createParagraphClauses(prose, {
        startDelay: FIRST_PARA_DELAY_S,
        gapDelay: PARA_GAP_DELAY_S,
        fast: false,
      });
      paragraphs = builtProse.paragraphs;

      panel.append(
        createCornerDecor(true),
        header,
        createDivider({ delay: '0.7s', compact: true }),
        builtProse.container,
      );

      if (theme.isEpilogue) {
        const fin = document.createElement('div');
        fin.className = 'chapter-theater-fin';
        fin.innerHTML = `<span class="chapter-theater-fin-rule is-left"></span>${buildFinCalligraphySvg()}<span class="chapter-theater-fin-rule is-right"></span>`;
        panel.append(fin);
      }

      proseWrap.append(panel);
      stageContent.push(ceremony, proseWrap);
    }

    viewport.append(
      artWrap,
      fogA,
      fogB,
      grain,
      createAtmosphericParticles(theme),
      sheen,
      borderOuter,
      borderInner,
      createCornerDecor(false),
      astrolabe,
      ...stageContent,
    );

    const bottomBar = document.createElement('div');
    bottomBar.className = 'chapter-theater-bar is-bottom';

    const continueBtn = document.createElement('button');
    continueBtn.id = 'chapter-theater-continue';
    continueBtn.type = 'button';
    continueBtn.className = 'chapter-theater-continue';
    continueBtn.tabIndex = -1;
    continueBtn.setAttribute('aria-hidden', 'true');
    bottomBar.append(continueBtn);

    const veil = document.createElement('div');
    veil.className = 'chapter-theater-veil';
    veil.setAttribute('aria-hidden', 'true');
    veil.innerHTML = `
      <div class="chapter-theater-veil-glow"></div>
      <div class="chapter-theater-veil-beam"></div>
      <div class="chapter-theater-veil-diamond">
        <div class="chapter-theater-veil-diamond-inner"></div>
        <div class="chapter-theater-veil-diamond-core"></div>
      </div>
      <span class="chapter-theater-veil-label">${theme.veilLabel}</span>
    `;

    root.replaceChildren(topBar, viewport, bottomBar, veil);

    continueBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!active || active.closing) return;
      if (active.singlePage) finish(true);
      else if (!active.revealed) revealNow();
      else finish(true);
    });

    viewport.addEventListener('click', () => {
      advance();
    });

    bottomBar.addEventListener('click', () => {
      advance();
    });

    topBar.addEventListener('click', () => {
      advance();
    });

    return paragraphs;
  }

  function play({
    heading = '',
    prose = '',
    buttonLabel: _buttonLabel = '',
    mode = 'intro',
    map = '',
    biome = '',
    place = '',
    act = 1,
    automatic = false,
    testScript = false,
    ceremonyOnly = false,
    singlePage: singlePageParam = false,
    ceremonyMs = CEREMONY_DURATION_MS,
  } = {}) {
    if (
      !root ||
      session.runtime.disposed ||
      context.developer?.skipScenes() ||
      !String(prose || heading || '').trim()
    ) {
      return Promise.resolve(true);
    }
    if (active) finish(false);

    const theme = resolveTheaterTheme({ map: map || biome || 'ruins', mode, place, act });
    const singlePage = Boolean(singlePageParam || theme.isSingleOpening);
    const reduced = reducedMotionEnabled();

    return new Promise((resolve) => {
      const current = {
        resolve,
        ceremonyOnly: singlePage ? false : ceremonyOnly,
        singlePage,
        revealed: singlePage,
        // Keep human-paced typewriter for all real gameplay (including automatic chapter opens);
        // only skip under prefers-reduced-motion or automated test fixtures.
        typed: reduced || testScript,
        paragraphs: [],
        paragraphIndex: -1,
        closing: false,
        ceremonyTimer: null,
        sealTimer: null,
        paragraphTimer: null,
        veilPeakTimer: null,
        veilDoneTimer: null,
      };
      active = current;

      root.hidden = false;
      root.classList.remove('is-closing', 'is-revealed', 'is-visible', 'is-typed', 'is-settled');
      if (current.typed) root.classList.add('is-typed');
      root.dataset.enhanced = 'true';
      root.dataset.mode = mode;
      root.dataset.theme = theme.key;
      root.dataset.phase = singlePage ? 'single' : 'ceremony';
      root.dataset.revealed = singlePage ? 'true' : 'false';
      root.dataset.single = singlePage ? 'true' : 'false';
      root.dataset.automatic = automatic ? 'true' : 'false';
      root.dataset.testScript = testScript ? 'true' : 'false';
      delete root.dataset.veiled;

      root.style.setProperty('--theater-accent', theme.accent);
      root.style.setProperty('--theater-seal', theme.sealColor);

      current.paragraphs = renderStage({ heading, prose, theme, singlePage });
      context.audio?.play?.(theaterCurtainCue(theme, mode));

      requestAnimationFrame(() => {
        if (active === current && !current.closing) root.classList.add('is-visible');
      });

      if (!reduced) {
        current.sealTimer = setTimeout(
          () => {
            if (active === current && !current.closing && (singlePage || !current.revealed)) {
              context.audio?.play?.('theater-seal');
            }
          },
          singlePage ? SINGLE_SEAL_IMPACT_MS : SEAL_IMPACT_DELAY_MS,
        );
      }

      if (singlePage) {
        if (current.typed) {
          markAllTyped();
        } else {
          startParagraph(0);
        }
      } else {
        current.ceremonyTimer = setTimeout(
          () => {
            if (active === current) {
              if (ceremonyOnly) finish(true);
              else revealNow();
            }
          },
          reduced ? 12 : ceremonyMs,
        );
      }
    });
  }

  function playOpening({
    mode = 'event-opening',
    heading = '',
    prose = '',
    map = '',
    testScript = false,
  } = {}) {
    return play({
      mode,
      heading,
      prose: prose || heading,
      map,
      automatic: true,
      singlePage: true,
      testScript,
    });
  }

  events.on(
    document,
    'keydown',
    (event) => {
      if (!active || active.closing) return;
      if (event.target?.closest?.('textarea, input, select')) return;
      if (![' ', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      advance();
    },
    { capture: true },
  );

  return {
    get playing() {
      return Boolean(active);
    },
    play,
    playOpening,
    skip() {
      finish(true);
    },
    cancel() {
      finish(false);
    },
    dispose() {
      finish(false);
      events.dispose();
    },
  };
}

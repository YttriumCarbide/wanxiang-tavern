import { DISHES } from '../content/dining.js';
import { SERVICE_MENU } from '../content/tavern-service.js';
import { COOKING } from '../service-cooking.js';
import { cookingArtwork, paintCookingArtwork } from './service-cooking-view.js';
import { SERVICE_PATCHES } from '../service-gestures.js';
import { escapeText } from '../ui.js';
import { foodArt } from './food-art.js';
import { serviceIcon } from './service-icons.js';

function dishMarkup(name) {
  const menu = SERVICE_MENU.find((item) => item.name === name);
  const dish = menu && DISHES[menu.artId];
  if (!dish) return `<span class="service-dish-art" aria-hidden="true">${serviceIcon(name)}</span>`;
  return `<span class="service-dish-art" aria-hidden="true">${foodArt(dish)}</span>`;
}

export function serviceItemArtwork(name) {
  return SERVICE_MENU.some((item) => item.name === name) ? dishMarkup(name) : serviceIcon(name);
}

function choiceButton(job, choice, content, label, disabled = false) {
  return `<button type="button" data-service-for="${job.guest.id}"
    data-service-choice="${escapeText(choice)}" aria-label="${escapeText(label)}"${disabled ? ' disabled' : ''}>${content}</button>`;
}

function focusDish(job) {
  if (!job.dish || job.phase !== 'order') return '';
  return `<div class="service-focus-dish">
    <span class="service-focus-art">${dishMarkup(job.dish)}</span>
    <span class="service-focus-copy"><small>第 ${job.step + 1}/${job.order.length} 道</small><strong>${escapeText(job.dish)}</strong></span>
  </div>`;
}

function briefText(job) {
  if (job.phase === 'order')
    return `客人点了 ${job.order.length} 道菜 · 看图标选出第 ${job.step + 1} 道`;
  if (job.phase === 'cook' && job.activity)
    return `第 ${job.course + 1}/${job.order.length} 道 · ${job.dish} · ${job.activity.note}`;
  return job.note;
}

function sorting(job) {
  const { targets, items, tokens = items.map((name) => ({ name, placed: false })) } = job.sort;
  const trays = targets
    .map(({ id, label, placed = [] }) => {
      const icon = /筐/.test(label) ? '餐篮' : /盘|碟/.test(label) ? '空碟' : '托盘';
      return `<button type="button" data-service-dropzone="${id}" data-filled="${placed.length > 0}">
      <span class="service-drop-art">${placed.length ? placed.map(serviceItemArtwork).join('') : serviceIcon(icon)}</span>
      <span>${escapeText(label)}</span></button>`;
    })
    .join('');
  const stock = tokens
    .map(({ name, placed }) => {
      const token = `${serviceItemArtwork(name)}<span>${escapeText(name)}</span>`;
      return placed
        ? `<span class="service-token-placed">${token}</span>`
        : `<button type="button" data-service-for="${job.guest.id}" data-drag-choice="${escapeText(name)}"
        aria-pressed="false">${token}</button>`;
    })
    .join('');
  return `<div class="service-sort">
    <div class="service-sort-row"><small>放到这里</small><div class="service-sort-targets">${trays}</div></div>
    <div class="service-sort-row"><small>从这里拿</small><div class="service-item-rack">${stock}</div></div>
  </div>`;
}

const pieces = {
  balance: '<i class="service-tray-lane"></i><i class="service-tray-piece"><b></b></i>',
  catch:
    '<i class="service-pass"></i><i class="service-falling-food"></i><i class="service-tray-piece"></i>',
  wipe: '<i class="service-cloth"></i>',
  mop: '<i class="service-mop"></i>',
};

function effectMarkup(kind) {
  const count = ['heat', 'sear', 'cut'].includes(kind) ? 16 : 12;
  const particles = Array.from({ length: count }, (_, index) => {
    const x = (index * 37 + 11) % 100;
    const delay = ((index * 13) % 9) * 0.1;
    const size = 2 + (index % 4);
    const drift = (index % 5) * 8 - 16;
    return `<i style="--fx-x:${x}%;--fx-delay:${delay}s;--fx-size:${size}px;--fx-drift:${drift}px"></i>`;
  }).join('');
  return `<span class="service-fx" aria-hidden="true">${particles}</span>`;
}

const accent = {
  heat: '#ff9a4e',
  sear: '#ff8752',
  stir: '#d8b069',
  whisk: '#f2d58d',
  cut: '#d6d2bd',
  knead: '#e5b16e',
  pipe: '#f6d38f',
  pour: '#e8a55d',
  roll: '#e0b77f',
  flip: '#f0c46c',
  season: '#cfda88',
  skim: '#d9c18d',
  balance: '#9cc4b2',
  catch: '#9fc4bd',
  wipe: '#a9d0c4',
  mop: '#a9d0c4',
};

function gestureArea(job) {
  const { kind, name } = job.activity;
  const cooking = Object.hasOwn(COOKING, kind);
  const patches = (cooking ? [] : SERVICE_PATCHES[kind] || [])
    .map(
      ([x, y], index) =>
        `<i class="service-patch" data-patch="${index}" style="--patch-x:${x * 100}%;--patch-y:${y * 100}%"></i>`,
    )
    .join('');
  return `<div class="service-play service-play-gesture" style="--accent:${accent[kind] || '#e8bd78'}">
    <div class="service-gesture" data-activity="${kind}" data-activity-for="${job.guest.id}"${cooking ? ' data-kitchen' : ''}
      role="group" aria-label="${name}">
      <span class="service-gesture-badge">${escapeText(name)}</span>
      ${cooking ? cookingArtwork(kind) : patches + pieces[kind]}${effectMarkup(kind)}
    </div>
    <div class="service-meter" role="progressbar" aria-label="${name}进度"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i><b></b></div>
  </div>`;
}

export function paintServiceActivity(area, activity, held) {
  if (!area || !activity) return;
  const { state, ready, lane, kind } = activity;
  const x = state.x ?? 0.5;
  const y = state.y ?? 0.5;
  if (Object.hasOwn(COOKING, kind)) paintCookingArtwork(area, activity, held);
  const properties = {
    '--tool-x': x * 100 + '%',
    '--tool-y': y * 100 + '%',
    '--tray-y': (kind === 'catch' ? 85 : 86 - (state.progress || 0) * 68) + '%',
    '--wobble': (state.wobble || 0) * 29 + 'deg',
    '--food-x': (lane ?? 0.5) * 100 + '%',
    '--food-y': 13 + (state.fall || 0) * 71 + '%',
  };
  for (const [property, value] of Object.entries(properties))
    area.style.setProperty(property, value);
  area.toggleAttribute('data-held', held);
  area.toggleAttribute('data-ready', ready);
  area.toggleAttribute('data-near-done', (state.progress || 0) >= 0.7 && (state.progress || 0) < 1);
  const nextIndex = (SERVICE_PATCHES[kind] || []).findIndex(
    (_, index) => !state.marks?.includes(index),
  );
  for (const patch of area.querySelectorAll('[data-patch]')) {
    const index = Number(patch.dataset.patch);
    patch.toggleAttribute('data-cleared', Boolean(state.marks?.includes(index)));
    patch.toggleAttribute('data-next', index === nextIndex && ['knead', 'pipe'].includes(kind));
    patch.toggleAttribute('data-contact', index === state.contact);
  }
  const meter = area.nextElementSibling;
  if (meter) {
    const progress = state.progress || 0;
    meter.style.setProperty('--meter', progress * 100 + '%');
    meter.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
  }
}

export function serviceGameMarkup(job) {
  let play;
  let kind;
  if (job.activity) {
    kind = 'gesture';
    play = gestureArea(job);
  } else if (job.sort) {
    kind = 'sort';
    play = `<div class="service-play">${sorting(job)}</div>`;
  } else if (job.cards) {
    kind = 'seat';
    play = `<div class="service-play"><div class="service-choices service-seat-cards" data-choice-type="seat">${job.cards
      .map((card, index) =>
        choiceButton(
          job,
          card.id,
          `<b>${index + 1}</b>${serviceIcon(card.id === 'hall' ? '大厅桌' : card.id === 'window' ? '窗边桌' : '吧台凳')}<strong>${escapeText(card.label)}</strong>
        <small>${card.disabled ? '暂不可用' : escapeText(card.detail)}</small>`,
          card.label,
          card.disabled,
        ),
      )
      .join('')}</div></div>`;
  } else {
    const numbers = job.phase === 'pay';
    kind = numbers ? 'number' : 'dish';
    play = `<div class="service-play"><div class="service-choices" data-choice-type="${kind}">${job.choices
      .map((choice) => {
        if (numbers) {
          return choiceButton(
            job,
            choice,
            `<b class="service-number">${escapeText(choice)}</b>`,
            choice,
          );
        }
        return choiceButton(
          job,
          choice,
          `${dishMarkup(choice)}<strong>${escapeText(choice)}</strong>`,
          choice,
        );
      })
      .join('')}</div></div>`;
  }
  return `<div class="service-game" data-play="${kind}">
    <div class="service-brief">
      <p class="service-voice">${escapeText(briefText(job))}</p>
    </div>
    ${focusDish(job)}
    ${play}
    ${job.guest.error ? `<small class="service-error" role="status">${escapeText(job.guest.error)}</small>` : ''}</div>`;
}

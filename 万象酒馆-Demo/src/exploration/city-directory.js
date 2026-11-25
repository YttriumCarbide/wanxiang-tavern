import {
  CITIES,
  cityDungeons,
  cityFacilities,
  cityForScene,
  cityPlaceId,
} from '../city-directory.js';
import { STARBELL_SCENES } from '../content/starbell-scenes.js';
import { TOWN_SIDE_PLACES } from '../content/town-side-places.js';

/** The city directory uses the same place IDs as the appointment setup. */
export function createCityDirectory({ events, definition, onNavigate, onOpenWorldMap, onAction }) {
  const openButton = document.getElementById('street-submap-open');
  const dialog = document.getElementById('street-city-submap');
  const list = document.getElementById('street-city-submap-canvas');
  const closeButton = document.getElementById('street-city-submap-close');
  const atlasButton = document.getElementById('street-city-submap-atlas');
  const atBorder = ['outskirts', 'riverbank'].includes(definition.id);
  const cityId = cityForScene(definition.id) || (atBorder ? 'starbell' : null);
  if (!cityId) return { isOpen: () => false, open() {}, close() {}, update() {} };

  const city = CITIES[cityId];
  const current = cityPlaceId(definition.id);
  const embedded = parent !== window;
  let locked = false;
  let danger = null;
  let discoveries = [];
  openButton.setAttribute('aria-expanded', 'false');
  // Border scenes retain their control; embedded cities use the ledger-side handle.
  openButton.hidden = embedded && !atBorder;
  dialog.dataset.city = cityId;
  dialog.querySelector('h2').textContent = city.name;
  const panorama = new URL(city.image, document.baseURI);
  dialog.querySelector('header').style.setProperty('--city-panorama', `url("${panorama}")`);

  function card(id, name, { kind, note, icon, facility } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'city-directory-entry';
    button.dataset.cityNode = id;
    button.dataset.kind = kind;
    const here = kind === 'stop' && current === id;
    if (kind === 'stop') button.dataset.cityScene = id;
    if (kind === 'facility') button.dataset.cityFacility = facility;
    if (kind === 'dungeon') button.dataset.cityDungeon = id;
    if (here) button.setAttribute('aria-current', 'location');
    button.disabled = locked || here || (kind !== 'stop' && !embedded);
    const seal = document.createElement('span');
    seal.className = 'city-directory-seal';
    seal.setAttribute('aria-hidden', 'true');
    seal.textContent = icon;
    const label = document.createElement('strong');
    label.textContent = name;
    button.append(seal, label);
    const detail = here ? '当前位置' : danger === id ? '游荡敌情' : note;
    if (detail) {
      const small = document.createElement('small');
      small.textContent = detail;
      button.append(small);
    }
    return button;
  }

  function section(id, label, entries) {
    const group = document.createElement('section');
    group.dataset.cityCategory = id;
    const title = document.createElement('h3');
    title.id = 'city-directory-' + id;
    title.textContent = label;
    group.setAttribute('aria-labelledby', title.id);
    group.append(title);
    if (entries.length) {
      const grid = document.createElement('div');
      grid.className = 'city-directory-grid';
      grid.append(...entries);
      group.append(grid);
    } else {
      const empty = document.createElement('p');
      empty.textContent = '暂无城区副本';
      group.append(empty);
    }
    return group;
  }

  function render() {
    const focusId = document.activeElement?.dataset?.cityNode;
    const scrollTop = list.scrollTop;
    const places = atBorder ? [['rampart', city.places.rampart]] : Object.entries(city.places);
    // Local roads stay navigable without adding them to the in-city invitation catalog.
    if (atBorder || current === 'rampart') places.push(['outskirts', STARBELL_SCENES.outskirts]);
    if (atBorder) places.push(['riverbank', TOWN_SIDE_PLACES.riverbank]);
    const stops = section(
      'places',
      '普通地点',
      places.map(([id, { title, name }]) => card(id, title || name, { kind: 'stop', icon: '◇' })),
    );
    list.replaceChildren(stops);
    if (!atBorder)
      list.append(
        section(
          'facilities',
          '功能地点',
          cityFacilities(cityId).map(({ id, name, icon, action, facility }) =>
            card(id, name, { kind: 'facility', icon, note: action, facility }),
          ),
        ),
        section(
          'dungeons',
          '副本',
          cityDungeons(cityId, discoveries).map(({ id, name, level }) =>
            card(id, name, { kind: 'dungeon', icon: '⛨', note: level ? 'Lv.' + level : '' }),
          ),
        ),
      );
    list.scrollTop = scrollTop;
    if (focusId) {
      const replacement = [...list.querySelectorAll('[data-city-node]')].find(
        (button) => button.dataset.cityNode === focusId && !button.disabled,
      );
      (replacement || closeButton).focus({ preventScroll: true });
    }
  }

  function postDialogState(open) {
    if (embedded) parent.postMessage({ type: 'street-dialog-state', open }, location.origin);
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function open() {
    if (dialog.open || locked) return;
    render();
    list.scrollTop = 0;
    dialog.showModal();
    openButton.setAttribute('aria-expanded', 'true');
    postDialogState(true);
  }

  events.on(openButton, 'click', open);
  events.on(dialog, 'click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      close();
  });
  events.on(closeButton, 'click', close);
  events.on(dialog, 'close', () => {
    if (!dialog.open) {
      openButton.setAttribute('aria-expanded', 'false');
      postDialogState(false);
      if (!openButton.hidden) openButton.focus({ preventScroll: true });
    }
  });
  events.on(atlasButton, 'click', () => {
    close();
    onOpenWorldMap();
  });
  events.on(list, 'click', (event) => {
    const button = event.target.closest('[data-city-node]');
    if (!button || button.disabled || locked || !dialog.open) return;
    const { cityScene, cityFacility, cityDungeon } = button.dataset;
    close();
    if (cityScene) onNavigate(cityScene);
    else if (cityFacility) onAction({ type: 'daily-open-city-facility', facility: cityFacility });
    else if (cityDungeon) onAction({ type: 'daily-open-dungeon', dungeonId: cityDungeon });
  });

  return {
    isOpen: () => dialog.open,
    open,
    close,
    update({ skirmishes, locked: blocked, discoveries: nextDiscoveries }) {
      const nextDanger = skirmishes?.pending?.stop || skirmishes?.active?.stop || null;
      const entries = Array.isArray(nextDiscoveries) ? nextDiscoveries : [];
      const sameDungeons =
        entries.length === discoveries.length &&
        entries.every(
          (entry, index) =>
            entry?.id === discoveries[index]?.id &&
            entry?.linkId === discoveries[index]?.linkId &&
            entry?.name === discoveries[index]?.name,
        );
      if (danger === nextDanger && locked === blocked && sameDungeons) return;
      danger = nextDanger;
      locked = blocked;
      discoveries = entries;
      if (dialog.open) render();
    },
  };
}

import { escapeText } from '../ui.js';
import { portraitUrl } from '../portraits.js';

function option(value, label, selected) {
  return `<option value="${escapeText(value)}"${selected ? ' selected' : ''}>${escapeText(label)}</option>`;
}

/** Render the location and appointment choices together in one preparation view. */
export function invitationSetupView({
  cities,
  city,
  place,
  candidates,
  selected,
  affection,
  activityMarkup,
  topicMarkup,
  intent,
}) {
  const selectedCity = cities.find((entry) => entry.id === city) || cities[0];
  const destinations = selectedCity?.venues || { places: [], facilities: [], dungeons: [] };
  const allVenues = [...destinations.places, ...destinations.facilities, ...destinations.dungeons];
  const currentPlace = allVenues.find((entry) => entry.id === place) || allVenues[0];
  const venueOptions = (label, entries) =>
    entries.length
      ? `<optgroup label="${label}">${entries.map(({ id, name }) => option(id, name, id === currentPlace?.id)).join('')}</optgroup>`
      : '';

  const roster = candidates
    .map((member) => {
      const active = member.id === selected;
      return `<button type="button" class="daily-person" data-daily-person="${escapeText(member.id)}" aria-pressed="${active}">
        <img src="${escapeText(portraitUrl(member.combat))}" alt="" loading="lazy">
        <span>${escapeText(member.setting.name)}${active ? `<small>${escapeText(affection)}</small>` : ''}</span>
      </button>`;
    })
    .join('');

  return `<div class="daily-invite-layout">
    <div class="daily-invite-destination">
      ${selectedCity ? `<img src="${escapeText(selectedCity.image)}" alt="">` : ''}
      <label>约见城市<select data-daily-city>${cities.map((entry) => option(entry.id, entry.name, entry.id === selectedCity?.id)).join('')}</select></label>
      <label>开场地点<select data-daily-place>${venueOptions('普通地点', destinations.places)}${venueOptions('功能地点', destinations.facilities)}${venueOptions('副本', destinations.dungeons)}</select></label>
    </div>
    <div class="daily-invite-roster" role="group" aria-label="约见对象">
      ${roster || '<p>暂无可约见角色。</p>'}
    </div>
    <div class="daily-invite-route">
      ${activityMarkup}
      ${topicMarkup}
      <label class="daily-invite-intent">约见来意（选填）<textarea data-daily-intent rows="3" maxlength="2000" placeholder="写下想聊的话题或期待">${escapeText(intent || '')}</textarea></label>
    </div>
  </div>`;
}

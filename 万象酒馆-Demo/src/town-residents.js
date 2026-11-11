import { TOWN_GUESTS } from './content/town-guests.js';
import { TAVERN_VISITORS, standingSprite } from './content/tavern-visitors.js';
import { formatCharacterSetting } from './ai/character-setting.js';
import { TOWN_SIDE_PLACES } from './content/town-side-places.js';

/** Unrecruited residents can appear and talk in town without being granted to the roster. */
export function townResidents(library, scene) {
  if (
    !Object.hasOwn(TOWN_SIDE_PLACES, scene) &&
    !['street', 'starlamp-street', 'city-center', 'market', 'rampart', 'outskirts'].includes(scene)
  )
    return [];
  return Object.entries(TOWN_GUESTS).flatMap(([key, guest]) => {
    const id = 'official-' + key;
    if (library.characters.some((member) => member.id === id)) return [];
    const sprite = TAVERN_VISITORS.find((entry) => entry.combatId === key);
    return [
      {
        id,
        source: 'town',
        combat: { ...structuredClone(guest.combat), customStanding: standingSprite(sprite) },
        setting: {
          name: guest.setting.name,
          title: guest.combat.title,
          worldbook: formatCharacterSetting(guest.setting),
          formatVersion: 3,
        },
      },
    ];
  });
}

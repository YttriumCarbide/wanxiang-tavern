import { restoreGrowth } from './growth.js';
import { newLibrary, officialCharacter } from './ai/library.js';

export function newCampaign(protagonist) {
  const library = newLibrary();
  library.characters = [structuredClone(protagonist), officialCharacter('edith')];
  library.characters[0].combat.limit = 2;
  library.characters[0].growth = restoreGrowth(protagonist.growth, protagonist.id);
  library.party = [protagonist.id, 'official-edith', null, null, null, null];
  library.enabled = true;
  library.campaign = {
    version: 3,
    protagonistId: protagonist.id,
    tutorial: 'arrival',
    firstRecruit: false,
    completed: false,
  };
  return library;
}

export const learning = (library) => !!library.campaign && !library.campaign.completed;
export const guiding = (library) =>
  learning(library) ||
  [
    'ether',
    'reward',
    'summon-return',
    'summon-guide',
    'recruit-dialogue',
    'table',
    'invite',
    'shop',
    'depart-again',
  ].includes(library.campaign?.tutorial);

/** Membership is authoritative; a protagonist can change places but cannot leave the party. */
export function assignParty(library, index, id) {
  if (!Number.isInteger(index) || index < 0 || index > 5) throw Error('阵容位置无效');
  if (id !== null && !library.characters.some((entry) => entry.id === id))
    throw Error('角色不在酒馆中');
  const previous = id === null ? -1 : library.party.indexOf(id);
  if (library.party[index] === library.campaign?.protagonistId && previous < 0)
    throw Error('主角必须出战，可与其他位置交换，不能移出队伍');
  const party = [...library.party];
  if (previous >= 0) [party[index], party[previous]] = [party[previous], party[index]];
  else party[index] = id;
  library.party = party;
  library.prepared = null;
}

/** The first recruitment is a fixed saved character, never another paid generation. */
export function firstCompanion(library, worldbook) {
  if (!library.campaign || library.campaign.firstRecruit || !library.campaign.completed)
    return null;
  if (!(library.inventory?.summonContracts > 0)) throw Error('需要一份召唤契约');
  if (library.characters.length >= 100) throw Error('角色池已满（100名）');
  const entry = officialCharacter('aegis');
  if (typeof worldbook === 'string' && worldbook.trim()) entry.setting.worldbook = worldbook.trim();
  library.inventory.summonContracts--;
  if (!library.characters.some((member) => member.id === entry.id)) library.characters.push(entry);
  const empty = library.party.indexOf(null);
  if (empty >= 0 && !library.party.includes(entry.id)) library.party[empty] = entry.id;
  library.prepared = null;
  library.campaign.firstRecruit = true;
  library.campaign.tutorial = 'recruit-dialogue';
  return entry;
}

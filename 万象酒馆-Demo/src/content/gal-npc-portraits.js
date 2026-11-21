const directory = './assets/gal-npc-cast/';

const portraits = Object.freeze({
  shadowMan: 'shadow-man.png',
  shadowWoman: 'shadow-woman.png',
  guardMan: 'town-guard-man.png',
  guardWoman: 'town-guard-woman.png',
  villagerMan: 'villager-man.png',
  villagerWoman: 'villager-woman.png',
  boy: 'child-boy.png',
  girl: 'child-girl.png',
  scholar: 'elder-scholar.png',
  scholarWoman: 'scholar-woman.png',
  merchant: 'traveling-merchant-woman.png',
  merchantMan: 'merchant-man.png',
  informantMan: 'alley-informant-man.png',
  blacksmithMan: 'blacksmith-artisan-man.png',
  dragonkinMan: 'dragonkin-hunter-man.png',
  dwarfMan: 'dwarf-artisan-man.png',
  elderWoman: 'elder-woman.png',
  elfHerbalist: 'elf-herbalist-woman.png',
  goblinTinker: 'goblin-tinker.png',
  healerWoman: 'healer-woman.png',
  mechanicWoman: 'mechanic-woman.png',
  knightMan: 'mercenary-knight-man.png',
  nobleWoman: 'noble-lady-woman.png',
  nobleMan: 'noble-official-man.png',
  rangerWoman: 'ranger-scout-woman.png',
  serverWoman: 'tavern-server-woman.png',
});

function genderOf(text) {
  if (/(?:女童|女孩|小女孩|少女|女性|妇女|女人|姑娘|妇人|婆婆|老妇|大小姐|夫人|她)/u.test(text))
    return 'woman';
  if (/(?:男童|男孩|小男孩|少年|男性|男人|青年男子|老先生|老人|他)/u.test(text)) return 'man';
  return '';
}

/** Choose a prepared Gal stand-in from NPC description data, never from invented image URLs. */
export function galNpcPortrait(npc = {}) {
  if (Object.hasOwn(portraits, npc.galPortrait)) return directory + portraits[npc.galPortrait];
  const description = [npc.name, npc.title, npc.setting, npc.appearance, npc.history]
    .filter(Boolean)
    .join(' ');
  const gender = genderOf(description);
  let file = '';

  if (/(?:小孩|孩子|幼童|男童|女孩|男孩|女童|小女孩|小男孩)/u.test(description))
    file = gender === 'woman' ? portraits.girl : portraits.boy;
  else if (/(?:哥布林|地精)/u.test(description)) file = portraits.goblinTinker;
  else if (/(?:龙裔|龙人)/u.test(description)) file = portraits.dragonkinMan;
  else if (/(?:矮人)/u.test(description)) file = portraits.dwarfMan;
  else if (/(?:精灵)/u.test(description) && gender !== 'man') file = portraits.elfHerbalist;
  else if (/(?:守卫|卫兵|巡逻兵|护卫|城防兵)/u.test(description))
    file = gender === 'woman' ? portraits.guardWoman : gender === 'man' ? portraits.guardMan : '';
  else if (/(?:佣兵|骑士)/u.test(description)) file = gender === 'man' ? portraits.knightMan : '';
  else if (/(?:线人|密探|情报贩)/u.test(description))
    file = gender === 'man' ? portraits.informantMan : '';
  else if (/(?:铁匠|锻造|铸造)/u.test(description))
    file = gender === 'man' ? portraits.blacksmithMan : '';
  else if (/(?:机械师|工程师|技师)/u.test(description))
    file = gender === 'woman' ? portraits.mechanicWoman : '';
  else if (/(?:游侠|斥候|猎人)/u.test(description))
    file = gender === 'woman' ? portraits.rangerWoman : '';
  else if (/(?:医者|药师|草药师|治疗师|修女)/u.test(description))
    file = gender === 'woman' ? portraits.healerWoman : '';
  else if (/(?:侍应|招待|酒保|女侍)/u.test(description))
    file = gender === 'woman' ? portraits.serverWoman : '';
  else if (/(?:贵族|大小姐|夫人|官员|执政|领主)/u.test(description))
    file = gender === 'woman' ? portraits.nobleWoman : gender === 'man' ? portraits.nobleMan : '';
  else if (/(?:行商|商人|店主|掌柜|货郎)/u.test(description))
    file = gender === 'woman' ? portraits.merchant : gender === 'man' ? portraits.merchantMan : '';
  else if (/(?:学者|书记员|抄写员|教师|老学究|研究员)/u.test(description))
    file = gender === 'woman' ? portraits.scholarWoman : gender === 'man' ? portraits.scholar : '';
  else if (/(?:老妇|婆婆|老奶奶|年长女性)/u.test(description)) file = portraits.elderWoman;
  else if (/(?:村民|村妇|农夫|农妇|平民|居民|面包师)/u.test(description))
    file =
      gender === 'woman' ? portraits.villagerWoman : gender === 'man' ? portraits.villagerMan : '';

  file ||=
    gender === 'woman'
      ? portraits.shadowWoman
      : gender === 'man'
        ? portraits.shadowMan
        : portraits.shadowMan;
  return directory + file;
}

export const GAL_NPC_PORTRAITS = Object.freeze(
  Object.fromEntries(Object.entries(portraits).map(([id, file]) => [id, directory + file])),
);

export const GAL_NPC_PORTRAIT_NAMES = Object.freeze({
  shadowMan: '成年男性剪影，身份不明或没有适合的具体立绘',
  shadowWoman: '成年女性剪影，身份不明或没有适合的具体立绘',
  guardMan: '成年男守卫、卫兵或护卫',
  guardWoman: '成年女守卫、卫兵或护卫',
  villagerMan: '成年男性平民或村民',
  villagerWoman: '成年女性平民或村民',
  boy: '男童',
  girl: '女童',
  scholar: '老年男性学者、长者',
  scholarWoman: '成年女性学者、书记员或研究员',
  merchant: '成年女性商人或店主',
  merchantMan: '成年男性商人、掌柜或货郎',
  informantMan: '成年男性暗巷线人、密探或情报贩',
  blacksmithMan: '成年男性铁匠或锻造工匠',
  dragonkinMan: '成年男性龙裔猎人或异族战士',
  dwarfMan: '成年男性矮人工匠或矿工',
  elderWoman: '老年女性长者、老妇或婆婆',
  elfHerbalist: '成年女性精灵草药师或林间医者',
  goblinTinker: '哥布林修补匠或小体格异族工匠',
  healerWoman: '成年女性医者、药师或修女',
  mechanicWoman: '成年女性机械师、工程师或炼金技师',
  knightMan: '成年男性佣兵、骑士或重装护卫',
  nobleWoman: '成年女性贵族、大小姐或礼仪夫人',
  nobleMan: '成年男性贵族、官员或执政官',
  rangerWoman: '成年女性游侠、斥候或猎人',
  serverWoman: '成年女性酒馆侍应、店员或招待',
});

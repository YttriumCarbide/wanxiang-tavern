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
  merchant: 'traveling-merchant-woman.png',
});

function genderOf(text) {
  if (/(?:女童|女孩|小女孩|少女|女性|妇女|女人|姑娘|妇人|她)/u.test(text)) return 'woman';
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
  else if (/(?:守卫|卫兵|巡逻兵|护卫|城防兵)/u.test(description))
    file = gender === 'woman' ? portraits.guardWoman : gender === 'man' ? portraits.guardMan : '';
  else if (/(?:行商|商人|店主|掌柜|货郎)/u.test(description))
    file = gender === 'woman' ? portraits.merchant : '';
  else if (/(?:学者|书记员|抄写员|教师|老学究|研究员)/u.test(description))
    file = gender === 'man' ? portraits.scholar : '';
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
  merchant: '成年女性商人或店主',
});

/** Pure, zero-import Overlord combat rules, timer profiles, and boss dialogue catalog. */

export function overlordTargetStage(unit, def) {
  if (!unit || !def || !Array.isArray(def.overlordPhases) || def.overlordPhases.length < 2) {
    return unit?.enraged ? 2 : 1;
  }
  if (!(unit.maxHp > 0)) return 1;
  const [phase2Ratio, phase3Ratio] = def.overlordPhases;
  if (unit.hp <= Math.floor(unit.maxHp * phase3Ratio)) return 3;
  if (unit.hp <= Math.floor(unit.maxHp * phase2Ratio)) return 2;
  return 1;
}

export function overlordPhaseProfile(def, stage = 1) {
  const s = Math.max(1, Math.min(3, Number(stage) || 1));
  const bombSeconds =
    def?.fixedFirstSlot?.bombSecondsByPhase?.[s - 1] ?? (s === 3 ? 20 : s === 2 ? 30 : 40);
  const toughness =
    def?.toughnessByPhase?.[s - 1] ?? (s === 3 ? 10 : s === 2 ? 9 : def?.toughness || 7);
  const breakLayers = def?.breakLayersByPhase?.[s - 1] ?? (s >= 3 ? 3 : 2);
  const regularActions =
    s === 3
      ? (def?.finalPhaseActions ?? def?.enragedActions ?? 2)
      : s === 2
        ? (def?.enragedActions ?? 2)
        : (def?.actions ?? 1);
  if (s === 1) {
    return {
      stage: 1,
      toughness,
      breakLayers,
      regularActions,
      bombSeconds,
      shield: 0,
      strengthBonus: 0,
      artifactBonus: 0,
      title: '',
      subtitle: '',
    };
  }
  if (s === 2) {
    return {
      stage: 2,
      toughness,
      breakLayers,
      regularActions,
      bombSeconds,
      shield: def?.phaseShields?.[1] ?? 12,
      strengthBonus: 0,
      artifactBonus: def?.artifactByPhase?.[1] ?? 1,
      title: '',
      subtitle: '',
    };
  }
  return {
    stage: 3,
    toughness,
    breakLayers,
    regularActions,
    bombSeconds,
    shield: def?.phaseShields?.[2] ?? 16,
    strengthBonus: 1,
    artifactBonus: def?.artifactByPhase?.[2] ?? 1,
    title: '',
    subtitle: '',
  };
}

export function isFixedFirstSlot(state, slotList, index, def) {
  return Boolean(
    state && state.phase !== 'opening' && index === 0 && slotList?.[0] && def?.fixedFirstSlot,
  );
}

export function pickBombTarget(state, round = 1) {
  const units = state?.units || {};
  const formation = Array.isArray(state?.formation) ? state.formation : [];
  const livingFront = formation.slice(0, 3).filter((id) => units[id]?.hp > 0);
  const candidates = livingFront.length ? livingFront : formation.filter((id) => units[id]?.hp > 0);
  if (!candidates.length) return null;
  const seed = (Number(state?.seed) || 37) >>> 0;
  const hash = Math.imul(seed + Math.max(1, Number(round) || 1) * 131, 2654435761) >>> 0;
  return candidates[hash % candidates.length];
}

export function alchemicalBombDamage(targetUnit) {
  return Math.max(18, Math.round((targetUnit?.maxHp || 36) * 0.48));
}

export const OVERLORD_DIALOGUES = (() => {
  const alchemicalPuppet = Object.freeze({
    rankLabel: '绿蕨磨坊 · 失控炼金造物',
    entrance: Object.freeze([
      '咔、咔哒……地板踩响了。三十年了，总算又有活人推开阁楼这扇死门。',
      '怀表还没停，炉心还在烧——在齿轮彻底咬死之前，谁也别想下楼。',
    ]),
    domainLock:
      '铁闩自己落下去了。现在这间阁楼里只剩面前的棋盘能动，想翻账簿、点设置、溜回酒馆？门外早就没有楼梯了。',
    phase2: '嘎吱——背壳的束带全崩断了！听见怀表走快半拍了吗？我的两只铁钳可不会等你喘气！',
    phase3: '滋……瓷面炸裂了，炉灰快把齿轮糊死了——好啊，那就趁最后几声滴答，一块化进锅底吧！',
    bombArmed: (targetName) =>
      `滴答、滴答……滚烫的炼金怀表扣进${targetName}衣领了。引信见底前，你押谁来赌这一秒？`,
    bombDetonate: (targetName, damage) =>
      `滴答到头了。怀表在${targetName}胸口炸开，硬生生轰出 ${damage} 点炼金余震！`,
    bombDefuse: (targetName) =>
      `啧……手指还挺快，硬把${targetName}胸口的簧片按熄了。别急着抹汗，下一枚马上上弦。`,
    broken: '咔——？！发条咬死在齿缝里了……连抬钳子的力气都卡住了……别、别趁现在砸我炉心——！',
    chargeStart: '嘎吱……逆重主簧已经绞到底了！再过一拍炉心就会轰穿整层屋顶——有胆就踩着弱点砸碎它！',
    breakShatter: '咔嚓——！！聚好的炼金烈焰被活生生捅穿了……齿轴全脱扣了……动弹不得了……！',
    pageReload: Object.freeze([
      '咔哒……刚刚偷偷按了【刷新网页】，对吧？别装傻了，整页重新载入一百遍，这枚怀表走的还是同一笔死账！',
      '又按【刷新】了？指针可不会陪你倒转。这具发条壳子顺着屏幕裂缝一直看着你呢。',
    ]),
    reenterAfterReload:
      '哦？靠退回酒馆换了一口冷空气，末了还是推开阁楼门回来了？那就接着算刚才那局。',
    defeat: '滴答……最后一齿终于磨平了……三十年的噪响……原来真有停下来的一天……',
    sealedButtons: Object.freeze({
      saves: '别掏【存档】了，阁楼里可没有能把烧红炉心塞回抽屉的魔法！',
      settings: '想拧【系统设置】关掉我的节奏？先接住下一次怀表走字再说！',
      ledger: '【账簿】压在碎磨盘底下了——此刻只算血条，不算银币！',
      story: '【手记】哪会自己替你打赢？是添一行战死还是添一行生还，打完再写！',
      retreat: '木梯早被火药炸成碎渣了，现在想【返回酒馆】只能从三楼摔下去！',
      party: '外门铜栓已死死焊住，站在楼下的人此刻递不进半柄剑来！',
      review: '废纸进炉膛早化灰了，盯着眼前轮过来的铁钳比较要紧！',
      default: '少碰棋盘外头那些无关的按钮，我的发条可不等人！',
    }),
  });

  const apepLamb = Object.freeze({
    rankLabel: '界隙深处 · 灰之疫胎',
    entrance: Object.freeze([
      '别忙着抬头看天。脚底那摊泛冷的黑水，早从你的鞋底漫进石缝了。',
      '灰把整座地下献给我的时候，我以为下一位客人还要很久才肯走下来。来吧，站稳你的位置。',
    ]),
    domainLock:
      '墨潮已经淹过门槛了——从这一息起，棋盘外的所有窗口、退路与档案都沉进了水底，只剩你和眼前这六个格位。',
    phase2:
      '你劈开了披在外头的羊毛与泥壳……真好。现在，正中央那只眼睛彻底睁开，看清你们六个站在哪一格了。',
    phase3:
      '日蚀已经垂到头顶！前方的石台正在塌陷，躲在后头喘气的影子也一个别想缩着不动——全给我换起来吧！',
    chargeStart:
      '嘶……千条黑蛇一起吸气了！日蚀深渊正在你们正上方合拢——在它彻底吞没整块地面前，击碎我的弱点！',
    breakShatter: '呃啊……！日蚀光环被强行撕开了一道口子……黑水倒灌回喉咙里了……！',
    broken: '嘶……骨节全被光灼僵了……黑潮退了半寸，趁现在……别、别让我把眼睑重新合上……',
    plague:
      '黑水已经漫上石台。只要你还钉在同一格里发呆，【沉疫】就会一轮比一轮更深地咬住你的脚踝。',
    plagueTick:
      '又过去一轮了。水底的手顺着后排的裤脚往上爬——谁敢一直缩在后场不往前换，下一脚就会直接踩空！',
    corruptSlot:
      '看清楚那个爬满墨纹的回合格。别想在上面塞什么输出招式——要么老实用来【换位】，要么逼我先踩上去替你挡灾！',
    slowBreakSlot:
      '啧……居然用【缓慢】硬生生把我的动作拖进了黑格里？好算计……那一格的诅咒被你反扣回我身上了！',
    rearPlagueAlert:
      '还躲在后排不动吗？沉水专啃不敢换到前场喘息的怯懦者——死在后面，连替身都救不及！',
    pageReload: Object.freeze([
      '按下【刷新网页】就能假装自己没下到坑底么？黑水比浏览器记得更牢——水位甚至没降下半分。',
      '又一次重开页面？真顽固。石缝里的眼睛可从不眨眼，它一直数着你回来几次。',
    ]),
    reenterAfterReload:
      '逃出界面又自己走了回来……脚印还是干湿各半。来吧，看看这次你记不记得及时换位。',
    defeat: '日蚀……终于散了……灰的债还清了……别回头看水底，快走上台阶去……',
    sealedButtons: Object.freeze({
      saves: '【存档】早浸进黑水里化作一团浆糊了，现在能靠的只有手头的站位。',
      settings: '别伸手去调【设置】了，潮水淹得比开关更快。',
      ledger: '算不清了，【账簿】上的墨字自己顺着黑泥往下滑——连名字都快洇没。',
      story: '【手记】还没写完。站错一格的话，下一页就是你的绝笔。',
      retreat: '石门早就合拢成整面悬崖，没有半条【撤退】的阶梯留给你。',
      party: '黑潮堵死了甬道外侧，没编进此刻战阵的同伴进不来这里！',
      review: '水下没有重印上一页的纸笔——把注意力放回你前排和后排脚下的位置吧！',
      default: '别去乱点那些浮在水面上的框体，它们早已替我沉入界隙了！',
    }),
  });

  const moonEye = Object.freeze({
    rankLabel: '古林圣殿 · 苍白月瞳主干',
    entrance: Object.freeze([
      '枝桠间的夜风停了。连月光都分出三条根脉盯着你们，你们还真敢走到树心前面来。',
      '冠盖会碾碎妄想，根须会收回血肉——而我的眼睛，只负责记录谁先崩溃。',
    ]),
    domainLock: '古林的年轮合上了！银白色的根藤缠死了界外的一切按键——在月瞳阖上以前，不许离席。',
    phase2: '树皮剥裂了半寸……银血的味道不错。让冠盖与深根同时加速吧，看看你们顾得了哪一头！',
    phase3: '全树共鸣已经响起来了！每一条年轮都在替月痕聚光，别指望慢吞吞拖过去！',
    chargeStart: '苍白月轮在中央主干骤然收束！这一道破坏光线落下来前，看你们挑不挑得破月瞳的护纹！',
    breakShatter: '嘶啦——！树冠护膜爆裂成漫天银屑，主干的聚能线被硬生生斩断了！',
    broken: '月光散乱了……年轮陷入死寂的一瞬——连根系都忘记怎么收缩了……',
    pageReload: Object.freeze([
      '就算按了【刷新网页】把林间的雾重新吹散一次，树干上的刻痕依旧记得刚才交手到第几轮。',
      '又从头载入一遍页面吗？古树的年轮从不漏记任何一圈倒流的时间。',
    ]),
    reenterAfterReload: '林间的月影刚刚才散，你们竟又主动踏回树冠正下方来了。',
    defeat: '月轮……碎成一地枯叶了……原来凡人手中的微火，真能烧穿千年的白树……',
    sealedButtons: Object.freeze({
      saves: '细藤早就缝死了【存档】匣，这棵大树最厌恶不付代价就重来！',
      settings: '月光照射的林间没有外来的【设置】，一切规矩由年轮决定！',
      ledger: '树根早缠碎了行囊后的【账簿】，眼下只需算清主干还有几层月痕！',
      story: '枯叶上写不下你们的【手记】——拿剑把真相刻进木心吧！',
      retreat: '来时的苔径早长满倒刺古藤，此刻无路可退！',
      party: '树冠阴影隔绝了营火，外面的候补伙伴穿过不来这层月障！',
      review: '旧战报早被风卷进林梢，先看清楚哪只树枝正在蓄力！',
      default: '年轮之外无一物可碰——把目光留在这三株圣树上。',
    }),
  });

  const ares = Object.freeze({
    rankLabel: '极北冰渊核心 · 阿瑞斯重装机枢',
    entrance: Object.freeze([
      '目标特征锁定完成。识别代码：闯入者六名。热能炉启动，冰渊防卫协议全开。',
      '在绝对低温与过载脉冲面前，血肉之躯的容错率接近于零。开始清场。',
    ]),
    domainLock: '全频段信号已屏蔽。除战斗指令外的所有控制台与界面接口均已离线封锁，请专注求生。',
    phase2: '外层复合装甲损毁超过警戒线。备用过载电路并网完成——火力配比提升，双炮协同激活！',
    phase3: '警告：反应炉进入极限临界域！取消安全阀限制，对战场实施无差别高温扫射！',
    chargeStart: '主炮阵列进入最高级热能蓄压！倒计时结束前若未能破坏核心护盾，将执行整排歼灭！',
    breakShatter: '警报——核心导流管遭定向击穿！热能蓄压强制泄放，机枢暂时瘫痪！',
    broken: '系统报错……主轴过冷卡死……炮台回路离线修复中，防御矩阵失效……',
    pageReload: Object.freeze([
      '检测到客户端发起【刷新网页】指令……无效规避。战场遥测记录仍完整保留在低温存储区。',
      '重复【刷新】无法重置阿瑞斯的锁定协议。请勿尝试绕过核心接敌区域。',
    ]),
    reenterAfterReload: '重新检测到入侵信号接入。已自动调出上次交战残余装甲参数，继续作战。',
    defeat: '核心反应炉……冷却停机……所有火控协议注销……冰渊重归静默……',
    sealedButtons: Object.freeze({
      saves: '写入权限已被极寒磁暴切断，无法在战斗期间访问【存档】节点！',
      settings: '禁止外部【设置】篡改机枢出力上限，系统不接受管理员覆写！',
      ledger: '行军【账簿】通讯离线——战后若能幸存，再行清算物资损耗。',
      story: '航行【手记】记录仪冻结，战场存活是继续记录的前提条件！',
      retreat: '冰渊闸门已按一级战备标准反锁，【撤退】路径物理封堵！',
      party: '低温风墙阻塞前哨信道，后备编队无法空降接应！',
      review: '历史回放模块已禁用，请即刻处理眼前的重装火力阵列！',
      default: '外部UI通道无响应：该操作已被阿瑞斯战区协议拦截。',
    }),
  });

  const radiantWyvern = Object.freeze({
    rankLabel: '天阶圣坛之巅 · 炽光巨龙',
    entrance: Object.freeze([
      '你们竟敢踩着先祖铺就的白石阶一路爬到这里？挺好，至少证明今日的祭品不算太寒酸。',
      '收起你们那点微弱的护盾吧。在真龙的炽日吐息底下，铁甲和纸片烧起来是一样的声音。',
    ]),
    domainLock: '龙威已经压实整座天阶！这方云巅之上只允许剑与火对话——任何界面退路都已被灼空！',
    phase2: '有点意思，竟然真能在龙鳞上留下一道浅痕。那就张开双翼，尝尝毫不留情的耀斑吧！',
    phase3: '够了！虫豸居然敢让我流血至此？！天穹要坍塌了——给我全数化作白灰！',
    chargeStart: '金白色的烈日已在龙喉深处坍缩成型！再不拿破盾重击敲醒我，下一息整队都将飞灰湮灭！',
    breakShatter: '吼——！！谁准你们用凡俗的兵刃砸穿真龙胸口的逆鳞？！吐息竟然逆流了……！',
    broken: '双翼沉重得抬不起来……龙鳞正在冒黑烟……不许……俯视我……！',
    pageReload: Object.freeze([
      '区区【刷新网页】，也敢妄想抹去龙火灼在命运上的焦痕？天阶的时间可归我管！',
      '再按一次【刷新】又何妨？只要翅膀还没折断，你们每回来一次，我便重新炙烤你们一次！',
    ]),
    reenterAfterReload: '喔？落荒退出天幕又自己爬回圣坛来了？这次站稳些，别一照面就化灰！',
    defeat: '天光……暗下来了……原来高悬千载的太阳……也有坠地的一刻……',
    sealedButtons: Object.freeze({
      saves: '真龙岂容凡人在【存档】里把生死涂改重来？老实接着这一剑！',
      settings: '天穹的烈度不是区区【设置】滑块能调低半度的！',
      ledger: '连金库在龙焰下都要熔成金水，现在看什么破【账簿】！',
      story: '你的【手记】配得上真龙的结局吗？打赢了再提笔吹嘘吧！',
      retreat: '百丈绝壁已成火海，跳下去比死在吐息下更难看！',
      party: '圣坛罡风如刀，在下方喘气的杂兵上不来替你分担龙炎！',
      review: '过去写过的漂亮话挡不住龙爪——抬头看着翅膀落下的方向！',
      default: '在天阶圣坛上对龙背过脸去，按那些虚幻的格子——可笑至极！',
    }),
  });

  return Object.freeze({
    alchemicalPuppet,
    apepLamb,
    moonEye,
    moonCrown: moonEye,
    moonRoot: moonEye,
    ares,
    radiantWyvern,
  });
})();

export function resolveOverlordId(overlordId) {
  if (overlordId === 'moonCrown' || overlordId === 'moonRoot') return 'moonEye';
  return OVERLORD_DIALOGUES[overlordId] ? overlordId : 'alchemicalPuppet';
}

export function overlordDialoguePack(overlordId) {
  return OVERLORD_DIALOGUES[resolveOverlordId(overlordId)];
}

export function overlordSealedBark(overlordId, buttonKey = 'default') {
  const pack = overlordDialoguePack(overlordId);
  const map = pack.sealedButtons || {};
  return map[buttonKey] || map.default;
}

export function overlordReloadBark(overlordId, reloadCount = 1) {
  const pack = overlordDialoguePack(overlordId);
  const lines = pack.pageReload;
  if (Array.isArray(lines) && lines.length) {
    const idx = Math.min(lines.length - 1, Math.max(0, (Number(reloadCount) || 1) - 1));
    return lines[idx];
  }
  return pack.domainLock || '棋盘之外的按钮已经锁死了——先把这一战打完。';
}

export function pickCorruptedTimelineSlot(s, slots) {
  if (!s?.sinkingPlague || !Array.isArray(slots) || !slots.length) return null;
  const empty = [];
  for (let i = 0; i < slots.length; i += 1) {
    if (!slots[i]) empty.push(i);
  }
  if (!empty.length) return null;
  // Prefer empty slots 1-2 indices after an enemy action so inflicting Slow can push an enemy onto it.
  const slowable = empty.filter((i) => slots.some((actor, ei) => actor && ei < i && i - ei <= 2));
  const pool = slowable.length
    ? slowable
    : empty.filter((i) => slots.some((actor, ei) => actor && ei < i));
  const candidates = pool.length ? pool : empty;
  const seed = (Number(s.seed) || 37) >>> 0;
  const round = Math.max(1, Number(s.round) || 1);
  const hash = Math.imul(seed + round * 149, 2654435761) >>> 0;
  return candidates[hash % candidates.length];
}

export function sinkingPlagueFrontDamage(s, slot, ageOverride = null) {
  const plague = s?.sinkingPlague;
  if (!plague || !Number.isInteger(slot) || slot < 0 || slot >= 3) return 0;
  const age = ageOverride ?? plague.ages?.[slot] ?? 0;
  const elapsed = age + 1;
  const sourceUnit = s.units?.[plague.source];
  const scale = Math.max(1, sourceUnit?.damageScale || 1);
  return Math.round(elapsed * 2 * scale);
}

export function sinkingPlagueRearDamage(s, rearTurns) {
  const plague = s?.sinkingPlague;
  if (!plague || !(rearTurns > 0)) return 0;
  const sourceUnit = s.units?.[plague.source];
  const scale = Math.max(1, sourceUnit?.damageScale || 1);
  return Math.round(rearTurns * rearTurns * 6 * scale);
}

export function overlordPhaseLog(id, def, nextStage, profile, shield) {
  const statsNote = `获得${profile.artifactBonus || 0}层人工制品与${shield}护盾，震退并打断我方本回合剩余行动`;
  if (id === 'apepLamb') {
    return nextStage >= 3
      ? `${def.name}头顶的日蚀黑轮彻底吞没天光，深渊赤瞳全开（${statsNote}）`
      : `${def.name}裂开灰白躯壳，腹间邪瞳睁视全阵（${statsNote}）`;
  }
  if (id === 'radiantWyvern') {
    return nextStage >= 3
      ? `${def.name}燃起极昼炽阳龙炎，暴怒龙压震碎圣坛砖石（${statsNote}）`
      : `${def.name}展开辉光双翼掀起日冕罡风（${statsNote}）`;
  }
  if (id === 'alchemicalPuppet') {
    return nextStage >= 3
      ? `${def.name}胸口的核心彻底碎裂暴走，滚烫炼金雾席卷全场（${statsNote}）`
      : `${def.name}体内的反重力发条猛然失衡逆转（${statsNote}）`;
  }
  return `${def.name}显露更深一层的霸主压迫（${statsNote}）`;
}

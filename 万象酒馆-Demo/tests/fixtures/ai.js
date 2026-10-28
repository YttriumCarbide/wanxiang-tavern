import { OFFICIAL_SETTINGS } from '../../src/content/official-characters.js';
export function characterFixture() {
  return { schemaVersion: 1, setting: { name: '灯河', title: '巡灯术士', appearance: '旧铜灯与青色披风。', personality: '细心而克制。', background: '渡口守灯人，追寻失踪同伴。', speechStyle: '简短温和。', motivation: '找到归乡的灯火。', tags: ['守灯', '寻人'] }, data: {
    archetype: 'morrow', hp: 50, mp: 28, attack: 12, attackName: '灯火弹', weapon: 'staff', limit: 1,
    skills: [ { name: '凝灯', text: '造成10伤害与1迟缓。', ap: 1, mp: 2, target: 'enemy', effects: [{ type: 'damage', value: 10 }, { type: 'buff', buff: 'slow', value: 1 }] }, { name: '灯罩', text: '一名队友获得8护盾。', ap: 1, mp: 2, target: 'ally', effects: [{ type: 'shield', value: 8 }] } ],
  } };
}
export function characterDocument() {
  const raw = characterFixture();
  const setting = JSON.parse(JSON.stringify(OFFICIAL_SETTINGS.morrow).replaceAll('时砂', '灯河'));
  setting.age = '二十九岁';
  setting.attack.name = raw.data.attackName;
  setting.skills.forEach((skill, index) => { skill.name = raw.data.skills[index].name; });
  return { schemaVersion: 3, setting, data: { name: setting.name, title: '', ...raw.data } };
}
export function characterResponse() { return JSON.stringify(characterDocument()); }
export function scriptFixture(ids) {
  const facts = [
    ['磨坊的铜灯忽然熄灭，旧水轮也停了。队伍沿干渠查找原因，第一道排水口伏着苔团与迷路小蕈，淤泥上留着往上游延伸的亮痕。', '排水口清出一条窄缝，下面没有积水。渠壁的水线还高过膝盖，说明断流发生在更远处；几块带着铜锈的断木挂在逆流的一边，曾被回涌的水推过来。', '队伍沿着干渠向北走，先前看到的木刺越来越多，潮湿的痕迹转进遗迹，接上磨坊引水图里没有画出的岔口。'],
    ['遗迹台阶被一块翻起的护板挡住，碎石幼灵挤在护板边。台阶侧面刻着两道箭头，分别通往主渠与一条狭窄的检修沟，沟底传出断续水声。', '护板下的通路显露出来，墙上旧图把检修沟与林地相连。磨坊那张图只标了水道，漏掉了供人进入上游的台阶，照原路继续走就会绕过断流的位置。', '队伍补好路标，带着从入口捡起的铜箍碎片进入检修沟，决定先找到引水设施，再回头处理下游。'],
    ['检修沟尽头被树根撑开。古林里，苔团、碎石幼灵和迷路小蕈围着几截斜放的石槽。石缝往外冒水，地面潮气渐重，主渠却仍然空着。', '通路恢复后，可以看清半截带铜箍的木梁压在渠底，边上连着一根绷紧的铁索。上游的水流进了废沟，只有把控制主渠的闸杆松开，才能恢复旧水道。', '沿着铁索寻找控制端时，队伍发现泥地上的刮痕通往一座检修亭，铜箍残片也终于能接上木梁的断面。'],
    ['林中的检修亭外守着裂隙猎犬与碎石幼灵。半扇窗压在石阶上，亭内手轮歪斜，铁索从轮轴后伸进墙洞，一直连向遗迹北侧。', '亭内的检修铜片记着开闸次序：先开旁闸卸压，再拉主闸。轮轴卡住的原因也明确了，倒塌木梁扯住铁索，强行转主轮只会把整套装置拉得更紧。', '队伍把铜片留在手轮旁，照次序先去找旁闸。林尽头露出一道石门，里面传来水流撞墙的闷响。'],
    ['引水室内，遗迹石卫停在主轮前，余烬祭司守着侧面火盆。旁闸的小轮藏在烟垢后，轮齿嵌着断木碎屑，水声隔着石墙越来越响。', '引水室恢复通行后，轮齿清理干净，旁闸缓缓转开。废沟开始退水，下面露出通往北端的台阶。主轮终于能转，却只动了半圈，末端还有另一道闸门没有打开。', '队伍沿新露出的石阶走进北端通道，门楣上的双箭头与检修铜片一致。主渠出口已经近了，这条线索可以走到底。'],
    ['北端闸室里，缚界巨像立在石门前，裂隙猎犬与余烬祭司分守两侧。压住闸杆的断梁就在墙角，铜箍已经裂开，水沿石门底部向外急渗。', '闸室阻碍消除后，队伍移走断梁，按记下的次序拉起主闸。水先涌进缓冲池，再沿石渠穿过古林。回程经过磨坊时，旧轮已经慢慢转动，铜灯也重新点起。补好的路线记录留在灯下，这趟查清断流、恢复水道的委托完成了。', ''],
  ];
  const line = (speaker, action, dialogue = '') => ({ speaker, action, dialogue });
  return { schemaVersion: 2, title: '寻灯之路', synopsis: '沿干渠追查断流，解除闸门堵塞并恢复磨坊水轮。', setting: '遗迹引水渠穿过古林，一场倒塌扯住了主闸。',
    opening: '副本总开场：界门落在一座旧磨坊旁，干涸渠床露着白底，水轮悬在半空。灯下的委托要求查清断流并恢复引水。队伍带上墙边的引水图，准备沿上游走一趟。槽底湿痕还没干，入口的断木带着新鲜木刺，故障应该就在最近发生。', tags: ['寻灯'], npcs: [],
    scenes: [...facts.slice(0, 3), facts[4], facts[5]].map(([opening, result, travel], encounter) => ({ encounter, opening,
      before: [line(encounter === 0 ? ids[0] : 'narrator', `战前${encounter+1}：先核对上一站记下的痕迹，再确认这处设施与主渠的连接。眼前的阻碍挡在查找故障的路上，需要先让通道恢复通行。`, encounter === 0 ? '先顺着水迹找断流处，别急着碰主轮。' : '')],
      after: [line('narrator', `战后${encounter+1}：${result}`)],
      interlude: encounter < 4 ? [line('narrator', `战间${encounter+1}：${travel}`)] : [],
    })), nextHook: { setting: '铜灯下的旧图还留着一条尚未勘查的支渠。', map: 'forest', artNodes: ['旧路标'] } };
}

export function requestContext(messages) {
  for (const message of messages) {
    if (message.role !== 'user' || !message.content.trim().startsWith('{')) continue;
    try {
      const value = JSON.parse(message.content);
      if (value.request?.brief && value.world && ['character', 'script'].includes(value.task)) return value;
    } catch { /* Only the structured current-input message is relevant. */ }
  }
  throw Error('Current task context missing');
}
export function tavernPresetFixture() {
  return { name: '酒馆导入验收',
    prompts: [
      {identifier:'main', name:'核心设定', role:'system', content:'你是角色设计API，按当前任务创作。{{brief}}'},
      {identifier:'sampleUser', name:'示例提问', role:'user', content:'这是一次格式演示。'},
      {identifier:'sampleAssistant', name:'示例回答', role:'assistant', content:'格式演示结束；实际输出以最后的固定协议为准。'},
      {identifier:'chatHistory', name:'本次资料', marker:true, system_prompt:true},
      {identifier:'disabled', name:'关闭层', role:'system', content:'THIS_LAYER_MUST_NOT_BE_SENT'},
    ],
    prompt_order: [{character_id:100001, order:[
      {identifier:'main',enabled:true},{identifier:'sampleUser',enabled:true},
      {identifier:'sampleAssistant',enabled:true},{identifier:'disabled',enabled:false},
      {identifier:'chatHistory',enabled:true},
    ]}],
  };
}

export function compactCharacterDocument() {
  const raw = characterDocument();
  for (const key of ['name', 'title', 'attackName']) delete raw.data[key];
  for (const item of raw.data.skills) delete item.name;
  return raw;
}

/** Default illustrations for generated protagonists and companions only. */
export const PORTRAIT_TEMPLATES = Object.freeze(
  ['sword', 'staff', 'bow'].flatMap((weapon) =>
    ['female', 'male'].map((gender) => ({
      id: `${weapon}-${gender}`,
      weapon,
      gender,
      portrait: `template-${weapon}-${gender}.webp`,
      name: `${{ sword: '剑士', staff: '法师', bow: '游侠' }[weapon]}·${gender === 'female' ? '女' : '男'}`,
    })),
  ),
);

export function defaultCharacterPortrait(weapon, gender = '') {
  const female = /女|female|woman|feminine/i.test(gender);
  const type = ['sword', 'staff', 'bow'].includes(weapon) ? weapon : 'sword';
  return PORTRAIT_TEMPLATES.find(
    (entry) => entry.weapon === type && entry.gender === (female ? 'female' : 'male'),
  ).portrait;
}

const CHARACTER_RENDERING = `沿用《万象酒馆》正式角色卡的二维日系幻想绘法。用细而有色的轮廓线，受光边缘让线融进色块；以清楚的大面明暗塑形，只在脸颊、鼻梁和衣料转折处细柔过渡。眼形自然，虹膜和眼睑清楚；头发按成组的发束画出起伏，用细窄高光表现发丝方向。保留通透明快的角色本色，以冷暖分面和轻微反光增加体积；衣料先画大褶，再用少量刺绣、宝石或金属高光点缀。避开粗黑描边、棕灰滤镜、仿旧纸纹、密集排线、塑料皮肤、照片写实和 3D 渲染。`;

export const CHARACTER_IMAGE_PROMPTS = Object.freeze({
  card: `生成一张《万象酒馆》角色战斗卡面，1024×1536 竖版 2:3。
参考图用法：随提示词附一张游戏原卡，例如 assets/portraits/luo-gongxu-v2.png、assets/portraits/silica-laps-v3.png 或 assets/portraits/edith.png。它只参考线条、上色与光影。若另附本角色设计图，脸型、发型、服装、配色和道具以设计图与下方角色设定为准。
${CHARACTER_RENDERING}
画到腰部或上胯，轻微三分之四转身，双肩入画，头顶和发饰留白，脸在画面上三分之一并保持清晰。用方向一致的柔和侧光和环境反光衬托脸部。背景取自角色设定，用低对比的前后景衬出剪影，脸后保持简洁。单张插画，无文字、水印、边框、UI 或拼图。`,
  standing: `生成一张《万象酒馆》场景与 Gal 共用的透明全身立绘，1024×1536 竖版 2:3。
参考图用法：先附本角色定稿卡面，锁定脸型、五官、发色、服装结构、饰物和配色；再附一张游戏内全身原稿，例如 assets/tavern-visitors/luo-gongxu-full-v2.png 或 assets/tavern-visitors/silica-laps-full-v2.png，只参考站姿、全身比例与上色技法。卡面以下未画出的部分按下方角色设定延续设计。
${CHARACTER_RENDERING}
正面自然站立，脸和胸朝向观者，双脚落在同一水平面。完整呈现头发、发饰、手指、衣摆、道具和双鞋底，头顶及脚底各留至少 4% 透明边距。手臂和道具贴近身体。用中性柔光保留卡面的上色层次和本色。
输出 PNG RGBA，轮廓外及发丝、衣摆、双腿之间的空隙均为透明 alpha=0。只保留实体及轮廓抗锯齿。无背景、地面、投影、外发光、文字、水印、边框或 UI。`,
});

import { FOREST_ENEMIES, FOREST_BOSSES } from './forest-adversaries.js';

const appearances = {
  vine: '盘绕立起的粗藤，以钩状侧枝和分叉根足攀附，藤节间透出蓝白微光。',
  moth: '灰蓝鳞粉覆盖分层宽翅，腹下垂着细足，触须和翅纹映出冰蓝月光。',
  worm: '粗短分节的软体躯壳贴地蠕动，两侧短足依次起落，前端口器不断收缩。',
  mushroom: '苍白菌柄撑着层叠蓝伞，伞沿垂挂荧亮孢囊，根丝扎进潮湿地面。',
  mud: '苔绿泥壳层层隆起，垂落的双臂聚成重拳，胸口露出银蓝色流动核心。',
  bee: '褐金相间的节腹、双侧叠翅与细长尾针，暗色复眼映着蓝色碎片。',
  lizard: '直立鳞身、长吻月瞳与脊背鳞冠，拖尾保持平衡，穿戴古城制式甲与兵器。',
  cultist: '树根披肩裹着长袍，枝角木面具遮脸，缝口根线下垂，手边挂着传令铜铃。',
  tree: '扭斜树干生出指爪般的枝臂，根足拖行，树皮缝中亮着细长眼孔。',
  root: '多股粗根拧成活动躯体，分叉支足撑住身体，银灰接环与蓝光导管穿过根心。',
  crown: '宽大冠层下悬着数枚半透明培养囊，叶片呈扇状层叠，蓝光沿根脉周期闪动。',
  eye: '活体树干包住银灰环形虹膜，中央竖瞳泛蓝，两侧飞弹舱与根管相连。',
  frog: '宽腹巨蛙伏在四只厚足上，高凸双眼扫视前方，苔背扎着数根发蓝的蜂针。',
};
export const FOREST_MONSTER_LORE = Object.freeze(
  Object.fromEntries(
    [...FOREST_ENEMIES, ...FOREST_BOSSES].map((enemy) => [
      enemy.id,
      {
        appearance: appearances[enemy.shape],
        habits: enemy.description,
        motion: enemy.intents.map((intent) => intent.name + '：' + intent.text).join('；'),
      },
    ]),
  ),
);

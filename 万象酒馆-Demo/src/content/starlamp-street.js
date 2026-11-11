import { STREET_SPATIAL } from './street-spatial.js';
import { STREET_ILLUSTRATED } from './street-illustrated.js';

/** This first compact scene uses painted layers; future places supply their own art and points. */
export const STARLAMP_STREET = Object.freeze({
  id: 'starlamp-street',
  name: '星灯街 · 酒馆门前',
  subtitle: '在街角停一会儿',
  title: '酒馆门前',
  index: '01',
  returnDestination: 'tavern',
  returnLabel: '酒馆',
  bearings: ['门前街角', '右侧街道', '酒馆方向', '左侧街道'],
  eye: [0, 1.65, 0],
  fov: 67,
  initialPitch: 0.03,
  ground: STREET_SPATIAL.road,
  spatial: STREET_SPATIAL,
  illustration: STREET_ILLUSTRATED,
  panorama: './assets/exploration/starlamp-corner-panorama-v3.png',
  panoramaBand: './assets/exploration/starlamp-band-v1.png',
  faceImages: ['front', 'right', 'back', 'left'].map(
    (direction) =>
      `./assets/exploration/starlamp-corner-${direction}-${{ front: 'v5', left: 'v4' }[direction] || 'v3'}.png`,
  ),
  cutouts: [
    {
      id: 'courtyard',
      kind: 'prop',
      image: './assets/exploration/street-spatial/courtyard-fountain.png',
      position: [-9.7, 0],
      height: 1.6,
      top: 64,
      foot: 1155,
    },
    {
      id: 'notice',
      kind: 'prop',
      image: './assets/exploration/starlamp-notice-v2.png',
      position: [4, -3.2],
      height: 1.45,
    },
  ],
  points: [
    {
      id: 'courtyard',
      name: '藤影饮水院',
      kind: '调查',
      anchor: [-9.6, 1.1, 0],
      text: '街道在这里退进去一小块，屋檐和矮墙围住了常年滴水的石槽。铜嘴被往来的旅人摸得发亮，槽沿放着一只木杯；藤叶底下刻着几个不同高度的记号，像是附近孩子一年年长高的记录。',
    },
    {
      id: 'apothecary',
      name: '青瓶药铺',
      kind: '调查',
      anchor: [3.9, 1.65, -5.9],
      text: '店里的灯刚刚亮起。几束香草倒挂在窗边，蓝色药瓶里沉着一片缓慢转动的叶子。橱窗贴着便条：今晚收购月露，不收没有盖子的瓶子。',
    },
    {
      id: 'notice',
      name: '街角告示栏',
      kind: '调查',
      anchor: [4, 1.3, -3.2],
      text: '三张旧告示压在黄铜图钉下面：灯匠招学徒、失猫启事，以及一张被雨水泡淡的城门时刻表。最底下有人补了一句：“猫回来就好，赏金照付。”',
    },
    {
      id: 'arch',
      name: '前往市中心',
      kind: '前往',
      destination: 'city-center',
      immediate: true,
      anchor: [-2, 1.65, -7.35],
      text: '石拱后面露出几片浅色屋顶。晾着的衣服在墙间轻轻晃动，巷子里传来收拾碗碟的声音。今天先在门前认认路，改天再往里面走。',
    },
    {
      id: 'tavern',
      name: '万象酒馆',
      kind: '返回',
      destination: 'tavern',
      actionLabel: '推门，回到酒馆 →',
      anchor: [-0.25, 1.3, 6.92],
      text: '熟悉的木门就在身后。门上的黄铜星标映着夕阳，里面传来杯盏相碰的轻响。推开门，就能回到酒馆大厅。',
    },
  ],
});

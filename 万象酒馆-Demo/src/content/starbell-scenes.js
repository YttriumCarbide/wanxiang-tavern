import { GAL_NPC_PORTRAITS } from './gal-npc-portraits.js';
import { EXPLORATION_GROUND } from './exploration-ground.js';
import { panoramaAnchor } from './panorama-anchors.js';
import { FREE_EXPLORATION_ART } from './free-exploration-art.js';

const art = (id) => ({
  illustration: FREE_EXPLORATION_ART[id],
  fov: 75,
  initialPitch: -0.09,
  ground: EXPLORATION_GROUND[id],
  panorama: `./assets/exploration/${id}-panorama-v2.png`,
  panoramaBand: `./assets/exploration/${id}-band-v1.png`,
  faceImages: ['front', 'right', 'back', 'left'].map(
    (direction) => `./assets/exploration/${id}-${direction}-v2.png`,
  ),
});
const exit = (id, name, anchor) => ({
  id,
  name,
  kind: '前往',
  destination: id,
  immediate: true,
  anchor,
});

export const STARBELL_SCENES = {
  market: {
    id: 'market',
    name: '星钟城 · 灯匠商业街',
    title: '灯匠商业街',
    subtitle: '工坊与药香之间',
    index: '03',
    eye: [0, 1.65, 0],
    returnDestination: 'city-center',
    returnLabel: '广场',
    bearings: ['灯匠工坊', '药铺门前', '街后水井', '广场方向'],
    ...art('market'),
    cutouts: [
      {
        id: 'novi',
        kind: 'npc',
        image: GAL_NPC_PORTRAITS.villagerWoman,
        position: [-0.95, -2.95],
        height: 1.7,
        foot: 1500,
      },
      {
        id: 'mirei',
        kind: 'npc',
        image: GAL_NPC_PORTRAITS.merchant,
        position: [2.2, -4.1],
        height: 1.74,
        foot: 1500,
      },
    ],
    points: [
      {
        id: 'novi',
        name: '灯匠学徒 · 诺薇',
        kind: '交谈',
        anchor: [-0.95, 1.8, -2.95],
        text: '女灯匠学徒正清点灯扣。她手边那盏旧星灯看起来修过很多次，却一直没有点亮。',
      },
      {
        id: 'mirei',
        name: '旅行医师 · 米蕾',
        kind: '交谈',
        anchor: [2.2, 1.8, -4.1],
        text: '医师把药箱按用途分开。她手套的指尖磨得发白，装绷带的抽屉却总擦得很干净。',
      },
      {
        id: 'workbench',
        name: '未完成的灯架',
        kind: '调查',
        anchor: panoramaAnchor(0.44, 0.57),
        text: '备用灯扣、木架和灯罩分成三堆。把它们整理好，就能知道缺的是哪一种。',
      },
      exit('city-center', '返回星钟广场', panoramaAnchor(0.17, 0.65)),
      exit('rampart', '前往城墙守备区', panoramaAnchor(0.92, 0.65)),
    ],
  },
  rampart: {
    id: 'rampart',
    name: '星钟城 · 城墙守备区',
    title: '城墙守备区',
    subtitle: '城门与警钟',
    index: '04',
    eye: [0, 1.65, 0],
    returnDestination: 'city-center',
    returnLabel: '广场',
    bearings: ['城门外', '守卫值房', '返回城内', '城墙警钟'],
    ...art('rampart'),
    cutouts: [
      {
        id: 'eirin',
        kind: 'npc',
        image: GAL_NPC_PORTRAITS.guardWoman,
        position: [1.4, -3.7],
        height: 1.78,
        foot: 1500,
      },
    ],
    points: [
      {
        id: 'eirin',
        name: '城卫副队长 · 艾琳',
        kind: '交谈',
        anchor: [1.4, 1.9, -3.7],
        text: '副队长的巡防册上夹着几封家书。她正在核对城门岗和庆典巡逻队的人数。',
      },
      {
        id: 'bell',
        name: '城墙警钟与换防表',
        kind: '调查',
        anchor: panoramaAnchor(0.265, 0.39),
        text: '警钟通向城外哨塔的方向。值房旁贴着节庆换防表，有一段时刻被改过两次。',
      },
      {
        id: 'barricade',
        name: '城门支撑木',
        kind: '调查',
        anchor: panoramaAnchor(0.31, 0.65),
        text: '支撑木没有固定，仍堆放在门边。守卫说庆典期间会让出这条路供商队通行。',
      },
      exit('outskirts', '出城 · 前往旧哨塔', panoramaAnchor(0.475, 0.62)),
      exit('city-center', '返回星钟广场', panoramaAnchor(0.85, 0.63)),
      exit('market', '前往灯匠商业街', panoramaAnchor(0.14, 0.63)),
    ],
  },
  outskirts: {
    id: 'outskirts',
    name: '星钟城 · 城外旧哨塔',
    title: '城外旧哨塔',
    subtitle: '大道尽头的风声',
    index: '05',
    eye: [0, 1.65, 0],
    returnDestination: 'rampart',
    returnLabel: '城门',
    bearings: ['旧哨塔', '倾倒的货车', '返回城门', '林边兽径'],
    ...art('outskirts'),
    panoramaBand: './assets/exploration/outskirts-band-v2.png',
    cutouts: [],
    points: [
      {
        id: 'tower',
        name: '旧哨塔',
        kind: '调查',
        anchor: panoramaAnchor(0.445, 0.59),
        text: '塔顶的钟绳垂在木架边，风里没有钟声。城门可以望见这里升起的旗。',
      },
      {
        id: 'tracks',
        name: '林边倒伏的草',
        kind: '调查',
        anchor: panoramaAnchor(0.055, 0.68),
        text: '路旁的草朝着城门的方向倒伏，泥土上有不属于车轮的痕迹。',
      },
      {
        id: 'cart',
        name: '损坏的货车',
        kind: '调查',
        anchor: panoramaAnchor(0.723, 0.66),
        text: '空货车的车辕断成两截，一枚铁箍上留下几道深深的划痕。',
      },
      exit('rampart', '沿大道返回城门', panoramaAnchor(0.34, 0.62)),
    ],
  },
};

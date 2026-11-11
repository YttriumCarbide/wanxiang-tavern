import { EXPLORATION_GROUND } from './exploration-ground.js';
import { panoramaAnchor } from './panorama-anchors.js';
import { FREE_EXPLORATION_ART } from './free-exploration-art.js';

/** Painted city center; all architecture and fountain details stay in the background art. */
export const CITY_CENTER = Object.freeze({
  id: 'city-center',
  illustration: FREE_EXPLORATION_ART['city-center'],
  name: '市中心 · 星钟广场',
  title: '星钟广场',
  subtitle: '市中心 · 晚钟之前',
  index: '02',
  fov: 75,
  initialYaw: 0.16,
  initialPitch: -0.06,
  detailPitch: Math.PI / 12,
  eye: [0, 1.65, 0],
  ground: EXPLORATION_GROUND.square,
  returnDestination: 'street',
  returnLabel: '街角',
  bearings: ['市政钟楼', '旅人公会', '返回街角', '石柱拱廊'],
  panorama: './assets/exploration/city-center-panorama-v1.png',
  panoramaBand: './assets/exploration/city-center-band-v1.png',
  faceImages: ['front', 'right', 'back', 'left'].map(
    (direction) => `./assets/exploration/city-center-${direction}-v1.png`,
  ),
  cutouts: [
    {
      id: 'sign',
      kind: 'prop',
      image: './assets/exploration/city-center-sign-v1.png',
      position: [-1.4, -2.9],
      height: 1.4,
    },
  ],
  points: [
    {
      id: 'market',
      name: '前往灯匠商业街',
      kind: '前往',
      destination: 'market',
      immediate: true,
      anchor: panoramaAnchor(0.6, 0.61),
    },
    {
      id: 'rampart',
      name: '前往城墙守备区',
      kind: '前往',
      destination: 'rampart',
      immediate: true,
      anchor: panoramaAnchor(0.18, 0.63),
    },
    {
      id: 'clock',
      name: '市政钟楼',
      kind: '调查',
      anchor: panoramaAnchor(0.46, 0.35),
      text: '钟面的金色指针正慢慢靠近傍晚。门廊下的铜牌写着今日议事已经结束，石阶却扫得很干净。侧边窗口还亮着一盏灯，有人似乎仍在整理迟到的来信。',
    },
    {
      id: 'fountain',
      name: '广场喷泉',
      kind: '调查',
      anchor: panoramaAnchor(0.365, 0.65),
      text: '浅浅的水池里映着钟楼，水声盖住了远处交谈的声音。池边放着半杯已经凉掉的茶，还有一本用干花夹住的册子。这里是个适合等人的地方。',
    },
    {
      id: 'guild',
      name: '旅人公会',
      kind: '调查',
      anchor: panoramaAnchor(0.7, 0.58),
      text: '公会的橡木门上钉着一枚磨亮的盾徽。窗边留着两排等待登记的座位，最靠里的椅子上搭了一件旅行斗篷。今天的委托已经收起，值班的人仍然愿意回答问路。',
    },
    {
      id: 'sign',
      name: '广场路标',
      kind: '调查',
      anchor: [-1.4, 1.6, -2.9],
      text: '路标上的钟、盾牌和杯子分别指向市政厅、旅人公会和酒馆街。木牌下沿刻着几笔不太整齐的小记号，像是走失的孩子给自己留下的认路办法。',
    },
    {
      id: 'street',
      name: '返回酒馆街角',
      kind: '前往',
      destination: 'street',
      immediate: true,
      anchor: panoramaAnchor(0.9, 0.63),
      text: '沿着身后缓缓下行的小街，可以回到青瓶药铺和酒馆门前。',
    },
  ],
});

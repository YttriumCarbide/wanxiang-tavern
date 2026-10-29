/** Scene positions are independent of camera seats and never change character ownership. */
export const TAVERN_VISITOR_SPOTS = Object.freeze([
  { id: 'gate-side', name: '界门旁', position: [2.75, 0, -3.25] },
  { id: 'bar-front', name: '吧台前', position: [-3, 0, -1.55] },
  { id: 'summon-side', name: '召唤门旁', position: [-4.45, 0, -0.2] },
  { id: 'window-side', name: '窗边', position: [5.3, 0, 3.05] },
  { id: 'shelf-side', name: '书架旁', position: [4.6, 0, -2.1] },
  { id: 'table-side', name: '圆桌旁', position: [1.65, 0, 1.05] },
]);

export const TAVERN_VISITORS = Object.freeze([
  { id: 'yuexi', combatId: 'aegis', name: '长景月汐', height: 1.76, top: 10, foot: 1508 },
  { id: 'edith', combatId: 'edith', name: '伊蒂丝', height: 1.7, top: 9, foot: 1527 },
  { id: 'pandora', combatId: 'pandora', name: '潘多拉', height: 1.64, top: 9, foot: 1490 },
]);

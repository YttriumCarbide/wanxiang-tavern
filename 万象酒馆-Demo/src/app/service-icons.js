const art = Object.freeze({
  table:
    '<ellipse cx="18" cy="15" rx="14" ry="7" fill="#7f523a"/><path d="M8 17v11m20-11v11M18 20v11" fill="none" stroke="#704433" stroke-width="3" stroke-linecap="round"/><ellipse cx="18" cy="13" rx="14" ry="7" fill="#c88c54"/><path d="M7 14q9-7 22-3M12 17q10-4 16-4" fill="none" stroke="#e0aa6f"/>',
  windowTable:
    '<path d="M3 17V4h16v13z" fill="#5b7882" stroke="#a66843" stroke-width="2"/><path d="M11 4v13M3 11h16" stroke="#efc78e"/><circle cx="7" cy="8" r="1.3" fill="#f4e2a6"/><ellipse cx="22" cy="22" rx="11" ry="5" fill="#c88c54"/><path d="M15 24v7m14-7v7" stroke="#704433" stroke-width="2.5"/>',
  stool:
    '<path d="M6 8h23v7H6z" fill="#b7794d"/><path d="M8 15v8m19-8v8M14 25v8m9-8v8" stroke="#6a4031" stroke-width="2.8" stroke-linecap="round"/><ellipse cx="18" cy="24" rx="8" ry="4" fill="#a95848"/>',
  kettle:
    '<path d="M25 11q10-1 7 7l-7 3M9 13 3 10l2 8 5 2" fill="none" stroke="#e5ad72" stroke-width="2.3"/><path d="M8 17c0-4 3-7 10-7s10 3 10 7v5c0 5-5 8-10 8S8 27 8 22z" fill="#61958a"/><path d="M11 11q7-6 14 0m-8-4q1-3 3 0" stroke="#f3cd8c" fill="none" stroke-width="2"/><path d="M11 20q3 4 11 1" stroke="#9cc6b1" fill="none"/>',
  drumstick:
    '<path fill="#b96b43" d="M13 19c-3-4-1-11 4-14s11-1 13 3-1 10-5 13c-4 3-9 2-12-2z"/><path fill="#f6dfb0" d="m15 19-5 7c-2-1-5 0-5 2 0 2 1 3 3 3 1 3 4 3 5 1 1-1 0-3-1-3l6-7z"/><path fill="none" stroke="#f0a565" d="M17 11c2-4 5-5 8-4"/>',
  bowl: '<path fill="#4f7a78" d="M4 15h28c-1 10-6 15-14 15S5 25 4 15z"/><ellipse fill="#f5be71" cx="18" cy="15" rx="14" ry="5"/><path stroke="#fff2cf" fill="none" d="M12 10c0-2 3-3 2-6m6 6c0-2 3-3 2-6m3 11-3 1m-9-2 3 2"/>',
  pancakes:
    '<ellipse fill="#b76a3d" cx="18" cy="25" rx="13" ry="5"/><ellipse fill="#d9924b" cx="18" cy="20" rx="14" ry="5"/><ellipse fill="#edb66b" cx="18" cy="15" rx="13" ry="5"/><path fill="#f8df83" d="m16 11 7-1 2 4-8 2z"/><circle fill="#913f52" cx="11" cy="15" r="2"/><circle fill="#913f52" cx="25" cy="17" r="2"/>',
  fish: '<path fill="#85aba8" d="M6 18c4-7 13-10 20-3l6-6v18l-6-6C19 27 10 25 6 18z"/><path fill="#496b71" d="m13 13 5-6 6 6m-6 8 4-5 1 6z"/><circle fill="#281f2a" cx="11" cy="17" r="1.3"/>',
  cup: '<path fill="#75a3a3" d="M9 12h16l-2 16H11z"/><path fill="none" stroke="#75a3a3" stroke-width="2.8" d="M24 15h4c5 0 4 8-4 7"/><ellipse fill="#bd783d" cx="17" cy="12" rx="8" ry="2.5"/><path stroke="#e8d09b" fill="none" d="M14 8c-1-2 3-4 2-6m4 6c-1-2 3-3 2-5"/>',
  salad:
    '<path fill="#b48458" d="M4 18h28c-1 8-6 12-14 12S5 26 4 18z"/><path fill="#719353" d="M6 17c0-4 5-7 9-5-1-6 7-7 10-1 5-1 7 2 6 7-8 4-16 4-25-1z"/><path stroke="#d9cb66" fill="none" d="m13 17 6-3m0 5 7-4"/>',
  root: '<path fill="#d78648" d="M8 28c2-5 4-12 7-15 4-5 12 0 9 5-2 5-11 8-16 10z"/><path fill="#669264" d="M20 13c-1-7 2-8 4-8l1 7c3-5 6-5 8-4l-6 7z"/><path stroke="#a35637" fill="none" d="m14 20 4 2m-1-7 4 2"/>',
  leaf: '<path fill="#6d985c" d="M5 28C5 10 19 7 31 6c-2 15-11 25-24 23z"/><path stroke="#d5d284" fill="none" d="M8 28 25 11m-13 13-1-8m7 3 7 1"/>',
  mushroom:
    '<path fill="#ead0a1" d="M14 16h8l2 13c-5 3-8 3-12 0z"/><path fill="#a9684d" d="M4 17C6 5 29 3 32 17c-6 4-22 4-28 0z"/><path stroke="#ecc089" fill="none" d="M10 12l4-2m6 2 4-1"/>',
  milk: '<path fill="#e5e9d5" d="M13 5h10v6l3 5v14H10V16l3-5z"/><path fill="#88a6a6" d="M13 4h10v4H13zm-3 13h16v8H10z"/>',
  salt: '<path fill="#d8d3b8" d="M12 13h12l2 17H10z"/><path fill="#7e827f" d="M11 12c0-4 3-6 7-6s7 2 7 6v2H11z"/><path stroke="#fff1d2" fill="none" d="m15 19-1 7m4-16h1"/>',
  egg: '<path fill="#e9c9a1" d="M9 23c0-7 5-16 9-16 5 0 10 10 10 16 0 6-4 8-10 8s-9-2-9-8z"/><path stroke="#fff0d0" fill="none" d="M13 20c0-3 2-6 4-8"/>',
  berries:
    '<path fill="#759559" d="M17 14c-3-6 1-8 7-9-1 5-2 8-7 9z"/><circle fill="#a54957" cx="13" cy="18" r="5"/><circle fill="#744f79" cx="22" cy="19" r="5"/><circle fill="#923951" cx="17" cy="25" r="5"/>',
  jar: '<rect fill="#c58643" x="10" y="11" width="16" height="20" rx="3"/><path fill="#744e3c" d="M11 7h14v6H11z"/><path fill="#f3ce77" d="M12 17h12v8H12z"/>',
  drop: '<path fill="#80aeb6" d="M18 4c4 7 10 14 10 19 0 6-5 8-10 8s-10-3-10-8c0-5 6-12 10-19z"/><path stroke="#d3edf0" fill="none" d="M13 21c-2 4 0 6 3 7"/>',
  lemon:
    '<circle fill="#ecc163" cx="18" cy="18" r="12"/><circle fill="none" stroke="#fff0a4" cx="18" cy="18" r="9"/><path stroke="#fff0a4" fill="none" d="M18 9v18M9 18h18m-15-6 12 12m-12 0 12-12"/>',
  plate:
    '<ellipse fill="#b7d0c8" cx="18" cy="19" rx="15" ry="10"/><ellipse fill="#e2e3c4" cx="18" cy="18" rx="11" ry="6"/>',
  fork: '<path fill="none" stroke="#a1a39a" stroke-width="3" d="M12 7v9m-4-9v5c0 5 8 5 8 0V7m-4 9v15m12 0V7c-5 4-5 11 0 11"/>',
  napkin:
    '<path fill="#e7d8b8" d="M6 6h23v23H6z"/><path fill="#b9a78e" d="M6 29 29 6v23z"/><path stroke="#ffedc7" fill="none" d="m10 24 14-14"/>',
  coin: '<circle fill="#d99a45" cx="18" cy="18" r="14"/><circle fill="#f4cd73" cx="18" cy="18" r="10"/><path fill="#a96938" d="m18 11 4 7-4 7-4-7z"/>',
  pot: '<path fill="#8c5b46" d="M5 13h26l-2 13c-4 6-17 6-22 0z"/><ellipse fill="#4a3232" cx="18" cy="13" rx="13" ry="5"/><path fill="none" stroke="#d5a174" stroke-width="2" d="M6 15H2m28 0h4M11 24c4 3 11 4 15 0"/>',
  receipt:
    '<path fill="#f1d7a5" d="M8 4h20v29l-4-3-4 3-4-3-4 3-4-3z"/><path fill="none" stroke="#a77759" d="M12 12h12m-12 5h12m-12 5h8"/>',
  basket:
    '<path fill="#bc874f" d="M5 16h26l-4 14H9z"/><path fill="none" stroke="#744936" stroke-width="2" d="M11 16C11 2 25 2 25 16m-14 4 2 7m5-7v8m7-8-2 7"/>',
});

const items = Object.freeze({
  大厅桌: 'table',
  窗边桌: 'windowTable',
  吧台凳: 'stool',
  倒茶壶: 'kettle',
  剩菜: 'salad',
  香草烤鸡: 'drumstick',
  鸡腿: 'drumstick',
  奶油蘑菇汤: 'bowl',
  野莓薄饼: 'pancakes',
  田园煎鱼: 'fish',
  河鱼: 'fish',
  薄荷蜜茶: 'cup',
  琥珀海藻凉拌: 'salad',
  金蜜根片: 'root',
  香根: 'root',
  胡萝卜: 'root',
  香草: 'leaf',
  薄荷: 'leaf',
  海藻: 'leaf',
  褐菇: 'mushroom',
  鲜奶: 'milk',
  盐: 'salt',
  少量盐: 'salt',
  少盐: 'salt',
  鸡蛋: 'egg',
  野莓: 'berries',
  蜂蜜: 'jar',
  黄油: 'egg',
  香醋: 'jar',
  酱汁: 'jar',
  酱汁另放: 'jar',
  热水: 'drop',
  清水: 'drop',
  空碟: 'plate',
  餐具: 'fork',
  纸巾: 'napkin',
  面包: 'basket',
  面粉: 'napkin',
  去蜜: 'lemon',
  柠檬片: 'lemon',
  照常: 'receipt',
  锅: 'pot',
  订单: 'receipt',
  托盘: 'plate',
  餐篮: 'basket',
  找零盘: 'coin',
});

export function serviceIcon(name) {
  const symbol = String(name).startsWith('coin:') ? 'coin' : items[name] || 'jar';
  return `<svg class="service-icon" viewBox="0 0 36 36" aria-hidden="true">${art[symbol]}</svg>`;
}

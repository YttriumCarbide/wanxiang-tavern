const HALL_PLACES = Object.freeze({
  bar: {
    name: '吧台',
    environment: '木质吧台上亮着暖灯，杯架映着微光，近旁有两张高脚凳。',
    actions: ['擦拭杯沿', '闻一闻杯里的饮料', '拨弄杯垫', '翻看酒单', '与身旁来客低声闲谈'],
  },
  bar2: {
    name: '吧台另一席',
    environment: '吧台另一侧的高脚凳挨着酒架，能听见杯盏轻响。',
    actions: ['轻晃杯中的饮料', '观察酒架上的瓶子', '把杯垫推回原处', '托着下巴听人说话'],
  },
  table: {
    name: '圆桌',
    environment: '酒馆中央的圆桌被暖色灯光笼罩，桌上摆着饮料和零食，四周传来低低的人声。',
    actions: ['摆弄桌上的小摆件', '分一碟零食', '整理随身笔记', '用指尖敲着桌沿', '闲看周围来客'],
  },
  table2: {
    name: '靠窗圆桌',
    environment: '窗边圆桌稍显安静，玻璃上映着灯火，窗外是界隙的朦胧光影。',
    actions: [
      '望向窗外的光影',
      '在纸上随手涂画',
      '捧着杯子出神',
      '借窗边的光翻书',
      '轻声哼着原乡的小调',
    ],
  },
});

const ROOM_POINTS = Object.freeze({
  entry: [
    '房间内',
    '暖灯照亮安静的房间，门外偶尔传来走廊的脚步声。',
    ['整理旅途的行装', '斟好一杯温水'],
  ],
  bed: [
    '床边',
    '床铺柔软整洁，床头灯映着被褥，几人可以在床沿坐下交谈。',
    ['坐在床沿整理衣袖', '把靠枕摆好'],
  ],
  window: [
    '窗边',
    '窗外是界隙中的夜色与朦胧星光，玻璃上映着室内的暖灯。',
    ['倚窗望向远处', '指着窗外的星光'],
  ],
  desk: [
    '书桌前',
    '书桌上摆着信纸、墨水与几本读到一半的书，桌灯照亮纸页。',
    ['翻开随身笔记', '把信纸推到一旁'],
  ],
  wardrobe: [
    '衣柜前',
    '木质衣柜和行李架收着旅途衣物，近旁留着可站立交谈的空处。',
    ['整理随身外衣', '把行李放到架上'],
  ],
  washstand: [
    '净手台旁',
    '净手台上放着清水、铜盆和叠好的布巾，水面映着灯火。',
    ['用布巾擦净双手', '向盆中添一点清水'],
  ],
  stove: [
    '暖炉旁',
    '暖炉里燃着小火，铜壶散出热气，炉边适合坐下来取暖。',
    ['捧着热茶暖手', '为铜壶添水'],
  ],
  door: [
    '房门旁',
    '房门内侧连着安静的走廊，这里仍属于酒馆休息区。',
    ['在门边等候同伴', '轻轻扶住门把'],
  ],
  sitting: [
    '起居角',
    '主卧的起居角摆着两把翼背椅、茶桌与茶具，可以相对坐下休息。',
    ['把茶杯摆上茶桌', '在翼背椅上放松坐下'],
  ],
  bookshelf: [
    '书架旁',
    '高书架上排列着来自不同世界的书卷，梯凳停在书架旁边。',
    ['从书架抽出一本书', '翻看书页里的插图'],
  ],
});
const MASTER_POINTS = Object.freeze({
  window: [
    '窗榻边',
    '长帘垂在窗榻两侧，界隙的月色与星光透过窗户落进主卧。',
    ['在窗榻坐下', '轻轻拨开长帘望向窗外'],
  ],
  washstand: [
    '梳妆台前',
    '梳妆镜映着暖灯，台面上摆着香露与梳具，近旁留有椅子。',
    ['把梳具摆整齐', '在镜前整理衣领'],
  ],
  stove: [
    '壁炉旁',
    '石砌壁炉里燃着暖火，壁炉镜映着火光，炉前留有取暖交谈的位置。',
    ['在炉火前暖手', '看着壁炉里的余烬'],
  ],
});
const ROOMS = Object.freeze({
  a: {
    name: '东厢客房',
    points: ['entry', 'bed', 'window', 'desk', 'wardrobe', 'washstand', 'stove', 'door'],
  },
  b: {
    name: '西厢客房',
    points: ['entry', 'bed', 'window', 'desk', 'wardrobe', 'washstand', 'stove', 'door'],
  },
  master: { name: '主卧', points: Object.keys(ROOM_POINTS) },
});

export function roomChatPlace(room, point = 'entry') {
  if (!Object.hasOwn(ROOMS, room)) return null;
  const spot = ROOMS[room].points.includes(point) ? point : 'entry';
  return `room-${room}-${spot}`;
}

export const CHAT_PLACES = Object.freeze({
  ...HALL_PLACES,
  corridor: Object.freeze({
    name: '二层走廊',
    environment:
      '木地板、壁灯和地毯沿着二层廊道延伸，三扇房门通往客房与主卧，另一扇门连着酒馆大厅。',
    actions: ['在壁灯下等候', '倚着廊道一侧看向同伴'],
  }),
  ...Object.fromEntries(
    Object.entries(ROOMS).flatMap(([id, room]) =>
      room.points.map((point) => {
        const [name, environment, actions] =
          (id === 'master' && MASTER_POINTS[point]) || ROOM_POINTS[point];
        return [
          roomChatPlace(id, point),
          Object.freeze({
            name: `${room.name} · ${name}`,
            environment: `${room.name}。${environment}这里属于万象酒馆内部，遵守酒馆规则。`,
            actions,
          }),
        ];
      }),
    ),
  ),
});

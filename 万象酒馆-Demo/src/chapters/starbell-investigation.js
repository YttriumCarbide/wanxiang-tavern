const line = (speaker, text) => ({ speaker, text });
const art = './assets/exploration/clues/';

/** Anchors use the actual outskirts/connected.png (3762 × 1254), never the old panorama. */
export const CHAPTER_INVESTIGATIONS = Object.freeze({
  tracks: {
    scene: 'outskirts',
    required: 2,
    objective:
      '用找到的证据解释异常如何发生，区分普通车祸与有组织的袭击，并说明接下来应追查的方向及理由。不能只报出“有蚀鳞”或复述线索名称。允许不同的合理解释，不要求猜中未发现的信息。',
    clues: [
      {
        id: 'grass',
        name: '倒伏的草丛',
        point: [1180 / 3762, 790 / 1254],
        radius: [0.03, 0.045],
        image: art + 'flattened-grass.png',
        detail:
          '草茎朝道路同一侧倒伏，有两组深浅不同、相互错开的压痕；旁边的细枝只在靠路一面折断，未见车轮连续碾过的轨迹。',
        lines: [
          line(
            '旁白',
            '拨开路边完好的草叶，下面露出几道压得很低的草茎。它们没有乱成一团，而是朝着同一侧伏下去，泥里的凹痕也不止一道。',
          ),
          line(
            '潘多拉',
            '主人，看这里……这一道比较深，旁边还有一道浅的，中间隔着没有压坏的草。要是货车直接冲进来，车轮不是应该一路留下痕迹吗？',
          ),
          line(
            '长景月汐',
            '也别急着把每道印子都算成一只怪物。先记住方向、深浅和旁边断枝的位置，再和别处对照，免得把来回走过的同一个东西当成一群。',
          ),
          line(
            '伊蒂丝',
            '嗯。现在能确定的是，有东西从这边经过，而且留下的痕迹不太像车轮。至于它为什么到路边来，光看这片草还说不准。',
          ),
        ],
      },
      {
        id: 'scales',
        name: '带着擦痕的蚀鳞鳞片',
        point: [846 / 3762, 853 / 1254],
        radius: [0.021, 0.04],
        image: art + 'eclipse-scales.png',
        detail:
          '左侧近路草地里有几枚暗色鳞片，断口较新，边缘挂着浅色纤维与木屑；一片外侧有横向擦痕，周围没有完整尸骸。',
        lines: [
          line(
            '旁白',
            '左边草根里反出一点暗蓝色。把上面的枯叶挪开，几枚不规则的鳞片落在泥里，边缘还勾着细细的纤维。',
          ),
          line(
            '伊蒂丝',
            '这颜色和断面……很像地志里记的蚀鳞。先别用手攥，拿布垫着。这里没有完整的躯体，鳞片未必是在它倒下时掉的。',
          ),
          line(
            '潘多拉',
            '旁边粘着木屑，还有这种浅色的线。是它先撞到了什么，还是有什么东西刮过它？这里离路已经不远了。',
          ),
          line(
            '长景月汐',
            '把擦痕也记下来。它能说明接触过什么，不能单独说明来了多少只、现在又在哪里。我们还得让这些证据彼此对得上。',
          ),
        ],
      },
      {
        id: 'cart',
        name: '被撞坏的货车',
        point: [2910 / 3762, 741 / 1254],
        radius: [0.038, 0.065],
        image: art + 'damaged-cart.png',
        detail:
          '货车侧板向内折裂，轴头偏向林侧，篷布缺了一块；车辙先急转、后被两道不同方向的足迹打断，货物没有被搬走。',
        lines: [
          line(
            '旁白',
            '货车歪靠在岔路口。侧板的断口朝车厢里面卷，车轴也错了位，几捆货物仍压在破掉的篷布下面。',
          ),
          line(
            '潘多拉',
            '东西还在，连捆绳都没有解开……要是为了抢货，怎么会就这么扔下？这一边碎得特别厉害，另一边反倒没什么事。',
          ),
          line(
            '长景月汐',
            '像是受了侧面的力，单凭车坏的位置，还不能断定先撞上什么。你看轮辙在这里转了一次，之后又被别的印子盖过去了。先把先后顺序分清。',
          ),
          line(
            '伊蒂丝',
            '篷布少掉的那块、木板的裂口和附近的印子，都值得对照。我们手里有了几件事，接下来得解释它们为什么会同时出现在这里。',
          ),
        ],
      },
    ],
  },
  tower: {
    scene: 'outskirts',
    required: 2,
    objective:
      '结合现场证据说明哨塔为何没有按时报警、值守者可能经历了什么，并提出有证据支撑的核实或接应办法。区分推断与已知事实，不能凭空找到幸存者或直接宣布夺回哨塔。',
    clues: [
      {
        id: 'threshold',
        name: '门槛边的拖痕',
        point: [1990 / 3762, 701 / 1254],
        radius: [0.024, 0.045],
        detail:
          '门槛内侧有抵门留下的磨痕，湿泥覆盖着较早的脚印，一道拖痕贴墙转向塔后，门锁没有从外砸开的缺口。',
        lines: [
          line(
            '旁白',
            '门槛上的泥还没完全干，底下却压着已经发白的旧脚印。门内侧的木头磨出了浅槽，一道拖痕沿墙拐向后面。',
          ),
          line(
            '长景月汐',
            '至少不是所有痕迹同时留下的。有人抵过门，后来又有东西被拖走。别把拖痕直接当成伤员，先想想还有什么能留下这种形状。',
          ),
          line(
            '伊蒂丝',
            '锁扣没有从外面砸开的缺口。这和“没有值守者”不是同一回事，我们还得弄清他们最后是在守、在走，还是根本走不了。',
          ),
        ],
      },
      {
        id: 'rope',
        name: '磨断的钟绳',
        point: [2001 / 3762, 257 / 1254],
        radius: [0.03, 0.065],
        detail:
          '钟绳下端落在横木旁，一截纤维被反复磨平，断面参差，并非整齐切断；钟体没有明显损坏。',
        lines: [
          line(
            '旁白',
            '风吹过塔顶，钟没有响。垂下来的绳头搭在横木旁，断口散着毛边，附近一小段纤维却磨得很光。',
          ),
          line(
            '潘多拉',
            '不是一下子切断的……有人使劲拉过吗？还是一直卡在木头上，越拉越紧？主人，钟看上去还是好的。',
          ),
          line(
            '长景月汐',
            '没听见钟声，未必是没人想报警。把能证实的先留下，不要急着给值守的人定罪。',
          ),
        ],
      },
      {
        id: 'supplies',
        name: '压在药包下的纸页',
        point: [1892 / 3762, 706 / 1254],
        radius: [0.026, 0.043],
        detail:
          '药包的封口已打开，纸页只记到“东侧换岗”，之后有一道急促划痕；纸角沾着新泥，药包没有被搜走。',
        lines: [
          line(
            '旁白',
            '墙边的药包没有收拢，下面压着一页湿纸。字迹写到“东侧换岗”就断了，后面只剩一道划得很重的墨痕。',
          ),
          line(
            '伊蒂丝',
            '写的人像是被什么打断了，不过“东侧换岗”也可能只是例行记录。药包已经用过，东西却没有带走，这两件事要一起看。',
          ),
          line(
            '潘多拉',
            '如果他们走得很从容，应该会把药也拿上吧……但这里没有写完的名字。我们不能就这么认定是谁，还是得想个办法确认。',
          ),
        ],
      },
    ],
  },
});

export function restoreInvestigations(raw) {
  return Object.fromEntries(
    Object.entries(CHAPTER_INVESTIGATIONS).map(([key, definition]) => [
      key,
      {
        started: raw?.[key]?.started === true,
        found: [
          ...new Set(
            (Array.isArray(raw?.[key]?.found) ? raw[key].found : []).filter((id) =>
              definition.clues.some((clue) => clue.id === id),
            ),
          ),
        ],
      },
    ]),
  );
}

export function investigationProgress(state, key) {
  const definition = CHAPTER_INVESTIGATIONS[key];
  if (!definition) return null;
  state.investigations ||= restoreInvestigations();
  const progress = (state.investigations[key] ||= { started: false, found: [] });
  return {
    ...progress,
    required: definition.required,
    ready: progress.started && progress.found.length >= definition.required,
  };
}

export function startInvestigation(state, key) {
  if (!CHAPTER_INVESTIGATIONS[key]) throw Error('未知调查');
  investigationProgress(state, key);
  state.investigations[key].started = true;
}

export function discoverChapterClue(state, key, id) {
  const progress = investigationProgress(state, key);
  const clue = CHAPTER_INVESTIGATIONS[key]?.clues.find((entry) => entry.id === id);
  if (!clue || !progress?.started) throw Error('调查尚未开始或线索无效');
  if (progress.found.includes(id)) return null;
  state.investigations[key].found.push(id);
  return clue;
}

export function investigationEvidence(state, key) {
  const definition = CHAPTER_INVESTIGATIONS[key];
  if (!definition) return null;
  const progress = investigationProgress(state, key);
  return {
    required: definition.required,
    found: definition.clues
      .filter((clue) => progress.found.includes(clue.id))
      .map(({ id, name, detail }) => ({ id, name, detail })),
    objective: definition.objective,
  };
}

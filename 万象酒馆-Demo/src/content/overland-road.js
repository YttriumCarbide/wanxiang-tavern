/** Ordered stages of the road from the old watchtower to the capital's outer gate. */
const sections = [
  {
    id: 'road-meadow',
    mapLabel: '出城草甸',
    mapShort: '草甸',
    back: [0.3, 0.72],
    onward: [0.704, 0.7],
  },
  {
    id: 'road-pines',
    mapLabel: '松林古道',
    mapShort: '松林',
    back: [0.3, 0.721],
    onward: [0.703, 0.675],
  },
  {
    id: 'road-bridge',
    name: '双拱石桥',
    mapLabel: '双拱石桥',
    mapShort: '石桥',
    back: [0.295, 0.66],
    onward: [0.709, 0.615],
  },
  {
    id: 'road-orchard',
    mapLabel: '野果坡',
    mapShort: '果坡',
    back: [0.3, 0.725],
    onward: [0.707, 0.653],
  },
  {
    id: 'road-ridge',
    mapLabel: '白石山口',
    mapShort: '山口',
    back: [0.3, 0.695],
    onward: [0.705, 0.638],
  },
  {
    id: 'road-reeds',
    name: '芦苇浅滩',
    mapLabel: '芦苇浅滩',
    mapShort: '芦滩',
    back: [0.29, 0.72],
    onward: [0.707, 0.72],
  },
  {
    id: 'road-downs',
    mapLabel: '风草长坡',
    mapShort: '长坡',
    back: [0.3, 0.707],
    onward: [0.7, 0.667],
  },
  {
    id: 'road-aqueduct',
    mapLabel: '旧渠拐道',
    mapShort: '旧渠',
    back: [0.3, 0.667],
    onward: [0.705, 0.645],
  },
  {
    id: 'road-causeway',
    mapLabel: '王城长堤',
    mapShort: '长堤',
    back: [0.3, 0.725],
    onward: [0.705, 0.62],
  },
  {
    id: 'road-capital',
    name: '银冠城外门',
    mapLabel: '银冠城外门',
    mapShort: '外门',
    back: [0.33, 0.729],
  },
];

export const OVERLAND_ROAD = Object.freeze(
  sections.map((section, index) => {
    const label = section.name ?? `第 ${index + 1} 段`;
    return {
      ...section,
      label,
      name: section.name ?? `城外大道 · ${label}`,
    };
  }),
);

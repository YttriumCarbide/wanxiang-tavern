export const SCENE_ENVIRONMENT_START = '【环境】';
export const SCENE_ENVIRONMENT_END = '【环境结束】';
export const SCENE_ENVIRONMENT_TEXT_LIMIT = 800;
const STAGE_MARKUP =
  /【(?:旁白|对白[:：][^】]*|登场[:：][^】]*|退场[:：][^】]*|清场)】|\[\[DC_CHECK\]\]/u;

/** A scene lead carries display text and its local location, never image or layout metadata. */
export function normalizeSceneEnvironment(value) {
  if (typeof value?.placeId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,95}$/u.test(value.placeId))
    return null;
  if (typeof value.title !== 'string' || typeof value.text !== 'string') return null;
  const title = value.title.trim();
  const text = value.text.trim();
  if (
    !title ||
    title.length > 100 ||
    !text ||
    text.length > SCENE_ENVIRONMENT_TEXT_LIMIT ||
    text.includes(SCENE_ENVIRONMENT_START) ||
    text.includes(SCENE_ENVIRONMENT_END) ||
    STAGE_MARKUP.test(text) ||
    /<\/?[a-z][^<>]*>/iu.test(text)
  )
    return null;
  return { placeId: value.placeId, title, text };
}

/** Separate a complete opening block. If it cannot be shown separately, keep every prose line. */
export function splitSceneEnvironment(source, place) {
  const body = source.trimStart();
  if (!body.includes(SCENE_ENVIRONMENT_START) && !body.includes(SCENE_ENVIRONMENT_END))
    return { content: source };
  const start = SCENE_ENVIRONMENT_START.length;
  const end = body.indexOf(SCENE_ENVIRONMENT_END, start);
  if (place && body.startsWith(SCENE_ENVIRONMENT_START) && end >= start) {
    const content = body.slice(end + SCENE_ENVIRONMENT_END.length).trimStart();
    const environment = normalizeSceneEnvironment({ ...place, text: body.slice(start, end) });
    if (
      environment &&
      content &&
      !content.includes(SCENE_ENVIRONMENT_START) &&
      !content.includes(SCENE_ENVIRONMENT_END)
    )
      return { content, environment };
  }
  return {
    content:
      body.replaceAll(SCENE_ENVIRONMENT_START, '').replaceAll(SCENE_ENVIRONMENT_END, '').trim() ||
      source,
  };
}

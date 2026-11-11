import { createTavernVisitors } from './visitors.js';
import { TAVERN_VISITORS, SCENE_VISITOR_SPOTS } from '../content/tavern-visitors.js';

/** Shared by the hall, upstairs rooms and painted outdoor locations. */
export async function createSceneVisitors({
  scene,
  camera,
  model,
  sceneId,
  events,
  assets,
  onChange,
  acceptsObstruction,
  placement,
  flat = false,
}) {
  const visitors = createTavernVisitors(scene, camera, model, {
    spots: SCENE_VISITOR_SPOTS[sceneId],
    maxVisible: sceneId === 'tavern' ? 3 : 2,
    assets,
    onChange,
    acceptsObstruction,
    placement,
    flat,
  });
  let received = null;
  let resolveConfiguration;
  const configuration = new Promise((resolve) => {
    resolveConfiguration = resolve;
  });
  events.on(window, 'message', (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== parent ||
      event.data?.type !== 'tavern-visitors'
    )
      return;
    received = event.data;
    resolveConfiguration(received);
    void visitors.configure(received);
  });
  if (parent === window) {
    received = { enabled: true, characters: TAVERN_VISITORS.map(({ id }) => ({ key: id, id })) };
  } else {
    parent.postMessage({ type: 'tavern-visitors-request' }, location.origin);
    let timeout;
    received = await Promise.race([
      configuration,
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve({ enabled: false, characters: [] }), 1200);
      }),
    ]);
    clearTimeout(timeout);
  }
  const imagesReady = visitors.configure(received);
  if (sceneId !== 'tavern') await imagesReady;
  return visitors;
}

export const TAVERN_MODEL_FILES = Object.freeze([
  './assets/inn.glb',
  './assets/tavern-machines.glb',
]);

export function attachTavernSupplies(model, supplies) {
  const oldCorner = [];
  model.traverse((object) => {
    if (object.name.startsWith('12_Corner_Barrels_and_Crates')) oldCorner.push(object);
  });
  oldCorner.forEach((object) => object.removeFromParent());
  supplies.name = 'Tavern_Supply_Corner';
  supplies.position.set(-3.75, 0, 4.45);
  supplies.rotation.y = Math.PI;
  model.add(supplies);
}

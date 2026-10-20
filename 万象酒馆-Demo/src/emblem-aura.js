import * as THREE from 'three';

/** A readable, always-on aura for combined units; it never owns combat state. */
export function createEmblemAura(scene, resources, reduced) {
  const groups = new Map();
  const ringGeometry = resources.track(new THREE.RingGeometry(0.82, 0.88, 64));
  const arcGeometry = resources.track(new THREE.RingGeometry(0.64, 0.7, 64, 1, 0, Math.PI * 1.35));
  const upperRingGeometry = resources.track(new THREE.RingGeometry(0.42, 0.48, 64));
  const haloGeometry = resources.track(new THREE.CircleGeometry(1.08, 64));
  const ringMaterial = resources.track(
    new THREE.MeshBasicMaterial({
      color: '#8ceaff',
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const arcMaterial = resources.track(
    new THREE.MeshBasicMaterial({
      color: '#d9ffff',
      transparent: true,
      opacity: 0.74,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const upperRingMaterial = resources.track(
    new THREE.MeshBasicMaterial({
      color: '#bdf7ff',
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const haloMaterial = resources.track(
    new THREE.MeshBasicMaterial({
      color: '#35b6ff',
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  const paint = sprite.getContext('2d');
  const gradient = paint.createRadialGradient(32, 34, 0, 32, 34, 31);
  gradient.addColorStop(0, '#f1ffffdd');
  gradient.addColorStop(0.24, '#b9f4ff9c');
  gradient.addColorStop(0.58, '#4aa9e35c');
  gradient.addColorStop(1, '#16468800');
  paint.fillStyle = gradient;
  paint.fillRect(0, 0, 64, 64);
  const texture = resources.track(new THREE.CanvasTexture(sprite));
  const glowMaterial = resources.track(
    new THREE.SpriteMaterial({
      map: texture,
      color: '#9beaff',
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const dotMaterial = resources.track(
    new THREE.PointsMaterial({
      color: '#c8f8ff',
      size: 0.23,
      map: texture,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  function groupFor(record) {
    if (groups.has(record)) return groups.get(record);
    const group = resources.object(new THREE.Group());
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.012;
    group.add(halo);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);
    const arc = new THREE.Mesh(arcGeometry, arcMaterial);
    arc.rotation.x = -Math.PI / 2;
    arc.position.y = 0.06;
    group.add(arc);
    const innerRing = new THREE.Mesh(upperRingGeometry, upperRingMaterial);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.08;
    group.add(innerRing);
    const glow = new THREE.Sprite(glowMaterial);
    glow.position.y = 0.03;
    glow.scale.set(2.4, 2.4, 1);
    group.add(glow);
    const geometry = resources.track(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    const points = new THREE.Points(geometry, dotMaterial);
    points.frustumCulled = false;
    group.add(points);
    scene.add(group);
    const effect = { group, halo, ring, arc, innerRing, glow, points };
    groups.set(record, effect);
    return effect;
  }
  return {
    update(records, now) {
      let active = false;
      for (const record of records) {
        const existing = groups.get(record);
        if (!record.emblemActive) {
          if (existing) existing.group.visible = false;
          continue;
        }
        const effect = existing || groupFor(record);
        effect.group.visible = true;
        effect.group.position.copy(record.root.position);
        const time = reduced ? 0 : now / 1000;
        effect.ring.scale.set(1 + Math.sin(time * 1.8) * 0.025, 1, 1);
        effect.arc.rotation.z = -time * 0.5;
        effect.innerRing.rotation.z = time * 0.34;
        effect.innerRing.scale.setScalar(1 + Math.sin(time * 1.6 + 1) * 0.05);
        effect.halo.scale.setScalar(1 + Math.sin(time * 1.4) * 0.04);
        effect.glow.scale.set(2.4 + Math.sin(time * 1.9) * 0.12, 2.4, 1);
        const positions = effect.points.geometry.attributes.position;
        for (let index = 0; index < 64; index++) {
          const phase = (index * 0.037 + time * 0.28) % 1;
          const angle = index * 2.399 + time * 0.4;
          const radius = 0.5 + phase * 0.22;
          positions.setXYZ(
            index,
            Math.cos(angle) * radius,
            0.08 + phase * 1.22,
            Math.sin(angle) * radius * 1.02,
          );
        }
        positions.needsUpdate = true;
        active = !reduced;
      }
      return active;
    },
    status() {
      const visible = [...groups.values()].filter((effect) => effect.group.visible);
      return {
        active: visible.length,
        groups: groups.size,
        particles: 64,
        layers: visible[0]?.group.children.length || 0,
      };
    },
  };
}

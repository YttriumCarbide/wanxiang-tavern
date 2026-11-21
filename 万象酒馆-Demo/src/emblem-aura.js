import * as THREE from 'three';
import { EMBLEM_ID, emblemVisualFor } from './emblems.js';

const DRAGON_VEIN_SLOTS = Object.freeze([
  Object.freeze({ x: -3.014, z: 2.345, primary: '#38e89e', glow: '#9dffda' }),
  Object.freeze({ x: 0, z: 2.345, primary: '#ff7043', glow: '#ffd1a3' }),
  Object.freeze({ x: 3.014, z: 2.345, primary: '#4ec8ff', glow: '#b5eeff' }),
]);

function createGlowTexture(resources) {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 128;
  const ctx = sprite.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.28, '#ffffffcc');
    g.addColorStop(0.62, '#ffffff44');
    g.addColorStop(1, '#ffffff00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return resources.track(new THREE.CanvasTexture(sprite));
}

function updatePointsPattern(array, t, style, reduced) {
  for (let i = 0; i < 64; i++) {
    const p = (((t * (style === 'overload-arc' ? 0.95 : 0.42) + i / 64) % 1) + 1) % 1;
    let angle = i * 2.39996 + t * (i % 2 === 0 ? 1.1 : -0.75);
    let r = 0.24 + (1 - p) * 0.72;
    let y = 0.08 + p * 1.92;
    let wobbleX = 0;
    let wobbleZ = 0;

    if (style === 'overload-arc') {
      const snap = reduced ? 0 : Math.sin(t * 22 + i * 3.1) * 0.14;
      angle += snap + (i % 2 === 0 ? 1 : -1) * t * 1.8;
      r = 0.48 + 0.34 * Math.sin(p * Math.PI * 3 + i);
      y = 0.16 + ((p * 2.1 + i * 0.07) % 1.85);
      wobbleX = reduced ? 0 : Math.cos(t * 17 + i) * 0.07;
      wobbleZ = reduced ? 0 : Math.sin(t * 19 + i * 1.3) * 0.07;
    } else if (style === 'dragon-tide') {
      angle = t * 0.9 + (i / 64) * Math.PI * 6;
      r = 0.44 + 0.52 * (1 - p * 0.7) + Math.sin(t * 2.6 + i * 0.4) * 0.1;
      y = 0.05 + p * 1.45 + Math.sin(angle * 2 + t * 2) * 0.08;
    } else if (style === 'phantom-veil') {
      angle = -t * 1.1 + i * 1.9 + Math.sin(p * 4) * 0.6;
      r = 0.76 * (1 - p * 0.55) + 0.12 * Math.sin(i + t * 2);
      y = 0.08 + p * 1.98;
    } else if (style === 'moon-eclipse') {
      const band = i % 2 === 0 ? 1 : -1;
      angle = t * 0.75 * band + (i / 64) * Math.PI * 2;
      r = 0.62 + 0.26 * Math.cos(i * 0.7 + t);
      y = 0.85 + Math.sin(angle * 2) * 0.46 * band + p * 0.4;
    } else if (style === 'shatter-crest') {
      angle = t * 1.15 * (i % 2 === 0 ? 1 : -1) + (i / 64) * Math.PI * 4;
      r = 0.5 + 0.36 * (1 - p * 0.65) + Math.abs(Math.sin(angle * 2)) * 0.14;
      y = 0.14 + p * 1.72;
    }

    array[i * 3] = Math.cos(angle) * r + wobbleX;
    array[i * 3 + 1] = y;
    array[i * 3 + 2] = Math.sin(angle) * r + wobbleZ;
  }
}

export function createEmblemAura(scene, resources, reduced) {
  const ringGeometry = resources.track(new THREE.RingGeometry(0.82, 0.88, 64));
  const arcGeometry = resources.track(new THREE.RingGeometry(0.64, 0.7, 64, 1, 0, Math.PI * 1.35));
  const upperRingGeometry = resources.track(new THREE.RingGeometry(0.42, 0.48, 64));
  const spireGeometry = resources.track(new THREE.RingGeometry(0.92, 0.97, 4));
  const haloGeometry = resources.track(new THREE.CircleGeometry(1.08, 64));
  const glowTexture = createGlowTexture(resources);

  const slots = [];
  const runtime = {
    active: 0,
    styles: [],
    activeEmblems: [],
    dragonVein: false,
  };

  function makeAdditiveMeshMaterial(opacity) {
    return resources.track(
      new THREE.MeshBasicMaterial({
        color: '#8ceaff',
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
  }

  function slotEntry() {
    const ringMaterial = makeAdditiveMeshMaterial(0.82);
    const arcMaterial = makeAdditiveMeshMaterial(0.68);
    const upperRingMaterial = makeAdditiveMeshMaterial(0.74);
    const spireMaterial = makeAdditiveMeshMaterial(0.56);
    const haloMaterial = makeAdditiveMeshMaterial(0.18);
    const glowMaterial = resources.track(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: '#9bf3ff',
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const dotMaterial = resources.track(
      new THREE.PointsMaterial({
        map: glowTexture,
        color: '#c9f8ff',
        size: 0.14,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );

    const group = resources.object(new THREE.Group());
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.01;

    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;

    const arc = new THREE.Mesh(arcGeometry, arcMaterial);
    arc.rotation.x = -Math.PI / 2;
    arc.position.y = 0.03;

    const innerRing = new THREE.Mesh(upperRingGeometry, upperRingMaterial);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.04;

    const spire = new THREE.Mesh(spireGeometry, spireMaterial);
    spire.position.set(0, 1.05, -0.05);

    const glow = new THREE.Sprite(glowMaterial);
    glow.position.set(0, 0.85, -0.06);
    glow.scale.set(2.05, 2.35, 1);

    const geometry = resources.track(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    const points = new THREE.Points(geometry, dotMaterial);

    group.add(halo, ring, arc, innerRing, spire, glow, points);
    group.visible = false;
    scene.add(group);
    return {
      group,
      halo,
      ring,
      arc,
      innerRing,
      spire,
      glow,
      points,
      geometry,
      materials: {
        ringMaterial,
        arcMaterial,
        upperRingMaterial,
        spireMaterial,
        haloMaterial,
        glowMaterial,
        dotMaterial,
      },
    };
  }

  function createDragonVeinDomain() {
    const outerGeo = resources.track(new THREE.RingGeometry(0.95, 1.06, 48));
    const innerGeo = resources.track(new THREE.RingGeometry(0.62, 0.69, 48));
    const domain = resources.object(new THREE.Group());
    domain.visible = false;
    const nodes = DRAGON_VEIN_SLOTS.map((slot) => {
      const node = new THREE.Group();
      node.position.set(slot.x, 0.015, slot.z);
      const outerMat = makeAdditiveMeshMaterial(0.7);
      outerMat.color.set(slot.primary);
      const innerMat = makeAdditiveMeshMaterial(0.5);
      innerMat.color.set(slot.glow);
      const outer = new THREE.Mesh(outerGeo, outerMat);
      outer.rotation.x = -Math.PI / 2;
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.008;
      node.add(outer, inner);
      domain.add(node);
      return { node, outer, inner, outerMat, innerMat };
    });
    scene.add(domain);
    return { domain, nodes };
  }

  const dragonVein = createDragonVeinDomain();

  function tintEntry(entry, visual, selected, pulse) {
    const m = entry.materials;
    const boost = selected ? 1.18 : 1;
    m.ringMaterial.color.set(visual.primary);
    m.arcMaterial.color.set(visual.secondary);
    m.upperRingMaterial.color.set(visual.core);
    m.spireMaterial.color.set(visual.glow);
    m.haloMaterial.color.set(visual.accent);
    m.glowMaterial.color.set(visual.glow);
    m.dotMaterial.color.set(visual.core);

    m.ringMaterial.opacity = Math.min(0.96, (0.72 + pulse * 0.14) * boost);
    m.arcMaterial.opacity = Math.min(0.92, (0.58 + pulse * 0.16) * boost);
    m.upperRingMaterial.opacity = Math.min(0.92, (0.64 + pulse * 0.15) * boost);
    m.spireMaterial.opacity = Math.min(0.84, (0.42 + pulse * 0.18) * boost);
    m.haloMaterial.opacity = selected ? 0.24 + pulse * 0.07 : 0.15 + pulse * 0.05;
    m.glowMaterial.opacity = selected ? 0.48 + pulse * 0.12 : 0.34 + pulse * 0.08;
    m.dotMaterial.opacity = selected ? 0.94 : 0.78;
  }

  function animateSilhouette(entry, style, t, pulse, selected) {
    entry.innerRing.rotation.x = -Math.PI / 2;
    entry.innerRing.rotation.y = 0;
    entry.spire.rotation.set(0, 0, Math.PI / 4);
    entry.spire.scale.setScalar(1);

    if (style === 'solar-scales') {
      entry.ring.rotation.z = t * 0.6;
      entry.arc.rotation.z = -t * 1.1;
      entry.innerRing.position.y = 0.05 + pulse * 0.05;
      entry.innerRing.rotation.z = t * 1.5;
      entry.spire.visible = true;
      entry.spire.rotation.z = Math.PI / 4 + Math.sin(t * 1.4) * 0.12;
      entry.spire.position.y = 0.95 + pulse * 0.08;
    } else if (style === 'overload-arc') {
      entry.ring.rotation.z = t * 2.4;
      entry.arc.rotation.z = -t * 3.1;
      entry.innerRing.rotation.x = -Math.PI / 2 + Math.sin(t * 8) * 0.18;
      entry.innerRing.rotation.z = t * 3.6;
      entry.spire.visible = true;
      entry.spire.rotation.z = t * 2.9;
      entry.spire.scale.setScalar(0.92 + Math.sin(t * 15) * 0.12);
    } else if (style === 'dragon-tide') {
      entry.ring.rotation.z = t * 0.55;
      entry.arc.rotation.z = t * 1.25;
      entry.ring.scale.setScalar(1.06 + pulse * 0.09);
      entry.innerRing.position.y = 0.03 + Math.sin(t * 2.2) * 0.04;
      entry.spire.visible = false;
    } else if (style === 'phantom-veil') {
      entry.ring.rotation.z = -t * 0.9;
      entry.arc.rotation.z = t * 1.7;
      entry.innerRing.rotation.x = -Math.PI / 2 + 0.24;
      entry.innerRing.rotation.z = -t * 1.9;
      entry.spire.visible = true;
      entry.spire.rotation.y = Math.sin(t * 1.6) * 0.35;
      entry.spire.rotation.z = -t * 0.8;
    } else if (style === 'shatter-crest') {
      entry.ring.rotation.z = t * 1.1;
      entry.arc.rotation.z = -t * 1.75;
      entry.innerRing.position.y = 0.66 + pulse * 0.06;
      entry.innerRing.rotation.x = -Math.PI / 2 + 0.18 * Math.cos(t * 1.6);
      entry.innerRing.rotation.z = -t * 1.5;
      entry.spire.visible = true;
      entry.spire.position.y = 1.04 + pulse * 0.1;
      entry.spire.rotation.z = Math.PI / 4 + Math.sin(t * 2.2) * 0.24;
    } else {
      entry.ring.rotation.z = t * 0.85;
      entry.arc.rotation.z = -t * 1.4;
      entry.innerRing.position.y = 0.78 + pulse * 0.08;
      entry.innerRing.rotation.x = -Math.PI / 2 + 0.35 * Math.sin(t * 0.9);
      entry.innerRing.rotation.z = t * 1.3;
      entry.spire.visible = true;
      entry.spire.position.y = 1.18 + pulse * 0.08;
      entry.spire.rotation.z = Math.PI / 4 + t * 0.45;
    }

    const scale = selected ? 1.12 + pulse * 0.07 : 0.96 + pulse * 0.05;
    entry.halo.scale.setScalar(scale);
    if (style !== 'dragon-tide') entry.ring.scale.setScalar(scale);
    entry.arc.scale.setScalar(1 + pulse * 0.08);
    entry.glow.scale.set(
      selected ? 2.28 + pulse * 0.22 : 1.9 + pulse * 0.18,
      selected ? 2.6 + pulse * 0.28 : 2.15 + pulse * 0.2,
      1,
    );
  }

  return {
    update(records, now, state = null) {
      const t = reduced ? 0 : now / 1000;
      const active = records.filter((record) => record.emblemActive);
      const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3.1);

      while (slots.length < active.length) slots.push(slotEntry());
      for (let i = 0; i < slots.length; i++) {
        const entry = slots[i];
        const record = active[i];
        entry.group.visible = !!record;
        if (!record) continue;

        const emblemId = record.emblemId || EMBLEM_ID;
        const visual = emblemVisualFor(emblemId);
        const selected = !!record.emblemSelected;

        entry.group.position.set(record.root.position.x, 0, record.root.position.z);
        tintEntry(entry, visual, selected, pulse);
        animateSilhouette(entry, visual.auraStyle, t, pulse, selected);

        const attr = entry.geometry.getAttribute('position');
        updatePointsPattern(attr.array, t, visual.auraStyle, reduced);
        attr.needsUpdate = true;
      }

      const veinActive = !!state?.dragonVein;
      dragonVein.domain.visible = veinActive;
      if (veinActive) {
        dragonVein.nodes.forEach((node, idx) => {
          node.outer.rotation.z = t * (idx === 1 ? -0.7 : 0.55);
          node.inner.rotation.z = -t * (idx === 1 ? 1.1 : 0.9);
          node.outerMat.opacity = 0.56 + pulse * 0.24;
          node.innerMat.opacity = 0.4 + pulse * 0.2;
        });
      }

      runtime.active = active.length;
      runtime.dragonVein = veinActive;
      runtime.styles = [...new Set(active.map((record) => record.emblemId || EMBLEM_ID))];
      runtime.activeEmblems = active.map((record) => {
        const emblemId = record.emblemId || EMBLEM_ID;
        const visual = emblemVisualFor(emblemId);
        return {
          id: record.id,
          emblemId,
          style: visual.auraStyle,
          color: visual.primary,
        };
      });

      return !reduced && (active.length > 0 || veinActive);
    },
    status() {
      return {
        active: runtime.active,
        layers: runtime.active ? 7 : 0,
        dragonVein: runtime.dragonVein,
        styles: [...runtime.styles],
        activeEmblems: runtime.activeEmblems.map((item) => ({ ...item })),
      };
    },
  };
}

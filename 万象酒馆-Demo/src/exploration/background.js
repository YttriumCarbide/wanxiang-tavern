import * as THREE from 'three';

/** A single equal-angle strip supplies every horizontal direction at one camera origin. */
export function createExplorationBackground(resources, definition, panorama, band) {
  if (!band) {
    return resources.track(
      new THREE.MeshBasicMaterial({ map: panorama, side: THREE.BackSide, toneMapped: false }),
    );
  }
  band.wrapS = THREE.RepeatWrapping;
  panorama.wrapS = THREE.RepeatWrapping;
  return resources.track(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      toneMapped: false,
      uniforms: {
        uPanorama: { value: panorama },
        uBand: { value: band },
        uEye: { value: new THREE.Vector3(...definition.eye) },
        uHalfLatitude: { value: definition.bandHalfLatitude ?? Math.PI / 3 },
      },
      vertexShader: `
        uniform vec3 uEye;
        varying vec3 vDirection;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vDirection = world.xyz - uEye;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform sampler2D uPanorama;
        uniform sampler2D uBand;
        uniform float uHalfLatitude;
        varying vec3 vDirection;
        void main() {
          vec3 direction = normalize(vDirection);
          float longitude = atan(direction.x, -direction.z) / 6.28318531 + 0.5;
          float latitude = asin(clamp(direction.y, -1.0, 1.0));
          float vertical = clamp(latitude / (2.0 * uHalfLatitude) + 0.5, 0.0, 1.0);
          vec4 color = texture2D(uBand, vec2(longitude, vertical));
          float border = min(longitude, 1.0 - longitude);
          float wrap = (1.0 - smoothstep(0.0, 0.006, border)) * 0.5;
          color = mix(color, texture2D(uBand, vec2(1.0 - longitude, vertical)), wrap);
          float pole = smoothstep(uHalfLatitude - 0.07, uHalfLatitude, abs(latitude));
          vec4 cap = texture2D(uPanorama, vec2(longitude, latitude / 3.14159265 + 0.5));
          gl_FragColor = mix(color, cap, pole);
          #include <colorspace_fragment>
        }
      `,
    }),
  );
}

// Big church billboards on Herbert Macaulay Way, high above the walkway on two posts, with
// programme posters (src/map/posters.js). The first one shows players' booked "yaba" adverts.
import * as THREE from 'three';
import { drawPoster } from '../map/posters.js';

/** [x, z, rotY, poster] — fronts face the road. */
const BOARDS = [
  [-34, -8.2, 0, { title: 'HOLY GHOST NIGHT', sub: 'Friday · 10pm · Grace Assembly', church: 'Grace Assembly, Yaba', theme: 'fire', motif: 'flame' }],
  [40, -8.2, 0, { title: 'SONGS OF ZION', sub: 'Choir concert · Sunday 4pm', church: 'Grace Assembly, Yaba', theme: 'purple', motif: 'mic' }],
  [-68, 8.3, Math.PI, { title: 'YOU ARE WELCOME', sub: 'Sunday 9am · Herbert Macaulay Way', church: 'Grace Assembly, Yaba', theme: 'royal', motif: 'cross' }],
];

/**
 * @param {THREE.Object3D} root
 * @param {{cylinder?: Function}} [W] builder state, to add colliders for the posts (optional)
 */
export function createStreetBillboards(root, collide) {
  const group = new THREE.Group();
  group.name = 'world:billboards';
  root.add(group);
  const faces = [];
  const frameMat = new THREE.MeshStandardMaterial({ color: '#2f3237', roughness: 0.6, metalness: 0.4 });
  const W = 7.2, H = 3.15, Y = 6.4;
  for (const [x, z, ry, poster] of BOARDS) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 224;
    const g = c.getContext('2d');
    drawPoster(g, 0, 0, 512, 224, poster);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.rotation.y = ry;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H).translate(0, Y, 0.11), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12 }));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, H + 0.3, 0.2).translate(0, Y, 0), frameMat);
    frame.castShadow = true;
    b.add(face, frame);
    for (const sx of [-2.4, 2.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, Y - H / 2, 8).translate(sx, (Y - H / 2) / 2, 0), frameMat);
      post.castShadow = true;
      b.add(post);
      const wx = x + Math.cos(ry) * sx, wz = z - Math.sin(ry) * sx;
      collide?.(wx, wz, 0.2, Y);
    }
    // two lamps that light the poster at night
    for (const sx of [-2.2, 2.2]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5).translate(sx, Y + H / 2 + 0.25, 0.55), new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
      b.add(lamp);
    }
    group.add(b);
    faces.push({ face, g, tex, poster });
  }
  return {
    group,
    /** Night: posters glow (their lamps are on). */
    setNight(k) { for (const f of faces) f.face.material.emissiveIntensity = 0.12 + k * 0.75; },
    /** A player's booked "yaba" advert replaces the first poster for its week. */
    setAds(ads = []) {
      const ad = ads.find((a) => a.spot === 'yaba');
      const f = faces[0];
      drawPoster(f.g, 0, 0, 512, 224, ad ? { ...ad, booked: true } : f.poster);
      f.tex.needsUpdate = true;
    },
  };
}

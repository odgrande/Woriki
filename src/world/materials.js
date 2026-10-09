// Material library for the map. Tiling materials take UVs in metres (texture.repeat = 1/tile size);
// most are tinted per vertex so one material serves many paint colours.
import * as THREE from 'three';

function repeatTex(t, size) {
  if (!t) return t;
  t.repeat.set(1 / size[0], 1 / size[1]);
  return t;
}

/**
 * @param {Record<string, any>} T textures from createTextures
 * @param {{ map: THREE.Texture }} screen lyrics screen texture
 * @returns {Record<string, THREE.Material>}
 */
export function createMaterials(T, screen) {
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const tiled = (name, o = {}) => {
    const t = T[name];
    return std({ map: repeatTex(t.map, t.size), normalMap: repeatTex(t.normalMap, t.size) || null, ...o });
  };
  const m = {
    ground: tiled('laterite', { roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) }),
    asphalt: tiled('asphalt', { roughness: 0.93, normalScale: new THREE.Vector2(0.7, 0.7) }),
    concrete: tiled('concrete', { roughness: 0.9 }),
    pavers: tiled('pavers', { roughness: 0.85 }),
    plaster: tiled('plaster', { roughness: 0.92, normalScale: new THREE.Vector2(0.6, 0.6) }),
    roof: tiled('zinc', { roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide }),
    tiles: tiled('tiles', { roughness: 0.28, normalScale: new THREE.Vector2(0.4, 0.4) }),
    ceiling: tiled('ceiling', { roughness: 0.6 }),
    carpet: tiled('carpet', { roughness: 1 }),
    wood: tiled('wood', { roughness: 0.62 }),
    fabric: tiled('fabric', { roughness: 0.95, side: THREE.DoubleSide }),
    metal: tiled('metal', { roughness: 0.55, metalness: 0.45 }),
    bark: tiled('bark', { roughness: 0.95 }),
    plastic: std({ roughness: 0.42 }),
    paint: std({ roughness: 0.32, metalness: 0.25 }),
    rubber: std({ roughness: 0.9, color: '#ffffff' }),
    glass: std({ roughness: 0.08, metalness: 0.6, color: '#ffffff', side: THREE.DoubleSide }),
    water: std({ roughness: 0.12, metalness: 0.1, color: '#ffffff' }),
    signs: std({ map: T.signs.map, alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide }),
    props: std({ map: T.props.map, roughness: 0.6 }),
    grille: std({ map: T.grille.map, alphaTest: 0.5, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide }),
    foliage: std({ map: T.foliage.map, alphaTest: 0.45, roughness: 0.85, side: THREE.DoubleSide }),
    lamp: new THREE.MeshBasicMaterial({ color: '#fffbea', vertexColors: true }),
    screen: new THREE.MeshBasicMaterial({ map: screen.map, toneMapped: false }),
  };
  m.foliage.shadowSide = THREE.DoubleSide;
  m.grille.shadowSide = THREE.DoubleSide;
  for (const [k, v] of Object.entries(m)) v.name = 'world:' + k;
  return m;
}

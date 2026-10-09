// Builds the game's character assets from CC0 sources.
//
//   npm run assets
//
// Sources (all CC0 1.0, by Quaternius — https://quaternius.com):
//   - Universal Base Characters [Standard]: bodies, hair, eyebrows
//   - Universal Animation Library 1 & 2 [Standard]: animation clips
// They are downloaded from GitHub mirrors into tools/.cache (gitignored),
// then compressed for phones into public/assets/characters.

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, textureCompress, meshopt, weld, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'tools', '.cache');
const OUT = join(ROOT, 'public', 'assets', 'characters');

const UBC = 'https://raw.githubusercontent.com/aaroohhiiii/ggj/main/Universal%20Base%20Characters%5BStandard%5D';
const UBC_BODY = `${UBC}/Base%20Characters/Godot%20-%20UE`;
const UBC_HAIR = `${UBC}/Hairstyles/Rigged%20to%20Head%20Bone/glTF%20(Godot%20-Unreal)`;
const UAL = 'https://raw.githubusercontent.com/EspacioKoop/expediente-legado/main/godot/assets/cc0/quaternius_ual';

const BODIES = ['Superhero_Male_FullBody', 'Superhero_Female_FullBody'];
const HAIR = ['Hair_Buzzed', 'Hair_BuzzedFemale', 'Hair_Buns', 'Hair_Long', 'Hair_SimpleParted', 'Hair_Beard', 'Eyebrows_Regular', 'Eyebrows_Female'];

// Clips the game uses. Everything else in the libraries is dropped.
const CLIPS = {
  UAL1_Standard: [
    'Idle_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop',
    'Jump_Start', 'Jump_Loop', 'Jump_Land',
    'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Exit', 'Sitting_Talking_Loop',
    'Idle_Talking_Loop', 'Dance_Loop', 'Fixing_Kneeling', 'Interact', 'PickUp_Table',
    'Crouch_Idle_Loop', 'Driving_Loop',
  ],
  UAL2_Standard: [
    'Idle_FoldArms_Loop', 'Idle_TalkingPhone_Loop', 'Yes', 'Idle_No_Loop',
    'Walk_Carry_Loop', 'Consume', 'LayToIdle',
  ],
};

const exists = (p) => access(p).then(() => true, () => false);

async function fetchTo(url, path) {
  if (await exists(path)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  console.log('downloaded', url.split('/').pop());
}

// Download a .gltf and every buffer/image it references.
async function fetchGltf(base, name) {
  const dir = join(CACHE, 'ubc');
  const gltfPath = join(dir, `${name}.gltf`);
  await fetchTo(`${base}/${name}.gltf`, gltfPath);
  const json = JSON.parse(await readFile(gltfPath, 'utf8'));
  const uris = [...(json.buffers || []), ...(json.images || [])].map((x) => x.uri).filter((u) => u && !u.startsWith('data:'));
  for (const uri of uris) {
    // Two images are referenced with a stray "_png" suffix in the source pack; fall back to the real file.
    const candidates = [uri, uri.replace('_png.png', '.png')];
    let ok = false;
    for (const c of candidates) {
      try { await fetchTo(`${base}/${encodeURIComponent(c)}`, join(dir, c)); ok = true; break; } catch { /* try next */ }
    }
    if (!ok) console.warn('missing in source pack:', uri);
  }
  return gltfPath;
}

// Rewrite image references to files that exist, and drop textures that don't.
async function repairGltf(path) {
  const dir = dirname(path);
  const json = JSON.parse(await readFile(path, 'utf8'));
  const missing = new Set();
  for (const [i, img] of (json.images || []).entries()) {
    if (await exists(join(dir, img.uri))) continue;
    const alt = img.uri.replace('_png.png', '.png');
    if (await exists(join(dir, alt))) img.uri = alt;
    else missing.add(i);
  }
  if (missing.size) {
    const badTex = new Set((json.textures || []).map((t, i) => (missing.has(t.source) ? i : -1)).filter((i) => i >= 0));
    for (const m of json.materials || []) {
      for (const slot of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) if (m[slot] && badTex.has(m[slot].index)) delete m[slot];
      const pbr = m.pbrMetallicRoughness || {};
      for (const slot of ['baseColorTexture', 'metallicRoughnessTexture']) if (pbr[slot] && badTex.has(pbr[slot].index)) delete pbr[slot];
    }
  }
  const fixed = path.replace('.gltf', '.fixed.gltf');
  await writeFile(fixed, JSON.stringify(json));
  return fixed;
}

async function compressTextures(doc) {
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(baseColor)/, resize: [1024, 1024], quality: 82 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(normal|metallicRoughness|occlusion)/, resize: [512, 512], quality: 80 }),
  );
}

// Low-detail crowd bodies: body mesh only, no UVs/normals/textures (the game colours
// them per vertex region and recomputes normals), welded and simplified to ~1.4k triangles.
// Skin weights and the skeleton are kept, so the same clips and garment builder work.
async function buildLods(io) {
  for (const name of BODIES) {
    const src = await repairGltf(await fetchGltf(UBC_BODY, name));
    const doc = await io.read(src);
    const root = doc.getRoot();
    for (const node of root.listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      if (/eye/i.test(node.getName())) { node.setMesh(null); mesh.dispose(); continue; }
      for (const prim of mesh.listPrimitives()) {
        for (const sem of prim.listSemantics()) if (!/^(POSITION|JOINTS_0|WEIGHTS_0)$/.test(sem)) prim.setAttribute(sem, null);
        prim.setMaterial(null);
      }
    }
    for (const m of root.listMaterials()) m.dispose();
    for (const t of root.listTextures()) t.dispose();
    await doc.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: 0.11, error: 0.02 }),
      prune(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const tris = root.listMeshes().reduce((t, m) => t + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() || 0) / 3, 0), 0);
    const out = join(OUT, `${name.replace('Superhero_', '').replace('_FullBody', '').toLowerCase()}_low.glb`);
    await io.write(out, doc);
    console.log('wrote', out.replace(ROOT + '/', ''), `(${tris} tris)`);
  }
}

async function main() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
  await mkdir(OUT, { recursive: true });
  if (process.argv.includes('--lod-only')) { await buildLods(io); return; }
  await fetchTo(`${UBC}/License_Standard.txt`, join(CACHE, 'ubc', 'License_Standard.txt'));

  for (const name of [...BODIES, ...HAIR]) {
    const src = await repairGltf(await fetchGltf(BODIES.includes(name) ? UBC_BODY : UBC_HAIR, name));
    const doc = await io.read(src);
    await compressTextures(doc);
    await doc.transform(dedup(), weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const out = join(OUT, `${name.replace('Superhero_', '').replace('_FullBody', '').toLowerCase()}.glb`);
    await io.write(out, doc);
    console.log('wrote', out.replace(ROOT + '/', ''));
  }

  for (const [file, keep] of Object.entries(CLIPS)) {
    const src = join(CACHE, 'ual', `${file}.glb`);
    await fetchTo(`${UAL}/${file}.glb`, src);
    const doc = await io.read(src);
    const root = doc.getRoot();
    const found = new Set();
    for (const anim of root.listAnimations()) {
      if (keep.includes(anim.getName())) { found.add(anim.getName()); continue; }
      // Dispose samplers and channels too, so their keyframe data becomes unreferenced.
      for (const ch of anim.listChannels()) ch.dispose();
      for (const sm of anim.listSamplers()) sm.dispose();
      anim.dispose();
    }
    const lost = keep.filter((k) => !found.has(k));
    if (lost.length) throw new Error(`${file}: clips not found: ${lost.join(', ')}`);
    // Animation-only file: drop the mannequin mesh and its textures, keep the skeleton nodes.
    for (const node of root.listNodes()) node.setMesh(null);
    for (const mesh of root.listMeshes()) mesh.dispose();
    for (const tex of root.listTextures()) tex.dispose();
    // Data left behind by the dropped clips is only referenced by the document root; prune() misses it.
    for (const acc of root.listAccessors()) if (acc.listParents().every((p) => p === root)) acc.dispose();
    await doc.transform(resample(), prune({ keepLeaves: true, keepAttributes: false }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const out = join(OUT, `anims_${file.startsWith('UAL1') ? '1' : '2'}.glb`);
    await io.write(out, doc);
    console.log('wrote', out.replace(ROOT + '/', ''), `(${found.size} clips)`);
  }

  await buildLods(io);

  await writeFile(join(OUT, 'LICENSE.txt'), [
    'Character models, hair and animations in this folder are CC0 1.0 (public domain) by Quaternius.',
    'https://quaternius.com — Universal Base Characters [Standard] and Universal Animation Library 1 & 2 [Standard].',
    'https://creativecommons.org/publicdomain/zero/1.0/',
    'Processed (texture resize/WebP, meshopt compression, clip selection, simplified *_low.glb crowd bodies) by tools/build-assets.mjs.',
    '',
  ].join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });

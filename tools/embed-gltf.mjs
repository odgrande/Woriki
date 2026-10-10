// Converts every .glb in a folder into a self-contained JSON glTF (<name>.gltf.json, buffers and
// images embedded as data URIs) for static hosts that refuse binary model files.
// Usage: node tools/embed-gltf.mjs <folder>   (then build with VITE_GLTF_JSON=1)
import { readdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/embed-gltf.mjs <folder>'); process.exit(1); }
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

for (const f of (await readdir(dir)).filter((n) => n.endsWith('.glb'))) {
  const doc = await io.read(join(dir, f));
  const { json, resources } = await io.writeJSON(doc, { format: 'gltf' });
  const toData = (uri, mime) => `data:${mime};base64,${Buffer.from(resources[uri]).toString('base64')}`;
  for (const b of json.buffers || []) if (b.uri && resources[b.uri]) b.uri = toData(b.uri, 'application/octet-stream');
  for (const im of json.images || []) if (im.uri && resources[im.uri]) im.uri = toData(im.uri, im.mimeType || 'image/webp');
  const out = join(dir, f.replace(/\.glb$/, '.gltf.json'));
  await writeFile(out, JSON.stringify(json));
  await unlink(join(dir, f));
  console.log(f, '→', out.split('/').pop());
}

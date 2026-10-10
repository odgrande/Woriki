// Converts every .glb in a folder into <name>.glb.json = {"glb": "<base64>"} for static hosts that
// refuse binary model files and block data: URLs and WebAssembly (strict Content-Security-Policy).
// Meshopt compression is decoded here, so the browser needs no WASM decoder.
// Usage: node tools/embed-gltf.mjs <folder>   (then build with VITE_GLTF_JSON=1)
import { readdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/embed-gltf.mjs <folder>'); process.exit(1); }
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

for (const f of (await readdir(dir)).filter((n) => n.endsWith('.glb'))) {
  const doc = await io.read(join(dir, f));
  for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
  const bytes = await io.writeBinary(doc);
  const out = join(dir, f.replace(/\.glb$/, '.glb.json'));
  await writeFile(out, JSON.stringify({ glb: Buffer.from(bytes).toString('base64') }));
  await unlink(join(dir, f));
  console.log(f, '→', out.split('/').pop(), `${Math.round(bytes.length / 1024)} KB`);
}

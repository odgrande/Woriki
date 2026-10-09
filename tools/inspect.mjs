import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const r = doc.getRoot();
  let animBytes = 0, keys = 0;
  for (const a of r.listAnimations()) for (const s of a.listSamplers()) { animBytes += s.getOutput().getByteLength() + s.getInput().getByteLength(); keys += s.getInput().getCount(); }
  console.log(f.split('/').pop(), {
    meshes: r.listMeshes().length, skins: r.listSkins().length, joints: r.listSkins().map(s=>s.listJoints().length),
    textures: r.listTextures().map(t => `${t.getMimeType()} ${t.getImage()?.byteLength}`),
    anims: r.listAnimations().length, animKB: Math.round(animBytes/1024), keys,
    skinnedNodes: r.listNodes().filter(n => n.getSkin()).map(n => n.getName()),
    tris: r.listMeshes().reduce((t,m)=>t+m.listPrimitives().reduce((a,p)=>a+(p.getIndices()?.getCount()||0)/3,0),0),
  });
}

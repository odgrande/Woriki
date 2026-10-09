// Tiny stand-in for src/engine/physics.js: records colliders so the world harness can run alone.
export function createStubPhysics() {
  const boxes = [];
  const cylinders = [];
  let ground = () => 0;
  return {
    boxes, cylinders, blockers: [],
    addBox(min, max, opts = {}) { boxes.push({ min: min.clone(), max: max.clone(), kind: opts.kind }); },
    addCylinder(center, radius, height) { cylinders.push({ center: center.clone(), radius, height }); },
    setGround(fn) { ground = fn; },
    groundHeight(x, z) { return ground(x, z); },
    moveCapsule(position, delta) { return position.clone().add(delta); },
  };
}

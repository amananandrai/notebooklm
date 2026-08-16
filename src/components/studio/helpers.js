import * as THREE from 'three';

// ================================================================
// GENERIC HELPERS
// ================================================================

function addMesh(parent, geometry, material, position, rotation = null, scale = null) {
  const mesh = new THREE.Mesh(geometry, material);

  if (position) mesh.position.copy(position);
  if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  if (scale) mesh.scale.copy(scale);

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  parent.add(mesh);
  return mesh;
}

function createBox(parent, size, material, position, rotation = null) {
  return addMesh(
    parent,
    new THREE.BoxGeometry(size.x, size.y, size.z),
    material,
    position,
    rotation
  );
}

function createCylinder(parent, radiusTop, radiusBottom, height, material, position) {
  return addMesh(
    parent,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 20),
    material,
    position
  );
}

export { addMesh, createBox, createCylinder };

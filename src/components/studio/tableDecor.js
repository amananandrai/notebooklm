import * as THREE from 'three';
import { MAT, rand } from './materials.js';
import { addMesh, createCylinder } from './helpers.js';
import { createDetailedBook } from './shelves.js';

export function createTableDecor(scene) {
  const decor = new THREE.Group();
  decor.position.set(0, 0.73, 0.55); // On top of desk surface

  // 1. Matte Black Ceramic Coffee Mugs with C-handles
  function createStudioMug(x, z, rotY) {
    const mug = new THREE.Group();
    mug.position.set(x, 0, z);
    mug.rotation.y = rotY;

    // Body
    createCylinder(mug, 0.042, 0.04, 0.095, MAT.blackMug, new THREE.Vector3(0, 0.048, 0));
    
    // Coffee liquid inside
    const coffeeMat = new THREE.MeshStandardMaterial({ color: '#160d07', roughness: 0.15 });
    addMesh(mug, new THREE.CircleGeometry(0.038, 16), coffeeMat, new THREE.Vector3(0, 0.088, 0), new THREE.Euler(-Math.PI / 2, 0, 0));

    // Handle
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.024, 0.007, 8, 16, Math.PI * 1.1),
      MAT.blackMug
    );
    handle.position.set(0.045, 0.05, 0);
    handle.rotation.z = Math.PI / 2;
    mug.add(handle);

    decor.add(mug);
    return mug;
  }

  createStudioMug(-0.55, 0.25, 0.4);
  createStudioMug(0.55, 0.25, -0.3);

  // 2. Low-Profile Ceramic Succulent Dish (Center of Desk)
  const dishGroup = new THREE.Group();
  dishGroup.position.set(0, 0, -0.05);

  // White ceramic bowl
  createCylinder(dishGroup, 0.11, 0.085, 0.055, MAT.ceramic, new THREE.Vector3(0, 0.028, 0));
  // Soil
  addMesh(dishGroup, new THREE.CircleGeometry(0.105, 20), MAT.soil, new THREE.Vector3(0, 0.053, 0), new THREE.Euler(-Math.PI / 2, 0, 0));

  // Layered fleshy succulent leaves
  const succulentMat = new THREE.MeshPhysicalMaterial({
    color: '#38573D',
    roughness: 0.35,
    clearcoat: 0.2,
    sheen: 0.25
  });

  for (let ring = 0; ring < 3; ring++) {
    const leafCount = 6 + ring * 2;
    const ringRadius = 0.02 + ring * 0.025;
    const leafSize = 0.04 - ring * 0.006;
    const elev = 0.055 + ring * 0.015;

    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2 + ring * 0.4;
      const petal = new THREE.Mesh(
        new THREE.SphereGeometry(leafSize, 8, 8),
        succulentMat
      );
      petal.scale.set(0.5, 0.25, 1.2);
      petal.position.set(
        Math.cos(angle) * ringRadius,
        elev,
        Math.sin(angle) * ringRadius
      );
      petal.rotation.set(0.3 + ring * 0.1, -angle + Math.PI / 2, 0);
      dishGroup.add(petal);
    }
  }
  decor.add(dishGroup);

  // 3. Stack of Slim Dark Notebooks
  createDetailedBook(decor, new THREE.Vector3(-0.15, 0.02, 0.15), '#1d222b', 0, 0.04, 0.22, 0.28);
  createDetailedBook(decor, new THREE.Vector3(-0.14, 0.055, 0.16), '#2b1a15', 0.08, 0.035, 0.20, 0.26);

  scene.add(decor);
  return decor;
}

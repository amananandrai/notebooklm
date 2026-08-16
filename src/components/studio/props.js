import * as THREE from 'three';
import { MAT, rand } from './materials.js';
import { addMesh, createBox, createCylinder } from './helpers.js';

// ================================================================
// DECORATIVE GLOBE ON BRASS STAND
// ================================================================
export function createGlobe(parent, position) {
  const globe = new THREE.Group();
  globe.position.copy(position);

  // Walnut circular base
  createCylinder(globe, 0.075, 0.085, 0.025, MAT.walnutWood, new THREE.Vector3(0, 0.012, 0));
  
  // Brass spindle mount
  createCylinder(globe, 0.01, 0.01, 0.08, MAT.brushedMetal, new THREE.Vector3(0, 0.06, 0));

  // Brass semicircular gimbal ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.008, 12, 36, Math.PI * 1.1),
    MAT.brushedMetal
  );
  ring.rotation.z = Math.PI / 2;
  ring.position.y = 0.17;
  globe.add(ring);

  // Tilted Globe Sphere with procedural earth oceans & continents texture
  const sphereGeo = new THREE.SphereGeometry(0.095, 32, 32);
  const globeMat = new THREE.MeshStandardMaterial({
    color: '#2a4459',
    roughness: 0.5,
    metalness: 0.1
  });
  const sphere = new THREE.Mesh(sphereGeo, globeMat);
  sphere.position.y = 0.17;
  sphere.rotation.z = 0.41; // 23.5 degree axial tilt
  globe.add(sphere);

  globe.rotation.y = 0.35;
  parent.add(globe);
  return globe;
}

// ================================================================
// VINTAGE EDISON GLASS CLOCHE LAMP (Shelf Prop)
// ================================================================
export function createLamp(parent, position) {
  const lamp = new THREE.Group();
  lamp.position.copy(position);

  // Walnut wood base
  createCylinder(lamp, 0.07, 0.08, 0.025, MAT.walnutWood, new THREE.Vector3(0, 0.012, 0));

  // Brass inner socket
  createCylinder(lamp, 0.02, 0.02, 0.04, MAT.brushedMetal, new THREE.Vector3(0, 0.04, 0));

  // Glowing filament inside
  const filament = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8),
    MAT.edisonBulb
  );
  filament.position.y = 0.08;
  lamp.add(filament);

  // Glass cloche dome
  const dome = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.16, 24, 1, false),
    new THREE.MeshPhysicalMaterial({
      color: '#FFEEDD',
      transmission: 0.9,
      transparent: true,
      opacity: 0.35,
      roughness: 0.08
    })
  );
  dome.position.y = 0.10;
  lamp.add(dome);

  // Local warm point light
  const light = new THREE.PointLight(0xFFAA44, 0.8, 1.8, 1.5);
  light.position.y = 0.09;
  lamp.add(light);

  parent.add(lamp);
  return lamp;
}

// ================================================================
// CERAMIC VASE WITH BOTANICAL TWIGS
// ================================================================
export function createDecorativeVase(parent, position) {
  const vase = new THREE.Group();
  vase.position.copy(position);

  // Matte charcoal ribbed vase body
  createCylinder(vase, 0.045, 0.065, 0.18, MAT.ceramicDark, new THREE.Vector3(0, 0.09, 0));
  createCylinder(vase, 0.025, 0.045, 0.06, MAT.ceramicDark, new THREE.Vector3(0, 0.21, 0));

  // Brass neck accent
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 24), MAT.brushedMetal);
  ring.position.y = 0.19;
  ring.rotation.x = Math.PI / 2;
  vase.add(ring);

  parent.add(vase);
  return vase;
}

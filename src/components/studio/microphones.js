import * as THREE from 'three';
import { MAT } from './materials.js';

export function createMic(scene, x, z, rotY, targetLookAtX = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0.73, z); // Clamped onto desk surface
  group.rotation.y = rotY;

  // 1. Heavy Heavy Duty Desk C-Clamp Base
  const clampMat = new THREE.MeshStandardMaterial({ color: '#0b0d10', roughness: 0.4, metalness: 0.8 });
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.09), clampMat);
  clamp.position.set(0, -0.02, 0.35);
  group.add(clamp);

  const clampKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.04, 12), clampMat);
  clampKnob.position.set(0, -0.06, 0.35);
  group.add(clampKnob);

  // 2. Articulated Scissor Boom Arms (Dual segment broadcast arm)
  // Lower segment
  const lowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.38, 0.02), clampMat);
  lowerArm.position.set(0, 0.16, 0.24);
  lowerArm.rotation.x = Math.PI / 4.8;
  group.add(lowerArm);

  // Elbow Joint Knob
  const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 16), MAT.brushedMetal);
  elbow.rotation.z = Math.PI / 2;
  elbow.position.set(0, 0.34, 0.12);
  group.add(elbow);

  // Upper segment (reaching toward host)
  const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.36, 0.018), clampMat);
  upperArm.position.set(0, 0.46, -0.02);
  upperArm.rotation.x = -Math.PI / 6.5;
  group.add(upperArm);

  // 3. Shure SM7B Yoke Mount & Tension Knobs
  const yokeJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12), MAT.brushedMetal);
  yokeJoint.rotation.z = Math.PI / 2;
  yokeJoint.position.set(0, 0.58, -0.15);
  group.add(yokeJoint);

  const yoke = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.007, 8, 16, Math.PI * 1.2),
    clampMat
  );
  yoke.position.set(0, 0.58, -0.18);
  yoke.rotation.y = Math.PI / 2;
  group.add(yoke);

  // 4. Shure SM7B Microphone Body
  const micHead = new THREE.Group();
  micHead.position.set(0, 0.58, -0.22);
  micHead.rotation.x = Math.PI / 8; // Aimed comfortably upward toward mouth

  // Main cylindrical capsule body
  const micBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.036, 0.14, 24),
    MAT.metal
  );
  micBody.rotation.x = Math.PI / 2;
  micHead.add(micBody);

  // Dark foam / mesh windscreen
  const windscreen = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.037, 0.08, 24),
    MAT.micGrille
  );
  windscreen.position.set(0, 0, -0.09);
  windscreen.rotation.x = Math.PI / 2;
  micHead.add(windscreen);

  const roundedCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.037, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    MAT.micGrille
  );
  roundedCap.position.set(0, 0, -0.13);
  roundedCap.rotation.x = -Math.PI / 2;
  micHead.add(roundedCap);

  // Activity ring indicator
  const ledRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.037, 0.0035, 6, 24),
    new THREE.MeshStandardMaterial({ color: '#23D5FF', emissive: '#23D5FF', emissiveIntensity: 0.0 })
  );
  ledRing.position.set(0, 0, -0.045);
  micHead.add(ledRing);

  group.add(micHead);

  // 5. Draped Black XLR Cable
  const cablePoints = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    cablePoints.push(new THREE.Vector3(
      0.015 * Math.sin(t * Math.PI),
      0.58 - t * 0.60,
      -0.22 + t * 0.55
    ));
  }
  const cableCurve = new THREE.CatmullRomCurve3(cablePoints);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(cableCurve, 16, 0.005, 8, false),
    clampMat
  );
  group.add(cable);

  scene.add(group);
  return ledRing.material;
}

export function setupMicrophones(scene) {
  // Clamped at desk front edge, angled directly toward Host A and Host B
  const micMatA = createMic(scene, -0.42, 0.45, Math.PI / 4.5);
  const micMatB = createMic(scene, 0.42, 0.45, -Math.PI / 4.5);

  return { a: micMatA, b: micMatB };
}

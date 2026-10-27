import * as THREE from 'three';
import { MAT } from './materials.js';
import { DESK, SEATS, seatForward } from './layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const armMat = new THREE.MeshStandardMaterial({ color: '#0b0d10', roughness: 0.4, metalness: 0.8 });

// Cylinder spanning two points
function rod(parent, from, to, radius, material) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function joint(parent, position, radius) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), MAT.brushedMetal);
  mesh.position.copy(position);
  parent.add(mesh);
}

// Shure SM7B-style capsule; its front (windscreen) points along local +z.
function createMicHead(ledMaterial) {
  const micHead = new THREE.Group();

  const micBody = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.14, 24), MAT.metal);
  micBody.rotation.x = Math.PI / 2;
  micBody.castShadow = true;
  micHead.add(micBody);

  const windscreen = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.037, 0.08, 24), MAT.micGrille);
  windscreen.position.z = 0.09;
  windscreen.rotation.x = Math.PI / 2;
  micHead.add(windscreen);

  const roundedCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.037, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    MAT.micGrille
  );
  roundedCap.position.z = 0.13;
  roundedCap.rotation.x = Math.PI / 2;
  micHead.add(roundedCap);

  // Activity ring indicator
  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.0035, 6, 24), ledMaterial);
  ledRing.position.z = 0.045;
  micHead.add(ledRing);

  // Yoke mount wrapping the rear of the body
  const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 8, 16, Math.PI), armMat);
  yoke.rotation.set(0, Math.PI / 2, Math.PI / 2);
  yoke.position.z = -0.02;
  micHead.add(yoke);

  return micHead;
}

// A desk-clamped boom arm whose capsule sits just in front of, below and
// slightly outboard of the host's mouth, aimed straight at it.
function createMic(scene, color) {
  const ledMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.0 });
  const group = new THREE.Group();
  scene.add(group);

  function aim(mouth, forward, outward) {
    group.clear();

    const micCenter = mouth.clone()
      .addScaledVector(forward, 0.2)
      .addScaledVector(outward, 0.09)
      .add(new THREE.Vector3(0, -0.13, 0));

    const micHead = createMicHead(ledMaterial);
    micHead.position.copy(micCenter);
    micHead.lookAt(mouth);
    group.add(micHead);

    const axis = new THREE.Vector3().subVectors(mouth, micCenter).normalize();
    const mount = micCenter.clone().addScaledVector(axis, -0.09);

    // Clamp on the back edge of the desk, in front of the host
    const deskBackZ = DESK.z - DESK.depth / 2;
    const base = new THREE.Vector3(mount.x + outward.x * 0.08, DESK.topY, deskBackZ + 0.07);
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.08), armMat);
    clamp.position.copy(base).add(new THREE.Vector3(0, 0.025, 0));
    group.add(clamp);

    const riserTop = base.clone().add(new THREE.Vector3(0, 0.12, 0));
    const elbow = riserTop.clone().lerp(mount, 0.45).add(new THREE.Vector3(0, 0.16, 0)).addScaledVector(outward, 0.05);
    rod(group, base, riserTop, 0.012, armMat);
    rod(group, riserTop, elbow, 0.01, armMat);
    rod(group, elbow, mount, 0.009, armMat);
    joint(group, riserTop, 0.018);
    joint(group, elbow, 0.02);
    joint(group, mount, 0.014);

    // XLR cable sagging from the mic back down to the clamp
    const sag = mount.clone().lerp(base, 0.5).add(new THREE.Vector3(0, -0.05, -0.03));
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([mount, sag, base]), 16, 0.005, 8, false),
      armMat
    );
    group.add(cable);
  }

  return { ledMaterial, aim };
}

// Direction pointing away from the partner, perpendicular to the host's facing.
function outwardFor(key, forward) {
  const sign = key === 'a' ? -1 : 1; // host A sits on the left, host B on the right
  return new THREE.Vector3(sign * forward.z, 0, -sign * forward.x);
}

export function setupMicrophones(scene, colors) {
  const mics = {};
  ['a', 'b'].forEach((key) => {
    const mic = createMic(scene, colors[key]);
    const seat = SEATS[key];
    const f = seatForward(seat);
    const forward = new THREE.Vector3(f.x, 0, f.z);
    const outward = outwardFor(key, forward);
    // Provisional aim until the avatar loads and reports its real mouth position
    mic.aim(new THREE.Vector3(seat.x + f.x * 0.1, 1.12, seat.z + f.z * 0.1), forward, outward);
    mics[key] = {
      ledMaterial: mic.ledMaterial,
      aimAt: (mouth) => mic.aim(mouth, forward, outward)
    };
  });

  return {
    a: mics.a.ledMaterial,
    b: mics.b.ledMaterial,
    aimAt: { a: mics.a.aimAt, b: mics.b.aimAt }
  };
}

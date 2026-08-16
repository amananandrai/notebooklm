import * as THREE from 'three';
import { MAT } from './materials.js';

export function createChair(scene, x, accent = null, rotY = 0) {
  const chair = new THREE.Group();
  chair.position.set(x, 0, 0.55);
  chair.rotation.y = rotY;

  const frameMat = MAT.metal;
  const woodArmMat = MAT.warmWoodArmrest;
  const cushionMat = MAT.chairCushion;

  // 1. Thick Padded Leather Seat Cushion
  const seatGeo = new THREE.BoxGeometry(0.64, 0.12, 0.58, 2, 2, 2);
  const seat = new THREE.Mesh(seatGeo, cushionMat);
  seat.position.set(0, 0.42, 0);
  seat.castShadow = true;
  seat.receiveShadow = true;
  chair.add(seat);

  // Seat stitching lines
  for (let i = -1; i <= 1; i++) {
    const stitch = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.005, 0.52),
      new THREE.MeshStandardMaterial({ color: '#090a0c', roughness: 0.9 })
    );
    stitch.position.set(i * 0.18, 0.482, 0);
    chair.add(stitch);
  }

  // 2. Thick Padded Backrest Cushion
  const backGeo = new THREE.BoxGeometry(0.62, 0.72, 0.12, 2, 4, 1);
  const back = new THREE.Mesh(backGeo, cushionMat);
  back.position.set(0, 0.82, -0.25);
  back.rotation.x = 0.18; // Comfortable ergonomic recline
  back.castShadow = true;
  chair.add(back);

  // 3. Warm Wood-Topped Armrests
  [-0.34, 0.34].forEach((armX) => {
    // Metal vertical arm supports
    const armPostFront = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.26, 12), frameMat);
    armPostFront.position.set(armX, 0.54, 0.18);
    chair.add(armPostFront);

    const armPostRear = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.26, 12), frameMat);
    armPostRear.position.set(armX, 0.54, -0.18);
    chair.add(armPostRear);

    // Warm natural wood armrest plank with rounded edges
    const armPlank = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.024, 0.48),
      woodArmMat
    );
    armPlank.position.set(armX, 0.67, 0.0);
    armPlank.castShadow = true;
    chair.add(armPlank);
  });

  // 4. Sturdy Black Metal Legs with Cross Bracing
  const legPositions = [
    [-0.27, 0.22, 0.08],
    [0.27, 0.22, -0.08],
    [-0.27, -0.24, -0.08],
    [0.27, -0.24, 0.08]
  ];

  legPositions.forEach(([lx, lz, angleX]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.42, 12), frameMat);
    leg.position.set(lx, 0.21, lz);
    leg.rotation.z = lx > 0 ? -0.1 : 0.1;
    leg.rotation.x = angleX;
    leg.castShadow = true;
    chair.add(leg);

    // Brass/rubber feet glider
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.015, 12), woodArmMat);
    foot.position.set(lx * 1.05, 0.008, lz * 1.05);
    chair.add(foot);
  });

  scene.add(chair);
  return chair;
}

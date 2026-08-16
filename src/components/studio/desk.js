import * as THREE from 'three';
import { MAT } from './materials.js';

export function createPremiumDesk(scene) {
  const deskGroup = new THREE.Group();
  deskGroup.position.set(0, 0, 0.55);

  // 1. Tabletop: Heavy Architectural Beveled Top
  const topWidth = 2.4;
  const topDepth = 1.0;
  const topHeight = 0.06;

  const topShape = new THREE.Shape();
  const hw = topWidth / 2;
  const hd = topDepth / 2;
  const bevelRadius = 0.03;

  topShape.moveTo(-hw + bevelRadius, -hd);
  topShape.lineTo(hw - bevelRadius, -hd);
  topShape.quadraticCurveTo(hw, -hd, hw, -hd + bevelRadius);
  topShape.lineTo(hw, hd - bevelRadius);
  topShape.quadraticCurveTo(hw, hd, hw - bevelRadius, hd);
  topShape.lineTo(-hw + bevelRadius, hd);
  topShape.quadraticCurveTo(-hw, hd, -hw, hd - bevelRadius);
  topShape.lineTo(-hw, -hd + bevelRadius);
  topShape.quadraticCurveTo(-hw, -hd, -hw + bevelRadius, -hd);

  const extrudeSettings = {
    steps: 1,
    depth: topHeight,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 3
  };

  const topGeo = new THREE.ExtrudeGeometry(topShape, extrudeSettings);
  topGeo.center();
  const topMesh = new THREE.Mesh(topGeo, MAT.matteDesk);
  topMesh.rotation.x = Math.PI / 2;
  topMesh.position.set(0, 0.70, 0);
  topMesh.castShadow = true;
  topMesh.receiveShadow = true;
  deskGroup.add(topMesh);

  // 2. Heavy Architectural Fluted Pedestal Base
  const pedWidth = 1.15;
  const pedDepth = 0.48;
  const pedHeight = 0.65;

  // Dark central column core
  const coreMat = new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.85 });
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(pedWidth, pedHeight, pedDepth),
    coreMat
  );
  core.position.set(0, 0.33, 0);
  core.castShadow = true;
  deskGroup.add(core);

  // Vertical wooden fluted slats wrapping the front and back of the pedestal
  const slatW = 0.035;
  const slatD = 0.025;
  const countX = 20;
  const startX = -pedWidth / 2 + slatW / 2;
  const stepX = pedWidth / countX;

  for (let i = 0; i < countX; i++) {
    const xPos = startX + i * stepX;
    // Front slat
    const slatFront = new THREE.Mesh(
      new THREE.BoxGeometry(slatW, pedHeight - 0.02, slatD),
      MAT.walnutWood
    );
    slatFront.position.set(xPos, 0.33, pedDepth / 2 + slatD / 2);
    slatFront.castShadow = true;
    deskGroup.add(slatFront);

    // Back slat
    const slatBack = new THREE.Mesh(
      new THREE.BoxGeometry(slatW, pedHeight - 0.02, slatD),
      MAT.walnutWood
    );
    slatBack.position.set(xPos, 0.33, -pedDepth / 2 - slatD / 2);
    slatBack.castShadow = true;
    deskGroup.add(slatBack);
  }

  // 3. Heavy Metal Base Plate on Floor
  const basePlate = new THREE.Mesh(
    new THREE.BoxGeometry(pedWidth + 0.15, 0.025, pedDepth + 0.12),
    MAT.metal
  );
  basePlate.position.set(0, 0.015, 0);
  basePlate.receiveShadow = true;
  deskGroup.add(basePlate);

  scene.add(deskGroup);
  return deskGroup;
}

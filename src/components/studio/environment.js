import * as THREE from 'three';
import { MAT } from './materials.js';

// Procedural high-res mottled woven rug texture
function createMottledRugTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Base dark charcoal
  ctx.fillStyle = '#121418';
  ctx.fillRect(0, 0, 512, 512);

  // Mottled multi-tone fiber noise (charcoal, slate, deep navy/grey)
  const colors = ['#0c0e12', '#181b22', '#222630', '#15171d', '#282d38'];
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = 1.0 + Math.random() * 3.5;
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.globalAlpha = 0.25 + Math.random() * 0.45;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle directional fiber streaks
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#ffffff';
  for (let i = 0; i < 400; i++) {
    const y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 512, y);
    ctx.lineTo(Math.random() * 512, y + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 3);
  return texture;
}

export function setupEnvironment(scene) {
  // ── Studio Floor ──
  const floorMat = new THREE.MeshStandardMaterial({
    color: '#080a0e',
    roughness: 0.4,
    metalness: 0.15,
    envMapIntensity: 0.5
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.08;
  floor.position.z = 0.4;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── Luxury Mottled Area Rug ──
  const rugTexture = createMottledRugTexture();
  const rugMat = new THREE.MeshStandardMaterial({
    map: rugTexture,
    color: '#1a1d24',
    roughness: 0.95,
    metalness: 0.02
  });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 3.8), rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, -0.07, 0.55);
  rug.receiveShadow = true;
  scene.add(rug);

  // ── Curved/Flat Studio Backdrop Wall ──
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#080a0f',
    roughness: 0.95,
    metalness: 0.05
  });
  const wallGeo = new THREE.CylinderGeometry(14, 14, 10, 64, 1, true, -Math.PI, Math.PI);
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 4, 3);
  wall.receiveShadow = true;
  scene.add(wall);

  // ── Warm Walnut Fluted Slat Wall (Left Accent Wall) ──
  const slatGroup = new THREE.Group();
  
  // Backing panel for wood slats
  const backingMat = new THREE.MeshStandardMaterial({ color: '#100c09', roughness: 0.9 });
  const backing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.5, 0.04), backingMat);
  backing.position.set(-4.6, 2.25, -2.55);
  slatGroup.add(backing);

  // Fluted wooden vertical batons
  const slatCount = 26;
  const slatStartX = -6.3;
  const slatSpacing = 0.13;
  for (let i = 0; i < slatCount; i++) {
    const slat = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 4.5, 0.06),
      MAT.walnutWood
    );
    slat.position.set(slatStartX + i * slatSpacing, 2.25, -2.5);
    slat.castShadow = true;
    slat.receiveShadow = true;
    slatGroup.add(slat);
  }
  scene.add(slatGroup);

  // ── Baseboard Glowing Blue/Cyan LED Runner ──
  const baseboardLed = new THREE.Mesh(
    new THREE.BoxGeometry(13.2, 0.04, 0.03),
    MAT.blueLedRunner
  );
  baseboardLed.position.set(0, 0.03, -2.48);
  scene.add(baseboardLed);

  // ── Foreground Blurred Boom Arm (cinematic depth framing) ──
  const fgMicArmMat = new THREE.MeshStandardMaterial({ color: '#090a0c', roughness: 0.3, metalness: 0.85 });
  const fgMicArm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 12), fgMicArmMat);
  fgMicArm.position.set(3.8, 0.5, 5.0);
  fgMicArm.rotation.set(-Math.PI / 4.5, 0, Math.PI / 7);
  fgMicArm.scale.setScalar(0.55);
  scene.add(fgMicArm);

  return {
    neons: [MAT.cyanNeon, MAT.blueLedRunner],
    fgMicArm
  };
}

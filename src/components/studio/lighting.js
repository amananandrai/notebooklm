import * as THREE from 'three';
import { MAT } from './materials.js';

export function setupLighting(scene) {
  // 1. Atmosphere Fog
  scene.fog = new THREE.FogExp2('#07090e', 0.03);

  // 2. Base Ambient Light
  const ambientLight = new THREE.AmbientLight(0x181e28, 0.7);
  scene.add(ambientLight);

  // 3. Cinematic Key Light (Soft Warm, 45 degrees focused on hosts)
  const keyLight = new THREE.SpotLight(0xFFECD6, 3.8);
  keyLight.position.set(-2.2, 4.5, 4.0);
  keyLight.target.position.set(0, 1.1, 0.5);
  keyLight.angle = Math.PI / 4.2;
  keyLight.penumbra = 0.95;
  keyLight.decay = 1.4;
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.bias = -0.001;
  keyLight.shadow.radius = 6;
  scene.add(keyLight, keyLight.target);

  // 4. Soft Fill Light (Subtle Cool Tone opposite Key)
  const fillLight = new THREE.DirectionalLight(0x9EBCE8, 0.9);
  fillLight.position.set(3.5, 3.2, 3.0);
  scene.add(fillLight);

  // 5. Crisp Rim Lights (Behind hosts for separation)
  const rimLightA = new THREE.SpotLight(0x66B6FF, 2.4);
  rimLightA.position.set(-3.2, 3.2, -2.8);
  rimLightA.target.position.set(-1.6, 1.3, 0.5);
  rimLightA.angle = Math.PI / 5.5;
  rimLightA.penumbra = 0.6;
  scene.add(rimLightA, rimLightA.target);

  const rimLightB = new THREE.SpotLight(0x66B6FF, 2.4);
  rimLightB.position.set(3.2, 3.2, -2.8);
  rimLightB.target.position.set(1.6, 1.3, 0.5);
  rimLightB.angle = Math.PI / 5.5;
  rimLightB.penumbra = 0.6;
  scene.add(rimLightB, rimLightB.target);

  // 6. Vintage Hanging Edison Pendants (Left Wall Slat Accent)
  function createEdisonPendant(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, 4.2, z);

    // Black woven cord
    const cordLength = 4.2 - y;
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, cordLength, 8),
      new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.8 })
    );
    cord.position.y = -cordLength / 2;
    group.add(cord);

    // Vintage brass socket
    const socket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.06, 16),
      new THREE.MeshStandardMaterial({ color: '#8C6832', roughness: 0.35, metalness: 0.85 })
    );
    socket.position.y = -cordLength;
    group.add(socket);

    // Teardrop glass bulb
    const bulbGlass = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 24, 24),
      new THREE.MeshPhysicalMaterial({
        color: '#FFE5B4',
        transmission: 0.85,
        transparent: true,
        opacity: 0.35,
        roughness: 0.05
      })
    );
    bulbGlass.scale.set(1.0, 1.4, 1.0);
    bulbGlass.position.y = -cordLength - 0.08;
    group.add(bulbGlass);

    // Glowing filament inside
    const filament = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8),
      MAT.edisonBulb
    );
    filament.position.y = -cordLength - 0.08;
    group.add(filament);

    // Warm radiant point light
    const edisonLight = new THREE.PointLight(0xFFA84E, 1.8, 3.8, 1.2);
    edisonLight.position.y = -cordLength - 0.08;
    group.add(edisonLight);

    scene.add(group);
  }

  createEdisonPendant(-4.8, 3.1, -1.8);
  createEdisonPendant(-3.8, 2.7, -2.1);

  // 7. Hero Plant Canister Uplight (Floor canister pointing up through leaves)
  const uplightCanister = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.085, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.4, metalness: 0.8 })
  );
  uplightCanister.position.set(-3.5, 0.06, -0.6);
  scene.add(uplightCanister);

  const plantUplight = new THREE.SpotLight(0xFFE2B0, 3.2, 4.5);
  plantUplight.position.set(-3.5, 0.12, -0.6);
  plantUplight.target.position.set(-3.3, 2.2, -1.6);
  plantUplight.angle = Math.PI / 4.5;
  plantUplight.penumbra = 0.85;
  plantUplight.decay = 1.3;
  scene.add(plantUplight, plantUplight.target);

  // 8. Shelf Warm Downlight Accents
  const shelfLights = [];
  function addShelfLight(x, y, z) {
    const light = new THREE.PointLight(0xFFAA55, 0.65, 2.2, 1.5);
    light.position.set(x, y, z);
    scene.add(light);
    shelfLights.push(light);
  }
  addShelfLight(3.6, 2.4, -2.1);
  addShelfLight(3.6, 1.6, -2.1);
  addShelfLight(3.6, 0.8, -2.1);

  return { shelfLights };
}

import * as THREE from 'three';

export function setupBranding(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 1024, 768);

  // Elegant cursive neon script text
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  const lines = ['Create', 'Inspire', 'Innovate'];
  const startY = 200;
  const lineSpacing = 160;

  // Draw glowing cyan neon effect with multiple blur passes
  lines.forEach((line, idx) => {
    const y = startY + idx * lineSpacing;
    const x = 140;

    // Outer broad glow
    ctx.font = 'italic 700 115px Georgia, serif';
    ctx.shadowColor = 'rgba(0, 210, 255, 0.9)';
    ctx.shadowBlur = 35;
    ctx.fillStyle = '#23D5FF';
    ctx.fillText(line, x, y);

    // Mid neon glow
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#7DF2FF';
    ctx.fillText(line, x, y);

    // Inner bright hot core
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(line, x, y);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.premultiplyAlpha = true;

  const signMat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    opacity: 0.95,
    emissiveMap: texture,
    emissive: '#23D5FF',
    emissiveIntensity: 2.8,
    roughness: 0.2,
    metalness: 0.1,
    depthWrite: false
  });

  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), signMat);
  signMesh.position.set(-5.35, 2.75, -2.43);
  scene.add(signMesh);

  // Soft localized cyan point light casting glow onto the wooden slats
  const signGlow = new THREE.PointLight(0x23D5FF, 0.85, 2.8, 1.5);
  signGlow.position.set(-5.35, 2.75, -2.3);
  scene.add(signGlow);

  return signMesh;
}

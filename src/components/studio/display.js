import * as THREE from 'three';

export function setupDisplay(scene, boardCanvas, boardTexture) {
  // 1. Screen Dimensions (16:9, matching the slide canvas)
  const screenWidth = 4.6;
  const screenHeight = screenWidth * 9 / 16;
  const screenX = 0;
  const screenY = 2.35;
  const screenZ = -2.46; // Clear separation in front of wall and bezel back

  // 2. High-Fidelity OLED Screen Material (No Z-fighting, self-illuminated)
  const boardMat = new THREE.MeshBasicMaterial({
    map: boardTexture,
    toneMapped: true
  });

  const boardGeo = new THREE.PlaneGeometry(screenWidth, screenHeight);
  const boardMesh = new THREE.Mesh(boardGeo, boardMat);
  boardMesh.position.set(screenX, screenY, screenZ);
  scene.add(boardMesh);

  // 3. Anodized Aluminum Physical Outer Bezel Frame (Surrounding the screen)
  const bezelMat = new THREE.MeshStandardMaterial({
    color: '#080a0e',
    roughness: 0.35,
    metalness: 0.85
  });

  // Bezel Backing Plate (Safely behind screen)
  const backPlate = new THREE.Mesh(
    new THREE.BoxGeometry(screenWidth + 0.12, screenHeight + 0.12, 0.04),
    bezelMat
  );
  backPlate.position.set(screenX, screenY, screenZ - 0.03);
  scene.add(backPlate);

  // 4 Top/Bottom/Left/Right Raised Bezel Lip Frame
  const lipMat = new THREE.MeshStandardMaterial({ color: '#0f1318', roughness: 0.25, metalness: 0.9 });
  const lipThickness = 0.035;
  const lipDepth = 0.03;

  // Top lip
  const topLip = new THREE.Mesh(new THREE.BoxGeometry(screenWidth + 0.12, lipThickness, lipDepth), lipMat);
  topLip.position.set(screenX, screenY + screenHeight / 2 + lipThickness / 2, screenZ + 0.01);
  scene.add(topLip);

  // Bottom lip
  const bottomLip = new THREE.Mesh(new THREE.BoxGeometry(screenWidth + 0.12, lipThickness, lipDepth), lipMat);
  bottomLip.position.set(screenX, screenY - screenHeight / 2 - lipThickness / 2, screenZ + 0.01);
  scene.add(bottomLip);

  // Left lip
  const leftLip = new THREE.Mesh(new THREE.BoxGeometry(lipThickness, screenHeight, lipDepth), lipMat);
  leftLip.position.set(screenX - screenWidth / 2 - lipThickness / 2, screenY, screenZ + 0.01);
  scene.add(leftLip);

  // Right lip
  const rightLip = new THREE.Mesh(new THREE.BoxGeometry(lipThickness, screenHeight, lipDepth), lipMat);
  rightLip.position.set(screenX + screenWidth / 2 + lipThickness / 2, screenY, screenZ + 0.01);
  scene.add(rightLip);

  // 4. WebGL Video Captions Plane (parented to the camera by the caller so it
  // stays at the bottom of frame in every shot)
  const captionCanvas = document.createElement('canvas');
  captionCanvas.width = 800;
  captionCanvas.height = 120;

  const captionTexture = new THREE.CanvasTexture(captionCanvas);
  const captionMaterial = new THREE.MeshBasicMaterial({
    map: captionTexture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });

  const captionMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.55), captionMaterial);
  captionMesh.renderOrder = 100;
  captionMesh.visible = false;
  scene.add(captionMesh);

  return {
    boardMesh,
    boardCenter: new THREE.Vector3(screenX, screenY, screenZ),
    captionMesh,
    captionTexture,
    captionCanvas
  };
}

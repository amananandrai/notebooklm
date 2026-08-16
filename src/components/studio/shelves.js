import * as THREE from 'three';
import { MAT, rand } from './materials.js';
import { addMesh, createBox } from './helpers.js';
import { createGlobe, createLamp, createDecorativeVase } from './props.js';
import { createTrailingPlant } from './plants.js';

// ================================================================
// DETAILED STUDIO BOOKS
// ================================================================
export function createDetailedBook(parent, position, color, rotationZ = 0, width = 0.045, height = 0.26, depth = 0.28) {
  const group = new THREE.Group();

  // Hardcover outer shell
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.72 })
  );
  group.add(cover);

  // Inset page block
  const pages = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.82, height - 0.03, depth - 0.03),
    new THREE.MeshStandardMaterial({ color: '#DDD6C6', roughness: 0.95 })
  );
  pages.position.x = width * 0.015;
  group.add(pages);

  // Subtle spine gold/foil band accent
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.006, 0.025, depth * 0.7),
    MAT.brushedMetal
  );
  band.position.set(-width / 2 - 0.004, 0.04, 0);
  group.add(band);

  group.position.copy(position);
  group.rotation.z = rotationZ;
  group.rotation.y = (rand() - 0.5) * 0.08;

  parent.add(group);
  return group;
}

// ================================================================
// FRAMED ARTWORK
// ================================================================
export function createPictureFrame(parent, position, rotY = 0) {
  const frameGroup = new THREE.Group();
  frameGroup.position.copy(position);
  frameGroup.rotation.y = rotY;

  // Thin black metal frame
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.02), MAT.metal);
  frameGroup.add(frame);

  // Dark matte canvas with subtle abstract graphic
  const artMat = new THREE.MeshStandardMaterial({ color: '#131720', roughness: 0.8 });
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), artMat);
  art.position.z = 0.012;
  frameGroup.add(art);

  parent.add(frameGroup);
  return frameGroup;
}

// ================================================================
// INDUSTRIAL STEEL & WALNUT SHELVING UNIT
// ================================================================
export function createDetailedShelf(decorRoot, x, z, side = 'left') {
  const shelf = new THREE.Group();
  shelf.position.set(x, 0, z);

  const unitWidth = 1.25;
  const unitDepth = 0.40;
  const unitHeight = 2.85;

  // 1. Black Steel Frame Vertical Uprights (4 corner posts)
  const postOffsets = [
    [-unitWidth / 2 + 0.02, -unitDepth / 2 + 0.02],
    [unitWidth / 2 - 0.02, -unitDepth / 2 + 0.02],
    [-unitWidth / 2 + 0.02, unitDepth / 2 - 0.02],
    [unitWidth / 2 - 0.02, unitDepth / 2 - 0.02]
  ];

  postOffsets.forEach(([px, pz]) => {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, unitHeight, 0.035),
      MAT.metal
    );
    post.position.set(px, unitHeight / 2, pz);
    post.castShadow = true;
    shelf.add(post);
  });

  // 2. Thick Walnut Wood Shelves (4 tiers)
  const tierY = [0.35, 1.05, 1.75, 2.45];
  tierY.forEach((y) => {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(unitWidth - 0.02, 0.045, unitDepth),
      MAT.walnutWood
    );
    plank.position.set(0, y, 0);
    plank.castShadow = true;
    plank.receiveShadow = true;
    shelf.add(plank);
  });

  // 3. Curated Props & Books Per Side
  const bookPalette = ['#1a202c', '#2d3748', '#1a365d', '#2c1e18', '#322659', '#1A202C'];

  function addRowOfBooks(xStart, y, count) {
    let offset = xStart;
    for (let i = 0; i < count; i++) {
      const w = 0.032 + rand() * 0.022;
      createDetailedBook(
        shelf,
        new THREE.Vector3(offset, y + 0.14, 0.02),
        bookPalette[Math.floor(rand() * bookPalette.length)],
        rand() > 0.8 ? (rand() - 0.5) * 0.12 : 0,
        w,
        0.22 + rand() * 0.08,
        0.26
      );
      offset += w + 0.005;
    }
  }

  if (side === 'right') {
    // Top tier (2.45): Trailing Pothos cascading down the shelves
    createTrailingPlant(shelf, new THREE.Vector3(0.28, 2.50, 0.05), 0.85);

    // Tier 3 (1.75): Vintage Edison Cloche Lamp + Books
    createLamp(shelf, new THREE.Vector3(-0.35, 1.78, 0.05));
    addRowOfBooks(0.05, 1.78, 5);

    // Tier 2 (1.05): Geometric Metallic Wireframe Sculpture + Books
    const sculpture = addMesh(
      shelf,
      new THREE.IcosahedronGeometry(0.11, 0),
      MAT.brushedMetal,
      new THREE.Vector3(0.35, 1.20, 0.05)
    );
    sculpture.rotation.set(0.4, 0.6, 0.2);
    addRowOfBooks(-0.45, 1.08, 6);

    // Tier 1 (0.35): Stacked Decorative White Binders / Storage Boxes
    for (let b = 0; b < 4; b++) {
      const binder = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, 0.32, 0.28),
        MAT.ceramic
      );
      binder.position.set(-0.38 + b * 0.08, 0.53, 0.02);
      binder.castShadow = true;
      shelf.add(binder);
    }
  } else {
    // Left side (integrated with wood wall):
    // Tier 3 (1.75): Modern Tilted Globe + Books
    createGlobe(shelf, new THREE.Vector3(0.32, 1.78, 0.05));
    addRowOfBooks(-0.45, 1.78, 5);

    // Tier 2 (1.05): Ceramic Vase with Twigs + Stacked Books
    createDecorativeVase(shelf, new THREE.Vector3(-0.35, 1.08, 0.05));
    addRowOfBooks(0.05, 1.08, 5);

    // Tier 1 (0.35): Storage Binders
    for (let b = 0; b < 4; b++) {
      const binder = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, 0.32, 0.28),
        MAT.ceramic
      );
      binder.position.set(0.12 + b * 0.08, 0.53, 0.02);
      binder.castShadow = true;
      shelf.add(binder);
    }
  }

  decorRoot.add(shelf);
  return shelf;
}

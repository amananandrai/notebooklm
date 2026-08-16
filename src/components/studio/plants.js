import * as THREE from 'three';
import { MAT, rand } from './materials.js';
import { addMesh, createCylinder } from './helpers.js';

// ================================================================
// TROPICAL BROAD LEAF GEOMETRY (Bird of Paradise / Strelitzia)
// ================================================================

export function createStrelitziaLeaf(width = 0.38, length = 1.1) {
  const shape = new THREE.Shape();

  // Create an elegant wide tropical paddle leaf contour
  shape.moveTo(0, 0);
  shape.bezierCurveTo(width * 0.4, length * 0.15, width * 0.9, length * 0.45, width * 0.85, length * 0.75);
  shape.bezierCurveTo(width * 0.8, length * 0.9, width * 0.4, length * 0.98, 0, length);
  shape.bezierCurveTo(-width * 0.4, length * 0.98, -width * 0.8, length * 0.9, -width * 0.85, length * 0.75);
  shape.bezierCurveTo(-width * 0.9, length * 0.45, -width * 0.4, length * 0.15, 0, 0);

  const extrudeSettings = {
    steps: 1,
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();

  // Apply natural longitudinal droop and lateral cup curvature
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const normY = (y + length * 0.5) / length; // 0 to 1
    // Arch backward and droop at tip
    const archZ = Math.sin(normY * Math.PI) * 0.08 - Math.pow(normY, 2) * 0.14;
    // Cup inward towards central rib
    const cupZ = -Math.pow(Math.abs(x) / (width * 0.5 + 0.01), 2) * 0.04;

    pos.setXYZ(i, x, y, z + archZ + cupZ);
  }
  geo.computeVertexNormals();
  return geo;
}

export function createLeafVein(length, width, material = MAT.stem) {
  const points = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    points.push(new THREE.Vector3(0, (t - 0.5) * length, 0.012 + Math.sin(Math.PI * t) * 0.04 - Math.pow(t, 2) * 0.08));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 16, width, 6, false),
    material
  );
}

// Assemble single complete tropical leaf with central stem and veins
export function createDetailedTropicalLeaf(width, length, material = MAT.leafMid) {
  const leafGroup = new THREE.Group();

  const leafMesh = new THREE.Mesh(createStrelitziaLeaf(width, length), material);
  leafMesh.castShadow = true;
  leafMesh.receiveShadow = true;
  leafGroup.add(leafMesh);

  const vein = createLeafVein(length, 0.009, MAT.stem);
  leafGroup.add(vein);

  return leafGroup;
}

// ================================================================
// HERO TROPICAL PLANT (Banana / Strelitzia in Concrete Pot)
// ================================================================

export function createHeroPlant(scene, x, z, scale = 1.0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);

  // 1. Heavy Cylindrical Concrete Planter Pot
  const potHeight = 0.68;
  const potRadius = 0.35;
  const pot = createCylinder(
    group,
    potRadius,
    potRadius * 0.92,
    potHeight,
    MAT.concretePot,
    new THREE.Vector3(0, potHeight / 2, 0)
  );

  // Pot Rim Ring
  addMesh(
    group,
    new THREE.TorusGeometry(potRadius, 0.02, 12, 36),
    MAT.concretePot,
    new THREE.Vector3(0, potHeight, 0),
    new THREE.Euler(Math.PI / 2, 0, 0)
  );

  // Dark Soil surface
  addMesh(
    group,
    new THREE.CircleGeometry(potRadius * 0.94, 32),
    MAT.soil,
    new THREE.Vector3(0, potHeight + 0.005, 0),
    new THREE.Euler(-Math.PI / 2, 0, 0)
  );

  // 2. Arching Tropical Stems and Large Broad Paddle Leaves
  const leaves = [];
  const leafConfigs = [
    // [angle, stemLength, leafWidth, leafLength, rotX, rotZ, material]
    [0.15,  1.45, 0.44, 1.25, -0.35,  0.20, MAT.leafDark],
    [0.75,  1.30, 0.40, 1.15, -0.28,  0.35, MAT.leafMid],
    [1.50,  1.10, 0.38, 1.05, -0.20,  0.45, MAT.leafLight],
    [2.35,  1.25, 0.42, 1.18,  0.25,  0.30, MAT.leafMid],
    [3.10,  1.50, 0.45, 1.30,  0.38, -0.15, MAT.leafDark],
    [3.85,  1.35, 0.40, 1.15,  0.28, -0.32, MAT.leafMid],
    [4.65,  1.15, 0.36, 1.00,  0.18, -0.42, MAT.leafLight],
    [5.45,  1.40, 0.43, 1.20, -0.30, -0.22, MAT.leafDark],
    // 2 Center tall majestic upright leaves
    [0.0,   1.75, 0.48, 1.40, -0.15,  0.05, MAT.leafDark],
    [3.4,   1.65, 0.46, 1.35,  0.15, -0.05, MAT.leafMid],
  ];

  leafConfigs.forEach(([angle, stemHeight, leafW, leafL, rotX, rotZ, mat], idx) => {
    // Arching green stem
    const stemPoints = [];
    const stemCurveSpread = 0.25;
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      stemPoints.push(new THREE.Vector3(
        Math.cos(angle) * (0.08 + t * stemCurveSpread),
        potHeight + t * stemHeight,
        Math.sin(angle) * (0.08 + t * stemCurveSpread)
      ));
    }
    const stemCurve = new THREE.CatmullRomCurve3(stemPoints);
    const stemMesh = new THREE.Mesh(
      new THREE.TubeGeometry(stemCurve, 16, 0.022 * (1.0 - 0.3 * (idx / leafConfigs.length)), 8, false),
      MAT.stem
    );
    stemMesh.castShadow = true;
    stemMesh.receiveShadow = true;
    group.add(stemMesh);

    // Leaf attached to top of stem
    const leaf = createDetailedTropicalLeaf(leafW, leafL, mat);
    const endPoint = stemPoints[stemPoints.length - 1];
    leaf.position.copy(endPoint);
    leaf.rotation.set(rotX, angle, rotZ);
    leaf.userData.baseRotZ = rotZ;
    leaf.userData.baseRotX = rotX;
    group.add(leaf);
    leaves.push(leaf);
  });

  group.userData.leaves = leaves;
  group.userData.animationPhase = rand() * Math.PI * 2;

  scene.add(group);
  return group;
}

// ================================================================
// TRAILING POTHOS (Shelf Vine Plant)
// ================================================================

export function createTrailingPlant(parent, position, scale = 1.0) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.scale.setScalar(scale);

  // Dark modern shelf pot
  createCylinder(group, 0.12, 0.09, 0.16, MAT.ceramicDark, new THREE.Vector3(0, 0.08, 0));
  addMesh(
    group,
    new THREE.CircleGeometry(0.11, 16),
    MAT.soil,
    new THREE.Vector3(0, 0.155, 0),
    new THREE.Euler(-Math.PI / 2, 0, 0)
  );

  // 7 Cascading vines draping over the shelf
  for (let v = 0; v < 7; v++) {
    const points = [];
    const angle = (v / 7) * Math.PI * 2;
    const vineLen = 0.55 + rand() * 0.65;
    
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      points.push(new THREE.Vector3(
        Math.cos(angle) * (0.08 + t * 0.12) + Math.sin(t * 5 + v) * 0.04,
        0.15 - t * vineLen,
        Math.sin(angle) * (0.08 + t * 0.12) + Math.cos(t * 4 + v) * 0.03
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const vine = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 18, 0.007, 5, false),
      MAT.stem
    );
    group.add(vine);

    // Leaves along vine
    for (let l = 0; l < 6; l++) {
      const t = 0.15 + (l / 6) * 0.8;
      const p = curve.getPoint(t);
      const leafGeo = createStrelitziaLeaf(0.08, 0.13);
      const leaf = new THREE.Mesh(leafGeo, l % 2 ? MAT.leafMid : MAT.leafLight);
      leaf.position.copy(p);
      leaf.rotation.set(rand() * 1.5, rand() * Math.PI * 2, rand() * 0.8);
      leaf.scale.setScalar(0.7 + rand() * 0.4);
      group.add(leaf);
    }
  }

  parent.add(group);
  return group;
}

import * as THREE from 'three';

// ---------------------------------------------------------------
// Deterministic random helper
// ---------------------------------------------------------------
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(73421);

// ---------------------------------------------------------------
// Shared PBR materials tailored for high-end studio realism
// ---------------------------------------------------------------
const MAT = {
  // Broad Tropical Leaf Materials (rich, subtle sheen, wax cuticle)
  leafDark: new THREE.MeshPhysicalMaterial({
    color: '#153820',
    roughness: 0.38,
    metalness: 0.0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.4,
    sheen: 0.15,
    side: THREE.DoubleSide
  }),

  leafMid: new THREE.MeshPhysicalMaterial({
    color: '#1e4b2a',
    roughness: 0.35,
    metalness: 0.0,
    clearcoat: 0.28,
    clearcoatRoughness: 0.35,
    sheen: 0.18,
    side: THREE.DoubleSide
  }),

  leafLight: new THREE.MeshPhysicalMaterial({
    color: '#2d6338',
    roughness: 0.32,
    metalness: 0.0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    sheen: 0.2,
    side: THREE.DoubleSide
  }),

  stem: new THREE.MeshStandardMaterial({
    color: '#1a3821',
    roughness: 0.55
  }),

  soil: new THREE.MeshStandardMaterial({
    color: '#0d0907',
    roughness: 0.95
  }),

  // Heavy Architectural Stone / Concrete Planter Pot
  concretePot: new THREE.MeshStandardMaterial({
    color: '#73777d',
    roughness: 0.85,
    metalness: 0.08
  }),

  ceramic: new THREE.MeshStandardMaterial({
    color: '#ECE6D8',
    roughness: 0.28,
    metalness: 0.02
  }),

  ceramicDark: new THREE.MeshStandardMaterial({
    color: '#18191B',
    roughness: 0.55
  }),

  blackMug: new THREE.MeshStandardMaterial({
    color: '#111214',
    roughness: 0.35,
    metalness: 0.1
  }),

  // Warm Walnut Wood for Slat Wall, Shelves, Pedestal, and Accents
  walnutWood: new THREE.MeshStandardMaterial({
    color: '#26160e',
    roughness: 0.72,
    metalness: 0.02
  }),

  wood: new THREE.MeshStandardMaterial({
    color: '#2b1b12',
    roughness: 0.75,
    metalness: 0.04
  }),

  woodEdge: new THREE.MeshStandardMaterial({
    color: '#3d2517',
    roughness: 0.65
  }),

  // Mid-Century Warm Wood for Chair Armrests
  warmWoodArmrest: new THREE.MeshStandardMaterial({
    color: '#5e3a20',
    roughness: 0.55,
    metalness: 0.05
  }),

  // Architectural Satin Black Studio Desk (eliminates white blowout glare)
  matteDesk: new THREE.MeshPhysicalMaterial({
    color: '#121417',
    roughness: 0.42,
    metalness: 0.12,
    clearcoat: 0.18,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.6
  }),

  // Metal Frame & Shure SM7B Mic Metal
  metal: new THREE.MeshStandardMaterial({
    color: '#0e1012',
    roughness: 0.3,
    metalness: 0.85
  }),

  brushedMetal: new THREE.MeshStandardMaterial({
    color: '#3a3d42',
    roughness: 0.22,
    metalness: 0.92
  }),

  micGrille: new THREE.MeshStandardMaterial({
    color: '#222428',
    roughness: 0.45,
    metalness: 0.75
  }),

  glass: new THREE.MeshPhysicalMaterial({
    color: '#1a2230',
    roughness: 0.08,
    metalness: 0.1,
    transmission: 0.4,
    transparent: true,
    opacity: 0.6
  }),

  // Vintage Glowing Edison Filament
  edisonBulb: new THREE.MeshStandardMaterial({
    color: '#FFA544',
    emissive: '#FF7711',
    emissiveIntensity: 3.5
  }),

  warmGlow: new THREE.MeshStandardMaterial({
    color: '#FFE2B8',
    emissive: '#FF9436',
    emissiveIntensity: 2.2
  }),

  // Cyan Script Neon (Create Inspire Innovate)
  cyanNeon: new THREE.MeshStandardMaterial({
    color: '#D4FBFF',
    emissive: '#23D5FF',
    emissiveIntensity: 3.0
  }),

  cyanGlow: new THREE.MeshStandardMaterial({
    color: '#DFFFFF',
    emissive: '#23D5FF',
    emissiveIntensity: 2.2
  }),

  // Floor Baseboard Blue/Cyan LED Strip Runner
  blueLedRunner: new THREE.MeshStandardMaterial({
    color: '#B3EBFF',
    emissive: '#00A2FF',
    emissiveIntensity: 2.8
  }),

  violetGlow: new THREE.MeshStandardMaterial({
    color: '#EEE9FF',
    emissive: '#7C5CFF',
    emissiveIntensity: 2.0
  }),

  // Chair Charcoal Padded Leather/Fabric Cushion
  chairCushion: new THREE.MeshStandardMaterial({
    color: '#16181B',
    roughness: 0.88,
    metalness: 0.02
  })
};

export { mulberry32, rand, MAT };

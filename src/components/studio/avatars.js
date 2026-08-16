import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export function setupAvatars(scene, avatarA, avatarB, hostARef, hostBRef, mixersRef) {
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const fbxLoader = new FBXLoader();

  // Load High-Resolution 3D Host Avatars from public folder GLBs.
  // The source files are authored at a tiny scale, so fit them to the
  // studio after loading instead of relying on their exported transforms.
  function prepareHostModel(model, x, z, rotationY, animations = []) {
    model.updateMatrixWorld(true);
    const sourceBounds = new THREE.Box3().setFromObject(model);
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    const targetHeight = 1.55; // Fit to chair height
    if (sourceSize.y > 0) {
      model.scale.multiplyScalar(targetHeight / sourceSize.y);
    }

    model.updateMatrixWorld(true);
    const fittedBounds = new THREE.Box3().setFromObject(model);
    // Determine base position so the butt/legs rest on the chair seat (~0.25).
    const basePosition = 0.25 - fittedBounds.min.y;

    model.position.set(x, basePosition, z);
    model.rotation.y = rotationY;

    model.userData = { 
      basePosition, 
      baseRotationY: rotationY,
      bones: { spine: null, neck: null, head: null }
    };

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          // Subsurface scattering & roughness approximation
          const matName = child.material.name.toLowerCase();
          if (matName.includes('skin') || matName.includes('head') || matName.includes('body')) {
            child.material.roughness = 0.45;
            child.material.metalness = 0.05;
            if (child.material.color) {
              child.material.color.lerp(new THREE.Color(0xffe0cd), 0.15); // Warm skin tint
            }
          } else {
            // Clothing fabric roughness
            child.material.roughness = 0.85;
          }
        }
      }
      if (child.isBone) {
        const name = child.name.toLowerCase();
        if (name.includes('spine') && !model.userData.bones.spine) {
          model.userData.bones.spine = child;
          model.userData.baseSpineY = child.position.y;
        }
        if (name.includes('neck') && !model.userData.bones.neck) model.userData.bones.neck = child;
        if (name.includes('head') && !model.userData.bones.head) model.userData.bones.head = child;
      }
    });
    scene.add(model);

    // Initialize AnimationMixer if the GLB contains baked animations
    if (animations && animations.length > 0) {
      const mixer = new THREE.AnimationMixer(model);
      model.userData.mixer = mixer;
      model.userData.actions = {};
      
      animations.forEach((clip) => {
        const action = mixer.clipAction(clip);
        const lower = clip.name.toLowerCase();
        if (lower.includes('sit') || lower.includes('idle')) model.userData.actions.idle = action;
        else if (lower.includes('talk') || lower.includes('speak')) model.userData.actions.talk = action;
        else if (lower.includes('listen') || lower.includes('agree')) model.userData.actions.listen = action;
        else if (lower.includes('gesture') || lower.includes('explain')) model.userData.actions.gesture = action;
      });

      // Fallbacks if specific clips don't exist
      if (!model.userData.actions.idle) model.userData.actions.idle = mixer.clipAction(animations[0]);
      if (!model.userData.actions.talk) model.userData.actions.talk = model.userData.actions.idle;
      if (!model.userData.actions.listen) model.userData.actions.listen = model.userData.actions.idle;

      model.userData.activeAction = model.userData.actions.idle;
      model.userData.activeAction.play();
      if (mixersRef && mixersRef.current) {
        mixersRef.current.push(mixer);
      }
    }
  }

  function loadAvatar(type, hostRef, x, z, rotationY) {
    if (type.endsWith('.glb')) {
      gltfLoader.load(`/${type}`, (gltf) => {
        const model = gltf.scene;
        prepareHostModel(model, x, z, rotationY, gltf.animations);
        hostRef.current = model;
      }, undefined, (err) => console.error(`Error loading ${type} GLB:`, err));
    } else if (type.endsWith('.fbx')) {
      fbxLoader.load(`/${type}`, (fbx) => {
        // FBX models often have a different scale or hierarchy, but we can process them similarly
        // FBX animations are stored directly on the loaded object
        prepareHostModel(fbx, x, z, rotationY, fbx.animations);
        hostRef.current = fbx;
      }, undefined, (err) => console.error(`Error loading ${type} FBX:`, err));
    }
  }

  loadAvatar(avatarA, hostARef, -1.55, 0.55, Math.PI / 6);
  loadAvatar(avatarB, hostBRef, 1.55, 0.55, -Math.PI / 6);
}

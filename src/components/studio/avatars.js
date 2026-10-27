import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import {
  FLOOR_Y,
  SEATS,
  SEAT_TOP_Y,
  HIP_ABOVE_SEAT,
  HIP_SEAT_OFFSET,
  HOST_STANDING_HEIGHT,
  seatForward
} from './layout.js';

export function setupAvatars(scene, avatarA, avatarB, hostARef, hostBRef, mixersRef, onHostReady) {
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  const fbxLoader = new FBXLoader();

  // Sit the posed skeleton into its chair: hips just above the cushion and
  // pushed back toward the backrest, feet resting on the floor.
  function seatModel(model, seat) {
    model.updateMatrixWorld(true);
    const hips = model.userData.bones.hips;
    if (!hips) {
      // No skeleton to seat by (e.g. an unrigged GLB): rest the bounds on the cushion.
      const bounds = new THREE.Box3().setFromObject(model);
      model.position.y += SEAT_TOP_Y - bounds.min.y;
      return;
    }

    const hipsPos = hips.getWorldPosition(new THREE.Vector3());
    let lowestFootY = Infinity;
    model.traverse((child) => {
      if (child.isBone && /foot|toe/i.test(child.name)) {
        lowestFootY = Math.min(lowestFootY, child.getWorldPosition(new THREE.Vector3()).y);
      }
    });

    const forward = seatForward(seat);
    const target = new THREE.Vector3(
      seat.x + forward.x * HIP_SEAT_OFFSET,
      SEAT_TOP_Y + HIP_ABOVE_SEAT,
      seat.z + forward.z * HIP_SEAT_OFFSET
    );
    if (Number.isFinite(lowestFootY)) {
      // Foot bones sit a few centimetres above the sole; never sink below the floor.
      const hipsAboveFeet = hipsPos.y - lowestFootY;
      target.y = Math.max(target.y, FLOOR_Y + 0.03 + hipsAboveFeet);
    }
    model.position.add(target.sub(hipsPos));
    model.updateMatrixWorld(true);
  }

  // Load High-Resolution 3D Host Avatars from public folder GLBs.
  // The source files are authored at different scales, so fit them to the
  // studio after loading instead of relying on their exported transforms.
  function prepareHostModel(model, key, animations = []) {
    const seat = SEATS[key];
    model.updateMatrixWorld(true);
    const sourceBounds = new THREE.Box3().setFromObject(model);
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    if (sourceSize.y > 0) {
      model.scale.multiplyScalar(HOST_STANDING_HEIGHT / sourceSize.y);
    }

    model.position.set(seat.x, 0, seat.z);
    model.rotation.y = seat.rotY;

    model.userData = {
      baseRotationY: seat.rotY,
      bones: { hips: null, spine: null, neck: null, head: null }
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
        if (name.includes('hips') && !model.userData.bones.hips) model.userData.bones.hips = child;
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
      // Pose the skeleton before seating so we measure the sitting pose.
      mixer.update(0);
    }

    seatModel(model, seat);
    onHostReady?.(key, model);
  }

  function loadAvatar(type, hostRef, key) {
    if (type.endsWith('.glb')) {
      gltfLoader.load(`/${type}`, (gltf) => {
        const model = gltf.scene;
        prepareHostModel(model, key, gltf.animations);
        hostRef.current = model;
      }, undefined, (err) => console.error(`Error loading ${type} GLB:`, err));
    } else if (type.endsWith('.fbx')) {
      fbxLoader.load(`/${type}`, (fbx) => {
        // FBX models often have a different scale or hierarchy, but we can process them similarly
        // FBX animations are stored directly on the loaded object
        prepareHostModel(fbx, key, fbx.animations);
        hostRef.current = fbx;
      }, undefined, (err) => console.error(`Error loading ${type} FBX:`, err));
    }
  }

  loadAvatar(avatarA, hostARef, 'a');
  loadAvatar(avatarB, hostBRef, 'b');
}

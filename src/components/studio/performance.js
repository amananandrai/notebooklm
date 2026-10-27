import * as THREE from 'three';
import { mulberry32 } from './materials.js';

// ================================================================
// HOST PERFORMANCE
// The avatars have no jaw bone or face blendshapes, so speech is sold
// through the head, neck and spine: syllable beats and emphasis while
// talking, backchannel nods while listening and smooth gaze. Everything
// is layered on top of the sitting animation after the mixer has posed the
// skeleton. Eye bones are left alone: their pivots are not at the eyeball centre on these rigs, so
// rotating them pushes the eyes into the sockets.
// ================================================================

const UP = new THREE.Vector3(0, 1, 0);
const _parentQuat = new THREE.Quaternion();
const _delta = new THREE.Quaternion();
const _axis = new THREE.Vector3();

// Rotate a bone about a world-space axis, on top of its current pose. Bone
// local axes differ between rigs, so world axes keep the motion consistent.
function rotateBoneWorld(bone, worldAxis, angle) {
  if (!bone || !bone.parent || !angle) return;
  bone.parent.getWorldQuaternion(_parentQuat).invert();
  _axis.copy(worldAxis).applyQuaternion(_parentQuat).normalize();
  bone.quaternion.premultiply(_delta.setFromAxisAngle(_axis, angle));
}

const smoothing = (rate, delta) => 1 - Math.exp(-rate * delta);

// ----------------------------------------------------------------
// Speech envelope estimated from the script text, for live browser TTS
// where the audio itself can't be analysed. Punctuation becomes pauses;
// word boundary events from the speech engine resynchronise it.
// ----------------------------------------------------------------
const PAUSE_CHARS = { ',': 4, ';': 5, ':': 5, '.': 7, '!': 7, '?': 7 };

export function createTextEnvelope(charsPerSecond = 14) {
  let levels = [];
  let virtualStart = [];
  let syncIndex = 0;
  let syncTime = 0;
  let pausedAt = null;
  let active = false;

  return {
    start(text, now) {
      levels = [];
      virtualStart = [];
      for (const ch of String(text || '')) {
        virtualStart.push(levels.length);
        if (PAUSE_CHARS[ch]) {
          for (let i = 0; i < PAUSE_CHARS[ch]; i++) levels.push(0);
        } else if (/\s/.test(ch)) {
          levels.push(0.15);
        } else {
          levels.push(/[aeiouy]/i.test(ch) ? 1 : 0.55);
        }
      }
      syncIndex = 0;
      syncTime = now;
      pausedAt = null;
      active = true;
    },
    boundary(charIndex, now) {
      if (!active || charIndex >= virtualStart.length) return;
      syncIndex = virtualStart[charIndex];
      syncTime = now;
    },
    pause(now) {
      if (pausedAt === null) pausedAt = now;
    },
    resume(now) {
      if (pausedAt === null) return;
      syncTime += now - pausedAt;
      pausedAt = null;
    },
    stop() {
      active = false;
    },
    sample(now) {
      if (!active || pausedAt !== null) return 0;
      const index = Math.floor(syncIndex + (now - syncTime) * charsPerSecond);
      return index >= 0 && index < levels.length ? levels[index] : 0;
    }
  };
}

// Loudness (0..1) of an AnalyserNode, for recordings where the narration
// audio runs through Web Audio.
export function analyserLevel(analyser, buffer) {
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.min(1, Math.sqrt(sum / buffer.length) * 5);
}

// ----------------------------------------------------------------
// Per-host procedural layer
// ----------------------------------------------------------------
export function createHostPerformer(host, seed) {
  const bones = host.userData.bones;
  const baseRot = host.userData.baseRotationY;
  const forward = new THREE.Vector3(Math.sin(baseRot), 0, Math.cos(baseRot));
  const nodAxis = UP.clone().cross(forward).normalize(); // positive = chin down
  const rand = mulberry32(seed * 7919);

  // Rigs without an animation mixer are never re-posed, so restore their
  // rest pose each frame before layering motion on top.
  const animated = Boolean(host.userData.mixer);
  const posedBones = [bones.spine, bones.neck, bones.head].filter(Boolean);
  const restPose = posedBones.map((bone) => bone.quaternion.clone());

  const state = {
    yaw: 0,
    level: 0, // fast: drives the mic ring
    levelMid: 0, // syllable/word rate: drives head beats
    levelSlow: 0, // phrase rate: drives lean and emphasis
    speechTime: 0, // seconds of speech since the last phrase break
    quietTime: 0,
    phraseEnded: false,
    nodStart: -Infinity,
    nodAmp: 0,
    nodDuration: 0.6,
    nextIdleNod: 6 + rand() * 6
  };

  function nod(time, amplitude, duration) {
    if (time - state.nodStart < state.nodDuration + 0.8) return;
    state.nodStart = time;
    state.nodAmp = amplitude;
    state.nodDuration = duration;
  }

  // lookTarget: world point to face. speaking: this host has the floor.
  // level: 0..1 speech loudness. partnerPhraseEnded: the other host just
  // finished a phrase (a natural moment for a listener to nod).
  function update({ time, delta, lookTarget, speaking, level, partnerPhraseEnded }) {
    if (!animated) posedBones.forEach((bone, i) => bone.quaternion.copy(restPose[i]));

    // Loudness: fast attack, slower release, plus a slow phrase-level average
    const target = speaking ? level : 0;
    state.level += (target - state.level) * smoothing(target > state.level ? 30 : 9, delta);
    state.levelMid += (state.level - state.levelMid) * smoothing(6, delta);
    state.levelSlow += (state.level - state.levelSlow) * smoothing(1.5, delta);

    // Phrase tracking (a pause after a stretch of speech)
    state.phraseEnded = false;
    if (speaking && state.level > 0.3) {
      state.speechTime += delta;
      state.quietTime = 0;
    } else {
      state.quietTime += delta;
      if (state.quietTime > 0.25 && state.speechTime > 1.5) {
        state.phraseEnded = true;
        state.speechTime = 0;
      }
    }

    // Gaze: yaw toward the target relative to the seated facing, eased
    const dx = lookTarget.x - host.position.x;
    const dz = lookTarget.z - host.position.z;
    let desiredYaw = Math.atan2(dx, dz) - baseRot;
    desiredYaw = Math.atan2(Math.sin(desiredYaw), Math.cos(desiredYaw));
    desiredYaw = THREE.MathUtils.clamp(desiredYaw, -Math.PI / 3, Math.PI / 3);
    state.yaw += (desiredYaw - state.yaw) * smoothing(4, delta);

    // Listening: nod on the partner's phrase breaks, and now and then on its own
    if (!speaking) {
      if (partnerPhraseEnded && rand() < 0.55) nod(time, 0.05 + rand() * 0.04, 0.5 + rand() * 0.3);
      if (time > state.nextIdleNod) {
        nod(time, 0.035, 0.9);
        state.nextIdleNod = time + 6 + rand() * 6;
      }
    }

    // Head pitch: syllable beats and emphasis while talking, nods, breathing
    const beat = state.levelMid - state.levelSlow;
    let pitch = speaking ? 0.06 * beat + 0.025 * state.levelSlow : 0;
    const nodPhase = (time - state.nodStart) / state.nodDuration;
    if (nodPhase >= 0 && nodPhase <= 1) pitch += state.nodAmp * Math.sin(Math.PI * nodPhase);
    pitch += Math.sin(time * 1.6 + seed) * 0.006;

    // Gentle head tilt, livelier while talking
    const roll = Math.sin(time * 0.8 + seed * 2) * (0.012 + 0.03 * state.levelSlow);

    // Lean in slightly while holding the floor
    const lean = 0.04 * state.levelSlow;

    rotateBoneWorld(bones.spine, UP, state.yaw * 0.12);
    rotateBoneWorld(bones.spine, nodAxis, lean);
    rotateBoneWorld(bones.neck, UP, state.yaw * 0.3);
    rotateBoneWorld(bones.head, UP, state.yaw * 0.45);
    rotateBoneWorld(bones.head, nodAxis, pitch);
    rotateBoneWorld(bones.head, forward, roll);
  }

  return {
    update,
    get level() {
      return state.level;
    },
    get phraseEnded() {
      return state.phraseEnded;
    }
  };
}

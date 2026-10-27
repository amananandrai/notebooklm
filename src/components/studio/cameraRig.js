import * as THREE from 'three';
import { isHostA } from './speakers.js';

// ================================================================
// CAMERA RIG
// Shot positions are derived from where the hosts' heads and the board
// actually are, and the planner picks one shot per script turn.
// ================================================================

const UP = new THREE.Vector3(0, 1, 0);

function flatDirection(from, to) {
  return new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
}

// Medium close-up of `subject`, from the side they are looking toward, with
// lead room on the partner's side of frame.
function mediumCloseUp(subject, partner, forward) {
  const toPartner = flatDirection(subject, partner);
  const toCamera = forward.clone().multiplyScalar(2).add(toPartner).normalize();
  const pos = subject.clone().addScaledVector(toCamera, 1.55).add(new THREE.Vector3(0, 0.02, 0));
  const right = toCamera.clone().negate().cross(UP).normalize();
  const leadSign = Math.sign(toPartner.dot(right)) || 1;
  const look = subject.clone().add(new THREE.Vector3(0, -0.05, 0)).addScaledVector(right, 0.16 * leadSign);
  return { pos, look, fov: 28, push: 0.12, aperture: 0.0025 };
}

// Over the partner's shoulder onto `subject`.
function overTheShoulder(subject, partner) {
  const away = flatDirection(subject, partner);
  const pos = partner.clone()
    .addScaledVector(away, 0.62)
    .add(new THREE.Vector3(0, 0.17, 0.42));
  const look = subject.clone().add(new THREE.Vector3(0, -0.04, 0));
  return { pos, look, fov: 30, push: 0.08, aperture: 0.0025 };
}

export function buildShots({ headA, headB, forwardA, forwardB, boardCenter }) {
  const mid = headA.clone().add(headB).multiplyScalar(0.5);
  return {
    WIDE: {
      pos: new THREE.Vector3(0, 1.55, 4.9),
      look: new THREE.Vector3(0, boardCenter.y - 0.67, mid.z - 0.6),
      fov: 34,
      push: 0.25,
      aperture: 0.0002
    },
    TWO_SHOT: {
      pos: new THREE.Vector3(mid.x, mid.y + 0.08, mid.z + 3.0),
      look: new THREE.Vector3(mid.x, mid.y - 0.15, mid.z),
      fov: 30,
      push: 0.15,
      aperture: 0.0005
    },
    MCU_A: mediumCloseUp(headA, headB, forwardA),
    MCU_B: mediumCloseUp(headB, headA, forwardB),
    OTS_A: overTheShoulder(headA, headB),
    OTS_B: overTheShoulder(headB, headA),
    BOARD: {
      pos: boardCenter.clone().add(new THREE.Vector3(0, -0.25, 5.0)),
      look: boardCenter.clone().add(new THREE.Vector3(0, -0.05, 0)),
      fov: 32,
      push: 0.2,
      aperture: 0.0002
    }
  };
}

// Which subject the lens should be focused on for a shot.
export function focusSubject(shot, speakerIsA) {
  if (shot === 'BOARD') return 'board';
  if (shot.endsWith('_A')) return 'a';
  if (shot.endsWith('_B')) return 'b';
  return speakerIsA ? 'a' : 'b';
}

// Alternate angle used instead of cutting to the shot already on screen.
const ALTERNATE = {
  MCU_A: 'OTS_A',
  OTS_A: 'MCU_A',
  MCU_B: 'OTS_B',
  OTS_B: 'MCU_B',
  WIDE: 'TWO_SHOT',
  TWO_SHOT: 'WIDE',
  BOARD: 'TWO_SHOT'
};

const SHORT_TURN_CHARS = 45; // roughly under 3 s of speech: not worth a cut
const ESTABLISH_EVERY = 5; // turns between wide/two-shot resets
const BOARD_COOLDOWN = 3; // turns between board inserts

export function planShots(turns, slideCount) {
  const turnsPerSlide = Math.max(1, Math.ceil(turns.length / Math.max(1, slideCount)));
  const slideOf = (i) => Math.floor(i / turnsPerSlide);

  const plan = [];
  let prev = null;
  let lastEstablishing = 'WIDE';
  let sinceEstablishing = 0;
  let lastBoard = -Infinity;

  turns.forEach((turn, i) => {
    const isA = isHostA(turn.speaker);
    const me = isA ? 'A' : 'B';
    const text = turn.text || '';
    const lower = text.toLowerCase();

    let intent = 'explain';
    if (lower.includes('?')) intent = 'ask';
    else if (lower.includes('!')) intent = 'emphasize';
    else if (/\b(exactly|yes|agree|absolutely|right|interesting)\b/.test(lower)) intent = 'react';

    const slideChanged = slideCount > 0 && i > 0 && slideOf(i) !== slideOf(i - 1);
    const mentionsBoard = /\b(slide|board|diagram|chart|here we see|look at)\b/.test(lower);

    let shot;
    let hold = false;
    if (i === 0) {
      shot = 'WIDE';
    } else if ((slideChanged || mentionsBoard) && i - lastBoard >= BOARD_COOLDOWN && text.length >= SHORT_TURN_CHARS) {
      shot = 'BOARD';
    } else if (text.length < SHORT_TURN_CHARS) {
      // Quick interjection: stay wide enough to see both hosts rather than cutting
      hold = prev === 'TWO_SHOT' || prev === 'WIDE';
      shot = hold ? prev : 'TWO_SHOT';
    } else if (sinceEstablishing >= ESTABLISH_EVERY) {
      shot = lastEstablishing === 'WIDE' ? 'TWO_SHOT' : 'WIDE';
    } else if (intent === 'ask') {
      shot = `OTS_${me}`;
    } else {
      shot = `MCU_${me}`;
    }

    if (shot === prev && !hold) shot = ALTERNATE[shot];

    if (shot === 'WIDE' || shot === 'TWO_SHOT') {
      lastEstablishing = shot;
      sinceEstablishing = 0;
    } else {
      sinceEstablishing++;
    }
    if (shot === 'BOARD') lastBoard = i;

    plan.push({ shot, intent });
    prev = shot;
  });

  return plan;
}

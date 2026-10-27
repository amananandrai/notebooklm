// ================================================================
// SHARED SET LAYOUT
// Single source of truth for where the desk, chairs and hosts sit, so
// furniture, avatars, microphones and camera shots all agree.
// ================================================================

export const FLOOR_Y = 0;

export const DESK = {
  x: 0,
  z: 0.55,
  width: 2.4,
  depth: 1.0,
  topY: 0.745 // upper surface of the tabletop
};

// Hosts sit behind the desk, angled toward each other and the camera.
// rotY is the yaw of the host/chair (0 = facing +z, toward the camera).
export const SEATS = {
  a: { x: -0.95, z: -0.22, rotY: 0.6 },
  b: { x: 0.95, z: -0.22, rotY: -0.6 }
};

export const SEAT_TOP_Y = 0.48; // top of the chair cushion
export const HIP_ABOVE_SEAT = 0.06; // hip joint height above the cushion
export const HIP_SEAT_OFFSET = -0.06; // hips sit slightly back from seat centre
export const HOST_STANDING_HEIGHT = 1.72; // bind-pose height avatars are fitted to

// Unit vector a seated host faces, in world XZ.
export function seatForward(seat) {
  return { x: Math.sin(seat.rotY), z: Math.cos(seat.rotY) };
}

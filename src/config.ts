/** Tunables in one place so the feel can be adjusted without hunting through files. */

export const ARENA_HALF = 15; // floor is 30 x 30
export const WALL_VISIBLE_H = 0.6; // the low wall you can see
export const WALL_INVISIBLE_H = 8; // the tall invisible wall that keeps objects in

export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 3;

export const PLAYER = {
  size: 0.9,
  color: 0xff7a1a,
  maxSpeed: 7.5,
  /** Acceleration cap (m/s^2). Low enough that a hit still pushes you around. */
  maxAccel: 55,
  linearDamping: 0.35,
};

/** Objects that drift around get a nudge every so often. */
export const WANDER = {
  minInterval: 1.5,
  maxInterval: 3.0,
  minSpeed: 1.6,
  maxSpeed: 3.4,
  /** Pull back toward the middle so everything does not pile up in a corner. */
  centerBias: 0.25,
};

export const FLASH_SECONDS = 0.2;

export const BULLET = {
  radius: 0.16,
  speed: 130,
  lifetime: 5,
  max: 24,
  color: 0xfff2a8,
};

/** Where an object counts as lost and gets sent back to its spawn point. */
export const OUT_OF_BOUNDS = {
  minY: -5,
  maxXZ: ARENA_HALF + 4,
};

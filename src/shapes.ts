/**
 * Shape factory.
 *
 * Every visual mesh and its collider are defined together, in one place, because
 * three.js and Rapier disagree about what their size arguments mean:
 *
 *   three.BoxGeometry(w, h, d)          <-> Rapier.cuboid(w/2, h/2, d/2)
 *   three.CapsuleGeometry(r, len)       <-> Rapier.capsule(len/2, r)
 *   three.CylinderGeometry(r, r, h)     <-> Rapier.cylinder(h/2, r)
 *   three.ConeGeometry(r, h)            <-> Rapier.cone(h/2, r)
 *
 * Getting one of those wrong would put a silent mismatch into a sim whose whole
 * point is showing you where mismatches come from, so nothing here is hand-built
 * per call site.
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import RAPIER from '@dimforge/rapier3d-compat';

/** One mesh + collider pair, optionally offset inside a compound body. */
export interface Part {
  geometry: THREE.BufferGeometry;
  makeCollider: () => RAPIER.ColliderDesc;
  offset?: [number, number, number];
  rotation?: [number, number, number]; // euler XYZ, applied to both mesh and collider
}

export interface ShapeDef {
  parts: Part[];
  color: number;
  /** Distance from the body origin down to the lowest point, so it can rest on the floor. */
  restHeight: number;
}

const eulerToQuat = (e: [number, number, number]) => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
  return { x: q.x, y: q.y, z: q.z, w: q.w };
};

/** Applies a Part's offset/rotation to a Rapier collider description. */
export function placeCollider(desc: RAPIER.ColliderDesc, part: Part): RAPIER.ColliderDesc {
  if (part.offset) desc.setTranslation(part.offset[0], part.offset[1], part.offset[2]);
  if (part.rotation) desc.setRotation(eulerToQuat(part.rotation));
  return desc;
}

// ---------------------------------------------------------------------------
// Basic shapes — visual and collider agree
// ---------------------------------------------------------------------------

const SPHERE_R = 0.7;
const BOX_S = 1.2;
const CAP_R = 0.45;
const CAP_LEN = 1.0; // length of the cylindrical middle section
const CYL_R = 0.6;
const CYL_H = 1.5;
const CONE_R = 0.75;
const CONE_H = 1.7;

/** Vertices of a chunky gem, used for both the convex hull and its mesh. */
const GEM_POINTS: number[] = [
  0, 1.05, 0, 0.8, 0.15, 0.1, 0.25, 0.3, 0.78, -0.6, 0.22, 0.6, -0.78, 0.1, -0.28, 0.05, 0.28, -0.75,
  0.5, -0.35, -0.5, -0.35, -0.42, 0.45, 0.1, -0.9, 0.05,
];

function gemGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < GEM_POINTS.length; i += 3) {
    pts.push(new THREE.Vector3(GEM_POINTS[i], GEM_POINTS[i + 1], GEM_POINTS[i + 2]));
  }
  return new ConvexGeometry(pts);
}

export type WanderKind =
  | 'ball'
  | 'cuboid'
  | 'capsule'
  | 'cylinder'
  | 'cone'
  | 'convexHull'
  | 'snowman'
  | 'dumbbell';

/** The kinds the "敵の数" slider multiplies. */
export const WANDER_KINDS: WanderKind[] = [
  'ball',
  'cuboid',
  'capsule',
  'cylinder',
  'cone',
  'convexHull',
  'snowman',
  'dumbbell',
];

export const KIND_LABEL: Record<string, string> = {
  ball: '球',
  cuboid: '箱',
  capsule: 'カプセル',
  cylinder: '円柱',
  cone: '円錐',
  convexHull: '凸包',
  snowman: '雪だるま',
  dumbbell: 'ダンベル',
};

export function makeWanderShape(kind: WanderKind): ShapeDef {
  switch (kind) {
    case 'ball':
      return {
        color: 0x4aa3ff,
        restHeight: SPHERE_R,
        parts: [
          {
            geometry: new THREE.SphereGeometry(SPHERE_R, 20, 14),
            makeCollider: () => RAPIER.ColliderDesc.ball(SPHERE_R),
          },
        ],
      };

    case 'cuboid':
      return {
        color: 0x59d98a,
        restHeight: BOX_S / 2,
        parts: [
          {
            geometry: new THREE.BoxGeometry(BOX_S, BOX_S, BOX_S),
            makeCollider: () => RAPIER.ColliderDesc.cuboid(BOX_S / 2, BOX_S / 2, BOX_S / 2),
          },
        ],
      };

    case 'capsule':
      return {
        color: 0xc07af0,
        restHeight: CAP_LEN / 2 + CAP_R,
        parts: [
          {
            geometry: new THREE.CapsuleGeometry(CAP_R, CAP_LEN, 6, 16),
            makeCollider: () => RAPIER.ColliderDesc.capsule(CAP_LEN / 2, CAP_R),
          },
        ],
      };

    case 'cylinder':
      return {
        color: 0xf0685f,
        restHeight: CYL_H / 2,
        parts: [
          {
            geometry: new THREE.CylinderGeometry(CYL_R, CYL_R, CYL_H, 20),
            makeCollider: () => RAPIER.ColliderDesc.cylinder(CYL_H / 2, CYL_R),
          },
        ],
      };

    case 'cone':
      return {
        color: 0xf5c542,
        restHeight: CONE_H / 2,
        parts: [
          {
            geometry: new THREE.ConeGeometry(CONE_R, CONE_H, 20),
            makeCollider: () => RAPIER.ColliderDesc.cone(CONE_H / 2, CONE_R),
          },
        ],
      };

    case 'convexHull': {
      // convexHull() returns null for degenerate point clouds, so the caller has
      // to be able to fall back. The point list is fixed, never random.
      const pts = Float32Array.from(GEM_POINTS);
      return {
        color: 0x36c7c7,
        restHeight: 0.9,
        parts: [
          {
            geometry: gemGeometry(),
            makeCollider: () =>
              RAPIER.ColliderDesc.convexHull(pts) ?? RAPIER.ColliderDesc.cuboid(0.7, 0.9, 0.7),
          },
        ],
      };
    }

    case 'snowman': {
      const rb = 0.62;
      const rt = 0.42;
      const yb = -0.2;
      const yt = yb + rb + rt * 0.55;
      return {
        color: 0xe8edf5,
        restHeight: -yb + rb,
        parts: [
          {
            geometry: new THREE.SphereGeometry(rb, 18, 12),
            makeCollider: () => RAPIER.ColliderDesc.ball(rb),
            offset: [0, yb, 0],
          },
          {
            geometry: new THREE.SphereGeometry(rt, 18, 12),
            makeCollider: () => RAPIER.ColliderDesc.ball(rt),
            offset: [0, yt, 0],
          },
        ],
      };
    }

    case 'dumbbell': {
      const r = 0.42;
      const barHalf = 0.62;
      const barR = 0.16;
      // Laid on its side: the bar and both weights are rotated onto the X axis.
      const rot: [number, number, number] = [0, 0, Math.PI / 2];
      return {
        color: 0x8d9bb5,
        restHeight: r,
        parts: [
          {
            geometry: new THREE.CylinderGeometry(barR, barR, barHalf * 2, 12),
            makeCollider: () => RAPIER.ColliderDesc.cylinder(barHalf, barR),
            rotation: rot,
          },
          {
            geometry: new THREE.SphereGeometry(r, 16, 12),
            makeCollider: () => RAPIER.ColliderDesc.ball(r),
            offset: [barHalf, 0, 0],
          },
          {
            geometry: new THREE.SphereGeometry(r, 16, 12),
            makeCollider: () => RAPIER.ColliderDesc.ball(r),
            offset: [-barHalf, 0, 0],
          },
        ],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Fixed props
// ---------------------------------------------------------------------------

/**
 * The donut is sunk into the floor so that the bottom of its hole is below
 * ground level. A ring standing on the floor has its hole starting at twice the
 * tube radius, which a floor-bound player can never walk through — sinking it
 * turns the ring into an archway you can actually run under.
 */
export const DONUT = {
  radius: 1.6,
  tube: 0.3,
  /** Height of the ring centre above the floor. */
  y: 0.95,
  radialSegments: 10,
  tubularSegments: 26,
};

export function donutGeometry(): THREE.BufferGeometry {
  return new THREE.TorusGeometry(
    DONUT.radius,
    DONUT.tube,
    DONUT.radialSegments,
    DONUT.tubularSegments,
  );
}

/** Extracts a Rapier trimesh (vertices + indices) from any three.js geometry. */
export function toTrimesh(geometry: THREE.BufferGeometry): {
  vertices: Float32Array;
  indices: Uint32Array;
} {
  const pos = geometry.getAttribute('position');
  const vertices = new Float32Array(pos.array.length);
  vertices.set(pos.array as ArrayLike<number>);

  const index = geometry.getIndex();
  if (index) {
    return { vertices, indices: Uint32Array.from(index.array as ArrayLike<number>) };
  }
  // Non-indexed geometry: every three vertices already form one triangle.
  const indices = new Uint32Array(pos.count);
  for (let i = 0; i < pos.count; i++) indices[i] = i;
  return { vertices, indices };
}

export const HAMMER = {
  length: 4.4,
  thickness: 0.28,
  headSize: 0.62,
  y: 0.62,
  color: 0xd94f9a,
};

export const STAR = {
  outer: 1.25,
  inner: 0.52,
  depth: 0.16,
  points: 5,
};

/** A flat five-pointed star plate, standing upright like a signboard. */
export function starGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const step = Math.PI / STAR.points;
  for (let i = 0; i < STAR.points * 2; i++) {
    const r = i % 2 === 0 ? STAR.outer : STAR.inner;
    const a = -Math.PI / 2 + i * step;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: STAR.depth,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.translate(0, 0, -STAR.depth / 2);
  return geo;
}

export const ROD = { radius: 0.11, height: 2.4, fakeBallRadius: 1.5 };

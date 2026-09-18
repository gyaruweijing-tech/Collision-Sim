import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SimObject, type SimContext } from './objects.ts';
import {
  DONUT,
  HAMMER,
  ROD,
  STAR,
  donutGeometry,
  starGeometry,
  toTrimesh,
} from './shapes.ts';

const TRUE_COLOR = 0x7fd4ff; // shapes whose collider matches what you see
const FAKE_COLOR = 0xff5f9e; // shapes whose collider deliberately does not


/** A flat pad under a prop, so the matched/mismatched pairs read as a set. */
function addPad(object: SimObject, color: number, radius: number, y: number): void {
  object.addDecorMesh(new THREE.CylinderGeometry(radius, radius, 0.06, 24), color, {
    offset: [0, y, 0],
    opacity: 0.5,
  });
}

/**
 * The real donut: a trimesh collider built from the exact torus mesh, so the
 * hole is a genuine hole you can run through.
 *
 * It is sunk into the floor on purpose. A ring resting on the ground has the
 * bottom of its hole sitting two tube-radii up, which a floor-bound player can
 * never reach; dropping the centre below that turns it into an archway.
 */
export function createTrueDonut(ctx: SimContext, position: THREE.Vector3): SimObject {
  const body = ctx.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
  );
  const object = new SimObject(ctx, 'donut-trimesh', body);
  const geometry = donutGeometry();
  const { vertices, indices } = toTrimesh(geometry);
  object.addPart({
    geometry,
    makeCollider: () => RAPIER.ColliderDesc.trimesh(vertices, indices),
  }, TRUE_COLOR);
  addPad(object, TRUE_COLOR, DONUT.radius + DONUT.tube, -position.y + 0.03);
  object.setSpawn(position);
  object.syncMesh();
  return object;
}

/** Same donut to look at, but the collider is one big ball: the hole is a lie. */
export function createFakeDonut(ctx: SimContext, position: THREE.Vector3): SimObject {
  const body = ctx.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
  );
  const object = new SimObject(ctx, 'donut-ball', body);
  object.addDecorMesh(donutGeometry(), FAKE_COLOR);
  object.addHiddenCollider(RAPIER.ColliderDesc.ball(DONUT.radius + DONUT.tube));
  addPad(object, FAKE_COLOR, DONUT.radius + DONUT.tube, -position.y + 0.03);
  object.setSpawn(position);
  object.syncMesh();
  return object;
}

/** A star plate with a rectangular collider: you bump into the empty corners. */
export function createFakeStar(ctx: SimContext, position: THREE.Vector3): SimObject {
  const body = ctx.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
  );
  const object = new SimObject(ctx, 'star-box', body);
  object.addDecorMesh(starGeometry(), FAKE_COLOR);
  object.addHiddenCollider(
    RAPIER.ColliderDesc.cuboid(STAR.outer, STAR.outer, STAR.depth / 2),
  );
  addPad(object, FAKE_COLOR, STAR.outer, -position.y + 0.03);
  object.setSpawn(position);
  object.syncMesh();
  return object;
}

/** A thin pole with a large invisible ball: you are stopped well before it. */
export function createFakeRod(ctx: SimContext, position: THREE.Vector3): SimObject {
  const body = ctx.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
  );
  const object = new SimObject(ctx, 'rod-ball', body);
  object.addDecorMesh(
    new THREE.CylinderGeometry(ROD.radius, ROD.radius, ROD.height, 12),
    FAKE_COLOR,
  );
  object.addHiddenCollider(RAPIER.ColliderDesc.ball(ROD.fakeBallRadius));
  addPad(object, FAKE_COLOR, ROD.fakeBallRadius, -position.y + 0.03);
  object.setSpawn(position);
  object.syncMesh();
  return object;
}

/**
 * A bar spinning at a fixed point. Kinematic bodies are driven by position, not
 * by forces, so it sweeps through everything it meets and shoves it aside
 * without ever being pushed back itself.
 */
export class Hammer {
  readonly object: SimObject;
  private angle: number;

  constructor(ctx: SimContext, position: THREE.Vector3, private readonly speed: number, phase: number) {
    this.angle = phase;
    const body = ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        position.x,
        position.y,
        position.z,
      ),
    );
    this.object = new SimObject(ctx, 'hammer', body);
    const halfLen = HAMMER.length / 2;
    const halfT = HAMMER.thickness / 2;
    const halfHead = HAMMER.headSize / 2;
    this.object.addPart(
      {
        geometry: new THREE.BoxGeometry(HAMMER.length, HAMMER.thickness, HAMMER.thickness),
        makeCollider: () => RAPIER.ColliderDesc.cuboid(halfLen, halfT, halfT),
      },
      HAMMER.color,
    );
    this.object.addPart(
      {
        geometry: new THREE.BoxGeometry(HAMMER.headSize, HAMMER.headSize, HAMMER.headSize),
        makeCollider: () => RAPIER.ColliderDesc.cuboid(halfHead, halfHead, halfHead),
        offset: [halfLen, 0, 0],
      },
      HAMMER.color,
    );
    this.object.setSpawn(position);
    this.object.syncMesh();
  }

  step(dt: number): void {
    this.angle += this.speed * dt;
    const half = this.angle / 2;
    this.object.body.setNextKinematicRotation({
      x: 0,
      y: Math.sin(half),
      z: 0,
      w: Math.cos(half),
    });
  }
}

export const PROP_LAYOUT = {
  door: new THREE.Vector3(-8, 0, 0),
  trueDonut: new THREE.Vector3(-4.6, DONUT.y, -6),
  fakeDonut: new THREE.Vector3(-0.6, DONUT.y, -6),
  fakeStar: new THREE.Vector3(3.6, STAR.outer + 0.05, -6),
  fakeRod: new THREE.Vector3(8.4, ROD.height / 2, -6),
  hammers: [
    // Kept clear of the auto door's sensor box, which this one used to sweep through.
    { at: new THREE.Vector3(-11.2, HAMMER.y, 8.6), speed: 1.7, phase: 0 },
    { at: new THREE.Vector3(9.5, HAMMER.y, 3.5), speed: -2.1, phase: 1.2 },
    { at: new THREE.Vector3(0, HAMMER.y, -11.5), speed: 1.35, phase: 2.4 },
  ],
};

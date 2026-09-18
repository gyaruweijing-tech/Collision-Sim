import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PLAYER } from './config.ts';
import { SimObject, type SimContext } from './objects.ts';

/**
 * The player is a dynamic body, because the whole point is feeling pushed
 * around. Movement is *not* applied by overwriting the velocity every frame —
 * that would make the player immovable and kill the pushback the sim exists to
 * show. Instead each step nudges the velocity toward the stick's target by at
 * most `maxAccel * dt`: releasing the stick stops you in about a tenth of a
 * second, while a hit still visibly shoves you before you recover.
 */
export class Player {
  readonly object: SimObject;
  private readonly startPosition: THREE.Vector3;

  constructor(ctx: SimContext, position = new THREE.Vector3(0, PLAYER.size / 2 + 0.05, 6)) {
    this.startPosition = position.clone();
    const body = ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(PLAYER.linearDamping)
        // No tumbling: this is a top-down mover, not a ragdoll.
        .lockRotations()
        .setCcdEnabled(true),
    );
    this.object = new SimObject(ctx, 'player', body);
    const half = PLAYER.size / 2;
    this.object.addPart(
      {
        geometry: new THREE.BoxGeometry(PLAYER.size, PLAYER.size, PLAYER.size),
        makeCollider: () => RAPIER.ColliderDesc.cuboid(half, half, half).setFriction(0.4),
      },
      PLAYER.color,
    );
    // A ring on the floor: with a top-down camera and a crowd of objects, the
    // player box alone is easy to lose track of.
    this.object.addDecorMesh(
      new THREE.RingGeometry(PLAYER.size * 0.75, PLAYER.size * 0.95, 28),
      PLAYER.color,
      { offset: [0, -half + 0.02, 0], rotation: [-Math.PI / 2, 0, 0], opacity: 0.55, doubleSide: true },
    );

    this.object.setSpawn(position);
    this.object.syncMesh();
  }

  get body(): RAPIER.RigidBody {
    return this.object.body;
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  private ghost = false;

  get ghostMode(): boolean {
    return this.ghost;
  }

  /**
   * Switches the player between a dynamic body and a kinematic one.
   *
   * A kinematic body is moved by writing positions rather than by forces, so it
   * ignores every collider it meets: it walks straight through walls and props
   * and is never pushed back, while still shoving dynamic objects aside. That is
   * the classic "I moved my character by setting its position" bug, made
   * switchable so the difference is something you can feel.
   */
  setGhost(on: boolean): void {
    if (on === this.ghost) return;
    this.ghost = on;
    this.body.setBodyType(
      on ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic,
      true,
    );
    if (!on) {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** @param move desired direction in world space on the XZ plane, length 0..1 */
  step(move: { x: number; z: number }, dt: number): void {
    if (this.ghost) {
      const t = this.body.translation();
      this.body.setNextKinematicTranslation({
        x: t.x + move.x * PLAYER.maxSpeed * dt,
        y: this.startPosition.y,
        z: t.z + move.z * PLAYER.maxSpeed * dt,
      });
      return;
    }

    const vel = this.body.linvel();
    const targetX = move.x * PLAYER.maxSpeed;
    const targetZ = move.z * PLAYER.maxSpeed;

    let dvx = targetX - vel.x;
    let dvz = targetZ - vel.z;

    const maxDv = PLAYER.maxAccel * dt;
    const len = Math.hypot(dvx, dvz);
    if (len > maxDv && len > 0) {
      dvx = (dvx / len) * maxDv;
      dvz = (dvz / len) * maxDv;
    }

    const mass = this.body.mass() || 1;
    this.body.applyImpulse({ x: dvx * mass, y: 0, z: dvz * mass }, true);
  }

  reset(): void {
    this.setGhost(false);
    this.object.setSpawn(this.startPosition);
    this.object.resetToSpawn();
    this.object.flash = 0;
  }
}

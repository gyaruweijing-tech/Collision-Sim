import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { BULLET } from './config.ts';
import { SimObject, type SimContext } from './objects.ts';

/**
 * Fast projectiles.
 *
 * CCD is left on permanently. It was originally a toggle, meant to show a fast
 * shot tunnelling through thin colliders with it off — but measured against
 * this build (Rapier 0.20) the flag changes nothing: bullets were stopped by an
 * 8 cm board and by the trimesh donut's shell at every speed from 20 to 520 m/s
 * and at timesteps from 1/60 down to 1/8. Rapier's broad phase sweeps the
 * motion of fast bodies regardless, so a switch for it would be a switch that
 * does nothing. The tunnelling lesson lives in the ghost-mode toggle instead.
 */
export class BulletPool {
  private readonly live: Array<{ object: SimObject; life: number }> = [];

  constructor(private readonly ctx: SimContext) {}

  get count(): number {
    return this.live.length;
  }

  fire(from: THREE.Vector3, direction: THREE.Vector3): void {
    while (this.live.length >= BULLET.max) this.retire(0);

    const dir = direction.clone().normalize();
    const start = from.clone().addScaledVector(dir, 1.1);

    const body = this.ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(start.x, start.y, start.z)
        // No gravity: a flat shot makes the tunnelling easier to aim and to see.
        .setGravityScale(0)
        .setCcdEnabled(true)
        .setLinvel(dir.x * BULLET.speed, dir.y * BULLET.speed, dir.z * BULLET.speed),
    );

    const object = new SimObject(this.ctx, 'bullet', body);
    object.addPart(
      {
        geometry: new THREE.SphereGeometry(BULLET.radius, 10, 8),
        makeCollider: () => RAPIER.ColliderDesc.ball(BULLET.radius).setDensity(6),
      },
      BULLET.color,
    );
    object.setSpawn(start);
    object.syncMesh();
    this.live.push({ object, life: BULLET.lifetime });
  }

  tick(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.life -= dt;
      const p = b.object.body.translation();
      const gone = b.life <= 0 || Math.abs(p.x) > 60 || Math.abs(p.z) > 60 || p.y < -20;
      if (gone) {
        this.retire(i);
        continue;
      }
      b.object.tickFlash(dt);
      b.object.syncMesh();
    }
  }

  private retire(index: number): void {
    this.live[index].object.dispose();
    this.live.splice(index, 1);
  }

  clear(): void {
    while (this.live.length) this.retire(this.live.length - 1);
  }
}

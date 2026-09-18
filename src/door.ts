import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SimObject, type SimContext } from './objects.ts';

/**
 * A sliding door that opens when the player stands in front of it.
 *
 * This is the worked example for what a sensor is actually *for*. Three pieces
 * that the sim has already introduced separately come together here:
 *
 *   1. an invisible sensor box, which detects overlap and never pushes anything
 *   2. the overlap query that asks, each step, whether the player is inside it
 *   3. a kinematic panel, moved by writing positions, which slides out of the way
 *
 * That is the minimum shape of nearly every scripted event in a game: a region
 * notices you, and something moves.
 *
 * Only the player opens it. A bullet fired from across the arena hits the shut
 * panel and bounces, which is the easiest way to see that the panel is a real
 * wall and the box in front of it is not.
 */
const WALL = {
  height: 2.4,
  thickness: 0.5,
  pillarWidth: 2.0,
  doorway: 2.4,
  color: 0x3d465a,
};

const PANEL = {
  width: WALL.doorway,
  height: WALL.height,
  thickness: 0.4,
  /** Sits just in front of the wall, like a barn door, so it can slide clear. */
  z: 0.45,
  color: 0x4fd0a8,
  travel: 2.6,
  /** Seconds for a full open or close. */
  duration: 0.35,
};

/** Slightly narrower than the doorway, so its edges are visible with 判定表示 on. */
const ZONE = { halfX: 1.0, halfY: 1.0, halfZ: 1.9 };

export class AutoDoor {
  readonly pillars: SimObject;
  readonly panel: SimObject;
  readonly zone: SimObject;
  readonly zoneCollider: RAPIER.Collider;

  /** 0 = shut, 1 = fully open. */
  private opened = 0;

  constructor(ctx: SimContext, private readonly origin: THREE.Vector3) {
    const halfGap = WALL.doorway / 2;
    const pillarHalf = WALL.pillarWidth / 2;
    const offset = halfGap + pillarHalf;

    // --- the wall either side of the opening (structure: always solid) -------
    const pillarBody = ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(origin.x, origin.y, origin.z),
    );
    this.pillars = new SimObject(ctx, 'door-wall', pillarBody);
    for (const side of [-1, 1]) {
      this.pillars.addPart(
        {
          geometry: new THREE.BoxGeometry(WALL.pillarWidth, WALL.height, WALL.thickness),
          makeCollider: () =>
            RAPIER.ColliderDesc.cuboid(pillarHalf, WALL.height / 2, WALL.thickness / 2),
          offset: [side * offset, WALL.height / 2, 0],
        },
        WALL.color,
      );
    }

    // --- the panel that slides (kinematic: driven by position) --------------
    const panelBody = ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        origin.x,
        origin.y + PANEL.height / 2,
        origin.z + PANEL.z,
      ),
    );
    this.panel = new SimObject(ctx, 'door-panel', panelBody);
    this.panel.addPart(
      {
        geometry: new THREE.BoxGeometry(PANEL.width, PANEL.height, PANEL.thickness),
        makeCollider: () =>
          RAPIER.ColliderDesc.cuboid(PANEL.width / 2, PANEL.height / 2, PANEL.thickness / 2),
      },
      PANEL.color,
    );

    // --- the sensor box (detects, never pushes, never drawn) ----------------
    const zoneBody = ctx.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(origin.x, origin.y + ZONE.halfY, origin.z),
    );
    this.zone = new SimObject(ctx, 'door-zone', zoneBody);
    this.zone.silent = true; // touching it is not a collision worth flashing
    this.zone.addHiddenCollider(
      RAPIER.ColliderDesc.cuboid(ZONE.halfX, ZONE.halfY, ZONE.halfZ).setSensor(true),
    );
    this.zoneCollider = this.zone.colliders[0];

    this.pillars.setSpawn(origin);
    this.zone.setSpawn(origin);
    this.pillars.syncMesh();
    this.zone.syncMesh();
    this.applyPanelPosition();
  }

  /** @param playerInside whether the player currently overlaps the sensor box */
  step(dt: number, playerInside: boolean): void {
    const target = playerInside ? 1 : 0;
    const rate = dt / PANEL.duration;
    if (this.opened < target) this.opened = Math.min(target, this.opened + rate);
    else if (this.opened > target) this.opened = Math.max(target, this.opened - rate);
    this.applyPanelPosition();
  }

  reset(): void {
    this.opened = 0;
    this.applyPanelPosition();
    this.panel.body.setTranslation(this.closedPosition(), true);
  }

  private closedPosition(): { x: number; y: number; z: number } {
    return {
      x: this.origin.x,
      y: this.origin.y + PANEL.height / 2,
      z: this.origin.z + PANEL.z,
    };
  }

  private applyPanelPosition(): void {
    // Smooth the ends so the panel eases rather than starting and stopping hard.
    const t = this.opened * this.opened * (3 - 2 * this.opened);
    const p = this.closedPosition();
    this.panel.body.setNextKinematicTranslation({
      x: p.x - t * PANEL.travel,
      y: p.y,
      z: p.z,
    });
  }
}

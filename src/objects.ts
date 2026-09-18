import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { FLASH_SECONDS, OUT_OF_BOUNDS, WANDER } from './config.ts';
import { placeCollider, type Part, type ShapeDef } from './shapes.ts';
import { randomDirXZ, range } from './rng.ts';

export interface SimContext {
  scene: THREE.Scene;
  world: RAPIER.World;
  /** collider handle -> owning object, for resolving collision events. */
  byCollider: Map<number, SimObject>;
}

export type Wander = { timer: number };

/**
 * A rigid body plus the meshes that draw it. Materials are never shared between
 * objects: the contact flash tints `emissive` per instance, and a shared
 * material would light up every object of the same kind at once.
 */
export class SimObject {
  readonly group = new THREE.Group();
  readonly colliders: RAPIER.Collider[] = [];
  readonly materials: THREE.MeshLambertMaterial[] = [];
  readonly geometries: THREE.BufferGeometry[] = [];
  readonly spawnPosition = new THREE.Vector3();
  readonly spawnRotation = new THREE.Quaternion();

  flash = 0;
  wander: Wander | null = null;
  /** Whether 検知のみモード should let the player pass through this object. */
  phaseable = false;
  /** Contacts with this object do not flash anything (used by the door sensor). */
  silent = false;

  constructor(
    readonly ctx: SimContext,
    readonly kind: string,
    readonly body: RAPIER.RigidBody,
  ) {
    ctx.scene.add(this.group);
  }

  addPart(part: Part, color: number, opts: { sensorEvents?: boolean } = {}): void {
    const material = new THREE.MeshLambertMaterial({ color, emissive: 0x000000 });
    const mesh = new THREE.Mesh(part.geometry, material);
    if (part.offset) mesh.position.set(part.offset[0], part.offset[1], part.offset[2]);
    if (part.rotation) mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
    this.group.add(mesh);
    this.materials.push(material);
    this.geometries.push(part.geometry);

    const desc = placeCollider(part.makeCollider(), part);
    if (opts.sensorEvents !== false) desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = this.ctx.world.createCollider(desc, this.body);
    this.colliders.push(collider);
    this.ctx.byCollider.set(collider.handle, this);
  }

  /** Adds a collider with no matching mesh — used by the mismatch demos. */
  addHiddenCollider(desc: RAPIER.ColliderDesc): void {
    desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = this.ctx.world.createCollider(desc, this.body);
    this.colliders.push(collider);
    this.ctx.byCollider.set(collider.handle, this);
  }

  /** Adds a mesh with no collider of its own — used by the mismatch demos. */
  addDecorMesh(geometry: THREE.BufferGeometry, color: number, opts: {
    offset?: [number, number, number];
    rotation?: [number, number, number];
    opacity?: number;
    doubleSide?: boolean;
  } = {}): void {
    const material = new THREE.MeshLambertMaterial({ color, emissive: 0x000000 });
    if (opts.doubleSide) material.side = THREE.DoubleSide;
    if (opts.opacity !== undefined && opts.opacity < 1) {
      material.transparent = true;
      material.opacity = opts.opacity;
    }
    const mesh = new THREE.Mesh(geometry, material);
    if (opts.offset) mesh.position.set(...opts.offset);
    if (opts.rotation) mesh.rotation.set(...opts.rotation);
    this.group.add(mesh);
    this.materials.push(material);
    this.geometries.push(geometry);
  }

  setSpawn(position: THREE.Vector3, rotation?: THREE.Quaternion): void {
    this.spawnPosition.copy(position);
    if (rotation) this.spawnRotation.copy(rotation);
  }

  syncMesh(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.group.position.set(t.x, t.y, t.z);
    this.group.quaternion.set(r.x, r.y, r.z, r.w);
  }

  hit(): void {
    this.flash = FLASH_SECONDS;
  }

  tickFlash(dt: number): void {
    if (this.flash <= 0) return;
    this.flash = Math.max(0, this.flash - dt);
    const v = (this.flash / FLASH_SECONDS) * 0.85;
    for (const m of this.materials) m.emissive.setScalar(v);
  }

  /**
   * Turns the push-apart on or off for this object.
   *
   * This is deliberately not `setSensor()`. A sensor collider stops responding
   * to *everything*, so switching the enemies to sensors dropped them straight
   * through the floor. Solver groups only silence the pairs we name.
   */
  setSolverGroups(groups: number): void {
    for (const c of this.colliders) c.setSolverGroups(groups);
  }

  /** Random nudge, scaled by mass so light and heavy objects move alike. */
  tickWander(dt: number, rng: () => number): void {
    const w = this.wander;
    if (!w) return;
    w.timer -= dt;
    if (w.timer > 0) return;
    w.timer = range(rng, WANDER.minInterval, WANDER.maxInterval);

    const dir = randomDirXZ(rng);
    const speed = range(rng, WANDER.minSpeed, WANDER.maxSpeed);
    const pos = this.body.translation();
    // Bias toward the middle of the arena so nothing settles in a corner.
    const len = Math.hypot(pos.x, pos.z) || 1;
    const bx = (-pos.x / len) * WANDER.centerBias;
    const bz = (-pos.z / len) * WANDER.centerBias;
    const mass = this.body.mass() || 1;
    this.body.applyImpulse(
      { x: (dir.x + bx) * speed * mass, y: 0, z: (dir.z + bz) * speed * mass },
      true,
    );
  }

  /** Sends the object home if it escaped the arena. */
  keepInBounds(): void {
    const p = this.body.translation();
    const lost =
      p.y < OUT_OF_BOUNDS.minY ||
      Math.abs(p.x) > OUT_OF_BOUNDS.maxXZ ||
      Math.abs(p.z) > OUT_OF_BOUNDS.maxXZ ||
      !Number.isFinite(p.x + p.y + p.z);
    if (!lost) return;
    this.resetToSpawn();
  }

  resetToSpawn(): void {
    this.body.setTranslation(
      { x: this.spawnPosition.x, y: this.spawnPosition.y, z: this.spawnPosition.z },
      true,
    );
    this.body.setRotation(
      {
        x: this.spawnRotation.x,
        y: this.spawnRotation.y,
        z: this.spawnRotation.z,
        w: this.spawnRotation.w,
      },
      true,
    );
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  dispose(): void {
    for (const c of this.colliders) this.ctx.byCollider.delete(c.handle);
    this.ctx.world.removeRigidBody(this.body);
    this.ctx.scene.remove(this.group);
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.colliders.length = 0;
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}

/** Builds a dynamic body from a ShapeDef. */
export function createDynamic(
  ctx: SimContext,
  kind: string,
  def: ShapeDef,
  position: THREE.Vector3,
): SimObject {
  const body = ctx.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.25)
      .setAngularDamping(0.4),
  );
  const obj = new SimObject(ctx, kind, body);
  for (const part of def.parts) obj.addPart(part, def.color);
  obj.setSpawn(position);
  obj.syncMesh();
  return obj;
}

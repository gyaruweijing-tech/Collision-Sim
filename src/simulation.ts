import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { FIXED_DT, SOLVER_GROUPS } from './config.ts';
import { buildArena, buildLights } from './arena.ts';
import { BulletPool } from './bullets.ts';
import { createDynamic, SimObject, type SimContext } from './objects.ts';
import { Player } from './player.ts';
import {
  Hammer,
  PROP_LAYOUT,
  createFakeDonut,
  createFakeRod,
  createFakeStar,
  createTrueDonut,
} from './props.ts';
import { makeRng, range } from './rng.ts';
import { WANDER_KINDS, makeWanderShape } from './shapes.ts';

export class Simulation {
  readonly scene = new THREE.Scene();
  readonly world: RAPIER.World;
  readonly ctx: SimContext;
  readonly player: Player;
  readonly bullets: BulletPool;

  private readonly eventQueue = new RAPIER.EventQueue(true);
  private readonly hammers: Hammer[] = [];
  private readonly props: SimObject[] = [];
  private readonly wanderers: SimObject[] = [];
  private rng = makeRng((Math.random() * 0xffffffff) >>> 0);

  countPerKind = 2;
  detectOnly = false;

  constructor() {
    this.scene.background = new THREE.Color(0x1b1f27);
    this.scene.fog = new THREE.Fog(0x1b1f27, 42, 78);

    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;

    this.ctx = { scene: this.scene, world: this.world, byCollider: new Map() };

    buildLights(this.scene);
    buildArena(this.scene, this.world);

    this.player = new Player(this.ctx);
    this.bullets = new BulletPool(this.ctx);

    this.buildProps();
    this.buildWanderers();
  }

  /** Exposed for tools/verify.mjs. */
  get wanderersForTest(): readonly SimObject[] {
    return this.wanderers;
  }

  get bodyCount(): number {
    return this.wanderers.length + this.props.length + this.hammers.length + 1;
  }

  // -------------------------------------------------------------------------
  // construction
  // -------------------------------------------------------------------------

  private buildProps(): void {
    const L = PROP_LAYOUT;
    this.props.push(
      createTrueDonut(this.ctx, L.trueDonut),
      createFakeDonut(this.ctx, L.fakeDonut),
      createFakeStar(this.ctx, L.fakeStar),
      createFakeRod(this.ctx, L.fakeRod),
    );
    for (const h of L.hammers) this.hammers.push(new Hammer(this.ctx, h.at, h.speed, h.phase));

    for (const p of this.props) p.phaseable = true;
    for (const h of this.hammers) h.object.phaseable = true;
  }

  private buildWanderers(): void {
    const taken: THREE.Vector3[] = [
      this.player.position,
      ...this.props.map((p) => p.spawnPosition),
      ...this.hammers.map((h) => h.object.spawnPosition),
    ];

    for (const kind of WANDER_KINDS) {
      for (let i = 0; i < this.countPerKind; i++) {
        const def = makeWanderShape(kind);
        const position = this.pickSpawn(taken, def.restHeight + 0.15);
        const object = createDynamic(this.ctx, kind, def, position);
        object.wander = { timer: range(this.rng, 0.2, 2.0) };
        object.phaseable = true;
        this.wanderers.push(object);
        taken.push(position);
      }
    }
    this.applyDetectOnly();
  }

  /** Finds a free-ish spot; gives up after a bounded number of tries. */
  private pickSpawn(taken: THREE.Vector3[], y: number): THREE.Vector3 {
    const limit = 12.5;
    const candidate = new THREE.Vector3();
    for (let attempt = 0; attempt < 40; attempt++) {
      candidate.set(range(this.rng, -limit, limit), y, range(this.rng, -limit, limit));
      let ok = true;
      for (const t of taken) {
        const dx = t.x - candidate.x;
        const dz = t.z - candidate.z;
        if (dx * dx + dz * dz < 3.6 * 3.6) {
          ok = false;
          break;
        }
      }
      if (ok) break;
    }
    return candidate.clone();
  }

  private clearWanderers(): void {
    for (const w of this.wanderers) w.dispose();
    this.wanderers.length = 0;
  }

  // -------------------------------------------------------------------------
  // controls
  // -------------------------------------------------------------------------

  setCount(count: number): void {
    if (count === this.countPerKind) return;
    this.countPerKind = count;
    this.clearWanderers();
    this.buildWanderers();
  }

  /** Full reset. Enemy placement is re-randomised every time, by design. */
  reset(): void {
    this.rng = makeRng((Math.random() * 0xffffffff) >>> 0);
    this.bullets.clear();
    this.clearWanderers();
    for (const p of this.props) {
      p.resetToSpawn();
      p.flash = 0;
      for (const m of p.materials) m.emissive.setScalar(0);
    }
    this.player.reset();
    this.buildWanderers();
  }

  /**
   * 検知のみモード: the player slips through every object instead of being
   * stopped by it, while contacts are still reported so both sides still flash.
   * Everything else — gravity, the floor, objects shoving each other — carries
   * on as normal.
   */
  setDetectOnly(on: boolean): void {
    this.detectOnly = on;
    this.applyDetectOnly();
  }

  private applyDetectOnly(): void {
    const props = this.detectOnly ? SOLVER_GROUPS.propPhaseThrough : SOLVER_GROUPS.normal;
    const player = this.detectOnly ? SOLVER_GROUPS.playerPhaseThrough : SOLVER_GROUPS.normal;
    for (const o of this.wanderers) if (o.phaseable) o.setSolverGroups(props);
    for (const p of this.props) if (p.phaseable) p.setSolverGroups(props);
    for (const h of this.hammers) if (h.object.phaseable) h.object.setSolverGroups(props);
    this.player.object.setSolverGroups(player);
  }

  setGhostMode(on: boolean): void {
    this.player.setGhost(on);
  }

  shoot(direction: THREE.Vector3): void {
    const from = this.player.position;
    from.y = Math.max(from.y, 0.5);
    this.bullets.fire(from, direction);
  }

  // -------------------------------------------------------------------------
  // stepping
  // -------------------------------------------------------------------------

  /** One fixed physics step. */
  step(move: { x: number; z: number }): void {
    const dt = FIXED_DT;

    this.player.step(move, dt);
    for (const h of this.hammers) h.step(dt);
    for (const w of this.wanderers) w.tickWander(dt, this.rng);

    this.world.step(this.eventQueue);

    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = this.ctx.byCollider.get(h1);
      const b = this.ctx.byCollider.get(h2);
      if (!a || !b) return;
      // Only contacts that involve the player (or one of their shots) light up.
      const interesting =
        a.kind === 'player' || b.kind === 'player' || a.kind === 'bullet' || b.kind === 'bullet';
      if (!interesting) return;
      a.hit();
      b.hit();
    });

    for (const w of this.wanderers) w.keepInBounds();
    this.player.object.keepInBounds();
  }

  /** Per-rendered-frame work: visuals only. */
  render(dt: number): void {
    for (const w of this.wanderers) {
      w.tickFlash(dt);
      w.syncMesh();
    }
    for (const p of this.props) p.tickFlash(dt);
    for (const h of this.hammers) {
      h.object.tickFlash(dt);
      h.object.syncMesh();
    }
    this.player.object.tickFlash(dt);
    this.player.object.syncMesh();
    this.bullets.tick(dt);
  }
}

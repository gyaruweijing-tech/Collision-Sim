import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ARENA_HALF, WALL_INVISIBLE_H, WALL_VISIBLE_H } from './config.ts';

/**
 * Flat floor plus a low perimeter wall. The visible wall is deliberately low,
 * so an extra *invisible* tall wall sits on top of it — otherwise the random
 * impulses launch light objects clean out of the arena and they never return.
 */
export function buildArena(scene: THREE.Scene, world: RAPIER.World): void {
  const h = ARENA_HALF;

  const floorMat = new THREE.MeshLambertMaterial({ color: 0x2e3542 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(h * 2, 0.4, h * 2), floorMat);
  floor.position.y = -0.2;
  scene.add(floor);

  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.2, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(h, 0.2, h), floorBody);

  // A faint grid makes motion readable on a flat single-colour floor.
  const grid = new THREE.GridHelper(h * 2, h * 2, 0x46506180, 0x3a4250);
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.35;
  grid.position.y = 0.002;
  scene.add(grid);

  const wallMat = new THREE.MeshLambertMaterial({ color: 0x3d465a });
  const t = 0.4; // wall thickness

  const sides: Array<[number, number, number, number]> = [
    // [cx, cz, halfX, halfZ]
    [0, -h, h + t, t],
    [0, h, h + t, t],
    [-h, 0, t, h + t],
    [h, 0, t, h + t],
  ];

  for (const [cx, cz, hx, hz] of sides) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, WALL_VISIBLE_H, hz * 2), wallMat);
    mesh.position.set(cx, WALL_VISIBLE_H / 2, cz);
    scene.add(mesh);

    // One collider, tall and invisible, covering both the visible wall and the
    // containment volume above it.
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx, WALL_INVISIBLE_H / 2, cz),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, WALL_INVISIBLE_H / 2, hz), body);
  }
}

export function buildLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x20242e, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(8, 16, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fb4ff, 0.45);
  fill.position.set(-9, 7, -8);
  scene.add(fill);
}

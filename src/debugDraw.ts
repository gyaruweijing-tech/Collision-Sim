import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Draws Rapier's collider outlines.
 *
 * `world.debugRender()` hands back a fresh pair of arrays every call, and their
 * length changes whenever objects are added or removed, so the buffer
 * attributes are rebuilt on length change and merely refilled otherwise.
 * Rapier's colours are RGBA; three.js wants RGB here, so alpha is dropped.
 */
export class DebugDraw {
  readonly lines: THREE.LineSegments;
  private positions = new Float32Array(0);
  private colors = new Float32Array(0);

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      // Draw on top of the solid meshes, otherwise the outlines hide inside them.
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    this.lines = new THREE.LineSegments(geometry, material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  set visible(v: boolean) {
    this.lines.visible = v;
  }

  get visible(): boolean {
    return this.lines.visible;
  }

  /** Only call this while visible — debugRender() is not cheap. */
  update(world: RAPIER.World): void {
    if (!this.lines.visible) return;
    const buffers = world.debugRender();
    const vertexCount = buffers.vertices.length / 3;
    const geometry = this.lines.geometry;

    if (this.positions.length !== buffers.vertices.length) {
      this.positions = new Float32Array(buffers.vertices.length);
      this.colors = new Float32Array(vertexCount * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    }

    this.positions.set(buffers.vertices);
    for (let i = 0; i < vertexCount; i++) {
      this.colors[i * 3] = buffers.colors[i * 4];
      this.colors[i * 3 + 1] = buffers.colors[i * 4 + 1];
      this.colors[i * 3 + 2] = buffers.colors[i * 4 + 2];
    }

    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('color').needsUpdate = true;
    geometry.setDrawRange(0, vertexCount);
    geometry.computeBoundingSphere();
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}

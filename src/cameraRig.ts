import * as THREE from 'three';

/**
 * Fixed-orientation camera looking down at an angle, smoothly following the
 * player. It never rotates, so "up" on the stick always means the same
 * direction on screen — but because it is angled, world axes and screen axes do
 * not line up, and movement has to be expressed relative to the camera.
 *
 * On a portrait phone the horizontal field of view collapses, so the rig backs
 * off as the aspect ratio narrows and the arena stays readable either way.
 */
const BASE_OFFSET = new THREE.Vector3(0, 15, 8.4);

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private readonly offset = BASE_OFFSET.clone();
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();

  /** Camera-relative forward/right on the XZ plane. */
  readonly forward = new THREE.Vector3(0, 0, -1);
  readonly right = new THREE.Vector3(1, 0, 0);

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 200);
    this.resize(aspect);
    this.camera.position.copy(this.offset);
    this.camera.lookAt(0, 0, 0);
    this.updateBasis();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    // Pull back when the screen is narrow (portrait) so the horizontal view
    // does not shrink to a slit.
    const narrow = aspect < 1 ? Math.min(1 / aspect, 2.2) : 1;
    const scale = 1 + (narrow - 1) * 0.42;
    this.offset.copy(BASE_OFFSET).multiplyScalar(scale);
    this.camera.updateProjectionMatrix();
  }

  update(playerPosition: THREE.Vector3, dt: number): void {
    this.target.lerp(playerPosition, 1 - Math.pow(0.001, dt));
    this.desired.copy(this.target).add(this.offset);
    this.camera.position.lerp(this.desired, 1 - Math.pow(0.0005, dt));
    this.camera.lookAt(this.target.x, this.target.y + 0.4, this.target.z);
    this.updateBasis();
  }

  /** Snaps straight to the target, used on reset. */
  snapTo(playerPosition: THREE.Vector3): void {
    this.target.copy(playerPosition);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target.x, this.target.y + 0.4, this.target.z);
    this.updateBasis();
  }

  private updateBasis(): void {
    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    // right = forward x up
    this.right.set(-this.forward.z, 0, this.forward.x).normalize();
  }

  /** Converts stick input into a world-space direction on the XZ plane. */
  toWorldMove(input: { x: number; y: number }, out: { x: number; z: number }): void {
    out.x = this.right.x * input.x + this.forward.x * input.y;
    out.z = this.right.z * input.x + this.forward.z * input.y;
  }
}

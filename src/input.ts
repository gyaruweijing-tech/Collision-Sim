/**
 * Virtual stick (touch/mouse) + WASD/arrow keys.
 *
 * Everything goes through Pointer Events with pointer capture, so a drag that
 * leaves the stick keeps tracking. `preventDefault` on the stick and canvas
 * stops iOS scrolling, pull-to-refresh and double-tap zoom from firing while
 * you steer.
 */
export interface MoveInput {
  /** -1..1, right positive */
  x: number;
  /** -1..1, forward (away from camera) positive */
  y: number;
}

const DEAD_ZONE = 0.12;

export class InputController {
  private readonly keys = new Set<string>();
  private stickPointer: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private radius = 56;

  constructor(
    private readonly stickEl: HTMLElement,
    private readonly knobEl: HTMLElement,
    canvas: HTMLCanvasElement,
  ) {
    this.measure();
    window.addEventListener('resize', () => this.measure());

    stickEl.addEventListener('pointerdown', this.onDown, { passive: false });
    stickEl.addEventListener('pointermove', this.onMove, { passive: false });
    stickEl.addEventListener('pointerup', this.onUp, { passive: false });
    stickEl.addEventListener('pointercancel', this.onUp, { passive: false });

    // The canvas itself should never scroll the page.
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.release();
    });
  }

  private measure(): void {
    const r = this.stickEl.getBoundingClientRect();
    this.radius = Math.max(24, Math.min(r.width, r.height) / 2 - 8);
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.stickPointer !== null) return;
    this.stickPointer = e.pointerId;
    this.stickEl.setPointerCapture(e.pointerId);
    this.updateFrom(e);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointer) return;
    e.preventDefault();
    this.updateFrom(e);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointer) return;
    e.preventDefault();
    this.stickEl.releasePointerCapture?.(e.pointerId);
    this.release();
  };

  private release(): void {
    this.stickPointer = null;
    this.stickX = 0;
    this.stickY = 0;
    this.knobEl.style.transform = '';
  }

  private updateFrom(e: PointerEvent): void {
    const r = this.stickEl.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, this.radius);
    const nx = dist > 0 ? (dx / dist) * (clamped / this.radius) : 0;
    const ny = dist > 0 ? (dy / dist) * (clamped / this.radius) : 0;
    this.stickX = nx;
    // Screen Y grows downward; "up" on the stick means forward.
    this.stickY = -ny;
    this.knobEl.style.transform = `translate(${nx * this.radius}px, ${ny * this.radius}px)`;
  }

  /** Combined stick + keyboard, clamped to length 1. */
  read(): MoveInput {
    let x = this.stickX;
    let y = this.stickY;

    const k = this.keys;
    let kx = 0;
    let ky = 0;
    if (k.has('a') || k.has('arrowleft')) kx -= 1;
    if (k.has('d') || k.has('arrowright')) kx += 1;
    if (k.has('w') || k.has('arrowup')) ky += 1;
    if (k.has('s') || k.has('arrowdown')) ky -= 1;
    if (kx !== 0 || ky !== 0) {
      const kl = Math.hypot(kx, ky);
      x = kx / kl;
      y = ky / kl;
    }

    const len = Math.hypot(x, y);
    if (len < DEAD_ZONE) return { x: 0, y: 0 };
    if (len > 1) return { x: x / len, y: y / len };
    return { x, y };
  }
}

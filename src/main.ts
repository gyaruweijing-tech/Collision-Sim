import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { FIXED_DT, MAX_STEPS_PER_FRAME } from './config.ts';
import { CameraRig } from './cameraRig.ts';
import { DebugDraw } from './debugDraw.ts';
import { InputController } from './input.ts';
import { Simulation } from './simulation.ts';

const boot = document.getElementById('boot') as HTMLDivElement;
const bootMsg = document.getElementById('boot-msg') as HTMLParagraphElement;

function fail(err: unknown): void {
  boot.classList.remove('hidden');
  boot.classList.add('error');
  bootMsg.textContent =
    '読み込みに失敗しました。\n' + (err instanceof Error ? err.message : String(err));
  console.error(err);
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

async function main(): Promise<void> {
  // Rapier is WebAssembly and must finish initialising before anything else
  // touches the API, so the page shows a loading panel until this resolves.
  await RAPIER.init();

  const canvas = el<HTMLCanvasElement>('view');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    // Antialiasing buys little on a high-DPI phone and costs a lot.
    antialias: window.devicePixelRatio < 1.5,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const sim = new Simulation();
  const rig = new CameraRig(window.innerWidth / window.innerHeight);
  const debug = new DebugDraw(sim.scene);
  const input = new InputController(el('stick'), el('stick-knob'), canvas);

  rig.snapTo(sim.player.position);

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    rig.resize(w / h);
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  window.visualViewport?.addEventListener('resize', resize);

  // --- UI ------------------------------------------------------------------
  const btnDebug = el<HTMLButtonElement>('btn-debug');
  const btnSensor = el<HTMLButtonElement>('btn-sensor');
  const btnGhost = el<HTMLButtonElement>('btn-ghost');
  const btnShoot = el<HTMLButtonElement>('btn-shoot');
  const btnReset = el<HTMLButtonElement>('btn-reset');
  const slider = el<HTMLInputElement>('count');
  const countOut = el<HTMLOutputElement>('count-out');
  const stats = el<HTMLSpanElement>('stats');

  const setPressed = (b: HTMLButtonElement, on: boolean) =>
    b.setAttribute('aria-pressed', String(on));

  btnDebug.addEventListener('click', () => {
    debug.visible = !debug.visible;
    setPressed(btnDebug, debug.visible);
  });

  btnSensor.addEventListener('click', () => {
    sim.setDetectOnly(!sim.detectOnly);
    setPressed(btnSensor, sim.detectOnly);
  });

  btnGhost.addEventListener('click', () => {
    sim.setGhostMode(!sim.player.ghostMode);
    setPressed(btnGhost, sim.player.ghostMode);
  });

  const shootDirection = new THREE.Vector3();
  function shoot(): void {
    const move = input.read();
    if (move.x !== 0 || move.y !== 0) {
      // Fire where you are steering, otherwise straight ahead.
      shootDirection.set(0, 0, 0).addScaledVector(rig.right, move.x).addScaledVector(rig.forward, move.y);
    } else {
      shootDirection.copy(rig.forward);
    }
    sim.shoot(shootDirection);
  }
  btnShoot.addEventListener('click', shoot);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      shoot();
    }
  });

  btnReset.addEventListener('click', () => {
    sim.reset();
    setPressed(btnGhost, sim.player.ghostMode);
    rig.snapTo(sim.player.position);
  });

  slider.addEventListener('input', () => {
    countOut.textContent = slider.value;
  });
  // Rebuilding is expensive, so it happens once the slider is let go.
  slider.addEventListener('change', () => {
    sim.setCount(Number(slider.value));
  });
  slider.value = String(sim.countPerKind);
  countOut.textContent = slider.value;

  // --- loop ----------------------------------------------------------------
  const worldMove = { x: 0, z: 0 };
  let last = performance.now();
  let accumulator = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;

  function frame(now: number): void {
    requestAnimationFrame(frame);

    const raw = (now - last) / 1000;
    last = now;
    // Tab switches and long stalls must not be replayed as one giant catch-up.
    const dt = Math.min(raw, 0.25);

    // Fixed physics step, independent of the display refresh rate: stepping
    // once per frame would run the sim at double speed on a 120Hz phone.
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      const move = input.read();
      rig.toWorldMove(move, worldMove);
      sim.step(worldMove);
      accumulator -= FIXED_DT;
      steps++;
    }
    if (accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) accumulator = 0;

    sim.render(dt);
    rig.update(sim.player.position, dt);
    debug.update(sim.world);
    renderer.render(sim.scene, rig.camera);

    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 0.5) {
      const fps = Math.round(fpsFrames / fpsAccum);
      stats.textContent = `${fps}fps / ${sim.bodyCount}体`;
      fpsAccum = 0;
      fpsFrames = 0;
    }
  }

  // Handy for poking at the simulation from the browser console.
  (window as unknown as { collisionSim: unknown }).collisionSim = { sim, rig, debug, renderer };

  boot.classList.add('hidden');
  requestAnimationFrame(frame);
}

main().catch(fail);

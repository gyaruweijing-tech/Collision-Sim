/**
 * Behaviour checks for the things this sim is supposed to teach.
 *
 * Run against a built preview:
 *   npm run build && npm run preview &   # serves /Collision-Sim/
 *   node tools/verify.mjs
 *
 * These drive the physics directly through `window.collisionSim`, stepping the
 * world by hand, so they do not depend on frame timing.
 */
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:4173/Collision-Sim/';
const EXECUTABLE = process.env.CHROMIUM_PATH; // optional: preinstalled browser

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`);
  if (!ok) failures.push(message);
};

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.collisionSim !== undefined, { timeout: 40000 });

/** Walks the player from z = -2.6 straight into the prop sitting at (x, -6). */
const walkInto = (x, options = {}) =>
  page.evaluate(({ x, ghost, sensor }) => {
    const { sim } = window.collisionSim;
    sim.setGhostMode(!!ghost);
    sim.setDetectOnly(!!sensor);
    const body = sim.player.body;
    body.setTranslation({ x, y: 0.5, z: -2.6 }, true);
    if (!ghost) body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    for (let i = 0; i < 260; i++) sim.step({ x: 0, z: -1 });
    const p = body.translation();
    const flashed = sim.player.object.materials.some((m) => m.emissive.r > 0);
    sim.setGhostMode(false);
    sim.setDetectOnly(false);
    return { x: p.x, y: p.y, z: p.z, flashed };
  }, { x, ...options });

const trueDonut = await walkInto(-4.6);
check(trueDonut.z < -7, `trimesh donut: the hole is a real hole (stopped at z=${trueDonut.z.toFixed(2)})`);

const fakeDonut = await walkInto(-0.6);
check(
  fakeDonut.z > -4.6 && fakeDonut.z < -2.5,
  `ball-collider donut: blocked out in front of the hole (z=${fakeDonut.z.toFixed(2)})`,
);

const star = await walkInto(3.6);
check(star.z > -5.9 && star.z < -5.0, `star plate: stopped by its box collider (z=${star.z.toFixed(2)})`);

const rod = await walkInto(8.4);
check(
  rod.z > -4.6 && rod.z < -3.5,
  `thin rod: stopped ~1.9 m short by its oversized ball (z=${rod.z.toFixed(2)})`,
);

const sensor = await walkInto(-0.6, { sensor: true });
check(sensor.z < -7, `sensor mode: passes through the ball-collider donut (z=${sensor.z.toFixed(2)})`);
check(sensor.flashed, 'sensor mode: overlap is still detected (the player lights up)');

// 検知のみモード must not detach anything from the floor: an earlier version
// switched the colliders to sensors, which stopped them colliding with
// *everything* and dropped every enemy through the ground.
const standing = await page.evaluate(() => {
  const { sim } = window.collisionSim;
  sim.setDetectOnly(true);
  for (let i = 0; i < 180; i++) sim.step({ x: 0, z: 0 });
  const fallen = sim.wanderersForTest.filter((w) => w.body.translation().y < -0.5).length;
  sim.setDetectOnly(false);
  return { fallen, total: sim.wanderersForTest.length };
});
check(
  standing.fallen === 0,
  `sensor mode: enemies stay on the floor (${standing.fallen}/${standing.total} fell through)`,
);

const ghost = await walkInto(-0.6, { ghost: true });
check(ghost.z < -7, `ghost mode: a kinematic player ignores the collider entirely (z=${ghost.z.toFixed(2)})`);

// Contact events have to reach the enemies too, not just the player.
const contact = await page.evaluate(() => {
  const { sim } = window.collisionSim;
  const target = sim.wanderersForTest[0];
  if (!target) return { ok: false, reason: 'no enemies spawned' };
  const t = target.body.translation();
  sim.player.body.setTranslation({ x: t.x, y: t.y + 0.1, z: t.z + 1.6 }, true);
  sim.player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  for (let i = 0; i < 90; i++) sim.step({ x: 0, z: -1 });
  return { ok: target.flash > 0 || target.materials.some((m) => m.emissive.r > 0) };
});
check(contact.ok, 'contact flash: the enemy the player touches lights up');

// Nothing may escape the arena.
const contained = await page.evaluate(() => {
  const { sim } = window.collisionSim;
  for (let i = 0; i < 1800; i++) sim.step({ x: 0, z: 0 });
  return sim.wanderersForTest.every((w) => {
    const p = w.body.translation();
    return Math.abs(p.x) < 20 && Math.abs(p.z) < 20 && p.y > -5;
  });
});
check(contained, 'containment: 30 s of random impulses and nothing left the arena');

await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');

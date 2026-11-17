import * as THREE from 'three';
import { EventBus } from './core/events.js';
import { Input } from './core/input.js';
import { Physics } from './core/physics.js';
import { Player } from './core/player.js';
import { Combat } from './core/combat.js';
import { createWorld } from './world/index.js';
import { createWeapon } from './weapon/index.js';
import { createBots } from './bots/index.js';
import { createGame } from './game/index.js';
import { createHud } from './hud/index.js';
import { createAudio } from './audio/index.js';
import { createGrenades } from './grenades/index.js';
import { preloadSoldiers } from './soldiers/index.js';

// ---- renderer / scene / camera (shared) ----
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // budget: see docs/PERF.md
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.03, 600);
camera.rotation.order = 'YXZ';
scene.add(camera); // so the viewmodel (child of camera) renders

const ctx = {
  THREE, renderer, scene, camera,
  events: new EventBus(),
  input: new Input(renderer.domElement),
  physics: new Physics(),
  time: 0,          // seconds since start (game clock, paused when paused)
  paused: true,
  actors: [],       // [player, ...bots] — every Actor
  effects: null,    // set by weapon module (impacts/tracers/muzzle), optional for others
};
ctx.combat = new Combat(ctx);
ctx.player = new Player(ctx);

preloadSoldiers(renderer);        // start fetching the HD soldier glb right away
ctx.world = createWorld(ctx);     // map, lights, sky, post-processing, colliders, spawns, sites
ctx.weapon = createWeapon(ctx);   // viewmodel, shooting, recoil, reload, effects
ctx.bots = createBots(ctx);       // AI actors
ctx.game = createGame(ctx);       // Search & Destroy rules
ctx.grenades = createGrenades(ctx); // smoke + flash grenades (player keys G / T, bots use them too)
ctx.audio = createAudio(ctx);     // Web Audio: weapon, steps, bomb, UI (mute: M)
ctx.hud = createHud(ctx);         // DOM HUD, minimap, hitmarkers, menus

ctx.refreshActors = () => { ctx.actors = [ctx.player, ...ctx.bots.list]; };
ctx.refreshActors();
ctx.game.init?.();
window.__ctx = ctx; // debug

// Shader warm-up: compile every material in the scene (incl. hidden ones: muzzle flash, impacts, blood, bomb, explosion,
// killcam ghost) while the menu is shown, so the first shot / plant / explosion does not freeze the game for a moment.
// Runs again once the HD soldiers are in. Uses the parallel-compile extension when available (no main-thread stall).
const warmShaders = () => { try { renderer.compileAsync(scene, camera).catch(() => {}); } catch { /* old three */ } };
setTimeout(warmShaders, 0);
preloadSoldiers(renderer)?.then(() => setTimeout(warmShaders, 500));
ctx.events.on('world:night', () => setTimeout(warmShaders, 0)); // Ops de nuit changes the light count: recompile in the menu

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  ctx.world.resize?.(innerWidth, innerHeight);
});

// Pause handling: the HUD shows the menu while not locked.
document.addEventListener('pointerlockchange', () => {
  ctx.paused = !ctx.input.locked;
  ctx.events.emit(ctx.paused ? 'game:paused' : 'game:resumed');
});

// Perf overlay: F3 or ?fps — fps, frame ms, draw calls, triangles, bots ms (see docs/PERF.md)
const perf = { on: /[?&]fps/.test(location.search), el: null, frames: 0, acc: 0, botsMs: 0, last: '' };
addEventListener('keydown', e => { if (e.code === 'F3') { e.preventDefault(); perf.on = !perf.on; if (perf.el) perf.el.style.display = perf.on ? 'block' : 'none'; } });
function perfTick(dt, botsMs) {
  if (!perf.on) return;
  if (!perf.el) { perf.el = Object.assign(document.createElement('div'), { style: 'position:fixed;right:8px;top:50%;z-index:99;font:12px/1.35 monospace;color:#9f9;background:#000a;padding:6px 8px;pointer-events:none;white-space:pre' }); document.body.appendChild(perf.el); }
  perf.frames++; perf.acc += dt; perf.botsMs += botsMs;
  if (perf.acc >= 0.5) {
    const i = renderer.info.render;
    perf.el.textContent = `${(perf.frames / perf.acc).toFixed(0)} i/s  ${(perf.acc / perf.frames * 1000).toFixed(1)} ms\ndraw ${i.calls}  tri ${(i.triangles / 1000).toFixed(0)}k\nbots ${(perf.botsMs / perf.frames).toFixed(2)} ms  px ${renderer.getPixelRatio().toFixed(2)}`;
    perf.frames = 0; perf.acc = 0; perf.botsMs = 0;
  }
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!ctx.paused) {
    ctx.time += dt;
    ctx.player.update(dt);
    const tb = performance.now(); ctx.bots.update(dt); var botsMs = performance.now() - tb;
    ctx.weapon.update(dt);
    ctx.game.update(dt);
  }
  ctx.world.update?.(dt);
  ctx.grenades.update(dt);
  ctx.effects?.update?.(dt);
  ctx.audio.update?.(dt);
  ctx.hud.update(dt);
  ctx.input.endFrame();
  ctx.world.render(dt);
  perfTick(dt, botsMs || 0);
}
frame();

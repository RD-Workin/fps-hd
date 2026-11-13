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

// ---- renderer / scene / camera (shared) ----
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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

ctx.world = createWorld(ctx);     // map, lights, sky, post-processing, colliders, spawns, sites
ctx.weapon = createWeapon(ctx);   // viewmodel, shooting, recoil, reload, effects
ctx.bots = createBots(ctx);       // AI actors
ctx.game = createGame(ctx);       // Search & Destroy rules
ctx.audio = createAudio(ctx);     // Web Audio: weapon, steps, bomb, UI (mute: M)
ctx.hud = createHud(ctx);         // DOM HUD, minimap, hitmarkers, menus

ctx.refreshActors = () => { ctx.actors = [ctx.player, ...ctx.bots.list]; };
ctx.refreshActors();
ctx.game.init?.();
window.__ctx = ctx; // debug

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

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!ctx.paused) {
    ctx.time += dt;
    ctx.player.update(dt);
    ctx.bots.update(dt);
    ctx.weapon.update(dt);
    ctx.game.update(dt);
  }
  ctx.world.update?.(dt);
  ctx.effects?.update?.(dt);
  ctx.audio.update?.(dt);
  ctx.hud.update(dt);
  ctx.input.endFrame();
  ctx.world.render(dt);
}
frame();

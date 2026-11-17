// Weapon-mounted flashlight (Ops de nuit). Only exists while the world is in night mode.
// F toggles it (on by default at each round start). One SpotLight, no shadow: a shadowed spot would re-render the
// ~700 k-triangle merged map every frame. The SpotLight always stays in the scene while night is on (intensity 0 when
// off) so toggling never recompiles a shader. `ctx.player.lampOn` is read by the bots (they spot a lit lamp from far).
import * as THREE from 'three';
import { genericAttrs, getMaterials, patchDepthOnly } from './viewmodel.js';

export const LAMP = { angle: 0.36, penumbra: 0.5, distance: 36, decay: 1.6, intensity: 160 };

export function createFlashlight(ctx, kits) {
  const { camera, player, events } = ctx;
  const spot = new THREE.SpotLight(0xfff1dc, 0, LAMP.distance, LAMP.angle, LAMP.penumbra, LAMP.decay);
  spot.castShadow = false;
  // under the barrel, slightly right of the eye; aims a bit converging onto the crosshair
  spot.position.set(0.06, -0.1, -0.95); // ahead of the muzzle: the viewmodel sits behind the cone and is not blown out
  spot.target.position.set(0, -1.1, -15); // ~4° down: the cone reaches the floor a few meters ahead
  let inScene = false;
  const attach = (on) => {
    if (on === inScene) return; inScene = on;
    if (on) { camera.add(spot); camera.add(spot.target); } else { camera.remove(spot); camera.remove(spot.target); }
  };

  // small lamp body + lens on each viewmodel (rifle / sniper), under the handguard
  const M = getMaterials();
  const lensMat = patchDepthOnly(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.18, 0.17), toneMapped: false }));
  const mounts = [];
  for (const [id, at] of [['rifle', [0, -0.04, -0.5]], ['sniper', [0, -0.036, -0.74]]]) {
    const k = kits[id]; if (!k) continue;
    const g = new THREE.Group(); g.position.set(...at); g.visible = false;
    const bodyG = genericAttrs(new THREE.CylinderGeometry(0.0155, 0.0155, 0.1, 16).rotateX(Math.PI / 2));
    const body = new THREE.Mesh(bodyG, M.polymer || M.dark); g.add(body);
    const bezG = genericAttrs(new THREE.CylinderGeometry(0.019, 0.017, 0.022, 16).rotateX(Math.PI / 2).translate(0, 0, -0.058));
    g.add(new THREE.Mesh(bezG, M.steel || M.dark));
    const mountG = genericAttrs(new THREE.BoxGeometry(0.014, 0.022, 0.04).translate(0, 0.016, 0));
    g.add(new THREE.Mesh(mountG, M.dark || M.steel));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0145, 16), lensMat); lens.position.z = -0.0695; lens.rotation.y = Math.PI; g.add(lens);
    g.traverse(o => { o.frustumCulled = false; o.renderOrder = 11; });
    k.vm.rifle.add(g); mounts.push(g);
  }

  const fl = {
    on: false, available: false,
    setAvailable(av) {
      this.available = !!av; attach(this.available);
      for (const g of mounts) g.visible = this.available;
      if (!this.available) this.set(false, true); else this.set(true, true);
    },
    set(on, silent = false) {
      on = !!on && this.available && player.alive;
      const changed = on !== this.on; this.on = on; player.lampOn = on;
      spot.intensity = on ? LAMP.intensity : 0;
      lensMat.color.setRGB(on ? 6 : 0.18, on ? 5.6 : 0.18, on ? 4.8 : 0.17);
      if (changed && !silent) { ctx.audio?.playUi?.('click'); events.emit('flashlight', { on }); }
    },
    toggle() { this.set(!this.on); },
  };
  player.lampOn = false;
  addEventListener('keydown', e => {
    if (e.code !== 'KeyF' || e.repeat || !ctx.input.locked || ctx.paused) return;
    if (fl.available && player.alive) fl.toggle();
  });
  events.on('world:night', ({ on }) => fl.setAvailable(on));
  events.on('round:start', () => { if (fl.available) fl.set(true, true); });
  events.on('player:respawn', () => { if (fl.available) fl.set(true, true); }); // capture du drapeau: back in the fight, lamp on
  events.on('player:died', () => fl.set(false, true));
  return fl;
}

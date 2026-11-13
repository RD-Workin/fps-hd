// Procedural bomb visuals (owned by the game module): explosive charge + control box with LCD countdown,
// blinking red LED (beep rate accelerates as the timer runs out), dropped-bomb pickup marker, carrier backpack
// and a scorch mark after the explosion. No external assets.
import * as THREE from 'three';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, canvas: c, g };
}

function noise(g, w, h, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function glowTexture(inner, outer) {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }).tex;
}

function buildBombMesh() {
  const root = new THREE.Group();
  root.name = 'bomb';

  // Putty charge texture (tan, grainy, with stencil label).
  const putty = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#b9a77a'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 2500, 0.08);
    g.fillStyle = 'rgba(40,30,15,0.75)'; g.font = 'bold 22px monospace'; g.fillText('CHARGE NV-7', 20, 60);
    g.font = '14px monospace'; g.fillText('MANIPULER AVEC SOIN', 20, 84);
  }).tex;
  const puttyMat = new THREE.MeshStandardMaterial({ map: putty, roughness: 0.85, metalness: 0 });
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.55, metalness: 0.05 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x3a4030, roughness: 0.5, metalness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.4, metalness: 0.7 });

  // 2x3 bricks
  const brick = new THREE.BoxGeometry(0.13, 0.07, 0.24);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const m = new THREE.Mesh(brick, puttyMat);
    m.position.set(-0.135 + i * 0.135, 0.035 + j * 0.072, 0);
    root.add(m);
  }
  // tape straps
  for (const z of [-0.075, 0.075]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.035), tapeMat);
    s.position.set(0, 0.073, z); root.add(s);
  }
  // control box on top
  const cb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.14), boxMat);
  cb.position.set(0.02, 0.17, 0); root.add(cb);
  // keypad
  const keyGeo = new THREE.BoxGeometry(0.018, 0.008, 0.018);
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x8b8f94, roughness: 0.6, metalness: 0.3 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const k = new THREE.Mesh(keyGeo, keyMat);
    k.position.set(0.055 + c * 0.024, 0.197, -0.02 + r * 0.024); root.add(k);
  }
  // LCD
  const lcd = canvasTex(128, 48, () => {});
  const lcdMat = new THREE.MeshBasicMaterial({ map: lcd.tex, toneMapped: false });
  const lcdMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.034), lcdMat);
  lcdMesh.rotation.x = -Math.PI / 2; lcdMesh.position.set(-0.035, 0.1955, 0); root.add(lcdMesh);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.004, 0.044), darkMat);
  bezel.position.set(-0.035, 0.1935, 0); root.add(bezel);
  // antenna
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.16, 6), darkMat);
  ant.position.set(-0.07, 0.27, 0.055); ant.rotation.z = 0.25; root.add(ant);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), darkMat);
  antTip.position.set(-0.09, 0.345, 0.055); root.add(antTip);
  // wires
  const wireCols = [0xc0392b, 0x2e6fd8, 0xe1b12c];
  wireCols.forEach((col, i) => {
    const z = -0.05 + i * 0.05;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, 0.17, z), new THREE.Vector3(-0.17, 0.2, z + 0.02),
      new THREE.Vector3(-0.22, 0.12, z), new THREE.Vector3(-0.2, 0.05, z - 0.03),
    ]);
    const w = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 6, false),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
    root.add(w);
  });
  // LED
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x330000, toneMapped: false });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), ledMat);
  led.position.set(0.1, 0.2, 0.045); root.add(led);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,90,70,1)', 'rgba(255,0,0,0.45)'), color: 0xffffff,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false,
  }));
  glow.position.copy(led.position); glow.scale.setScalar(0.25); root.add(glow);

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  lcdMesh.castShadow = false; led.castShadow = false;
  return { root, lcd, lcdMesh, led, ledMat, glow };
}

function drawLcd(lcd, text, color) {
  const { g, canvas } = lcd;
  g.fillStyle = '#0c120c'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = color; g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 8;
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  g.shadowBlur = 0;
  lcd.tex.needsUpdate = true;
}

export function createBombVisuals(ctx) {
  const scene = ctx.scene;
  const bomb = buildBombMesh();
  bomb.root.visible = false;
  scene?.add(bomb.root);

  // LED light: always in the scene (toggling lights forces shader recompiles) — intensity 0 when hidden.
  const light = new THREE.PointLight(0xff2a1a, 0, 4, 2);
  scene?.add(light);

  // Pickup marker (dropped bomb): ground ring + vertical beam + floating chevron.
  const marker = new THREE.Group(); marker.visible = false; scene?.add(marker);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 48), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; marker.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.9, 48, 1, 0, Math.PI * 1.5), ringMat.clone());
  ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.03; marker.add(ring2);
  const beamTex = canvasTex(4, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,180,40,0)'); gr.addColorStop(1, 'rgba(255,180,40,1)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }).tex;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 24, 1, true),
    new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.position.y = 2; marker.add(beam);
  const chevron = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0),
    new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.95, toneMapped: false }));
  chevron.scale.set(1, 1.5, 1); marker.add(chevron);

  // Backpack on a bot carrier (third person only).
  const pack = new THREE.Group(); pack.visible = false; scene?.add(pack);
  const packMesh = buildBombMesh().root; packMesh.scale.setScalar(0.9); packMesh.rotation.x = Math.PI / 2; pack.add(packMesh);

  // Scorch decal after explosion.
  const scorchTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, 'rgba(5,5,5,0.95)'); gr.addColorStop(0.5, 'rgba(15,12,10,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 80;
      g.strokeStyle = `rgba(0,0,0,${0.2 + Math.random() * 0.4})`; g.lineWidth = 1 + Math.random() * 4;
      g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); g.stroke();
    }
  }).tex;
  const scorch = new THREE.Mesh(new THREE.PlaneGeometry(7, 7),
    new THREE.MeshStandardMaterial({ map: scorchTex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  scorch.rotation.x = -Math.PI / 2; scorch.visible = false; scene?.add(scorch);

  let t = 0, beepClock = 0, lastLcd = '', yawSeed = 0;
  const tmp = new THREE.Vector3();

  function setLcd(text, color) {
    const key = text + color; if (key === lastLcd) return; lastLcd = key; drawLcd(bomb.lcd, text, color);
  }
  setLcd('--:--', '#55ff66');

  return {
    // flash: 0..1 current LED brightness (exposed for HUD/tests)
    flash: 0,
    beepInterval: 1,
    reset() {
      scorch.visible = false; bomb.root.visible = false; marker.visible = false; pack.visible = false;
      light.intensity = 0; beepClock = 0; this.flash = 0;
    },
    placeAt(pos, yaw) {
      bomb.root.position.copy(pos); bomb.root.rotation.set(0, yaw || 0, 0); yawSeed = yaw || 0;
    },
    scorchAt(pos) { scorch.position.set(pos.x, (pos.y || 0) + 0.02, pos.z); scorch.rotation.z = Math.random() * 6.28; scorch.visible = true; },
    update(dt, game) {
      t += dt;
      const b = game.bomb;
      const st = b.state;
      // dropped / planted / defused: bomb visible in world
      const onGround = (st === 'dropped' || st === 'planted' || st === 'defused') && b.position;
      bomb.root.visible = !!onGround;
      if (onGround) bomb.root.position.copy(b.position);
      // LED + LCD
      let flash = 0;
      if (st === 'planted') {
        const tl = Math.max(0, b.timeLeft);
        // interval shrinks from ~1 s to ~0.1 s as the timer runs out
        const k = tl / 40;
        const interval = Math.max(0.09, 0.1 + 0.9 * k * k + (tl > 10 ? 0.0 : 0));
        this.beepInterval = interval;
        beepClock += dt;
        if (beepClock >= interval) beepClock %= interval;
        const on = Math.min(interval * 0.45, 0.12);
        flash = beepClock < on ? 1 : Math.max(0, 1 - (beepClock - on) / 0.08) * 0.0;
        if (tl < 2) flash = Math.max(flash, 0.5 + 0.5 * Math.sin(t * 40));
        const s = Math.ceil(tl);
        setLcd(`00:${String(s).padStart(2, '0')}`, '#ff3b2f');
      } else if (st === 'defused') {
        flash = 0; setLcd('00:00', '#55ff66');
      } else if (st === 'dropped') {
        flash = (t % 2) < 0.08 ? 0.4 : 0; setLcd('--:--', '#55ff66');
      }
      this.flash = flash;
      bomb.ledMat.color.setRGB(0.2 + flash * 4, flash * 0.4, flash * 0.3);
      if (st === 'defused') bomb.ledMat.color.setRGB(0.1, 1.5, 0.2);
      bomb.glow.material.opacity = st === 'defused' ? 0 : flash;
      bomb.glow.scale.setScalar(0.18 + flash * 0.22);
      if (onGround && flash > 0) {
        bomb.led.getWorldPosition(tmp); light.position.copy(tmp).y += 0.1; light.intensity = flash * 3.5;
      } else light.intensity = 0;

      // pickup marker
      marker.visible = st === 'dropped' && !!b.position;
      if (marker.visible) {
        marker.position.copy(b.position);
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        ring.scale.setScalar(0.9 + pulse * 0.2); ring.material.opacity = 0.5 + pulse * 0.4;
        ring2.rotation.z = t * 1.5;
        chevron.position.y = 1.1 + Math.sin(t * 2.5) * 0.12; chevron.rotation.y = t * 2;
        beam.material.opacity = 0.2 + pulse * 0.15;
      }

      // backpack on a bot carrier (we need its yaw to orient it)
      const c = b.carrier;
      pack.visible = st === 'carried' && !!c && c.alive && !c.isPlayer && typeof c.yaw === 'number' && !!c.position;
      if (pack.visible) {
        const back = tmp.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
        pack.position.copy(c.position).addScaledVector(back, 0.22); pack.position.y += (c.height || 1.8) * 0.68;
        pack.rotation.set(0, c.yaw, 0);
      }
    },
  };
}

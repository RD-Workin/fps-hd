// Input: physical key codes (event.code) so ZQSD on AZERTY == WASD on QWERTY.
// Z/W = forward, S = back, Q/A = left, D = right, Shift = walk slowly, Space = jump, C/Ctrl = crouch,
// E (hold) = plant / defuse. Left click = fire, right click = reload. Pointer lock on click.
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.fireDown = false;         // left button held
    this.firePressed = false;      // left button pressed this frame
    this.reloadPressed = false;    // right button pressed this frame
    this.locked = false;
    this.sensitivity = 0.0022;
    addEventListener('keydown', e => { this.keys.add(e.code); if (e.code === 'Space' || e.code === 'Tab') e.preventDefault(); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.fireDown = false; });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousedown', e => {
      if (!this.locked) return;
      if (e.button === 0) { this.fireDown = true; this.firePressed = true; }
      if (e.button === 2) this.reloadPressed = true;
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.fireDown = false; });
    addEventListener('mousemove', e => { if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; } });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.dom; if (!this.locked) this.fireDown = false; });
  }
  requestLock() { try { const p = this.dom.requestPointerLock({ unadjustedMovement: true }); p?.catch?.(() => this.dom.requestPointerLock()); } catch { this.dom.requestPointerLock(); } }
  down(...codes) { return codes.some(c => this.keys.has(c)); }
  get forward() { return this.down('KeyW', 'ArrowUp') ? 1 : 0; }
  get back() { return this.down('KeyS', 'ArrowDown') ? 1 : 0; }
  get left() { return this.down('KeyA', 'ArrowLeft') ? 1 : 0; }
  get right() { return this.down('KeyD', 'ArrowRight') ? 1 : 0; }
  get jump() { return this.down('Space'); }
  get crouch() { return this.down('KeyC', 'ControlLeft'); }
  get walk() { return this.down('ShiftLeft', 'ShiftRight'); }
  get use() { return this.down('KeyE', 'KeyF'); }
  get scoreboard() { return this.down('Tab'); }
  endFrame() { this.mouseDX = 0; this.mouseDY = 0; this.firePressed = false; this.reloadPressed = false; }
}

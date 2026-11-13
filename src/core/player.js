import * as THREE from 'three';
// The local player. Implements the Actor interface (see ARCHITECTURE.md).
export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.id = 'player'; this.name = 'Vous'; this.isPlayer = true;
    this.team = 'ATK';
    this.health = 100; this.alive = true;
    this.position = new THREE.Vector3();   // feet
    this.velocity = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;          // radians; yaw 0 looks toward -Z
    this.recoilPitch = 0; this.recoilYaw = 0; // transient view kick, recovers over time
    this.radius = 0.35; this.standHeight = 1.8; this.crouchHeight = 1.25;
    this.height = this.standHeight; this.eyeOffset = 0.12;
    this.onGround = false; this.moveSpeed = 0; // current horizontal speed (for spread/bob)
    this.frozen = false;                   // set by game mode during freeze time / planting
    this.hasBomb = false;
    this.headBob = 0;
  }
  get eyeHeight() { return this.height - this.eyeOffset; }
  getEyePosition(out = new THREE.Vector3()) { return out.copy(this.position).setY(this.position.y + this.eyeHeight); }
  getForward(out = new THREE.Vector3()) {
    const p = this.pitch + this.recoilPitch, y = this.yaw + this.recoilYaw;
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)).normalize();
  }
  spawn(pos, yaw, team) {
    this.position.copy(pos); this.velocity.set(0, 0, 0); this.yaw = yaw; this.pitch = 0;
    this.recoilPitch = this.recoilYaw = 0; this.health = 100; this.alive = true; if (team) this.team = team;
    this.height = this.standHeight;
  }
  addRecoil(pitch, yaw) { this.recoilPitch += pitch; this.recoilYaw += yaw; }
  update(dt) {
    const { input, physics, camera } = this.ctx;
    if (this.alive) {
      this.yaw -= input.mouseDX * input.sensitivity;
      this.pitch -= input.mouseDY * input.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
      // recoil recovery
      const rec = Math.min(1, dt * 7);
      this.recoilPitch -= this.recoilPitch * rec; this.recoilYaw -= this.recoilYaw * rec;

      const crouch = input.crouch;
      const targetH = crouch ? this.crouchHeight : this.standHeight;
      this.height += (targetH - this.height) * Math.min(1, dt * 12);
      let speed = crouch ? 2.6 : input.walk ? 3.0 : 5.6;
      if (this.ctx.weapon?.aiming) speed *= 0.8;
      const fx = input.forward - input.back, sx = input.right - input.left;
      const wish = new THREE.Vector3();
      if (!this.frozen && (fx || sx)) {
        const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
        wish.set(-sin * fx + cos * sx, 0, -cos * fx - sin * sx).normalize().multiplyScalar(speed);
      }
      const accel = this.onGround ? 14 : 3;
      this.velocity.x += (wish.x - this.velocity.x) * Math.min(1, accel * dt);
      this.velocity.z += (wish.z - this.velocity.z) * Math.min(1, accel * dt);
      if (this.onGround && input.jump && !this.frozen) { this.velocity.y = 7.2; this.onGround = false; }
      this.onGround = physics.moveActor(this.position, this.velocity, dt, this.radius, this.height).onGround;
      this.moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (this.onGround) this.headBob += dt * this.moveSpeed * 1.9;
    }
    // camera
    const bobY = this.alive && this.onGround ? Math.sin(this.headBob * 2) * 0.025 * Math.min(1, this.moveSpeed / 5) : 0;
    this.getEyePosition(camera.position); camera.position.y += bobY;
    if (!this.alive) camera.position.y = this.position.y + 0.5; // death cam: low
    camera.rotation.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, this.alive ? 0 : 0.6, 'YXZ');
  }
}

import * as THREE from 'three';

// Seven-segment bit patterns: segments a-g mapped to bits 0-6
//   aaa
//  f   b
//   ggg
//  e   c
//   ddd
const SEGS = {
  '0': 0b0111111, '1': 0b0000110, '2': 0b1011011, '3': 0b1001111,
  '4': 0b1100110, '5': 0b1101101, '6': 0b1111101, '7': 0b0000111,
  '8': 0b1111111, '9': 0b1101111, '-': 0b1000000, ' ': 0b0000000,
};

const UPDATE_INTERVAL = 0.25; // seconds between display refreshes
const FPS_HISTORY = 60;
const DROP_THRESHOLD = 1 / 60; // frame longer than 16.6ms counts as drop

export class PerfWatch {
  constructor(scene) {
    this.scene = scene;

    // Canvas for the watch face
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 128;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;

    // Watch case — dark rectangle with bezel
    const group = new THREE.Group();

    // Bezel
    const bezelGeo = new THREE.BoxGeometry(0.045, 0.005, 0.035);
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x333333, roughness: 0.3, metalness: 0.8,
    });
    const bezel = new THREE.Mesh(bezelGeo, bezelMat);
    group.add(bezel);

    // Screen
    const screenGeo = new THREE.PlaneGeometry(0.038, 0.022);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true,
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.y = 0.003;
    screen.rotation.x = -Math.PI / 2;
    group.add(screen);

    // Strap hints (thin dark boxes)
    const strapGeo = new THREE.BoxGeometry(0.012, 0.003, 0.035);
    const strapMat = new THREE.MeshStandardMaterial({
      color: 0x222222, roughness: 0.9, metalness: 0.1,
    });
    const strap1 = new THREE.Mesh(strapGeo, strapMat);
    strap1.position.set(0, 0, -0.03);
    group.add(strap1);
    const strap2 = new THREE.Mesh(strapGeo, strapMat);
    strap2.position.set(0, 0, 0.03);
    group.add(strap2);

    this.group = group;
    this.group.visible = false;
    scene.add(this.group);

    // Perf tracking
    this.frameTimes = [];
    this.lastUpdate = 0;
    this.lastFps = 0;
    this.lastDropPct = 0;

    // Temps
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._rotOffset = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
    this._offset = new THREE.Vector3(0, 0.02, 0); // above wrist
  }

  /**
   * Call each frame with dt and reference to right hand wrist joint.
   * @param {number} dt - frame delta time
   * @param {THREE.Object3D|null} wristJoint - right hand wrist XRJointSpace
   */
  update(dt, wristJoint) {
    // Track frame time
    this.frameTimes.push(dt);
    if (this.frameTimes.length > FPS_HISTORY) this.frameTimes.shift();

    if (!wristJoint || !wristJoint.visible) {
      this.group.visible = false;
      return;
    }

    // Position watch on wrist
    this.group.visible = true;
    wristJoint.getWorldPosition(this._pos);
    wristJoint.getWorldQuaternion(this._quat);

    // Offset slightly above the wrist
    const offset = this._offset.clone().applyQuaternion(this._quat);
    this._pos.add(offset);
    this.group.position.copy(this._pos);
    this.group.quaternion.copy(this._quat).multiply(this._rotOffset);

    // Update display periodically
    this.lastUpdate += dt;
    if (this.lastUpdate >= UPDATE_INTERVAL) {
      this.lastUpdate = 0;
      this._refreshDisplay();
    }
  }

  _refreshDisplay() {
    if (this.frameTimes.length < 2) return;

    // Compute FPS
    const sum = this.frameTimes.reduce((a, b) => a + b, 0);
    const avgDt = sum / this.frameTimes.length;
    const fps = Math.round(1 / avgDt);

    // Compute drop rate
    const drops = this.frameTimes.filter(t => t > DROP_THRESHOLD).length;
    const dropPct = Math.round((drops / this.frameTimes.length) * 100);

    this.lastFps = fps;
    this.lastDropPct = dropPct;

    // Color based on FPS
    let color;
    if (fps >= 68) color = '#00ff44';       // green
    else if (fps >= 45) color = '#ffaa00';   // amber
    else color = '#ff2222';                   // red

    this._drawFace(fps, dropPct, color);
  }

  _drawFace(fps, dropPct, color) {
    const ctx = this.canvas.getContext('2d');
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Dark LCD background
    ctx.fillStyle = '#0a0f0a';
    ctx.fillRect(0, 0, w, h);

    // Subtle LCD grid effect
    ctx.fillStyle = '#0d130d';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1);
    }

    // FPS — large digits top row
    const fpsStr = String(fps).padStart(3, ' ');
    this._drawSegDigits(ctx, fpsStr, 8, 6, 28, color);

    // "FPS" label
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.fillText('FPS', 190, 42);
    ctx.globalAlpha = 1.0;

    // Drop rate — smaller digits bottom row
    const dropColor = dropPct <= 5 ? '#00ff44' : dropPct <= 15 ? '#ffaa00' : '#ff2222';
    const dropStr = String(dropPct).padStart(3, ' ');
    this._drawSegDigits(ctx, dropStr, 8, 68, 20, dropColor);

    // "DRP%" label
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = dropColor;
    ctx.globalAlpha = 0.6;
    ctx.fillText('DRP%', 180, 98);
    ctx.globalAlpha = 1.0;

    this.texture.needsUpdate = true;
  }

  /**
   * Draw seven-segment digits on canvas.
   */
  _drawSegDigits(ctx, str, x, y, size, color) {
    for (let i = 0; i < str.length; i++) {
      this._drawSegChar(ctx, str[i], x + i * (size * 1.8), y, size, color);
    }
  }

  _drawSegChar(ctx, ch, x, y, size, color) {
    const bits = SEGS[ch];
    if (bits === undefined) return;

    const sw = size * 0.18; // segment width
    const w = size;
    const h = size * 1.8;
    const half = h / 2;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.15; // dim inactive segments

    // Draw all 7 segments dimmed, then overdraw active ones bright
    const segments = [
      // a: top horizontal
      () => this._hSeg(ctx, x + sw, y, w - 2 * sw, sw),
      // b: top-right vertical
      () => this._vSeg(ctx, x + w - sw, y + sw, half - 1.5 * sw, sw),
      // c: bottom-right vertical
      () => this._vSeg(ctx, x + w - sw, y + half + sw * 0.5, half - 1.5 * sw, sw),
      // d: bottom horizontal
      () => this._hSeg(ctx, x + sw, y + h - sw, w - 2 * sw, sw),
      // e: bottom-left vertical
      () => this._vSeg(ctx, x, y + half + sw * 0.5, half - 1.5 * sw, sw),
      // f: top-left vertical
      () => this._vSeg(ctx, x, y + sw, half - 1.5 * sw, sw),
      // g: middle horizontal
      () => this._hSeg(ctx, x + sw, y + half - sw / 2, w - 2 * sw, sw),
    ];

    // Draw dimmed segments
    for (const draw of segments) draw();

    // Overdraw active segments bright
    ctx.globalAlpha = 1.0;
    for (let s = 0; s < 7; s++) {
      if (bits & (1 << s)) segments[s]();
    }
  }

  _hSeg(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x + h / 2, y);
    ctx.lineTo(x + w - h / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w - h / 2, y + h);
    ctx.lineTo(x + h / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
    ctx.fill();
  }

  _vSeg(ctx, x, y, h, w) {
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + w / 2);
    ctx.lineTo(x + w, y + h - w / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h - w / 2);
    ctx.lineTo(x, y + w / 2);
    ctx.closePath();
    ctx.fill();
  }
}

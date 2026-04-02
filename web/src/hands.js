import * as THREE from 'three';
import { playBladeExtend, playBladeSwoosh } from './audio.js';

const COLLISION_JOINTS = [
  'wrist',
  'index-finger-tip',
  'middle-finger-tip',
  'ring-finger-tip',
  'index-finger-phalanx-proximal',
  'middle-finger-phalanx-proximal',
];

// All 25 WebXR hand joints for rendering
const ALL_JOINTS = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];

const HIT_COOLDOWN = 0.25;
const MIN_HIT_SPEED = 0.3;
const TRIGGER_GRAVITY_MULTIPLIER = 10.0;
const BLADE_LENGTH = 0.25;
const BLADE_POP_RADIUS = 0.03;

class HandTracker {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.hands = [];
    this.tempVec = new THREE.Vector3();
    this.ballPos = new THREE.Vector3();
    this.attractorData = [];

    // Shared geometry/material for joint spheres
    const jointGeo = new THREE.SphereGeometry(0.008, 8, 8);
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      emissive: 0x4488ff,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8,
      roughness: 0.3,
      metalness: 0.6,
    });

    for (let i = 0; i <= 1; i++) {
      const handGroup = renderer.xr.getHand(i);
      scene.add(handGroup);

      // Create manual joint spheres
      const jointMeshes = new Map();
      for (const name of ALL_JOINTS) {
        const mesh = new THREE.Mesh(jointGeo, jointMat);
        mesh.visible = false;
        scene.add(mesh);
        jointMeshes.set(name, mesh);
      }

      this.hands.push({
        index: i,
        handGroup,
        jointMeshes,
        prevPositions: new Map(),
        lastHitTimes: new Map(),
        triggerPressed: false,
      });
    }

    // Assassin's Creed hidden blade on left wrist
    const bladeGroup = new THREE.Group();
    // Blade shaft
    const bladeGeo = new THREE.ConeGeometry(0.006, BLADE_LENGTH, 6);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc, roughness: 0.1, metalness: 1.0,
      emissive: 0xaaaaff, emissiveIntensity: 0.3,
    });
    const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
    bladeMesh.rotation.x = -Math.PI / 2; // point forward along -Z
    bladeMesh.position.z = -BLADE_LENGTH / 2 - 0.02; // extend from wrist
    bladeGroup.add(bladeMesh);

    // Blade guard (small box at base)
    const guardGeo = new THREE.BoxGeometry(0.025, 0.008, 0.012);
    const guardMat = new THREE.MeshStandardMaterial({
      color: 0x444444, roughness: 0.3, metalness: 0.9,
    });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.z = -0.02;
    bladeGroup.add(guard);

    bladeGroup.visible = false;
    scene.add(bladeGroup);
    this.bladeGroup = bladeGroup;
    this.bladeTip = new THREE.Vector3();
    this.bladeQuat = new THREE.Quaternion();
    this.bladeWasVisible = false;
    this.bladePrevPos = new THREE.Vector3();
    this.bladeSwooshCooldown = 0;

    // Also set up controller inputs for trigger/button detection
    this.controllers = [];
    for (let i = 0; i <= 1; i++) {
      const ctrl = renderer.xr.getController(i);
      scene.add(ctrl);
      this.controllers.push(ctrl);
    }
  }

  /** Read trigger/squeeze values and B/Y button from gamepad */
  _getInputState(session) {
    const states = [
      { trigger: 0, squeeze: 0, buttonB: false },
      { trigger: 0, squeeze: 0, buttonB: false },
    ];
    if (!session) return states;

    for (const source of session.inputSources) {
      if (!source.gamepad) continue;
      const hand = source.handedness === 'left' ? 0 : source.handedness === 'right' ? 1 : -1;
      if (hand < 0) continue;

      const gp = source.gamepad;
      // Standard XR gamepad mapping:
      // buttons[0] = trigger, buttons[1] = squeeze/grip
      // buttons[4] = B (right) or Y (left)
      if (gp.buttons[0]) states[hand].trigger = gp.buttons[0].value;
      if (gp.buttons[1]) states[hand].squeeze = gp.buttons[1].value;
      if (gp.buttons[4]) states[hand].buttonB = gp.buttons[4].pressed;
    }
    return states;
  }

  /** Returns Float32Array [x,y,z,strength, x,y,z,strength, ...] */
  getAttractors() {
    this.attractorData.length = 0;
    const session = this.renderer.xr.getSession();
    const inputStates = this._getInputState(session);

    for (const hand of this.hands) {
      const joints = hand.handGroup.joints;
      if (!joints) continue;
      const palmJoint = joints['middle-finger-metacarpal'] || joints['wrist'];
      if (!palmJoint || !palmJoint.visible) continue;
      palmJoint.getWorldPosition(this.tempVec);

      // Trigger from either hand tracking pinch OR controller trigger
      const input = inputStates[hand.index];
      const triggerVal = Math.max(input.trigger, input.squeeze);
      const strength = triggerVal > 0.3 ? TRIGGER_GRAVITY_MULTIPLIER * triggerVal : 1.0;

      this.attractorData.push(this.tempVec.x, this.tempVec.y, this.tempVec.z, strength);
    }
    return new Float32Array(this.attractorData);
  }

  /** Check if B/Y button pressed (quit) */
  shouldQuit() {
    const session = this.renderer.xr.getSession();
    const states = this._getInputState(session);
    return states[0].buttonB || states[1].buttonB;
  }

  /** Get the left hand's wrist joint (for blade attachment) */
  getLeftWrist() {
    const hand = this.hands[0]; // left hand
    if (!hand) return null;
    const joints = hand.handGroup.joints;
    if (!joints || !joints['wrist'] || !joints['wrist'].visible) return null;
    return joints['wrist'];
  }

  /** Get the right hand's wrist joint (for watch attachment) */
  getRightWrist() {
    const hand = this.hands[1]; // right hand
    if (!hand) return null;
    const joints = hand.handGroup.joints;
    if (!joints || !joints['wrist'] || !joints['wrist'].visible) return null;
    return joints['wrist'];
  }

  /** Update joint sphere rendering */
  updateVisuals() {
    for (const hand of this.hands) {
      const joints = hand.handGroup.joints;
      for (const [name, mesh] of hand.jointMeshes) {
        if (!joints || !joints[name] || !joints[name].visible) {
          mesh.visible = false;
          continue;
        }
        joints[name].getWorldPosition(this.tempVec);
        mesh.position.copy(this.tempVec);
        mesh.visible = true;
      }
    }
  }

  /** Update blade position and check for ball pops. Returns [{ballIndex, x, y, z}] */
  updateBlade(world, dt) {
    const wrist = this.getLeftWrist();
    if (!wrist) {
      this.bladeGroup.visible = false;
      this.bladeWasVisible = false;
      return [];
    }

    // Play extend sound when blade first appears
    if (!this.bladeWasVisible) {
      playBladeExtend();
      this.bladeWasVisible = true;
      this.bladePrevPos.copy(this.tempVec);
    }

    this.bladeGroup.visible = true;
    wrist.getWorldPosition(this.tempVec);
    wrist.getWorldQuaternion(this.bladeQuat);
    this.bladeGroup.position.copy(this.tempVec);
    this.bladeGroup.quaternion.copy(this.bladeQuat);

    // Swoosh sound based on wrist speed
    this.bladeSwooshCooldown -= dt;
    const bladeSpeed = this.tempVec.distanceTo(this.bladePrevPos) / Math.max(dt, 0.001);
    this.bladePrevPos.copy(this.tempVec);
    if (bladeSpeed > 1.5 && this.bladeSwooshCooldown <= 0) {
      playBladeSwoosh(bladeSpeed);
      this.bladeSwooshCooldown = 0.15;
    }

    // Compute blade tip position in world space
    this.bladeTip.set(0, 0, -BLADE_LENGTH - 0.02);
    this.bladeTip.applyQuaternion(this.bladeQuat);
    this.bladeTip.add(this.tempVec);

    // Check blade tip against all balls
    const pops = [];
    const ballCount = world.ball_count();
    for (let i = ballCount - 1; i >= 0; i--) {
      const bx = world.get_ball_x(i);
      const by = world.get_ball_y(i);
      const bz = world.get_ball_z(i);
      const br = world.get_ball_radius(i);
      const dx = this.bladeTip.x - bx;
      const dy = this.bladeTip.y - by;
      const dz = this.bladeTip.z - bz;
      const distSq = dx * dx + dy * dy + dz * dz;
      const hitDist = br + BLADE_POP_RADIUS;
      if (distSq < hitDist * hitDist) {
        pops.push({ ballIndex: i, x: bx, y: by, z: bz });
        world.remove_ball(i);
      }
    }
    return pops;
  }

  update(world, dt) {
    this.updateVisuals();

    const hits = [];
    const ballCount = world.ball_count();

    for (const hand of this.hands) {
      const joints = hand.handGroup.joints;
      if (!joints || Object.keys(joints).length === 0) continue;

      for (const jointName of COLLISION_JOINTS) {
        const joint = joints[jointName];
        if (!joint || !joint.visible) continue;

        joint.getWorldPosition(this.tempVec);
        const jx = this.tempVec.x;
        const jy = this.tempVec.y;
        const jz = this.tempVec.z;

        let vx = 0, vy = 0, vz = 0;
        const prev = hand.prevPositions.get(jointName);
        if (prev && dt > 0.001) {
          vx = (jx - prev.x) / dt;
          vy = (jy - prev.y) / dt;
          vz = (jz - prev.z) / dt;
        }
        if (!prev) {
          hand.prevPositions.set(jointName, new THREE.Vector3(jx, jy, jz));
        } else {
          prev.set(jx, jy, jz);
        }

        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (speed < MIN_HIT_SPEED) continue;

        for (let bi = 0; bi < ballCount; bi++) {
          const bx = world.get_ball_x(bi);
          const by = world.get_ball_y(bi);
          const bz = world.get_ball_z(bi);

          const jointRadius = joint.jointRadius || 0.01;
          const hitDist = world.get_ball_radius(bi) + jointRadius;
          const dx = jx - bx;
          const dy = jy - by;
          const dz = jz - bz;
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq < hitDist * hitDist) {
            const now = performance.now() / 1000;
            const cooldownKey = `${bi}`;
            if ((hand.lastHitTimes.get(cooldownKey) || 0) + HIT_COOLDOWN > now) continue;
            hand.lastHitTimes.set(cooldownKey, now);

            const factor = Math.min(speed, 8.0) / Math.max(speed, 0.001) * 1.5;
            world.apply_impulse_to(bi, vx * factor, vy * factor, vz * factor);

            hits.push({
              ballIndex: bi,
              x: jx, y: jy, z: jz,
              intensity: Math.min(speed / 3.0, 1.0),
            });
            break;
          }
        }
      }
    }

    return hits;
  }
}

export function initHandTracking(renderer, scene) {
  return new HandTracker(renderer, scene);
}

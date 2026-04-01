import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

const COLLISION_JOINTS = [
  'wrist',
  'index-finger-tip',
  'middle-finger-tip',
  'ring-finger-tip',
  'index-finger-phalanx-proximal',
  'middle-finger-phalanx-proximal',
];

const HIT_COOLDOWN = 0.25;
const MIN_HIT_SPEED = 0.3;

class HandTracker {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.hands = [];
    this.tempVec = new THREE.Vector3();
    this.ballPos = new THREE.Vector3();
    // Palm positions for gravity attractors (updated each frame)
    this.palmPositions = [];

    const handModelFactory = new XRHandModelFactory();

    for (let i = 0; i <= 1; i++) {
      const controller = renderer.xr.getHand(i);
      const handModel = handModelFactory.createHandModel(controller, 'spheres');
      controller.add(handModel);
      scene.add(controller);

      this.hands.push({
        controller,
        prevPositions: new Map(),
        lastHitTimes: new Map(), // per-ball cooldowns
      });
    }
  }

  /** Returns Float32Array of palm positions [x,y,z, x,y,z, ...] for attractors */
  getPalmPositions() {
    this.palmPositions.length = 0;
    for (const hand of this.hands) {
      const joints = hand.controller.joints;
      if (!joints) continue;
      // Use middle-finger-metacarpal as palm center, fallback to wrist
      const palmJoint = joints['middle-finger-metacarpal'] || joints['wrist'];
      if (!palmJoint || !palmJoint.visible) continue;
      palmJoint.getWorldPosition(this.tempVec);
      this.palmPositions.push(this.tempVec.x, this.tempVec.y, this.tempVec.z);
    }
    return new Float32Array(this.palmPositions);
  }

  /**
   * Check collisions against all balls.
   * @param {World} world
   * @param {number} dt
   * @returns {Array<{ballIndex, x, y, z, intensity}>}
   */
  update(world, dt) {
    const hits = [];
    const ballRadius = world.get_radius();
    const ballCount = world.ball_count();

    for (const hand of this.hands) {
      const joints = hand.controller.joints;
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

        // Check against all balls
        for (let bi = 0; bi < ballCount; bi++) {
          const bx = world.get_ball_x(bi);
          const by = world.get_ball_y(bi);
          const bz = world.get_ball_z(bi);

          const jointRadius = joint.jointRadius || 0.01;
          const hitDist = ballRadius + jointRadius;
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

            break; // one hit per joint per frame
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

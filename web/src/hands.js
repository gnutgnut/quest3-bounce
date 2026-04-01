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

    const handModelFactory = new XRHandModelFactory();

    for (let i = 0; i <= 1; i++) {
      const controller = renderer.xr.getHand(i);
      const handModel = handModelFactory.createHandModel(controller, 'spheres');
      controller.add(handModel);
      scene.add(controller);

      this.hands.push({
        controller,
        prevPositions: new Map(),
        lastHitTime: 0,
      });
    }
  }

  update(world, dt) {
    const hits = [];
    const ballRadius = world.get_radius();
    this.ballPos.set(world.get_x(), world.get_y(), world.get_z());

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

        // Compute velocity from previous frame
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

        // Sphere-sphere collision
        const jointRadius = joint.jointRadius || 0.01;
        const hitDist = ballRadius + jointRadius;
        const dx = jx - this.ballPos.x;
        const dy = jy - this.ballPos.y;
        const dz = jz - this.ballPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < hitDist * hitDist) {
          const now = performance.now() / 1000;
          if (now - hand.lastHitTime < HIT_COOLDOWN) continue;

          const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
          if (speed < MIN_HIT_SPEED) continue;

          hand.lastHitTime = now;

          // Clamp impulse so ball can't go to infinity
          const factor = Math.min(speed, 8.0) / Math.max(speed, 0.001) * 1.5;
          world.apply_impulse(vx * factor, vy * factor, vz * factor);

          hits.push({
            x: jx, y: jy, z: jz,
            intensity: Math.min(speed / 3.0, 1.0),
          });

          break; // one hit per hand per frame
        }
      }
    }

    return hits;
  }
}

export function initHandTracking(renderer, scene) {
  return new HandTracker(renderer, scene);
}

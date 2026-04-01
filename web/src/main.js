import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { ensureAudioContext, playBounce } from './audio.js';
import init, { World } from '../pkg/bounce_physics.js';

async function main() {
  // Init WASM
  await init();
  const world = new World();

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 6, 12);

  // Camera
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 2.5);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // VR button
  document.body.appendChild(VRButton.createButton(renderer));

  // Room dimensions (must match Rust: half-width=2, height=3, half-depth=2)
  const roomW = 4, roomH = 3, roomD = 4;

  // Floor
  const floorGeo = new THREE.PlaneGeometry(roomW, roomD);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a4a,
    roughness: 0.8,
    metalness: 0.2,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Ceiling
  const ceiling = new THREE.Mesh(floorGeo, floorMat.clone());
  ceiling.material.color.set(0x1e1e3a);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = roomH;
  scene.add(ceiling);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2e2e5e,
    roughness: 0.9,
    metalness: 0.1,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });

  // Back wall
  const wallGeoWide = new THREE.PlaneGeometry(roomW, roomH);
  const backWall = new THREE.Mesh(wallGeoWide, wallMat);
  backWall.position.set(0, roomH / 2, -roomD / 2);
  scene.add(backWall);

  // Front wall
  const frontWall = new THREE.Mesh(wallGeoWide, wallMat);
  frontWall.position.set(0, roomH / 2, roomD / 2);
  frontWall.rotation.y = Math.PI;
  scene.add(frontWall);

  // Side walls
  const wallGeoDeep = new THREE.PlaneGeometry(roomD, roomH);
  const leftWall = new THREE.Mesh(wallGeoDeep, wallMat);
  leftWall.position.set(-roomW / 2, roomH / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(wallGeoDeep, wallMat);
  rightWall.position.set(roomW / 2, roomH / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  scene.add(rightWall);

  // Grid helper on floor
  const grid = new THREE.GridHelper(roomW, 8, 0x444488, 0x333366);
  grid.position.y = 0.001;
  scene.add(grid);

  // Ball
  const ballGeo = new THREE.SphereGeometry(0.15, 32, 32);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xff4488,
    roughness: 0.2,
    metalness: 0.8,
    emissive: 0xff2266,
    emissiveIntensity: 0.3,
  });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.castShadow = true;
  scene.add(ball);

  // Ball glow (point light that follows the ball)
  const ballLight = new THREE.PointLight(0xff4488, 2, 5);
  ballLight.castShadow = true;
  scene.add(ballLight);

  // Ambient light
  scene.add(new THREE.AmbientLight(0x404060, 0.5));

  // Overhead light
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(0, roomH - 0.1, 0);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  // Enable audio on click
  document.addEventListener('click', () => ensureAudioContext(), { once: true });

  // Animation loop
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);

    // Step physics
    world.step(dt);

    // Update ball position
    const bx = world.get_x();
    const by = world.get_y();
    const bz = world.get_z();
    ball.position.set(bx, by, bz);
    ballLight.position.set(bx, by, bz);

    // Flash ball on bounce
    const bounceCount = world.get_bounce_count();
    if (bounceCount > 0) {
      ballMat.emissiveIntensity = 1.0;
      ballLight.intensity = 6;
    } else {
      ballMat.emissiveIntensity = Math.max(0.3, ballMat.emissiveIntensity * 0.92);
      ballLight.intensity = Math.max(2, ballLight.intensity * 0.92);
    }

    // Play bounce audio
    for (let i = 0; i < bounceCount; i++) {
      const ev = world.get_bounce_event(i);
      playBounce(ev[0], ev[1], ev[2], ev[3]);
    }

    renderer.render(scene, camera);
  });

  // Resize handler
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

main().catch(console.error);

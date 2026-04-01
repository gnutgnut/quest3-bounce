import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { ensureAudioContext, playBounce, playHandHit } from './audio.js';
import { initHandTracking } from './hands.js';
import init, { World } from '../pkg/bounce_physics.js';

const VERSION = '0.4.0';
const SPAWN_INTERVAL = 15.0;
const BALL_COLORS = [
  0xff4488, 0x44ff88, 0x4488ff, 0xffaa22, 0xaa44ff,
  0xff44cc, 0x44ffcc, 0xccff44, 0xff6644, 0x44aaff,
];

async function main() {
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
  const sessionInit = { optionalFeatures: ['hand-tracking'] };
  document.body.appendChild(VRButton.createButton(renderer, sessionInit));
  renderer.xr.addEventListener('sessionstart', () => ensureAudioContext());

  // Room
  const roomW = 4, roomH = 3, roomD = 4;

  // Floor
  const floorGeo = new THREE.PlaneGeometry(roomW, roomD);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a4a, roughness: 0.8, metalness: 0.2 });
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
    color: 0x2e2e5e, roughness: 0.9, metalness: 0.1,
    transparent: true, opacity: 0.4, side: THREE.DoubleSide,
  });
  const wallGeoWide = new THREE.PlaneGeometry(roomW, roomH);
  const wallGeoDeep = new THREE.PlaneGeometry(roomD, roomH);

  const backWall = new THREE.Mesh(wallGeoWide, wallMat);
  backWall.position.set(0, roomH / 2, -roomD / 2);
  scene.add(backWall);

  const frontWall = new THREE.Mesh(wallGeoWide, wallMat);
  frontWall.position.set(0, roomH / 2, roomD / 2);
  frontWall.rotation.y = Math.PI;
  scene.add(frontWall);

  const leftWall = new THREE.Mesh(wallGeoDeep, wallMat);
  leftWall.position.set(-roomW / 2, roomH / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(wallGeoDeep, wallMat);
  rightWall.position.set(roomW / 2, roomH / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  scene.add(rightWall);

  const grid = new THREE.GridHelper(roomW, 8, 0x444488, 0x333366);
  grid.position.y = 0.001;
  scene.add(grid);

  // Shared ball geometry
  const ballGeo = new THREE.SphereGeometry(0.15, 32, 32);

  // Ball management
  const ballMeshes = [];
  const ballLights = [];

  function ensureBallMeshes() {
    const count = world.ball_count();
    while (ballMeshes.length < count) {
      const idx = ballMeshes.length;
      const color = BALL_COLORS[idx % BALL_COLORS.length];
      const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.2, metalness: 0.8,
        emissive: color, emissiveIntensity: 0.3,
      });
      const mesh = new THREE.Mesh(ballGeo, mat);
      mesh.castShadow = true;
      scene.add(mesh);
      ballMeshes.push(mesh);

      // One light per ball (limit to first 5 for performance)
      if (idx < 5) {
        const light = new THREE.PointLight(color, 2, 4);
        scene.add(light);
        ballLights.push({ light, ballIdx: idx });
      }
    }
  }

  // Ambient + overhead light
  scene.add(new THREE.AmbientLight(0x404060, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(0, roomH - 0.1, 0);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  // Hand tracking
  const handTracker = initHandTracking(renderer, scene);

  // Version splash
  const versionSprite = createTextSprite(`v${VERSION}`, 48);
  versionSprite.position.set(0, 2.2, -1.5);
  versionSprite.scale.set(1.2, 0.3, 1);
  scene.add(versionSprite);
  let versionFadeStart = null;

  const info = document.getElementById('info');
  if (info) info.textContent = `quest3-bounce v${VERSION} — Click to enable audio`;

  document.addEventListener('click', () => ensureAudioContext(), { once: true });

  // Spawn timer
  let lastSpawnTime = 0;
  let gameOver = false;

  // Game over splash (hidden initially)
  const gameOverSprite = createTextSprite('GAME OVER', 64);
  gameOverSprite.position.set(0, 1.6, -1.0);
  gameOverSprite.scale.set(1.5, 0.4, 1);
  gameOverSprite.visible = false;
  scene.add(gameOverSprite);

  // Animation loop
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    if (gameOver) {
      renderer.render(scene, camera);
      return;
    }

    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    // Spawn a new ball every SPAWN_INTERVAL seconds
    if (elapsed - lastSpawnTime > SPAWN_INTERVAL) {
      world.spawn_ball();
      lastSpawnTime = elapsed;
    }

    // Check game over
    if (world.is_game_over()) {
      gameOver = true;
      gameOverSprite.visible = true;
      if (info) info.textContent = `GAME OVER — 1000 balls in ${Math.floor(elapsed)}s`;
      return;
    }

    // Quit on B/Y button
    if (handTracker.shouldQuit()) {
      const session = renderer.xr.getSession();
      if (session) session.end();
      return;
    }

    // Pass hand positions + trigger strength as gravity attractors
    const attractors = handTracker.getAttractors();
    world.set_attractors(attractors);

    // Step physics
    world.step(dt);

    // Ensure we have meshes for all balls
    ensureBallMeshes();

    // Update ball positions
    const count = world.ball_count();
    for (let i = 0; i < count; i++) {
      ballMeshes[i].position.set(
        world.get_ball_x(i),
        world.get_ball_y(i),
        world.get_ball_z(i),
      );
    }

    // Update ball lights
    for (const bl of ballLights) {
      const mesh = ballMeshes[bl.ballIdx];
      if (mesh) bl.light.position.copy(mesh.position);
    }

    // Hand tracking collisions
    const handHits = handTracker.update(world, dt);

    // Flash balls on hand hit
    for (const hit of handHits) {
      const mesh = ballMeshes[hit.ballIndex];
      if (mesh) {
        mesh.material.emissiveIntensity = 1.5;
      }
      playHandHit(hit.x, hit.y, hit.z, hit.intensity);
    }

    // Wall bounce events (now include ball index)
    const bounceCount = world.get_bounce_count();
    for (let i = 0; i < bounceCount; i++) {
      const ev = world.get_bounce_event(i);
      const bi = ev[0] | 0;
      const mesh = ballMeshes[bi];
      if (mesh) {
        mesh.material.emissiveIntensity = 1.0;
      }
      playBounce(ev[1], ev[2], ev[3], ev[4]);
    }

    // Decay emissive on all balls
    for (const mesh of ballMeshes) {
      mesh.material.emissiveIntensity = Math.max(0.3, mesh.material.emissiveIntensity * 0.92);
    }

    // Decay ball lights
    for (const bl of ballLights) {
      bl.light.intensity = Math.max(2, bl.light.intensity * 0.95);
    }

    // Version splash fade
    if (!versionFadeStart) versionFadeStart = elapsed;
    const vElapsed = elapsed - versionFadeStart;
    if (vElapsed > 4 && versionSprite.visible) {
      versionSprite.material.opacity = Math.max(0, 1.0 - (vElapsed - 4) / 2);
      if (versionSprite.material.opacity <= 0) {
        versionSprite.visible = false;
        scene.remove(versionSprite);
      }
    }

    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function createTextSprite(text, fontSize = 48) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(136, 204, 255, 0.9)';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, opacity: 1.0, depthTest: false,
  });
  return new THREE.Sprite(material);
}

main().catch(console.error);

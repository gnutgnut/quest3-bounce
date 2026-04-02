import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { ensureAudioContext, speakRobot, playBounce, playHandHit, playGameOver, playHotReload, playSpawn, playPop, playWinner } from './audio.js';
import { initHandTracking } from './hands.js';
import { PerfWatch } from './watch.js';
import { MusicEngine } from './music.js';
import init, { World } from '../pkg/bounce_physics.js';

const VERSION = '0.6.12';
const SPAWN_INTERVAL_START = 15.0;
const SPAWN_INTERVAL_MIN = 2.0;
const SPAWN_ACCEL = 0.95; // multiply interval by this each spawn
const VERSION_POLL_INTERVAL = 10000; // 10 seconds
const BALL_COLORS = [
  0xff4488, 0x44ff88, 0x4488ff, 0xffaa22, 0xaa44ff,
  0xff44cc, 0x44ffcc, 0xccff44, 0xff6644, 0x44aaff,
];

async function main() {
  await init();
  const world = new World();

  // Restore state from hot reload if available
  let restoredElapsed = 0;
  let restoredLastSpawn = 0;
  const savedState = sessionStorage.getItem('hotReloadState');
  if (savedState) {
    try {
      const { balls, elapsed, lastSpawn } = JSON.parse(savedState);
      if (balls && balls.length > 0) {
        world.restore_state(new Float32Array(balls));
        restoredElapsed = elapsed || 0;
        restoredLastSpawn = lastSpawn || 0;
      }
    } catch (e) { /* ignore corrupt state */ }
    sessionStorage.removeItem('hotReloadState');
  }
  const wasHotReload = sessionStorage.getItem('hotReload') === '1';
  sessionStorage.removeItem('hotReload');

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
  renderer.xr.addEventListener('sessionstart', () => {
    ensureAudioContext();
    speakRobot(`Quest 3 Bounce. Version ${VERSION}. Destroy all balls.`);
  });

  // Auto-enter VR after hot reload (requires user gesture on most browsers, but Quest 3 may allow it)
  if (wasHotReload && navigator.xr) {
    navigator.xr.requestSession('immersive-vr', sessionInit).then((session) => {
      renderer.xr.setSession(session);
      ensureAudioContext();
    }).catch(() => { /* user will click Enter VR manually */ });
  }

  // Version polling for hot reload
  let knownVersion = null;
  async function checkVersion() {
    try {
      const base = import.meta.env.BASE_URL || '/';
      const res = await fetch(`${base}version.json`, { cache: 'no-store' });
      if (!res.ok) return;
      const { v } = await res.json();
      if (knownVersion === null) {
        knownVersion = v;
      } else if (v !== knownVersion) {
        triggerHotReload();
      }
    } catch (e) { /* network error, skip */ }
  }

  function triggerHotReload() {
    playHotReload();
    // Save game state
    const stateArray = Array.from(world.serialize_state());
    const elapsed = clock.elapsedTime + restoredElapsed;
    sessionStorage.setItem('hotReloadState', JSON.stringify({
      balls: stateArray,
      elapsed,
      lastSpawn: lastSpawnTime,
    }));
    sessionStorage.setItem('hotReload', '1');

    // End XR session if active, then reload
    const session = renderer.xr.getSession();
    if (session) {
      session.end().then(() => location.reload()).catch(() => location.reload());
    } else {
      location.reload();
    }
  }

  setInterval(checkVersion, VERSION_POLL_INTERVAL);
  checkVersion(); // establish baseline immediately

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

  // Ball geometry cache (keyed by radius rounded to 2 decimals)
  const ballGeoCache = new Map();
  function getBallGeo(radius) {
    const key = Math.round(radius * 100);
    if (!ballGeoCache.has(key)) {
      ballGeoCache.set(key, new THREE.SphereGeometry(radius, 24, 24));
    }
    return ballGeoCache.get(key);
  }

  // Ball material styles — varied textures
  const BALL_STYLES = [
    { roughness: 0.1, metalness: 0.9 },  // chrome
    { roughness: 0.8, metalness: 0.1 },  // matte rubber
    { roughness: 0.3, metalness: 0.6 },  // satin
    { roughness: 0.05, metalness: 1.0 }, // mirror
    { roughness: 0.6, metalness: 0.3 },  // clay
  ];

  // Ball management
  const ballMeshes = [];
  const ballLights = [];

  function createBallMesh(idx) {
    const color = BALL_COLORS[idx % BALL_COLORS.length];
    const style = BALL_STYLES[idx % BALL_STYLES.length];
    const radius = world.get_ball_radius(idx);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: style.roughness,
      metalness: style.metalness,
      emissive: color,
      emissiveIntensity: 0.3,
    });
    const mesh = new THREE.Mesh(getBallGeo(radius), mat);
    mesh.castShadow = true;
    return mesh;
  }

  function ensureBallMeshes() {
    const count = world.ball_count();
    while (ballMeshes.length < count) {
      const idx = ballMeshes.length;
      const mesh = createBallMesh(idx);
      scene.add(mesh);
      ballMeshes.push(mesh);

      // One light per ball (limit to first 5 for performance)
      if (idx < 5) {
        const color = BALL_COLORS[idx % BALL_COLORS.length];
        const light = new THREE.PointLight(color, 2, 4);
        scene.add(light);
        ballLights.push({ light, ballIdx: idx });
      }
    }
  }

  /** Remove ball mesh at index (mirrors Rust swap_remove) */
  function removeBallMesh(idx) {
    if (idx >= ballMeshes.length) return;
    const last = ballMeshes.length - 1;
    // Remove mesh from scene
    scene.remove(ballMeshes[idx]);
    if (idx < last) {
      // Swap last mesh into removed slot
      ballMeshes[idx] = ballMeshes[last];
    }
    ballMeshes.pop();
    // Fix up lights that referenced the swapped ball
    for (const bl of ballLights) {
      if (bl.ballIdx === last) bl.ballIdx = idx;
    }
    // Remove lights for balls that no longer exist
    for (let i = ballLights.length - 1; i >= 0; i--) {
      if (ballLights[i].ballIdx >= ballMeshes.length) {
        scene.remove(ballLights[i].light);
        ballLights.splice(i, 1);
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

  // Ball counter on back wall
  const counterCanvas = document.createElement('canvas');
  counterCanvas.width = 1024;
  counterCanvas.height = 512;
  const counterTexture = new THREE.CanvasTexture(counterCanvas);
  const counterMat = new THREE.MeshBasicMaterial({
    map: counterTexture, transparent: true, depthTest: false,
  });
  const counterMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), counterMat);
  counterMesh.position.set(0, roomH / 2, -roomD / 2 + 0.01);
  scene.add(counterMesh);
  let lastCounterValue = -1;

  function updateCounter(count) {
    if (count === lastCounterValue) return;
    lastCounterValue = count;
    const ctx = counterCanvas.getContext('2d');
    ctx.clearRect(0, 0, counterCanvas.width, counterCanvas.height);
    ctx.font = 'bold 280px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(136, 204, 255, 0.7)';
    ctx.fillText(String(count), counterCanvas.width / 2, counterCanvas.height / 2);
    counterTexture.needsUpdate = true;
  }
  updateCounter(world.ball_count());

  // Hand tracking
  const handTracker = initHandTracking(renderer, scene);

  // Perf watch on right wrist
  const perfWatch = new PerfWatch(scene);

  // Chiptune music engine
  const music = new MusicEngine();
  const MAX_BALLS_DISPLAY = 20; // match Rust MAX_BALLS for intensity scaling

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
  let spawnInterval = SPAWN_INTERVAL_START;
  let lastSpawnTime = restoredLastSpawn;
  let gameOver = false;
  let gameOverTime = 0;
  let winnerActive = false;
  let winnerTime = 0;
  const GAME_OVER_DURATION = 4.0;
  const WINNER_DURATION = 5.0;

  // Game over splash (hidden initially)
  const gameOverSprite = createTextSprite('GAME OVER', 64);
  gameOverSprite.position.set(0, 1.6, -1.0);
  gameOverSprite.scale.set(1.5, 0.4, 1);
  gameOverSprite.visible = false;
  scene.add(gameOverSprite);

  // Winner splash
  const winnerSprite = createTextSprite('WINNER!', 64);
  winnerSprite.position.set(0, 1.6, -1.0);
  winnerSprite.scale.set(1.5, 0.4, 1);
  winnerSprite.visible = false;
  scene.add(winnerSprite);

  // Celebration particles
  const celebParticles = [];
  const celebGeo = new THREE.SphereGeometry(0.03, 8, 8);

  function spawnCelebration() {
    for (let i = 0; i < 40; i++) {
      const color = BALL_COLORS[i % BALL_COLORS.length];
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0 });
      const mesh = new THREE.Mesh(celebGeo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 2,
        1.2 + Math.random() * 1.0,
        -0.5 + (Math.random() - 0.5) * 2,
      );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        2 + Math.random() * 4,
        (Math.random() - 0.5) * 4,
      );
      scene.add(mesh);
      celebParticles.push({ mesh, vel, life: 1.0 });
    }
  }

  function updateCelebration(dt) {
    for (let i = celebParticles.length - 1; i >= 0; i--) {
      const p = celebParticles[i];
      p.vel.y -= 6.0 * dt; // gravity
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt * 0.4;
      p.mesh.material.opacity = Math.max(0, p.life);
      // Pulse scale for boingy effect
      const pulse = 1.0 + 0.3 * Math.sin(p.life * 20);
      p.mesh.scale.setScalar(pulse);
      if (p.life <= 0) {
        scene.remove(p.mesh);
        celebParticles.splice(i, 1);
      }
    }
  }

  function clearCelebration() {
    for (const p of celebParticles) scene.remove(p.mesh);
    celebParticles.length = 0;
  }

  function restartGame(elapsed) {
    world.reset();
    while (ballMeshes.length > 1) {
      const mesh = ballMeshes.pop();
      scene.remove(mesh);
    }
    while (ballLights.length > 1) {
      const bl = ballLights.pop();
      scene.remove(bl.light);
    }
    gameOver = false;
    winnerActive = false;
    gameOverSprite.visible = false;
    winnerSprite.visible = false;
    clearCelebration();
    lastSpawnTime = elapsed;
    spawnInterval = SPAWN_INTERVAL_START;
    restoredElapsed = 0;
    updateCounter(world.ball_count());
  }

  // Animation loop
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime + restoredElapsed;

    if (winnerActive) {
      const sinceWin = elapsed - winnerTime;
      updateCelebration(dt);
      // Pulsing rainbow text
      const hue = (sinceWin * 120) % 360;
      winnerSprite.material.color.setHSL(hue / 360, 1, 0.7);
      // Boingy scale pulse
      const scale = 1.5 + 0.3 * Math.sin(sinceWin * 8);
      winnerSprite.scale.set(scale, scale * 0.27, 1);
      if (sinceWin > WINNER_DURATION - 1) {
        winnerSprite.material.opacity = Math.max(0, WINNER_DURATION - sinceWin);
      }
      if (sinceWin > WINNER_DURATION) {
        restartGame(elapsed);
      }
      handTracker.updateBlade(world, dt);
      handTracker.update(world, dt);
      music.update(dt, 0, MAX_BALLS_DISPLAY);
      perfWatch.update(dt, handTracker.getRightWrist());
      renderer.render(scene, camera);
      return;
    }

    if (gameOver) {
      const sinceOver = elapsed - gameOverTime;
      if (sinceOver > GAME_OVER_DURATION) {
        restartGame(elapsed);
      } else if (sinceOver > GAME_OVER_DURATION - 1) {
        gameOverSprite.material.opacity = Math.max(0, (GAME_OVER_DURATION - sinceOver));
      }
      renderer.render(scene, camera);
      return;
    }

    // Spawn balls at increasing rate
    if (elapsed - lastSpawnTime > spawnInterval) {
      world.spawn_ball();
      playSpawn();
      lastSpawnTime = elapsed;
      spawnInterval = Math.max(SPAWN_INTERVAL_MIN, spawnInterval * SPAWN_ACCEL);
    }

    // Check game over
    if (world.is_game_over()) {
      gameOver = true;
      gameOverTime = elapsed;
      gameOverSprite.visible = true;
      gameOverSprite.material.opacity = 1.0;
      playGameOver();
      music.gameOverDarken();
      if (info) info.textContent = `GAME OVER — ${world.ball_count()} balls in ${Math.floor(elapsed)}s`;
      renderer.render(scene, camera);
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

    // Update ball counter
    const count = world.ball_count();
    updateCounter(count);
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

    // Blade pops (before hand collisions — removes balls, indices shift)
    const pops = handTracker.updateBlade(world, dt);
    for (const pop of pops) {
      removeBallMesh(pop.ballIndex);
      playPop(pop.x, pop.y, pop.z);
    }

    // Check for winner — all balls destroyed!
    if (pops.length > 0 && world.ball_count() === 0) {
      winnerActive = true;
      winnerTime = elapsed;
      winnerSprite.visible = true;
      winnerSprite.material.opacity = 1.0;
      spawnCelebration();
      playWinner();
      music.celebrationSwell();
      updateCounter(0);
      renderer.render(scene, camera);
      return;
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

    // Update music and perf watch
    music.update(dt, count, MAX_BALLS_DISPLAY);
    perfWatch.update(dt, handTracker.getRightWrist());

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

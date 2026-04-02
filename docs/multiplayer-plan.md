# Multiplayer Plan — quest3-bounce

## Context
Assessing how hard it would be to make quest3-bounce multiplayer (like City Sling VR) — multiple players in the same room interacting with the same balls.

## Verdict: Medium difficulty, ~2-3 days of work

It's very doable. The architecture is already well-suited: clean physics/rendering split, small state footprint, existing serialization. The main work is adding a networking layer and handling a few gotchas.

## What's in our favour

- **Tiny state**: 20 balls x 8 floats = 640 bytes. Fits in a single UDP packet.
- **Serialization exists**: `serialize_state()` / `restore_state()` already work.
- **Input is simple**: Each player contributes hand attractors (4 floats per hand) + ball removals. Easy to transmit.
- **Physics is fast**: `step()` runs in microseconds for 20 balls. Can run on server or every client.
- **Clean separation**: Rust physics knows nothing about rendering. JS knows nothing about physics internals.

## What needs solving

### 1. Networking layer (biggest chunk of work)
**No networking exists today.** Need to add either:
- **WebSocket to a small server** (simplest — a 50-line Node/Deno/Cloudflare Worker)
- **WebRTC Data Channel** (P2P, lower latency, but needs STUN/TURN for NAT traversal)

For a game like this, **WebSocket is fine** — we're syncing 20 balls at 30Hz, not a twitch shooter.

### 2. Non-deterministic spawning
`Ball::new_random()` uses `js_sys::Math::random()`. Two clients calling `spawn_ball()` get different balls. **Fix**: replace with a seeded PRNG (xorshift32, ~10 lines of Rust), seed provided by server at game start. Then all clients generate identical balls.

### 3. Who runs physics?
**Recommended: server-authoritative with client prediction.**
- Server runs `World::step()` at 30Hz, broadcasts state snapshots
- Clients run physics locally for smooth rendering, snap to server state when it arrives
- Hand attractors from all players sent to server, merged into one `set_attractors()` call

Alternative: P2P with one client as "host" — simpler but host has advantage.

### 4. Collision arbitration
- Ball-ball collisions: handled by server physics, no issue
- Hand-ball collisions (impulses): client sends "I hit ball X with velocity V", server validates
- Blade/touch pops: client sends "remove ball X", server confirms and broadcasts
- Bonds: emerge from physics, server-authoritative

### 5. Rendering remote players
Need to show other players' hands in the room. Each player sends hand joint positions (~25 joints x 3 floats x 2 hands = 150 floats/frame). Render as the same blue spheres, different colour per player.

## Architecture sketch

```
                          WebSocket (wss://)
  +-----------+     <--------------------------->     +--------------+
  | Client A  |       hand pos, pops, state          |   Server     |
  | (Quest 3) |                                       | (shed-pve)   |
  +-----------+                                       |  Node.js     |
                                                      |  runs World  |
  +-----------+     <--------------------------->     |  merges input|
  | Client B  |       hand pos, pops, state          +--------------+
  | (Phone)   |
  +-----------+
```

**Messages (all JSON or binary):**
- Client->Server: `{type:"hands", data:[x,y,z,str,...]}` @ 30Hz
- Client->Server: `{type:"pop", ballIndex:5}` on blade/touch pop
- Server->All: `{type:"state", balls:[...], bonds:[...]}` @ 30Hz
- Server->All: `{type:"hands", playerId:1, data:[...]}` @ 30Hz (for rendering remote hands)

## Hosting

WebSocket server on **shed-pve** — lightweight Node.js process, behind existing reverse proxy. GitHub Pages continues to serve the static client; client connects to `wss://shed-pve.local/bounce` (or a Tailscale/Cloudflare tunnel for external access).

## Estimated effort

| Task | Effort |
|------|--------|
| WebSocket server (Node.js, hosts World) | 3-4 hours |
| Replace Math.random with seeded PRNG | 30 min |
| Client networking module (connect, send hands, receive state) | 3-4 hours |
| Render remote players' hands | 1-2 hours |
| Room/lobby system (create/join game) | 2-3 hours |
| State reconciliation (snap client to server) | 1-2 hours |
| Deploy server on shed-pve | 1 hour |
| Testing & polish | 2-3 hours |
| **Total** | **~15-20 hours** |

## What we'd keep as-is
- All rendering code (Three.js scene, materials, effects)
- All audio (bounce, pop, music — each client plays locally)
- Hand tracking input (just also send it over network)
- Watch, blade, celebration — all local visual flair
- Hot reload (each client independent)
- Phone touch controls (phone players join same game)

## Open questions
1. **Matchmaking**: Simple room codes? Auto-join? For a toy project, a 4-digit room code is plenty.
2. **Player limit**: 2-4 players is trivial. 10+ would need state compression but still manageable given tiny world size.
3. **Cross-platform**: Quest VR + phone spectator in same room works naturally — phone players see the same balls, use touch to interact.
4. **External access**: Tailscale or Cloudflare tunnel from shed-pve for players outside the LAN.

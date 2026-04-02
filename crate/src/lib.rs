use wasm_bindgen::prelude::*;

const GRAVITY: f32 = -9.81;
const RESTITUTION: f32 = 0.85;
const MAX_BOUNCES: usize = 64;
const MAX_BALLS: usize = 20;
const ATTRACT_STRENGTH: f32 = 3.0;
const ATTRACT_MIN_DIST: f32 = 0.15;

struct Ball {
    pos: [f32; 3],
    vel: [f32; 3],
    radius: f32,
    mass: f32, // 0.5 = light/bouncy, 3.0 = heavy/sluggish
}

#[wasm_bindgen]
pub struct World {
    balls: Vec<Ball>,

    // Room half-extents (centered at origin, floor at y=0)
    room_w: f32,
    room_h: f32,
    room_d: f32,

    // Hand attractor positions (up to 2 hands)
    attractors: Vec<[f32; 4]>,  // [x, y, z, strength_multiplier]

    // Bounce events from last step: [ball_index, x, y, z, intensity, ...]
    bounce_events: Vec<f32>,

    game_over: bool,
}

impl Ball {
    fn new_random() -> Ball {
        let mass = 0.5 + pseudo_random() * 2.5; // 0.5 to 3.0
        let radius = 0.08 + mass * 0.04; // 0.10 to 0.20 — heavier = bigger
        Ball {
            pos: [
                (pseudo_random() - 0.5) * 2.0,
                2.0 + pseudo_random() * 0.8,
                (pseudo_random() - 0.5) * 2.0,
            ],
            vel: [
                (pseudo_random() - 0.5) * 3.0,
                pseudo_random() * 2.0,
                (pseudo_random() - 0.5) * 3.0,
            ],
            radius,
            mass,
        }
    }
}

#[wasm_bindgen]
impl World {
    #[wasm_bindgen(constructor)]
    pub fn new() -> World {
        let mut w = World {
            balls: Vec::new(),
            room_w: 2.0,
            room_h: 3.0,
            room_d: 2.0,
            attractors: Vec::new(),
            bounce_events: Vec::new(),
            game_over: false,
        };
        // Start with one ball
        w.balls.push(Ball {
            pos: [0.0, 2.5, -1.0],
            vel: [1.8, 0.0, -1.2],
            radius: 0.15,
            mass: 1.0,
        });
        w
    }

    pub fn reset(&mut self) {
        self.balls.clear();
        self.game_over = false;
        self.bounce_events.clear();
        self.balls.push(Ball {
            pos: [0.0, 2.5, -1.0],
            vel: [1.8, 0.0, -1.2],
            radius: 0.15,
            mass: 1.0,
        });
    }

    pub fn spawn_ball(&mut self) {
        if self.balls.len() < MAX_BALLS {
            self.balls.push(Ball::new_random());
        }
        if self.balls.len() >= MAX_BALLS {
            self.game_over = true;
        }
    }

    pub fn is_game_over(&self) -> bool {
        self.game_over
    }

    pub fn ball_count(&self) -> usize {
        self.balls.len()
    }

    /// Set attractor positions with per-attractor strength multiplier.
    /// Format: [x, y, z, strength, x, y, z, strength, ...]
    pub fn set_attractors(&mut self, coords: &[f32]) {
        self.attractors.clear();
        let mut i = 0;
        while i + 3 < coords.len() {
            self.attractors.push([coords[i], coords[i + 1], coords[i + 2], coords[i + 3]]);
            i += 4;
        }
    }

    pub fn step(&mut self, dt: f32) {
        self.bounce_events.clear();
        let dt = dt.min(0.05);

        for bi in 0..self.balls.len() {
            let ball = &mut self.balls[bi];

            // Gravity
            ball.vel[1] += GRAVITY * dt;

            // Hand attraction (lighter balls pulled more easily)
            let inv_mass = 1.0 / ball.mass;
            for attr in &self.attractors {
                let dx = attr[0] - ball.pos[0];
                let dy = attr[1] - ball.pos[1];
                let dz = attr[2] - ball.pos[2];
                let strength_mult = attr[3];
                let dist_sq = dx * dx + dy * dy + dz * dz;
                let dist = dist_sq.sqrt().max(ATTRACT_MIN_DIST);
                let force = ATTRACT_STRENGTH * strength_mult * inv_mass / dist;
                let inv_dist = 1.0 / dist;
                ball.vel[0] += dx * inv_dist * force * dt;
                ball.vel[1] += dy * inv_dist * force * dt;
                ball.vel[2] += dz * inv_dist * force * dt;

                // Damping — bleed off velocity when close to attractor (prevents orbit oscillation)
                if dist < 0.8 && strength_mult > 1.0 {
                    let damp = 1.0 - (3.0 * dt).min(0.9) * (1.0 - dist / 0.8);
                    ball.vel[0] *= damp;
                    ball.vel[1] *= damp;
                    ball.vel[2] *= damp;
                }
            }

            // Integrate
            ball.pos[0] += ball.vel[0] * dt;
            ball.pos[1] += ball.vel[1] * dt;
            ball.pos[2] += ball.vel[2] * dt;

            // Wall collisions
            if ball.pos[1] < ball.radius {
                ball.pos[1] = ball.radius;
                let intensity = (-ball.vel[1]).max(0.0);
                ball.vel[1] = -ball.vel[1] * RESTITUTION;
                if intensity > 0.3 { Self::push_bounce_ev(&mut self.bounce_events, bi, &ball.pos, intensity); }
            }
            if ball.pos[1] > self.room_h - ball.radius {
                ball.pos[1] = self.room_h - ball.radius;
                let intensity = ball.vel[1].max(0.0);
                ball.vel[1] = -ball.vel[1] * RESTITUTION;
                if intensity > 0.3 { Self::push_bounce_ev(&mut self.bounce_events, bi, &ball.pos, intensity); }
            }
            if ball.pos[0] < -self.room_w + ball.radius {
                ball.pos[0] = -self.room_w + ball.radius;
                let intensity = (-ball.vel[0]).max(0.0);
                ball.vel[0] = -ball.vel[0] * RESTITUTION;
                if intensity > 0.3 { Self::push_bounce_ev(&mut self.bounce_events, bi, &ball.pos, intensity); }
            }
            if ball.pos[0] > self.room_w - ball.radius {
                ball.pos[0] = self.room_w - ball.radius;
                let intensity = ball.vel[0].max(0.0);
                ball.vel[0] = -ball.vel[0] * RESTITUTION;
                if intensity > 0.3 { Self::push_bounce_ev(&mut self.bounce_events, bi, &ball.pos, intensity); }
            }
            if ball.pos[2] < -self.room_d + ball.radius {
                ball.pos[2] = -self.room_d + ball.radius;
                let intensity = (-ball.vel[2]).max(0.0);
                ball.vel[2] = -ball.vel[2] * RESTITUTION;
                if intensity > 0.3 { Self::push_bounce_ev(&mut self.bounce_events, bi, &ball.pos, intensity); }
            }
            if ball.pos[2] > self.room_d - ball.radius {
                ball.pos[2] = self.room_d - ball.radius;
                let intensity = ball.vel[2].max(0.0);
                ball.vel[2] = -ball.vel[2] * RESTITUTION;
                if intensity > 0.3 { Self::push_bounce_ev(&mut self.bounce_events, bi, &ball.pos, intensity); }
            }

            // Auto-kick when nearly stopped (only if no attractors active)
            if self.attractors.is_empty() {
                let speed_sq = ball.vel[0] * ball.vel[0]
                    + ball.vel[1] * ball.vel[1]
                    + ball.vel[2] * ball.vel[2];
                if speed_sq < 0.1 && ball.pos[1] < ball.radius + 0.01 {
                    ball.vel[1] = 4.0 + pseudo_random() * 2.0;
                    ball.vel[0] = (pseudo_random() - 0.5) * 3.0;
                    ball.vel[2] = (pseudo_random() - 0.5) * 3.0;
                }
            }
        }

        // Ball-to-ball collisions (elastic, mass-weighted)
        let n = self.balls.len();
        for i in 0..n {
            for j in (i + 1)..n {
                let dx = self.balls[j].pos[0] - self.balls[i].pos[0];
                let dy = self.balls[j].pos[1] - self.balls[i].pos[1];
                let dz = self.balls[j].pos[2] - self.balls[i].pos[2];
                let dist_sq = dx * dx + dy * dy + dz * dz;
                let min_dist = self.balls[i].radius + self.balls[j].radius;
                if dist_sq < min_dist * min_dist && dist_sq > 0.0001 {
                    let dist = dist_sq.sqrt();
                    let nx = dx / dist;
                    let ny = dy / dist;
                    let nz = dz / dist;

                    // Relative velocity along collision normal
                    let dvx = self.balls[i].vel[0] - self.balls[j].vel[0];
                    let dvy = self.balls[i].vel[1] - self.balls[j].vel[1];
                    let dvz = self.balls[i].vel[2] - self.balls[j].vel[2];
                    let dvn = dvx * nx + dvy * ny + dvz * nz;

                    // Only resolve if approaching
                    if dvn > 0.0 {
                        let mi = self.balls[i].mass;
                        let mj = self.balls[j].mass;
                        let impulse = (1.0 + RESTITUTION) * dvn / (mi + mj);

                        self.balls[i].vel[0] -= impulse * mj * nx;
                        self.balls[i].vel[1] -= impulse * mj * ny;
                        self.balls[i].vel[2] -= impulse * mj * nz;
                        self.balls[j].vel[0] += impulse * mi * nx;
                        self.balls[j].vel[1] += impulse * mi * ny;
                        self.balls[j].vel[2] += impulse * mi * nz;
                    }

                    // Separate overlapping balls
                    let overlap = min_dist - dist;
                    let total_mass = self.balls[i].mass + self.balls[j].mass;
                    let fi = self.balls[j].mass / total_mass;
                    let fj = self.balls[i].mass / total_mass;
                    self.balls[i].pos[0] -= nx * overlap * fi;
                    self.balls[i].pos[1] -= ny * overlap * fi;
                    self.balls[i].pos[2] -= nz * overlap * fi;
                    self.balls[j].pos[0] += nx * overlap * fj;
                    self.balls[j].pos[1] += ny * overlap * fj;
                    self.balls[j].pos[2] += nz * overlap * fj;
                }
            }
        }
    }

    fn push_bounce_ev(events: &mut Vec<f32>, ball_idx: usize, pos: &[f32; 3], intensity: f32) {
        if events.len() / 5 < MAX_BOUNCES {
            events.push(ball_idx as f32);
            events.push(pos[0]);
            events.push(pos[1]);
            events.push(pos[2]);
            events.push(intensity.min(10.0));
        }
    }

    pub fn get_ball_x(&self, i: usize) -> f32 {
        self.balls.get(i).map_or(0.0, |b| b.pos[0])
    }

    pub fn get_ball_y(&self, i: usize) -> f32 {
        self.balls.get(i).map_or(0.0, |b| b.pos[1])
    }

    pub fn get_ball_z(&self, i: usize) -> f32 {
        self.balls.get(i).map_or(0.0, |b| b.pos[2])
    }

    pub fn get_radius(&self) -> f32 {
        0.15 // default for collision estimation
    }

    // Keep old API for compatibility
    pub fn get_x(&self) -> f32 { self.get_ball_x(0) }
    pub fn get_y(&self) -> f32 { self.get_ball_y(0) }
    pub fn get_z(&self) -> f32 { self.get_ball_z(0) }

    pub fn get_bounce_count(&self) -> usize {
        self.bounce_events.len() / 5
    }

    pub fn get_bounce_event(&self, index: usize) -> Vec<f32> {
        let i = index * 5;
        if i + 4 < self.bounce_events.len() {
            vec![
                self.bounce_events[i],     // ball index
                self.bounce_events[i + 1], // x
                self.bounce_events[i + 2], // y
                self.bounce_events[i + 3], // z
                self.bounce_events[i + 4], // intensity
            ]
        } else {
            vec![0.0, 0.0, 0.0, 0.0, 0.0]
        }
    }

    pub fn apply_impulse(&mut self, vx: f32, vy: f32, vz: f32) {
        self.apply_impulse_to(0, vx, vy, vz);
    }

    pub fn apply_impulse_to(&mut self, i: usize, vx: f32, vy: f32, vz: f32) {
        if let Some(ball) = self.balls.get_mut(i) {
            let inv_mass = 1.0 / ball.mass;
            ball.vel[0] += vx * inv_mass;
            ball.vel[1] += vy * inv_mass;
            ball.vel[2] += vz * inv_mass;
        }
    }

    /// Remove ball by index (swap-remove for O(1)). Returns true if removed.
    pub fn remove_ball(&mut self, i: usize) -> bool {
        if i < self.balls.len() {
            self.balls.swap_remove(i);
            true
        } else {
            false
        }
    }

    pub fn get_ball_radius(&self, i: usize) -> f32 {
        self.balls.get(i).map_or(0.15, |b| b.radius)
    }

    pub fn get_ball_mass(&self, i: usize) -> f32 {
        self.balls.get(i).map_or(1.0, |b| b.mass)
    }

    /// Serialize all ball state: [count, x,y,z,vx,vy,vz,radius,mass, ...]
    pub fn serialize_state(&self) -> Vec<f32> {
        let mut data = Vec::with_capacity(1 + self.balls.len() * 8);
        data.push(self.balls.len() as f32);
        for ball in &self.balls {
            data.extend_from_slice(&ball.pos);
            data.extend_from_slice(&ball.vel);
            data.push(ball.radius);
            data.push(ball.mass);
        }
        data
    }

    /// Restore ball state from serialized data. Clears existing balls.
    pub fn restore_state(&mut self, data: &[f32]) {
        self.balls.clear();
        if data.is_empty() { return; }
        let count = data[0] as usize;
        let mut i = 1;
        for _ in 0..count {
            if i + 7 >= data.len() { break; }
            self.balls.push(Ball {
                pos: [data[i], data[i + 1], data[i + 2]],
                vel: [data[i + 3], data[i + 4], data[i + 5]],
                radius: data[i + 6],
                mass: data[i + 7],
            });
            i += 8;
        }
        self.game_over = self.balls.len() >= MAX_BALLS;
    }
}

fn pseudo_random() -> f32 {
    js_sys::Math::random() as f32
}

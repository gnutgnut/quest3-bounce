use wasm_bindgen::prelude::*;

const GRAVITY: f32 = -9.81;
const RESTITUTION: f32 = 0.85;
const MAX_BOUNCES: usize = 16;

#[wasm_bindgen]
pub struct World {
    // Ball state
    pos: [f32; 3],
    vel: [f32; 3],
    radius: f32,

    // Room half-extents (centered at origin, floor at y=0)
    room_w: f32, // half-width (x)
    room_h: f32, // height (y, floor=0 ceiling=room_h)
    room_d: f32, // half-depth (z)

    // Bounce events from last step: [x, y, z, intensity, ...]
    bounce_events: Vec<f32>,
}

#[wasm_bindgen]
impl World {
    #[wasm_bindgen(constructor)]
    pub fn new() -> World {
        World {
            pos: [0.0, 2.5, -2.0],
            vel: [1.8, 0.0, -1.2],
            radius: 0.15,
            room_w: 2.0,
            room_h: 3.0,
            room_d: 2.0,
            bounce_events: Vec::new(),
        }
    }

    pub fn step(&mut self, dt: f32) {
        self.bounce_events.clear();

        // Clamp dt to prevent explosion on tab-switch
        let dt = dt.min(0.05);

        // Apply gravity
        self.vel[1] += GRAVITY * dt;

        // Integrate position
        self.pos[0] += self.vel[0] * dt;
        self.pos[1] += self.vel[1] * dt;
        self.pos[2] += self.vel[2] * dt;

        // Collision detection & response against 6 planes
        // Floor (y = radius)
        if self.pos[1] < self.radius {
            self.pos[1] = self.radius;
            let intensity = (-self.vel[1]).max(0.0);
            self.vel[1] = -self.vel[1] * RESTITUTION;
            self.add_jitter();
            if intensity > 0.3 {
                self.push_bounce(intensity);
            }
        }

        // Ceiling (y = room_h - radius)
        if self.pos[1] > self.room_h - self.radius {
            self.pos[1] = self.room_h - self.radius;
            let intensity = self.vel[1].max(0.0);
            self.vel[1] = -self.vel[1] * RESTITUTION;
            if intensity > 0.3 {
                self.push_bounce(intensity);
            }
        }

        // Left wall (x = -room_w + radius)
        if self.pos[0] < -self.room_w + self.radius {
            self.pos[0] = -self.room_w + self.radius;
            let intensity = (-self.vel[0]).max(0.0);
            self.vel[0] = -self.vel[0] * RESTITUTION;
            if intensity > 0.3 {
                self.push_bounce(intensity);
            }
        }

        // Right wall (x = room_w - radius)
        if self.pos[0] > self.room_w - self.radius {
            self.pos[0] = self.room_w - self.radius;
            let intensity = self.vel[0].max(0.0);
            self.vel[0] = -self.vel[0] * RESTITUTION;
            if intensity > 0.3 {
                self.push_bounce(intensity);
            }
        }

        // Back wall (z = -room_d + radius)
        if self.pos[2] < -self.room_d + self.radius {
            self.pos[2] = -self.room_d + self.radius;
            let intensity = (-self.vel[2]).max(0.0);
            self.vel[2] = -self.vel[2] * RESTITUTION;
            if intensity > 0.3 {
                self.push_bounce(intensity);
            }
        }

        // Front wall (z = room_d - radius)
        if self.pos[2] > self.room_d - self.radius {
            self.pos[2] = self.room_d - self.radius;
            let intensity = self.vel[2].max(0.0);
            self.vel[2] = -self.vel[2] * RESTITUTION;
            if intensity > 0.3 {
                self.push_bounce(intensity);
            }
        }

        // If ball has nearly stopped, give it a kick
        let speed_sq = self.vel[0] * self.vel[0]
            + self.vel[1] * self.vel[1]
            + self.vel[2] * self.vel[2];
        if speed_sq < 0.1 && self.pos[1] < self.radius + 0.01 {
            self.vel[1] = 4.0 + pseudo_random() * 2.0;
            self.vel[0] = (pseudo_random() - 0.5) * 3.0;
            self.vel[2] = (pseudo_random() - 0.5) * 3.0;
        }
    }

    pub fn get_x(&self) -> f32 {
        self.pos[0]
    }

    pub fn get_y(&self) -> f32 {
        self.pos[1]
    }

    pub fn get_z(&self) -> f32 {
        self.pos[2]
    }

    pub fn get_bounce_count(&self) -> usize {
        self.bounce_events.len() / 4
    }

    pub fn get_bounce_event(&self, index: usize) -> Vec<f32> {
        let i = index * 4;
        if i + 3 < self.bounce_events.len() {
            vec![
                self.bounce_events[i],
                self.bounce_events[i + 1],
                self.bounce_events[i + 2],
                self.bounce_events[i + 3],
            ]
        } else {
            vec![0.0, 0.0, 0.0, 0.0]
        }
    }

    fn push_bounce(&mut self, intensity: f32) {
        if self.bounce_events.len() / 4 >= MAX_BOUNCES {
            return;
        }
        self.bounce_events.push(self.pos[0]);
        self.bounce_events.push(self.pos[1]);
        self.bounce_events.push(self.pos[2]);
        self.bounce_events.push(intensity.min(10.0));
    }

    pub fn apply_impulse(&mut self, vx: f32, vy: f32, vz: f32) {
        self.vel[0] += vx;
        self.vel[1] += vy;
        self.vel[2] += vz;
    }

    pub fn get_radius(&self) -> f32 {
        self.radius
    }

    fn add_jitter(&mut self) {
        self.vel[0] += (pseudo_random() - 0.5) * 0.3;
        self.vel[2] += (pseudo_random() - 0.5) * 0.3;
    }
}

// Simple deterministic pseudo-random (no std rand in wasm)
// Uses js_sys::Math::random for actual randomness
fn pseudo_random() -> f32 {
    js_sys::Math::random() as f32
}

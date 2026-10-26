// ============================================================
// §1  CONSTANTS
// ============================================================
const GRID   = 30;          // cells per axis
const CELL   = 20;          // px per cell  (600 / 30)
const WIDTH  = 600;
const HEIGHT = 600;
const BASE_INTERVAL = 120;  // ms per step at speed 1x
const FOOD_MIN = 3;
const FOOD_MAX = 5;
const GROW_POINTS   = 10;
const AI_KILL_BONUS = 20;
const SPEED_UP_EVERY = 5;   // player food eaten before speed bump
const SPEED_UP_FACTOR = 0.92; // multiply interval by this

// Direction vectors  {dx, dy}
const DIR = {
  UP:    { dx:  0, dy: -1 },
  DOWN:  { dx:  0, dy:  1 },
  LEFT:  { dx: -1, dy:  0 },
  RIGHT: { dx:  1, dy:  0 },
};
// Opposite check helper
const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };

// Snake colors
const PLAYER_COLOR     = '#4fc3f7';
const PLAYER_HEAD      = '#81d4fa';
const AI_COLORS = [
  { body: '#ef5350', head: '#ff8a80' },   // red
  { body: '#ab47bc', head: '#ce93d8' },   // purple
  { body: '#66bb6a', head: '#a5d6a7' },   // green
  { body: '#ffa726', head: '#ffcc80' },   // orange
  { body: '#ec407a', head: '#f48fb1' },   // pink
];

// Difficulty presets
const DIFFICULTIES = {
  easy:   { aiCount: 1, blockChance: 0.05, aiRespawn: 4000 },
  normal: { aiCount: 3, blockChance: 0.25, aiRespawn: 3000 },
  hard:   { aiCount: 5, blockChance: 0.45, aiRespawn: 1800 },
};

// ============================================================
// §2  DOM REFERENCES
// ============================================================
const canvas   = document.getElementById('game');
const ctx      = canvas.getContext('2d');
const hudEl    = document.getElementById('hud');
const scoreEl  = document.getElementById('score-val');
const highEl   = document.getElementById('high-val');
const speedEl  = document.getElementById('speed-display');
const lbEl     = document.getElementById('leaderboard');
const overlayEl = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const overlayMsg   = document.getElementById('overlay-msg');
const menuEl   = document.getElementById('menu');

// ============================================================
// §3  AUDIO  (Web Audio API — no files needed)
// ============================================================
let audioCtx = null;
let muted = false;

/** Lazy-init AudioContext (must happen after user gesture) */
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

/** Play a short synthesized tone */
function playTone(freq, duration, type = 'square', vol = 0.13) {
  if (muted || !audioCtx) return;
  try {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (_) { /* swallow audio errors gracefully */ }
}

function sfxEat()      { playTone(660, 0.08, 'square', 0.12); setTimeout(() => playTone(880, 0.08, 'square', 0.10), 60); }
function sfxDie()      { playTone(180, 0.3, 'sawtooth', 0.15); setTimeout(() => playTone(120, 0.35, 'sawtooth', 0.12), 100); }
function sfxAIDie()    { playTone(440, 0.1, 'triangle', 0.10); setTimeout(() => playTone(330, 0.12, 'triangle', 0.08), 80); }

function toggleMute() {
  muted = !muted;
  document.getElementById('mute-btn').textContent = muted ? '🔇' : '🔊';
}

// ============================================================
// §4  GAME STATE
// ============================================================
let difficulty = 'normal';
let gameState  = 'menu'; // 'menu' | 'playing' | 'paused' | 'dead'
let loopTimer  = null;
let currentInterval = BASE_INTERVAL;

// Player snake
let player = null;
// AI snakes
let aiSnakes = [];
// Food items  [{x, y}]
let foods = [];
// Score
let score = 0;
let highScore = 0;
// Speed level (how many times we sped up)
let speedLevel = 0;
let foodEatenSinceSpeedup = 0;

// Particles  [{x, y, vx, vy, life, maxLife, color}]
let particles = [];

// Screen shake
let shakeAmount = 0;
let shakeDuration = 0;
let shakeStart = 0;

// ============================================================
// §5  UTILITIES
// ============================================================

/** Is (x,y) inside the grid? */
function inBounds(x, y) {
  return x >= 0 && x < GRID && y >= 0 && y < GRID;
}

/** Build a Set key from coords */
function key(x, y) { return x * 1000 + y; }

/** Get the set of all occupied cell keys */
function occupiedSet() {
  const s = new Set();
  if (player && player.alive) player.body.forEach(p => s.add(key(p.x, p.y)));
  aiSnakes.forEach(ai => { if (ai.alive) ai.body.forEach(p => s.add(key(p.x, p.y))); });
  foods.forEach(f => s.add(key(f.x, f.y)));
  return s;
}

/** Get the set of all snake body cell keys (no food) */
function snakeOccupiedSet() {
  const s = new Set();
  if (player && player.alive) player.body.forEach(p => s.add(key(p.x, p.y)));
  aiSnakes.forEach(ai => { if (ai.alive) ai.body.forEach(p => s.add(key(p.x, p.y))); });
  return s;
}

/** Find a random empty cell */
function randomEmptyCell(occupied) {
  // Fast: try random spots first
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(Math.random() * GRID);
    const y = Math.floor(Math.random() * GRID);
    if (!occupied.has(key(x, y))) return { x, y };
  }
  // Fallback: scan all cells
  const empties = [];
  for (let x = 0; x < GRID; x++)
    for (let y = 0; y < GRID; y++)
      if (!occupied.has(key(x, y))) empties.push({ x, y });
  if (empties.length === 0) return null; // board full
  return empties[Math.floor(Math.random() * empties.length)];
}

/** Manhattan distance */
function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

/** Load high score from localStorage */
function loadHighScore() {
  try {
    const v = localStorage.getItem('snakeArena_highScore');
    if (v !== null) highScore = parseInt(v, 10) || 0;
  } catch (_) {}
}

/** Save high score to localStorage */
function saveHighScore() {
  try { localStorage.setItem('snakeArena_highScore', highScore.toString()); } catch (_) {}
}

// ============================================================
// §6  SNAKE FACTORY
// ============================================================

function createSnake(x, y, dir, color, headColor, isPlayer = false) {
  const body = [];
  const d = DIR[dir];
  // Build body from head backwards
  for (let i = 0; i < 3; i++) {
    body.push({ x: x - d.dx * i, y: y - d.dy * i });
  }
  return {
    body,            // [0] = head
    dir,             // current direction name
    nextDir: dir,    // buffered direction
    color,
    headColor,
    isPlayer,
    alive: true,
    respawnTimer: 0, // ms until respawn (for AI)
    growQueue: 0,    // segments queued to grow
  };
}

// ============================================================
// §7  INITIALIZATION
// ============================================================

function initGame() {
  const diff = DIFFICULTIES[difficulty];

  // Reset state
  score = 0;
  speedLevel = 0;
  foodEatenSinceSpeedup = 0;
  currentInterval = BASE_INTERVAL;
  particles = [];
  shakeAmount = 0;
  foods = [];

  // Player at center, moving right
  const cx = Math.floor(GRID / 2);
  const cy = Math.floor(GRID / 2);
  player = createSnake(cx, cy, 'RIGHT', PLAYER_COLOR, PLAYER_HEAD, true);

  // AI snakes
  aiSnakes = [];
  for (let i = 0; i < diff.aiCount; i++) {
    spawnAI(i);
  }

  // Spawn initial food
  for (let i = 0; i < FOOD_MAX; i++) {
    spawnFood();
  }

  updateHUD();
}

function spawnAI(index) {
  const occ = occupiedSet();
  // Try to find a safe 3-cell strip for the AI
  const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
  for (let attempt = 0; attempt < 300; attempt++) {
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    const dv = DIR[d];
    const hx = Math.floor(Math.random() * GRID);
    const hy = Math.floor(Math.random() * GRID);
    // Check all 3 cells
    let ok = true;
    for (let i = 0; i < 3; i++) {
      const bx = hx - dv.dx * i;
      const by = hy - dv.dy * i;
      if (!inBounds(bx, by) || occ.has(key(bx, by))) { ok = false; break; }
    }
    if (ok) {
      const ci = index % AI_COLORS.length;
      const ai = createSnake(hx, hy, d, AI_COLORS[ci].body, AI_COLORS[ci].head, false);
      // If slot already exists, replace; otherwise push
      if (index < aiSnakes.length) {
        aiSnakes[index] = ai;
      } else {
        aiSnakes.push(ai);
      }
      return;
    }
  }
  // If somehow can't place, create it off-screen (will respawn properly)
  const ci = index % AI_COLORS.length;
  const ai = createSnake(0, 0, 'RIGHT', AI_COLORS[ci].body, AI_COLORS[ci].head, false);
  ai.alive = false;
  ai.respawnTimer = 500;
  if (index < aiSnakes.length) aiSnakes[index] = ai;
  else aiSnakes.push(ai);
}

function spawnFood() {
  const occ = occupiedSet();
  const cell = randomEmptyCell(occ);
  if (cell) foods.push(cell);
}

// ============================================================
// §8  INPUT HANDLING
// ============================================================

/** Queue a direction change for the player */
function changeDir(newDir) {
  if (!player || !player.alive) return;
  // Block reversing into self
  if (OPPOSITE[newDir] === player.dir) return;
  player.nextDir = newDir;
}

// Keyboard
document.addEventListener('keydown', (e) => {
  // Menu
  if (gameState === 'menu') {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); }
    return;
  }

  // Dead overlay
  if (gameState === 'dead') {
    if (e.key === 'Enter') { e.preventDefault(); restartGame(); }
    return;
  }

  // Pause toggle
  if (e.key === 'p' || e.key === 'P' || (e.key === ' ' && gameState !== 'menu')) {
    e.preventDefault();
    if (gameState === 'playing') pauseGame();
    else if (gameState === 'paused') resumeGame();
    return;
  }

  if (gameState === 'paused') return;

  // Direction keys
  switch (e.key) {
    case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); changeDir('UP');    break;
    case 'ArrowDown':  case 's': case 'S': e.preventDefault(); changeDir('DOWN');  break;
    case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); changeDir('LEFT');  break;
    case 'ArrowRight': case 'd': case 'D': e.preventDefault(); changeDir('RIGHT'); break;
  }
});

// Touch / Swipe
let touchStartX = 0, touchStartY = 0;

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  ensureAudio();
  if (gameState === 'dead') { restartGame(); return; }
  if (gameState === 'menu') { startGame(); return; }
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (gameState !== 'playing') return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (Math.max(absDx, absDy) < 20) return; // too short, ignore
  if (absDx > absDy) {
    changeDir(dx > 0 ? 'RIGHT' : 'LEFT');
  } else {
    changeDir(dy > 0 ? 'DOWN' : 'UP');
  }
}, { passive: false });

// Click on overlay / canvas for restart
canvas.addEventListener('click', () => {
  ensureAudio();
  if (gameState === 'dead') restartGame();
});

// ============================================================
// §9  GAME LOOP & UPDATE
// ============================================================

function startGame() {
  ensureAudio();
  menuEl.style.display = 'none';
  hudEl.style.display = 'block';
  overlayEl.style.display = 'none';
  gameState = 'playing';
  initGame();
  startLoop();
}

function restartGame() {
  overlayEl.style.display = 'none';
  gameState = 'playing';
  initGame();
  startLoop();
}

function pauseGame() {
  gameState = 'paused';
  stopLoop();
  overlayTitle.textContent = 'Paused';
  overlayScore.textContent = '';
  overlayMsg.textContent = 'Press P or Space to resume';
  overlayEl.style.display = 'flex';
}

function resumeGame() {
  gameState = 'playing';
  overlayEl.style.display = 'none';
  startLoop();
}

function gameOver() {
  gameState = 'dead';
  stopLoop();
  // Update high score
  if (score > highScore) {
    highScore = score;
    saveHighScore();
  }
  highEl.textContent = highScore;
  overlayTitle.textContent = 'Game Over';
  overlayScore.textContent = `Score: ${score}`;
  overlayMsg.textContent = 'Press Enter or tap to restart';
  overlayEl.style.display = 'flex';
  sfxDie();
  triggerShake(8, 300);
}

function startLoop() {
  stopLoop();
  loopTimer = setInterval(tick, currentInterval);
}

function stopLoop() {
  if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
}

/** One game step */
function tick() {
  if (gameState !== 'playing') return;

  const diff = DIFFICULTIES[difficulty];

  // ── Move player ──
  if (player.alive) {
    player.dir = player.nextDir;
    moveSnake(player);
  }

  // ── Move AI snakes ──
  aiSnakes.forEach((ai, idx) => {
    if (!ai.alive) {
      // Respawn timer
      ai.respawnTimer -= currentInterval;
      if (ai.respawnTimer <= 0) {
        spawnAI(idx);
      }
      return;
    }
    aiDecide(ai, idx, diff);
    moveSnake(ai);
  });

  // ── Check collisions ──
  checkCollisions();

  // ── Ensure food count ──
  while (foods.length < FOOD_MIN) spawnFood();
  // Randomly add up to max
  if (foods.length < FOOD_MAX && Math.random() < 0.3) spawnFood();

  // ── Update HUD ──
  updateHUD();
}

/** Move a snake one step in its current direction */
function moveSnake(snake) {
  const d = DIR[snake.dir];
  const head = snake.body[0];
  const nx = head.x + d.dx;
  const ny = head.y + d.dy;

  // Add new head
  snake.body.unshift({ x: nx, y: ny });

  // Check food
  const fi = foods.findIndex(f => f.x === nx && f.y === ny);
  if (fi !== -1) {
    // Ate food
    foods.splice(fi, 1);
    snake.growQueue++;
    if (snake.isPlayer) {
      score += GROW_POINTS;
      foodEatenSinceSpeedup++;
      sfxEat();
      // Speed up
      if (foodEatenSinceSpeedup >= SPEED_UP_EVERY) {
        foodEatenSinceSpeedup = 0;
        speedLevel++;
        currentInterval = Math.max(50, Math.round(currentInterval * SPEED_UP_FACTOR));
        startLoop(); // restart interval at new speed
      }
    }
    // Particles at food location
    spawnParticles(nx * CELL + CELL / 2, ny * CELL + CELL / 2, snake.color, 8);
  }

  // Grow or remove tail
  if (snake.growQueue > 0) {
    snake.growQueue--;
  } else {
    snake.body.pop();
  }
}

/** Check all collisions */
function checkCollisions() {
  // Player wall collision
  if (player.alive) {
    const ph = player.body[0];
    if (!inBounds(ph.x, ph.y)) { player.alive = false; gameOver(); return; }
    // Player self collision (skip head)
    for (let i = 1; i < player.body.length; i++) {
      if (player.body[i].x === ph.x && player.body[i].y === ph.y) {
        player.alive = false; gameOver(); return;
      }
    }
  }

  // AI wall / self collision
  aiSnakes.forEach((ai, idx) => {
    if (!ai.alive) return;
    const ah = ai.body[0];
    if (!inBounds(ah.x, ah.y)) { killAI(ai, idx); return; }
    for (let i = 1; i < ai.body.length; i++) {
      if (ai.body[i].x === ah.x && ai.body[i].y === ah.y) { killAI(ai, idx); return; }
    }
  });

  // Player head vs AI bodies
  if (player.alive) {
    const ph = player.body[0];
    for (const ai of aiSnakes) {
      if (!ai.alive) continue;
      const ah = ai.body[0];
      // Head-on collision
      if (ph.x === ah.x && ph.y === ah.y) {
        // Both die
        player.alive = false;
        killAI(ai, aiSnakes.indexOf(ai));
        gameOver();
        return;
      }
      // Player head into AI body (skip AI head, checked above)
      for (let i = 1; i < ai.body.length; i++) {
        if (ai.body[i].x === ph.x && ai.body[i].y === ph.y) {
          player.alive = false; gameOver(); return;
        }
      }
    }
  }

  // AI head vs player body (AI dies, player gets points)
  if (player.alive) {
    aiSnakes.forEach((ai, idx) => {
      if (!ai.alive) return;
      const ah = ai.body[0];
      for (let i = 1; i < player.body.length; i++) {
        if (player.body[i].x === ah.x && player.body[i].y === ah.y) {
          score += AI_KILL_BONUS;
          killAI(ai, idx);
          return;
        }
      }
    });
  }

  // AI vs AI collisions
  for (let i = 0; i < aiSnakes.length; i++) {
    if (!aiSnakes[i].alive) continue;
    const ah = aiSnakes[i].body[0];
    for (let j = 0; j < aiSnakes.length; j++) {
      if (i === j || !aiSnakes[j].alive) continue;
      // Head-on
      const bh = aiSnakes[j].body[0];
      if (ah.x === bh.x && ah.y === bh.y) {
        killAI(aiSnakes[i], i);
        killAI(aiSnakes[j], j);
        continue;
      }
      // Head into other's body
      for (let k = 1; k < aiSnakes[j].body.length; k++) {
        if (aiSnakes[j].body[k].x === ah.x && aiSnakes[j].body[k].y === ah.y) {
          killAI(aiSnakes[i], i);
          break;
        }
      }
    }
  }
}

function killAI(ai, idx) {
  if (!ai.alive) return;
  ai.alive = false;
  ai.respawnTimer = DIFFICULTIES[difficulty].aiRespawn;
  spawnParticles(ai.body[0].x * CELL + CELL / 2, ai.body[0].y * CELL + CELL / 2, ai.color, 12);
  sfxAIDie();
}

// ============================================================
// §10  AI DECISION MAKING
// ============================================================

function aiDecide(ai, idx, diff) {
  const head = ai.body[0];
  const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

  // Build danger set: walls + all snake bodies (except this AI's head next-step tiles)
  const danger = snakeOccupiedSet();

  // Find nearest food
  let nearestFood = null;
  let nearestDist = Infinity;
  for (const f of foods) {
    const d = dist(head, f);
    if (d < nearestDist) { nearestDist = d; nearestFood = f; }
  }

  // Blocking behavior: if player is near food, sometimes try to cut off player
  let targetFood = nearestFood;
  const blockChance = diff.blockChance;
  if (player.alive && nearestFood && Math.random() < blockChance) {
    // Find food that player is closest to
    let playerNearestFood = null;
    let playerNearestDist = Infinity;
    const ph = player.body[0];
    for (const f of foods) {
      const d = dist(ph, f);
      if (d < playerNearestDist) { playerNearestDist = d; playerNearestFood = f; }
    }
    if (playerNearestFood && playerNearestDist < 10) {
      // Try to get between player and food
      targetFood = playerNearestFood;
    }
  }

  // Add randomness: occasionally pick a random safe direction
  if (Math.random() < 0.05) {
    const safeDirs = dirs.filter(d => {
      const dv = DIR[d];
      const nx = head.x + dv.dx;
      const ny = head.y + dv.dy;
      return inBounds(nx, ny) && !danger.has(key(nx, ny)) && OPPOSITE[d] !== ai.dir;
    });
    if (safeDirs.length > 0) {
      ai.dir = safeDirs[Math.floor(Math.random() * safeDirs.length)];
      return;
    }
  }

  // Score each direction
  let bestDir = ai.dir;
  let bestScore = -Infinity;

  for (const d of dirs) {
    // Can't reverse
    if (OPPOSITE[d] === ai.dir) continue;

    const dv = DIR[d];
    const nx = head.x + dv.dx;
    const ny = head.y + dv.dy;

    // Must be in bounds
    if (!inBounds(nx, ny)) continue;
    // Must not collide with any snake
    if (danger.has(key(nx, ny))) continue;

    let s = 0;

    // Prefer direction toward target food
    if (targetFood) {
      const currentDist = dist(head, targetFood);
      const newDist = dist({ x: nx, y: ny }, targetFood);
      s += (currentDist - newDist) * 10; // positive if getting closer
    }

    // Prefer cells with more open neighbors (avoid traps)
    let openNeighbors = 0;
    for (const nd of dirs) {
      const ndv = DIR[nd];
      const nnx = nx + ndv.dx;
      const nny = ny + ndv.dy;
      if (inBounds(nnx, nny) && !danger.has(key(nnx, nny))) openNeighbors++;
    }
    s += openNeighbors * 2;

    // Small random factor to prevent identical movement
    s += Math.random() * 1.5;

    if (s > bestScore) {
      bestScore = s;
      bestDir = d;
    }
  }

  ai.dir = bestDir;
}

// ============================================================
// §11  PARTICLES & SCREEN SHAKE
// ============================================================

function spawnParticles(px, py, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    particles.push({
      x: px, y: py,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      decay: 0.02 + Math.random() * 0.03,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function triggerShake(amount, duration) {
  shakeAmount = amount;
  shakeDuration = duration;
  shakeStart = performance.now();
}

function getShakeOffset() {
  if (shakeAmount <= 0) return { x: 0, y: 0 };
  const elapsed = performance.now() - shakeStart;
  if (elapsed > shakeDuration) { shakeAmount = 0; return { x: 0, y: 0 }; }
  const progress = 1 - elapsed / shakeDuration;
  const mag = shakeAmount * progress;
  return {
    x: (Math.random() - 0.5) * mag * 2,
    y: (Math.random() - 0.5) * mag * 2,
  };
}

// ============================================================
// §12  RENDER
// ============================================================

let lastRender = 0;
function renderLoop(ts) {
  requestAnimationFrame(renderLoop);
  if (gameState === 'menu') return;

  updateParticles();
  render();
}

function render() {
  const shake = getShakeOffset();

  ctx.save();
  ctx.translate(shake.x, shake.y);

  // ── Clear ──
  ctx.fillStyle = '#0d0d20';
  ctx.fillRect(-10, -10, WIDTH + 20, HEIGHT + 20);

  // ── Grid lines ──
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= GRID; i++) {
    const pos = i * CELL;
    ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, HEIGHT); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(WIDTH, pos); ctx.stroke();
  }

  // ── Food ──
  for (const f of foods) {
    const cx = f.x * CELL + CELL / 2;
    const cy = f.y * CELL + CELL / 2;
    // Glow
    ctx.fillStyle = 'rgba(255,82,82,0.15)';
    ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.65, 0, Math.PI * 2); ctx.fill();
    // Core
    ctx.fillStyle = '#ff5252';
    ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.35, 0, Math.PI * 2); ctx.fill();
    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(cx - 2, cy - 2, CELL * 0.12, 0, Math.PI * 2); ctx.fill();
  }

  // ── Draw snakes ──
  // AI snakes first (player on top)
  for (const ai of aiSnakes) {
    if (ai.alive) drawSnake(ai);
  }
  if (player.alive) drawSnake(player);

  // ── Particles ──
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawSnake(snake) {
  const body = snake.body;
  // Body segments
  for (let i = body.length - 1; i >= 0; i--) {
    const seg = body[i];
    const isHead = i === 0;
    const px = seg.x * CELL;
    const py = seg.y * CELL;

    if (isHead) {
      // Head with slight glow
      ctx.fillStyle = snake.headColor;
      ctx.shadowColor = snake.headColor;
      ctx.shadowBlur = 6;
      roundRect(ctx, px + 1, py + 1, CELL - 2, CELL - 2, 5);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Eyes
      const d = DIR[snake.dir];
      const eyeOffset = 4;
      const eyeSize = 2.5;
      let e1x, e1y, e2x, e2y;
      if (d.dx !== 0) {
        // horizontal
        e1x = px + CELL / 2 + d.dx * 3;
        e1y = py + eyeOffset;
        e2x = e1x;
        e2y = py + CELL - eyeOffset;
      } else {
        // vertical
        e1x = px + eyeOffset;
        e1y = py + CELL / 2 + d.dy * 3;
        e2x = px + CELL - eyeOffset;
        e2y = e1y;
      }
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(e1x, e1y, eyeSize, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e2x, e2y, eyeSize, 0, Math.PI * 2); ctx.fill();
    } else {
      // Body — slight fade toward tail
      const fade = 0.5 + 0.5 * (1 - i / body.length);
      ctx.globalAlpha = fade;
      ctx.fillStyle = snake.color;
      roundRect(ctx, px + 1, py + 1, CELL - 2, CELL - 2, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

/** Draw a filled rounded rect */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ============================================================
// §13  HUD UPDATE
// ============================================================

function updateHUD() {
  scoreEl.textContent = score;
  highEl.textContent = highScore;
  const spd = (1 + speedLevel * 0.08).toFixed(1);
  speedEl.textContent = `Speed: ${spd}x`;

  // Leaderboard: rank all snakes by length
  const entries = [];
  if (player.alive) {
    entries.push({ name: 'You', color: PLAYER_COLOR, len: player.body.length });
  }
  aiSnakes.forEach((ai, i) => {
    if (ai.alive) {
      entries.push({ name: `AI ${i + 1}`, color: ai.color, len: ai.body.length });
    }
  });
  entries.sort((a, b) => b.len - a.len);

  lbEl.innerHTML = entries.map((e, i) =>
    `<span class="lb-entry"><span class="lb-dot" style="background:${e.color}"></span>${i + 1}. ${e.name} (${e.len})</span>`
  ).join('');
}

// ============================================================
// §14  DIFFICULTY SELECTOR
// ============================================================

function setDifficulty(d) {
  difficulty = d;
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === d);
  });
}

// ============================================================
// §15  STARTUP
// ============================================================

loadHighScore();
highEl.textContent = highScore;

// Start render loop
requestAnimationFrame(renderLoop);

// ============================================================
// §1  CONSTANTS & DIFFICULTY SPEEDS
// ============================================================
const GAME_CONFIG = window.GAME_CONFIG || {};
const WORLD_WIDTH = GAME_CONFIG.WORLD_WIDTH || 8000;
const WORLD_HEIGHT = GAME_CONFIG.WORLD_HEIGHT || 8000;
const REFERENCE_VIEW_WIDTH = GAME_CONFIG.REFERENCE_VIEW_WIDTH || 1600;
const REFERENCE_VIEW_HEIGHT = GAME_CONFIG.REFERENCE_VIEW_HEIGHT || 900;
const CAMERA_LERP = GAME_CONFIG.CAMERA_LERP || 0.12;
const CAMERA_ZOOM_OUT_MAX = GAME_CONFIG.CAMERA_ZOOM_OUT_MAX || 0.25;
const SPEED_CONFIGS = {
  easy: 2.8,
  medium: 3.6,
  normal: 3.6,
  hard: 4.4
};

const TURN_RATE = 0.075;
const SEGMENT_SPACING = 6;
const INITIAL_SEGMENTS = 22;
const HEAD_RADIUS = 9;
const FOOD_SIZE_SCALE = 1.25; // +25% visual food scale increase
const FOOD_DENSITY_SCALE = 1.25; // +25% world food density increase (100% -> 125%)
const FOOD_DENSITY = GAME_CONFIG.FOOD_DENSITY ?? (0.3 * FOOD_DENSITY_SCALE);
const FOOD_VALUE = GAME_CONFIG.FOOD_VALUE ?? 1;
const FOOD_COUNT = Math.max(1, Math.round(42 * FOOD_DENSITY * (WORLD_WIDTH * WORLD_HEIGHT) / (REFERENCE_VIEW_WIDTH * REFERENCE_VIEW_HEIGHT)));
const MAX_VISIBLE_FOOD = 19; // +25% from 15
const FOOD_RESPAWN_DELAY_MS = (GAME_CONFIG.FRUITS && GAME_CONFIG.FRUITS.spawnIntervalMs) || 2500;
const DANGER_ZONE_FOOD_COUNT = 53; // +25% from 42
const FOOD_PICKUP_RADIUS = HEAD_RADIUS + 13 * FOOD_SIZE_SCALE;
const RARE_ORB_PICKUP_RADIUS = HEAD_RADIUS + 16 * FOOD_SIZE_SCALE;
const FOOD_GRID_COLUMNS = Math.ceil(Math.sqrt(FOOD_COUNT));
const FOOD_GRID_ROWS = Math.ceil(FOOD_COUNT / FOOD_GRID_COLUMNS);
const foodGridTaken = new Uint8Array(FOOD_COUNT);
let foodGridCursor = 0;
let nextFoodSpawnAt = 0;
let normalFoodCount = 0;

const FRUITS_CONFIG = GAME_CONFIG.FRUITS || {
  spawnIntervalMs: 2500,
  minHeadClearCells: 3,
  baseLifetimeMs: 9000,
  minLifetimeMs: 5000,
  lifetimeStepPerLevelMs: 450,
  blinkWarningMs: 2000,
  scaleInMs: 240,
  spawnsPerMinute: 24,
  avgGoldBonusPerMinute: 120,
  targetRatioStart: 0.55,
  targetRatioEnd: 0.85,
  maxLevel: 10,
  types: {
    apple: { id: 'apple', name: 'Apple', points: 20, growth: 1, baseOdds: 0.60, oddsShiftPerLevel: -0.035, color: '#ff3b5c', outline: '#ff9ebb', stem: '#4ade80', highlight: '#ffe4e9', glow: 'rgba(255, 59, 92, 0.78)' },
    cherry: { id: 'cherry', name: 'Cherry', points: 35, growth: 1, baseOdds: 0.30, oddsShiftPerLevel: 0.015, color: '#e11d48', outline: '#fda4af', stem: '#22c55e', highlight: '#ffe4e6', glow: 'rgba(225, 29, 72, 0.82)' },
    grapes: { id: 'grapes', name: 'Grapes', points: 50, growth: 2, baseOdds: 0.10, oddsShiftPerLevel: 0.020, color: '#a855f7', outline: '#e9d5ff', stem: '#4ade80', highlight: '#f3e8ff', glow: 'rgba(168, 85, 247, 0.86)' }
  }
};

function getFruitOddsForLevel(level = 1) {
  const lvlIdx = Math.max(0, Math.min((FRUITS_CONFIG.maxLevel || 10) - 1, Math.floor(level) - 1));
  const t = FRUITS_CONFIG.types;
  const rawApple = Math.max(0.22, (t.apple.baseOdds || 0.60) + (t.apple.oddsShiftPerLevel || -0.035) * lvlIdx);
  const rawCherry = Math.max(0.15, (t.cherry.baseOdds || 0.30) + (t.cherry.oddsShiftPerLevel || 0.015) * lvlIdx);
  const rawGrapes = Math.max(0.08, (t.grapes.baseOdds || 0.10) + (t.grapes.oddsShiftPerLevel || 0.020) * lvlIdx);
  const sum = rawApple + rawCherry + rawGrapes;
  return {
    apple: rawApple / sum,
    cherry: rawCherry / sum,
    grapes: rawGrapes / sum
  };
}

function pickFruitTypeForLevel(level = 1) {
  const odds = getFruitOddsForLevel(level);
  const r = Math.random();
  if (r < odds.apple) return FRUITS_CONFIG.types.apple;
  if (r < odds.apple + odds.cherry) return FRUITS_CONFIG.types.cherry;
  return FRUITS_CONFIG.types.grapes;
}

function getFruitLifetimeMs(level = 1) {
  const lvlIdx = Math.max(0, Math.min((FRUITS_CONFIG.maxLevel || 10) - 1, Math.floor(level) - 1));
  return Math.max(
    FRUITS_CONFIG.minLifetimeMs || 5000,
    (FRUITS_CONFIG.baseLifetimeMs || 9000) - lvlIdx * (FRUITS_CONFIG.lifetimeStepPerLevelMs || 450)
  );
}

function computeLevelTargetScore(level = 1) {
  const maxLvl = FRUITS_CONFIG.maxLevel || 10;
  const clampedLvl = Math.max(1, Math.min(maxLvl, Math.floor(level)));
  const odds = getFruitOddsForLevel(clampedLvl);
  const t = FRUITS_CONFIG.types;
  const avgFruitVal = odds.apple * t.apple.points + odds.cherry * t.cherry.points + odds.grapes * t.grapes.points;
  const spawnsPerMin = FRUITS_CONFIG.spawnsPerMinute || 24;
  const avgGoldPerMin = FRUITS_CONFIG.avgGoldBonusPerMinute || 120;
  const realisticMax = (spawnsPerMin * avgFruitVal + avgGoldPerMin) * clampedLvl;
  const ratioStart = FRUITS_CONFIG.targetRatioStart || 0.55;
  const ratioEnd = FRUITS_CONFIG.targetRatioEnd || 0.85;
  const ratio = ratioStart + ((clampedLvl - 1) / Math.max(1, maxLvl - 1)) * (ratioEnd - ratioStart);
  return Math.max(100, Math.round((realisticMax * ratio) / 10) * 10);
}

let gameMode = 'arena'; // 'arena' | 'levels' — explicit mode switch
let currentArenaLevel = 1;
let matchFruitScore = 0;
let levelIntroTimer = 0;
const fruitSpriteCache = new Map();

function showLevelIntroBanner(level = 1) {
  const bannerEl = document.getElementById('level-intro-banner');
  const titleEl = document.getElementById('lvl-intro-title');
  if (!bannerEl) return;
  if (level > 1 && typeof CrazyGamesBridge !== 'undefined') CrazyGamesBridge.happytime();
  const targetPts = computeLevelTargetScore(level);
  if (titleEl) {
    titleEl.textContent = `STAGE ${level} • TARGET ${targetPts.toLocaleString()} PTS`;
  }
  bannerEl.style.display = 'block';
  bannerEl.style.opacity = '1';
  clearTimeout(levelIntroTimer);
  levelIntroTimer = setTimeout(() => {
    if (bannerEl) {
      bannerEl.style.opacity = '0';
      setTimeout(() => { if (bannerEl) bannerEl.style.display = 'none'; }, 260);
    }
  }, 3200);
}
const BOT_START_COUNT = GAME_CONFIG.BOT_START_COUNT || 50;
const BOT_WAVE_ADD = GAME_CONFIG.BOT_WAVE_ADD || 5;
const BOT_WAVE_INTERVAL_MS = GAME_CONFIG.BOT_WAVE_INTERVAL_MS || 10000;
const BOT_MAX_DESKTOP = GAME_CONFIG.BOT_MAX_DESKTOP || GAME_CONFIG.BOT_MAX || 120;
const BOT_MAX_MOBILE = GAME_CONFIG.BOT_MAX_MOBILE || 80;
const BOT_MIN_CAP = GAME_CONFIG.BOT_MIN_CAP || 40;
const BOT_RING_MIN_DIST = GAME_CONFIG.BOT_RING_MIN_DIST || 600;
const BOT_SPAWN_FADE_MS = GAME_CONFIG.BOT_SPAWN_FADE_MS || 1500;
const BOT_LOD_NEAR_DIST = GAME_CONFIG.BOT_LOD_NEAR_DIST || 1200;
const BOT_LOD_NEAR_DIST_SQ = BOT_LOD_NEAR_DIST * BOT_LOD_NEAR_DIST;
let activeBotMax = BOT_MAX_DESKTOP;
let activeTargetBotCount = BOT_START_COUNT;
let nextBotWaveAt = 0;
let nextWaveBotSpawnAt = 0;
let totalBotsCreatedInMatch = 0;
const MAX_DEATH_DROP_ORBS = 300;
const RESPAWN_DELAY_FRAMES = 180;
const PARTICLE_LIMITS = { low: 150, medium: 260, high: 400 };
let maxParticles = PARTICLE_LIMITS.medium;
let graphicsQuality = 'medium';
let qualityPreference = 'auto';
let fpsCounterEnabled = false;
let lowFpsSince = 0;
let averageFrameMs = 16.7;
let lastFpsDisplayAt = 0;
let lastHudRefreshAt = 0;
const QUALITY_ORDER = ['high', 'medium', 'low'];
const CYCLE_DURATION_MS = 180000;
const CYCLE_PHASES = [
  { name: 'Dawn', icon: '☼', top: [18, 48, 56], mid: [29, 93, 99], bot: [12, 36, 48], ray: [111, 206, 195], rays: 0.04, glow: 0.18, plankton: 0.02 },
  { name: 'Midday', icon: '☀', top: [49, 120, 177], mid: [30, 151, 209], bot: [13, 55, 82], ray: [203, 233, 255], rays: 0.20, glow: 0.10, plankton: 0.00 },
  { name: 'Dusk', icon: '◒', top: [87, 58, 113], mid: [180, 105, 85], bot: [55, 40, 71], ray: [255, 184, 133], rays: 0.07, glow: 0.24, plankton: 0.04 },
  { name: 'Night', icon: '☾', top: [4, 8, 16], mid: [6, 14, 26], bot: [2, 5, 11], ray: [92, 117, 145], rays: 0.00, glow: 1.00, plankton: 0.24 }
];
const RARE_ORB_MIN_INTERVAL_MS = 40000;
const RARE_ORB_MAX_INTERVAL_MS = 60000;
const RARE_ORB_LIFETIME_MS = 25000;
const RARE_ORB_TRAIL_MS = 6000;
const DANGER_ZONE_RADIUS = 850;
const DANGER_ZONE_SLOW = 0.78;
const ABILITY_CONFIG = Object.freeze({ ghost: { duration: 3000, cooldown: 14000 }, magnet: { duration: 5000, cooldown: 12000 }, dash: { duration: 1000, cooldown: 8000 } });
const TOUCH_DEAD_ZONE = 10;
const TOUCH_MAX_TURN_RATE = 2.4;
const BOT_SENSOR_ANGLES = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4];

// Power-up system: collectible items that spawn randomly on the map (including Blue Plasma 2X Score Multiplier Orb)
const POWERUP_TYPES = [
  { id: 'magnet', icon: '🧲', label: 'Magnet!', color: '#f43f5e', glow: 'rgba(244,63,94,.7)', duration: 6000, radius: 700 },
  { id: 'speed', icon: '⚡', label: 'Speed Boost!', color: '#fbbf24', glow: 'rgba(251,191,36,.7)', duration: 5000, multiplier: 1.6 },
  { id: 'plasma', icon: '💠', label: 'Blue Plasma 2X Score!', color: '#00d9ff', glow: 'rgba(0,217,255,.85)', duration: 8000, multiplier: 2.0 }
];
const POWERUP_SPAWN_MIN_MS = 15000;
const POWERUP_SPAWN_MAX_MS = 30000;
const POWERUP_LIFETIME_MS = 20000;
const MAX_POWERUPS_ON_MAP = 3;
let powerups = [];
let nextPowerupSpawnAt = 0;
let powerupIndicatorEl = null;
let powerupIndicatorTimer = 0;

// Big snake food production
const BIG_SNAKE_FOOD_THRESHOLD = 40; // length above which a snake starts producing food
const BIG_SNAKE_FOOD_INTERVAL_MS = 3000; // how often big snakes produce food (ms)
let lastBigSnakeFoodAt = 0;

const PALETTE_PLAYER = {
  head: '#34d399',
  bodyStart: '#10b981',
  bodyEnd: '#047857',
  scale: 'rgba(255, 255, 255, 0.12)',
  glow: 'rgba(52, 211, 153, 0.72)',
  eyeIris: '#047857',
  eyePupil: '#064e3b',
  tongue: '#f43f5e'
};

const SKINS = [
  // ================= EXISTING 16 SKINS (PRESERVED + ENHANCED METADATA) =================
  { id: 'classic', name: 'Classic Green', category: 'creature', rarity: 'common', price: 0, desc: 'Balanced emerald scales built for the arena.', palette: { ...PALETTE_PLAYER, pattern: 'scales', headShape: 'round', eyeStyle: 'normal' }, unlock: { type: 'default' } },
  { id: 'cobra', name: 'King Cobra', category: 'creature', rarity: 'rare', price: 0, desc: 'Flared royal hood with deadly chevron markings.', palette: { head: '#c28136', bodyStart: '#8b5a2b', bodyEnd: '#2e1c0c', scale: '#e0c080', glow: 'rgba(212, 143, 56, 0.75)', eyeIris: '#d97706', eyePupil: '#1c1917', tongue: '#1c1917', pattern: 'chevron', headShape: 'cobra', eyeStyle: 'slit', hoodWidth: 1.85 }, unlock: { type: 'default' } },
  { id: 'python', name: 'Reticulated Python', category: 'creature', rarity: 'common', price: 0, desc: 'Heavy constrictor covered in interlocking jungle mesh.', palette: { head: '#786043', bodyStart: '#54422e', bodyEnd: '#1e1610', scale: '#c4a47c', glow: 'rgba(168, 134, 98, 0.65)', eyeIris: '#b45309', eyePupil: '#0c0a09', tongue: '#1c1917', pattern: 'reticulated', headShape: 'python', eyeStyle: 'slit' }, unlock: { type: 'default' } },
  { id: 'viper', name: 'Emerald Tree Boa', category: 'creature', rarity: 'common', price: 150, desc: 'Rainforest ambush predator with white dorsal lightning.', palette: { head: '#10b981', bodyStart: '#059669', bodyEnd: '#064e3b', scale: '#ffffff', glow: 'rgba(52, 211, 153, 0.75)', eyeIris: '#fde047', eyePupil: '#022c22', tongue: '#f43f5e', pattern: 'lightning', headShape: 'viper', eyeStyle: 'slit' }, unlock: { type: 'time', seconds: 30 } },
  { id: 'coral', name: 'Coral Snake', category: 'creature', rarity: 'uncommon', price: 220, desc: 'Warning tricolor bands of crimson, gold, and obsidian.', palette: { head: '#111827', bodyStart: '#dc2626', bodyEnd: '#111827', scale: '#facc15', glow: 'rgba(239, 68, 68, 0.7)', eyeIris: '#1f2937', eyePupil: '#000000', tongue: '#000000', pattern: 'coral_tricolor', headShape: 'round', eyeStyle: 'normal' }, unlock: { type: 'time', seconds: 60 } },
  { id: 'ocean', name: 'Ocean Blue', category: 'fantasy', rarity: 'common', price: 250, desc: 'Tidal wave rings pulsing with deep abyssal currents.', palette: { head: '#7dd3fc', bodyStart: '#38bdf8', bodyEnd: '#1d4ed8', scale: 'rgba(224,242,254,.45)', glow: 'rgba(56,189,248,.75)', eyeIris: '#0369a1', eyePupil: '#082f49', tongue: '#fb7185', pattern: 'bands', headShape: 'round', eyeStyle: 'normal' }, unlock: { type: 'time', seconds: 90 } },
  { id: 'rattlesnake', name: 'Diamondback', category: 'creature', rarity: 'rare', price: 300, desc: 'Arid canyon striker with crisp diamond dorsal armor.', palette: { head: '#926a42', bodyStart: '#684522', bodyEnd: '#291809', scale: '#fef08a', glow: 'rgba(180, 130, 70, 0.6)', eyeIris: '#78350f', eyePupil: '#0c0a09', tongue: '#1c1917', pattern: 'diamonds', headShape: 'viper', eyeStyle: 'slit' }, unlock: { type: 'length', length: 35 } },
  { id: 'blackmamba', name: 'Black Mamba', category: 'creature', rarity: 'rare', price: 420, desc: 'Coffin-headed speed demon with gunmetal satin scales.', palette: { head: '#334155', bodyStart: '#1e293b', bodyEnd: '#0f172a', scale: '#64748b', glow: 'rgba(100, 116, 139, 0.8)', eyeIris: '#0f172a', eyePupil: '#020617', tongue: '#020617', pattern: 'smooth', headShape: 'coffin', eyeStyle: 'angry' }, unlock: { type: 'length', length: 50 } },
  { id: 'anaconda', name: 'Green Anaconda', category: 'creature', rarity: 'rare', price: 500, desc: 'Swamp colossus marked with dark river ocelli spots.', palette: { head: '#3f4f2c', bodyStart: '#2d3a1e', bodyEnd: '#131b0c', scale: '#1c1917', glow: 'rgba(63, 79, 44, 0.7)', eyeIris: '#ca8a04', eyePupil: '#0c0a09', tongue: '#450a0a', pattern: 'ocelli', headShape: 'python', eyeStyle: 'slit' }, unlock: { type: 'time', seconds: 120 } },
  { id: 'seasnake', name: 'Banded Sea Krait', category: 'creature', rarity: 'epic', price: 650, desc: 'Pelagic reef hunter with glowing cyan sea bands.', palette: { head: '#38bdf8', bodyStart: '#0284c7', bodyEnd: '#0f172a', scale: '#38bdf8', glow: 'rgba(56, 189, 248, 0.8)', eyeIris: '#0369a1', eyePupil: '#082f49', tongue: '#38bdf8', pattern: 'krait_rings', headShape: 'paddle', eyeStyle: 'normal', trailEffect: 'bubbles' }, unlock: { type: 'time', seconds: 180 } },
  { id: 'albino', name: 'Albino Python', category: 'creature', rarity: 'epic', price: 750, desc: 'Rare ivory and gold morph with ruby predator eyes.', palette: { head: '#fef08a', bodyStart: '#fed7aa', bodyEnd: '#ffffff', scale: '#ffffff', glow: 'rgba(254, 240, 138, 0.85)', eyeIris: '#ef4444', eyePupil: '#991b1b', tongue: '#f43f5e', pattern: 'clouded', headShape: 'python', eyeStyle: 'slit', trailEffect: 'shimmer' }, unlock: { type: 'length', length: 70 } },
  { id: 'cyber', name: 'Cyber Neon', category: 'cyber', rarity: 'epic', price: 900, desc: 'Synthwave grid runner charged with high-voltage cyan.', palette: { head: '#06b6d4', bodyStart: '#3b82f6', bodyEnd: '#8b5cf6', scale: '#a5f3fc', glow: 'rgba(6, 182, 212, 0.95)', eyeIris: '#ec4899', eyePupil: '#082f49', tongue: '#ec4899', pattern: 'neon_grid', headShape: 'arrow', eyeStyle: 'visor', trailEffect: 'neon' }, unlock: { type: 'time', seconds: 240 } },
  { id: 'magma', name: 'Magma Viper', category: 'fantasy', rarity: 'epic', price: 1100, desc: 'Molten volcanic crust venting superheated embers.', palette: { head: '#fdba74', bodyStart: '#f97316', bodyEnd: '#7c2d12', scale: 'rgba(254,215,170,.55)', glow: 'rgba(249,115,22,.82)', eyeIris: '#9a3412', eyePupil: '#431407', tongue: '#fef3c7', pattern: 'embers', headShape: 'viper', eyeStyle: 'glowing', trailEffect: 'embers' }, unlock: { type: 'time', seconds: 300 } },
  { id: 'aurora', name: 'Aurora Spirit', category: 'fantasy', rarity: 'legendary', price: 1400, desc: 'Celestial northern lights weaving across ethereal scales.', palette: { head: '#e9d5ff', bodyStart: '#a78bfa', bodyEnd: '#0f766e', scale: 'rgba(240,253,250,.58)', glow: 'rgba(167,139,250,.82)', eyeIris: '#6d28d9', eyePupil: '#2e1065', tongue: '#f0abfc', pattern: 'ribbons', headShape: 'round', eyeStyle: 'glowing', trailEffect: 'aurora' }, unlock: { type: 'length', length: 85 } },
  { id: 'ghost', name: 'Ghost Spectre', category: 'fantasy', rarity: 'legendary', price: 1650, desc: 'Phantom wraith drifting silently through the dark abyss.', palette: { head: '#f8fafc', bodyStart: '#cbd5e1', bodyEnd: '#64748b', scale: 'rgba(255,255,255,.48)', glow: 'rgba(226,232,240,.8)', eyeIris: '#64748b', eyePupil: '#1e293b', tongue: '#c4b5fd', pattern: 'spots', headShape: 'round', eyeStyle: 'glowing', trailEffect: 'mist' }, unlock: { type: 'length', length: 100 } },
  { id: 'golden', name: 'Golden Dragon', category: 'creature', rarity: 'legendary', price: 2000, desc: 'Imperial horned dragon clad in radiant 24-karat armor.', palette: { head: '#fef08a', bodyStart: '#facc15', bodyEnd: '#92400e', scale: 'rgba(255,251,191,.7)', glow: 'rgba(250,204,21,.9)', eyeIris: '#a16207', eyePupil: '#422006', tongue: '#fb7185', pattern: 'dragon', headShape: 'dragon', eyeStyle: 'glowing', trailEffect: 'gold_sparks' }, unlock: { type: 'time', seconds: 400 } },

  // ================= A. FUNNY / MEME SKINS (16 SKINS) =================
  { id: 'banana', name: 'Banana Serpent', category: 'funny', rarity: 'common', price: 180, desc: '100% potassium power with ripe brown sugar spots and googly eyes.', palette: { head: '#FDE047', bodyStart: '#FACC15', bodyEnd: '#713F12', scale: '#78350F', glow: 'rgba(250, 204, 21, 0.72)', eyeIris: '#FFFFFF', eyePupil: '#111827', tongue: '#F43F5E', pattern: 'banana_spots', headShape: 'round', eyeStyle: 'googly' }, unlock: { type: 'time', seconds: 45 } },
  { id: 'hotdog', name: 'Hot Dog Snake', category: 'funny', rarity: 'uncommon', price: 260, desc: 'Grilled stadium frankfurter topped with a wavy yellow mustard line.', palette: { head: '#EA580C', bodyStart: '#C2410C', bodyEnd: '#9A3412', scale: '#FACC15', glow: 'rgba(234, 88, 12, 0.72)', eyeIris: '#FEF08A', eyePupil: '#1C1917', tongue: '#FACC15', pattern: 'hotdog_mustard', headShape: 'round', eyeStyle: 'googly' }, unlock: { type: 'length', length: 40 } },
  { id: 'pizza', name: 'Pizza Serpent', category: 'funny', rarity: 'rare', price: 380, desc: 'Melted mozzarella crust loaded with spicy pepperoni slices.', palette: { head: '#FBBF24', bodyStart: '#F59E0B', bodyEnd: '#B45309', scale: '#DC2626', glow: 'rgba(245, 158, 11, 0.78)', eyeIris: '#DC2626', eyePupil: '#1C1917', tongue: '#EF4444', pattern: 'pizza_pepperoni', headShape: 'viper', eyeStyle: 'googly' }, unlock: { type: 'kills', count: 5 } },
  { id: 'rubberduck', name: 'Rubber Duck Snake', category: 'funny', rarity: 'uncommon', price: 280, desc: 'Squeaky bath-time champion complete with a bright orange duck bill.', palette: { head: '#FDE047', bodyStart: '#FACC15', bodyEnd: '#EAB308', scale: '#FB923C', glow: 'rgba(253, 224, 71, 0.8)', eyeIris: '#38BDF8', eyePupil: '#020617', tongue: '#FB923C', pattern: 'smooth', headShape: 'duck', eyeStyle: 'cute' }, unlock: { type: 'time', seconds: 75 } },
  { id: 'noob', name: 'Noob Snake', category: 'funny', rarity: 'common', price: 160, desc: 'Classic blocky retro yellow-blue-green noob colors with derpy eyes.', palette: { head: '#FACC15', bodyStart: '#3B82F6', bodyEnd: '#22C55E', scale: '#FDE047', glow: 'rgba(59, 130, 246, 0.72)', eyeIris: '#FFFFFF', eyePupil: '#000000', tongue: '#F43F5E', pattern: 'noob_blocks', headShape: 'pixel', eyeStyle: 'derp' }, unlock: { type: 'length', length: 30 } },
  { id: 'memeface', name: 'Meme Face Snake', category: 'funny', rarity: 'rare', price: 450, desc: 'Deal-with-it pixel sunglasses and chaotic meme energy.', palette: { head: '#F8FAFC', bodyStart: '#E2E8F0', bodyEnd: '#64748B', scale: '#0F172A', glow: 'rgba(248, 250, 252, 0.8)', eyeIris: '#000000', eyePupil: '#FFFFFF', tongue: '#FF477E', pattern: 'meme_stripes', headShape: 'round', eyeStyle: 'sunglasses' }, unlock: { type: 'kills', count: 10 } },
  { id: 'donut', name: 'Donut Serpent', category: 'funny', rarity: 'rare', price: 420, desc: 'Strawberry frosted glaze covered in rainbow confetti sprinkles.', palette: { head: '#F472B6', bodyStart: '#EC4899', bodyEnd: '#D97706', scale: '#38BDF8', glow: 'rgba(244, 114, 182, 0.82)', eyeIris: '#FDE047', eyePupil: '#500724', tongue: '#38BDF8', pattern: 'donut_sprinkles', headShape: 'round', eyeStyle: 'cute' }, unlock: { type: 'length', length: 55 } },
  { id: 'toilet', name: 'Toilet Snake', category: 'funny', rarity: 'uncommon', price: 310, desc: 'Porcelain plumbing escapee swirling with aqua flush vortexes.', palette: { head: '#FFFFFF', bodyStart: '#E0F2FE', bodyEnd: '#0284C7', scale: '#38BDF8', glow: 'rgba(56, 189, 248, 0.75)', eyeIris: '#0284C7', eyePupil: '#082F49', tongue: '#38BDF8', pattern: 'swirl_flush', headShape: 'round', eyeStyle: 'derp' }, unlock: { type: 'time', seconds: 100 } },
  { id: 'rainbow', name: 'Rainbow Worm', category: 'funny', rarity: 'epic', price: 780, desc: 'Full-spectrum prismatic worm cycling through every neon hue.', palette: { head: '#FF477E', bodyStart: '#00F5A0', bodyEnd: '#A855F7', scale: '#FACC15', glow: 'rgba(0, 245, 160, 0.88)', eyeIris: '#FFFFFF', eyePupil: '#111827', tongue: '#FF477E', pattern: 'rainbow_cycle', headShape: 'round', eyeStyle: 'cute', trailEffect: 'rainbow' }, unlock: { type: 'length', length: 75 } },
  { id: 'frog', name: 'Frog Snake', category: 'funny', rarity: 'uncommon', price: 290, desc: 'Amphibian hybrid with wide bulging frog eyes and lily-pad spots.', palette: { head: '#4ADE80', bodyStart: '#22C55E', bodyEnd: '#15803D', scale: '#BBF7D0', glow: 'rgba(74, 222, 128, 0.75)', eyeIris: '#FACC15', eyePupil: '#052E16', tongue: '#FB7185', pattern: 'frog_spots', headShape: 'frog', eyeStyle: 'googly' }, unlock: { type: 'time', seconds: 80 } },
  { id: 'bee', name: 'Bee Snake', category: 'funny', rarity: 'rare', price: 460, desc: 'Buzzing honey-striker with translucent wings and black-gold bands.', palette: { head: '#FACC15', bodyStart: '#EAB308', bodyEnd: '#1C1917', scale: '#111827', glow: 'rgba(250, 204, 21, 0.82)', eyeIris: '#1C1917', eyePupil: '#000000', tongue: '#F59E0B', pattern: 'bee_stripes', headShape: 'bee', eyeStyle: 'cute' }, unlock: { type: 'kills', count: 12 } },
  { id: 'penguin', name: 'Penguin Snake', category: 'funny', rarity: 'uncommon', price: 320, desc: 'Antarctic tuxedo waddler with a snowy belly and orange beak.', palette: { head: '#1E293B', bodyStart: '#0F172A', bodyEnd: '#334155', scale: '#F8FAFC', glow: 'rgba(148, 163, 184, 0.75)', eyeIris: '#38BDF8', eyePupil: '#020617', tongue: '#FB923C', pattern: 'penguin_tux', headShape: 'duck', eyeStyle: 'cute' }, unlock: { type: 'time', seconds: 110 } },
  { id: 'chicken', name: 'Chicken Snake', category: 'funny', rarity: 'rare', price: 410, desc: 'Feathered barnyard brawler sporting a bright crimson rooster comb.', palette: { head: '#FEFCE8', bodyStart: '#FDE68A', bodyEnd: '#D97706', scale: '#EF4444', glow: 'rgba(253, 230, 138, 0.78)', eyeIris: '#F59E0B', eyePupil: '#1C1917', tongue: '#EF4444', pattern: 'feathers', headShape: 'chicken', eyeStyle: 'googly' }, unlock: { type: 'kills', count: 8 } },
  { id: 'candy', name: 'Candy Snake', category: 'funny', rarity: 'rare', price: 480, desc: 'Peppermint twist cane spiraling with glossy sugar stripes.', palette: { head: '#FB7185', bodyStart: '#F43F5E', bodyEnd: '#FFFFFF', scale: '#FFFFFF', glow: 'rgba(251, 113, 133, 0.84)', eyeIris: '#E11D48', eyePupil: '#4C0519', tongue: '#F43F5E', pattern: 'candy_stripes', headShape: 'round', eyeStyle: 'cute' }, unlock: { type: 'length', length: 60 } },
  { id: 'bubblegum', name: 'Bubblegum Snake', category: 'funny', rarity: 'epic', price: 720, desc: 'Pop-art neon pink chew with floating glossy bubble highlights.', palette: { head: '#FF477E', bodyStart: '#F472B6', bodyEnd: '#C084FC', scale: '#FCE7F3', glow: 'rgba(255, 71, 126, 0.88)', eyeIris: '#00D9FF', eyePupil: '#500724', tongue: '#00D9FF', pattern: 'bubbles', headShape: 'round', eyeStyle: 'cute', trailEffect: 'bubbles' }, unlock: { type: 'length', length: 80 } },
  { id: 'disco', name: 'Disco Snake', category: 'funny', rarity: 'legendary', price: 1450, desc: 'Mirrored dance-floor fever flashing sequencedfunk tiles.', palette: { head: '#E879F9', bodyStart: '#38BDF8', bodyEnd: '#FACC15', scale: '#FFFFFF', glow: 'rgba(232, 121, 249, 0.92)', eyeIris: '#FACC15', eyePupil: '#1E1B4B', tongue: '#00F5A0', pattern: 'disco_tiles', headShape: 'round', eyeStyle: 'sunglasses', trailEffect: 'rainbow' }, unlock: { type: 'kills', count: 35 } },

  // ================= B. NEW REALISTIC / CREATURE SKINS (9 NEW + 10 EXISTING = 19 CREATURES) =================
  { id: 'emerald_python', name: 'Emerald Python', category: 'creature', rarity: 'uncommon', price: 290, desc: 'Canopy coil serpent with deep jade saddle markings.', palette: { head: '#00F5A0', bodyStart: '#10B981', bodyEnd: '#064E3B', scale: '#A7F3D0', glow: 'rgba(0, 245, 160, 0.78)', eyeIris: '#FACC15', eyePupil: '#022C22', tongue: '#F43F5E', pattern: 'reticulated', headShape: 'python', eyeStyle: 'slit' }, unlock: { type: 'time', seconds: 95 } },
  { id: 'arctic_viper', name: 'Arctic Viper', category: 'creature', rarity: 'rare', price: 520, desc: 'Tundra frost predator camouflaged in glacier-white chevrons.', palette: { head: '#E0F2FE', bodyStart: '#BAE6FD', bodyEnd: '#0369A1', scale: '#FFFFFF', glow: 'rgba(186, 230, 253, 0.84)', eyeIris: '#00D9FF', eyePupil: '#082F49', tongue: '#38BDF8', pattern: 'chevron', headShape: 'viper', eyeStyle: 'slit' }, unlock: { type: 'time', seconds: 150 } },
  { id: 'coral_predator', name: 'Coral Predator', category: 'creature', rarity: 'rare', price: 540, desc: 'Apex reef striker with venomous scarlet and obsidian rings.', palette: { head: '#F43F5E', bodyStart: '#E11D48', bodyEnd: '#0F172A', scale: '#FBBF24', glow: 'rgba(244, 63, 94, 0.82)', eyeIris: '#FBBF24', eyePupil: '#000000', tongue: '#F43F5E', pattern: 'coral_tricolor', headShape: 'viper', eyeStyle: 'angry' }, unlock: { type: 'kills', count: 15 } },
  { id: 'desert_rattler', name: 'Desert Rattler', category: 'creature', rarity: 'uncommon', price: 340, desc: 'Sun-baked sidewinder with sandy Mojave diamond scales.', palette: { head: '#D97706', bodyStart: '#B45309', bodyEnd: '#451A03', scale: '#FDE68A', glow: 'rgba(217, 119, 6, 0.74)', eyeIris: '#FDE047', eyePupil: '#1C1917', tongue: '#1C1917', pattern: 'diamonds', headShape: 'viper', eyeStyle: 'slit' }, unlock: { type: 'length', length: 45 } },
  { id: 'jungle_boa', name: 'Jungle Boa', category: 'creature', rarity: 'uncommon', price: 330, desc: 'Amazonian river boa with mossy rosette camouflaged coils.', palette: { head: '#65A30D', bodyStart: '#4D7C0F', bodyEnd: '#1A2E05', scale: '#BEF264', glow: 'rgba(101, 163, 13, 0.75)', eyeIris: '#CA8A04', eyePupil: '#052E16', tongue: '#7F1D1D', pattern: 'ocelli', headShape: 'python', eyeStyle: 'slit' }, unlock: { type: 'time', seconds: 115 } },
  { id: 'blood_moon', name: 'Blood Moon Serpent', category: 'creature', rarity: 'epic', price: 980, desc: 'Awakened under a crimson eclipse with glowing lunar sigils.', palette: { head: '#F43F5E', bodyStart: '#9F1239', bodyEnd: '#1F0910', scale: '#FDA4AF', glow: 'rgba(244, 63, 94, 0.92)', eyeIris: '#FF477E', eyePupil: '#FFFFFF', tongue: '#FF477E', pattern: 'blood_moon', headShape: 'cobra', eyeStyle: 'glowing', hoodWidth: 1.75, trailEffect: 'crimson' }, unlock: { type: 'kills', count: 25 } },
  { id: 'leviathan', name: 'Deep Sea Leviathan', category: 'creature', rarity: 'legendary', price: 1600, desc: 'Bioluminescent trench monster sporting finned gill crests.', palette: { head: '#00D9FF', bodyStart: '#0284C7', bodyEnd: '#081426', scale: '#00F5A0', glow: 'rgba(0, 217, 255, 0.92)', eyeIris: '#00F5A0', eyePupil: '#042F2E', tongue: '#00F5A0', pattern: 'leviathan_fins', headShape: 'leviathan', eyeStyle: 'glowing', trailEffect: 'bubbles' }, unlock: { type: 'time', seconds: 330 } },
  { id: 'poison_fang', name: 'Poison Fang', category: 'creature', rarity: 'epic', price: 890, desc: 'Neurotoxic pit viper dripping with radioactive lime venom.', palette: { head: '#A3E635', bodyStart: '#4D7C0F', bodyEnd: '#1E1B4B', scale: '#D9F99D', glow: 'rgba(163, 230, 53, 0.88)', eyeIris: '#A855F7', eyePupil: '#052E16', tongue: '#A855F7', pattern: 'venom_drip', headShape: 'viper', eyeStyle: 'slit', trailEffect: 'toxic' }, unlock: { type: 'kills', count: 20 } },

  // ================= C. NEW FANTASY / SPECIAL SKINS (12 NEW + 4 EXISTING = 16 FANTASY) =================
  { id: 'lava_beast', name: 'Lava Beast', category: 'fantasy', rarity: 'epic', price: 950, desc: 'Tectonic titan with cracked obsidian plates over liquid magma.', palette: { head: '#FB923C', bodyStart: '#DC2626', bodyEnd: '#1C1917', scale: '#FACC15', glow: 'rgba(239, 68, 68, 0.9)', eyeIris: '#FEF08A', eyePupil: '#7F1D1D', tongue: '#FACC15', pattern: 'lava_cracks', headShape: 'dragon', eyeStyle: 'glowing', trailEffect: 'embers' }, unlock: { type: 'length', length: 90 } },
  { id: 'ice_dragon', name: 'Ice Dragon', category: 'fantasy', rarity: 'legendary', price: 1500, desc: 'Frostborne wyrm exhaling sub-zero crystalline blizzard shards.', palette: { head: '#E0F2FE', bodyStart: '#38BDF8', bodyEnd: '#1E3A8A', scale: '#FFFFFF', glow: 'rgba(0, 217, 255, 0.92)', eyeIris: '#00D9FF', eyePupil: '#FFFFFF', tongue: '#7DD3FC', pattern: 'ice_shards', headShape: 'dragon', eyeStyle: 'glowing', trailEffect: 'frost' }, unlock: { type: 'time', seconds: 320 } },
  { id: 'crystal', name: 'Crystal Serpent', category: 'fantasy', rarity: 'epic', price: 880, desc: 'Refractive amethyst and quartz facets that bend arena light.', palette: { head: '#E9D5FF', bodyStart: '#C084FC', bodyEnd: '#3B82F6', scale: '#FFFFFF', glow: 'rgba(192, 132, 252, 0.88)', eyeIris: '#00D9FF', eyePupil: '#2E1065', tongue: '#F472B6', pattern: 'crystal_facets', headShape: 'crystal', eyeStyle: 'glowing', trailEffect: 'shimmer' }, unlock: { type: 'length', length: 82 } },
  { id: 'void_snake', name: 'Void Snake', category: 'fantasy', rarity: 'legendary', price: 1700, desc: 'Event-horizon entity absorbing light into a violet singularity.', palette: { head: '#A855F7', bodyStart: '#3B0764', bodyEnd: '#030712', scale: '#C084FC', glow: 'rgba(168, 85, 247, 0.94)', eyeIris: '#FF477E', eyePupil: '#000000', tongue: '#A855F7', pattern: 'void_stars', headShape: 'coffin', eyeStyle: 'glowing', trailEffect: 'void' }, unlock: { type: 'kills', count: 40 } },
  { id: 'cosmic', name: 'Cosmic Serpent', category: 'fantasy', rarity: 'mythic', price: 2400, desc: 'Nebula weaver carrying whole star clusters inside its body.', palette: { head: '#00D9FF', bodyStart: '#A855F7', bodyEnd: '#0F172A', scale: '#FDE047', glow: 'rgba(0, 217, 255, 0.95)', eyeIris: '#FFB020', eyePupil: '#FFFFFF', tongue: '#FF477E', pattern: 'cosmic_stars', headShape: 'dragon', eyeStyle: 'glowing', trailEffect: 'cosmos' }, unlock: { type: 'level', level: 15 } },
  { id: 'storm', name: 'Storm Snake', category: 'fantasy', rarity: 'epic', price: 920, desc: 'Thundercloud tempest crackling with live high-voltage arcs.', palette: { head: '#38BDF8', bodyStart: '#1D4ED8', bodyEnd: '#0F172A', scale: '#FDE047', glow: 'rgba(56, 189, 248, 0.9)', eyeIris: '#FDE047', eyePupil: '#FFFFFF', tongue: '#38BDF8', pattern: 'storm_bolts', headShape: 'arrow', eyeStyle: 'glowing', trailEffect: 'lightning' }, unlock: { type: 'time', seconds: 260 } },
  { id: 'shadow_assassin', name: 'Shadow Assassin', category: 'fantasy', rarity: 'epic', price: 860, desc: 'Stealth shinobi serpent veiled in smoke with crimson daggers.', palette: { head: '#1E293B', bodyStart: '#0F172A', bodyEnd: '#020617', scale: '#F43F5E', glow: 'rgba(244, 63, 94, 0.85)', eyeIris: '#F43F5E', eyePupil: '#000000', tongue: '#F43F5E', pattern: 'assassin_blades', headShape: 'arrow', eyeStyle: 'angry', trailEffect: 'mist' }, unlock: { type: 'kills', count: 18 } },
  { id: 'phoenix', name: 'Phoenix Serpent', category: 'fantasy', rarity: 'mythic', price: 2500, desc: 'Immortal solar firebird reborn in golden-crimson plumage.', palette: { head: '#FEF08A', bodyStart: '#F97316', bodyEnd: '#DC2626', scale: '#FACC15', glow: 'rgba(255, 176, 32, 0.96)', eyeIris: '#FFFFFF', eyePupil: '#F59E0B', tongue: '#FEF08A', pattern: 'phoenix_plumes', headShape: 'phoenix', eyeStyle: 'glowing', trailEffect: 'embers' }, unlock: { type: 'hard_time', seconds: 240 } },
  { id: 'ancient_guardian', name: 'Ancient Guardian', category: 'fantasy', rarity: 'legendary', price: 1550, desc: 'Runic temple protector carved from weathered stone and emerald mana.', palette: { head: '#00F5A0', bodyStart: '#334155', bodyEnd: '#1E293B', scale: '#00F5A0', glow: 'rgba(0, 245, 160, 0.88)', eyeIris: '#00F5A0', eyePupil: '#FFFFFF', tongue: '#00D9FF', pattern: 'ancient_runes', headShape: 'dragon', eyeStyle: 'glowing', trailEffect: 'shimmer' }, unlock: { type: 'achievements', count: 15 } },
  { id: 'spirit_snake', name: 'Spirit Snake', category: 'fantasy', rarity: 'epic', price: 840, desc: 'Mystic shrine guardian radiating tranquil cyan wisps.', palette: { head: '#A5F3FC', bodyStart: '#22D3EE', bodyEnd: '#0E7490', scale: '#ECFEFF', glow: 'rgba(0, 217, 255, 0.88)', eyeIris: '#FFFFFF', eyePupil: '#083344', tongue: '#A5F3FC', pattern: 'ribbons', headShape: 'round', eyeStyle: 'glowing', trailEffect: 'aurora' }, unlock: { type: 'time', seconds: 210 } },
  { id: 'toxic_reaper', name: 'Toxic Reaper', category: 'fantasy', rarity: 'legendary', price: 1620, desc: 'Bio-hazard harbinger pulsing with corrosive acid rings.', palette: { head: '#00F5A0', bodyStart: '#84CC16', bodyEnd: '#14532D', scale: '#A855F7', glow: 'rgba(0, 245, 160, 0.92)', eyeIris: '#A855F7', eyePupil: '#000000', tongue: '#00F5A0', pattern: 'venom_drip', headShape: 'coffin', eyeStyle: 'angry', trailEffect: 'toxic' }, unlock: { type: 'kills', count: 30 } },
  { id: 'celestial_dragon', name: 'Celestial Dragon', category: 'fantasy', rarity: 'mythic', price: 2800, desc: 'Supreme astral sovereign crowned in starlight and mythic pink.', palette: { head: '#FF477E', bodyStart: '#FFB020', bodyEnd: '#A855F7', scale: '#FFFFFF', glow: 'rgba(255, 71, 126, 0.96)', eyeIris: '#00D9FF', eyePupil: '#FFFFFF', tongue: '#00F5A0', pattern: 'celestial_halos', headShape: 'dragon', eyeStyle: 'glowing', trailEffect: 'cosmos' }, unlock: { type: 'king_kills', count: 5 } },

  // ================= D. NEW CYBER / NEON SKINS (10 NEW + 1 EXISTING = 11 CYBER) =================
  { id: 'cyber_serpent', name: 'Cyber Serpent', category: 'cyber', rarity: 'rare', price: 560, desc: 'Augmented chrome chassis wired with neon green fiber optics.', palette: { head: '#00F5A0', bodyStart: '#1E293B', bodyEnd: '#0F172A', scale: '#00F5A0', glow: 'rgba(0, 245, 160, 0.86)', eyeIris: '#00F5A0', eyePupil: '#022C22', tongue: '#00D9FF', pattern: 'circuit_board', headShape: 'arrow', eyeStyle: 'visor' }, unlock: { type: 'length', length: 65 } },
  { id: 'neon_overlord', name: 'Neon Overlord', category: 'cyber', rarity: 'legendary', price: 1750, desc: 'Apex cybernetic warlord surging with dual magenta-cyan cores.', palette: { head: '#FF477E', bodyStart: '#A855F7', bodyEnd: '#00D9FF', scale: '#FFFFFF', glow: 'rgba(255, 71, 126, 0.94)', eyeIris: '#00D9FF', eyePupil: '#090D16', tongue: '#00F5A0', pattern: 'neon_grid', headShape: 'samurai', eyeStyle: 'visor', trailEffect: 'neon' }, unlock: { type: 'level', level: 12 } },
  { id: 'glitch_beast', name: 'Glitch Beast', category: 'cyber', rarity: 'epic', price: 960, desc: 'Corrupted memory anomaly shifting RGB scanline blocks.', palette: { head: '#00D9FF', bodyStart: '#FF477E', bodyEnd: '#0F172A', scale: '#00F5A0', glow: 'rgba(0, 217, 255, 0.9)', eyeIris: '#FF477E', eyePupil: '#00F5A0', tongue: '#00F5A0', pattern: 'glitch_blocks', headShape: 'pixel', eyeStyle: 'visor', trailEffect: 'neon' }, unlock: { type: 'kills', count: 22 } },
  { id: 'digital_snake', name: 'Digital Snake', category: 'cyber', rarity: 'uncommon', price: 360, desc: '8-bit arcade voxel crawler rendered in crisp cyan telemetry.', palette: { head: '#00D9FF', bodyStart: '#0284C7', bodyEnd: '#1E3A8A', scale: '#7DD3FC', glow: 'rgba(0, 217, 255, 0.8)', eyeIris: '#FFFFFF', eyePupil: '#082F49', tongue: '#00F5A0', pattern: 'noob_blocks', headShape: 'pixel', eyeStyle: 'visor' }, unlock: { type: 'time', seconds: 130 } },
  { id: 'cyber_samurai', name: 'Cyber Samurai', category: 'cyber', rarity: 'legendary', price: 1680, desc: 'Armored Ronin unit with a horned kabuto crest and katana edges.', palette: { head: '#F43F5E', bodyStart: '#1E293B', bodyEnd: '#090D16', scale: '#FFB020', glow: 'rgba(244, 63, 94, 0.92)', eyeIris: '#FFB020', eyePupil: '#000000', tongue: '#F43F5E', pattern: 'samurai_armor', headShape: 'samurai', eyeStyle: 'visor', trailEffect: 'crimson' }, unlock: { type: 'kills', count: 28 } },
  { id: 'hologram', name: 'Hologram Serpent', category: 'cyber', rarity: 'epic', price: 940, desc: 'Hard-light projection flickering with translucent wireframe rings.', palette: { head: '#00D9FF', bodyStart: '#38BDF8', bodyEnd: '#082F49', scale: '#E0F2FE', glow: 'rgba(0, 217, 255, 0.9)', eyeIris: '#FFFFFF', eyePupil: '#00D9FF', tongue: '#00F5A0', pattern: 'hologram_rings', headShape: 'arrow', eyeStyle: 'visor', trailEffect: 'neon' }, unlock: { type: 'length', length: 95 } },
  { id: 'plasma_snake', name: 'Plasma Snake', category: 'cyber', rarity: 'epic', price: 990, desc: 'Contained fusion reactor undulating with ionized magenta arcs.', palette: { head: '#E879F9', bodyStart: '#A855F7', bodyEnd: '#3B0764', scale: '#00D9FF', glow: 'rgba(168, 85, 247, 0.92)', eyeIris: '#00D9FF', eyePupil: '#FFFFFF', tongue: '#FF477E', pattern: 'plasma_pulse', headShape: 'arrow', eyeStyle: 'glowing', trailEffect: 'neon' }, unlock: { type: 'time', seconds: 280 } },
  { id: 'neon_ghost', name: 'Neon Ghost', category: 'cyber', rarity: 'rare', price: 620, desc: 'Stealth netrunner cloaked in ultraviolet phantom circuitry.', palette: { head: '#C084FC', bodyStart: '#6366F1', bodyEnd: '#1E1B4B', scale: '#00D9FF', glow: 'rgba(192, 132, 252, 0.85)', eyeIris: '#00F5A0', eyePupil: '#1E1B4B', tongue: '#00D9FF', pattern: 'circuit_board', headShape: 'round', eyeStyle: 'glowing' }, unlock: { type: 'time', seconds: 195 } },
  { id: 'quantum', name: 'Quantum Serpent', category: 'cyber', rarity: 'mythic', price: 2600, desc: 'Superposition accelerator phasing across parallel dimensions.', palette: { head: '#00F5A0', bodyStart: '#00D9FF', bodyEnd: '#A855F7', scale: '#FFFFFF', glow: 'rgba(0, 245, 160, 0.96)', eyeIris: '#FF477E', eyePupil: '#FFFFFF', tongue: '#FFB020', pattern: 'quantum_rings', headShape: 'crystal', eyeStyle: 'visor', trailEffect: 'cosmos' }, unlock: { type: 'length', length: 200 } },
  { id: 'matrix_snake', name: 'Matrix Snake', category: 'cyber', rarity: 'legendary', price: 1580, desc: 'Pure executable code streaming cascading green glyphs.', palette: { head: '#00F5A0', bodyStart: '#10B981', bodyEnd: '#022C22', scale: '#A7F3D0', glow: 'rgba(0, 245, 160, 0.94)', eyeIris: '#00F5A0', eyePupil: '#000000', tongue: '#00F5A0', pattern: 'matrix_code', headShape: 'pixel', eyeStyle: 'visor', trailEffect: 'neon' }, unlock: { type: 'missions', count: 10 } }
];
const SKIN_UNLOCKS_KEY = 'serpentRun_unlockedSkins';
const SELECTED_SKIN_KEY = 'serpentRun_selectedSkin';

function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (_) {}
}

const FRUIT_PIXEL_GRIDS = Object.freeze({
  apple: [
    '.......SS.......',
    '......SSGG......',
    '......S.GG......',
    '...OOOO..OOOO...',
    '..OBBBBOOOBBBO..',
    '.OBHHBBBBBBBBBO.',
    '.OBHBBBBBBBBBBBO',
    '.OBBBBBBBBBBBBBO',
    '.OBBBBBBBBBBBBBO',
    '.OBBBBBBBBBBBBBO',
    '..OBBBBBBBBBBBO.',
    '..OBBBBBBBBBBBO.',
    '...OBBBBBBBBBO..',
    '....OOBBBBBOO...',
    '.....OO.O.OO....',
    '................'
  ],
  cherry: [
    '.........SS.....',
    '........SSGG....',
    '.......SS..G....',
    '......S..S......',
    '.....S....S.....',
    '....S......S....',
    '..OOOO....OOOO..',
    '.OBBBBO..OBBBBO.',
    'OBHHBBBOOBHHBBBO',
    'OBHBBBBBOBHBBBBO',
    'OBBBBBBBOBBBBBBO',
    '.OBBBBBO.OBBBBBO',
    '..OOOOO...OOOOO.',
    '................',
    '................',
    '................'
  ],
  grapes: [
    '.......SS.......',
    '.....SSSSSS.....',
    '.......SS.......',
    '..OOOO.OO.OOOO..',
    '.OBHBBOOOOBHBBO.',
    '.OBBBBOHBOBBBBO.',
    '..OOOOOBBOOOOO..',
    '...OOOBBBBOOO...',
    '..OBHBBBBBBHBO..',
    '..OBBBBBBBBBBO..',
    '...OOOBBBBOOO...',
    '....OBHBBOHBO...',
    '....OBBBBBBBO...',
    '.....OOOBBOO....',
    '......OBBBO.....',
    '.......OOO......'
  ]
});

function initFruitSpriteCache() {
  fruitSpriteCache.clear();
  const types = FRUITS_CONFIG.types;
  for (const key of Object.keys(types)) {
    const def = types[key];
    const grid = FRUIT_PIXEL_GRIDS[key] || FRUIT_PIXEL_GRIDS.apple;
    const sprite = document.createElement('canvas');
    sprite.width = 48;
    sprite.height = 48;
    const sCtx = sprite.getContext('2d');

    // Soft radial neon under-glow baked into the offscreen sprite
    const rad = sCtx.createRadialGradient(24, 25, 2, 24, 25, 22);
    rad.addColorStop(0, def.glow);
    rad.addColorStop(0.55, def.glow.replace(/[\d.]+\)$/, '0.28)'));
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    sCtx.fillStyle = rad;
    sCtx.fillRect(0, 0, 48, 48);

    const pxSize = 2.25;
    const offset = (48 - 16 * pxSize) / 2;
    for (let r = 0; r < grid.length; r++) {
      const rowStr = grid[r];
      for (let c = 0; c < rowStr.length; c++) {
        const ch = rowStr[c];
        if (ch === '.') continue;
        if (ch === 'O') sCtx.fillStyle = def.outline;
        else if (ch === 'B') sCtx.fillStyle = def.color;
        else if (ch === 'H') sCtx.fillStyle = def.highlight || '#ffffff';
        else if (ch === 'S' || ch === 'G') sCtx.fillStyle = def.stem || '#4ade80';
        else continue;
        sCtx.fillRect(
          Math.round(offset + c * pxSize),
          Math.round(offset + r * pxSize),
          Math.ceil(pxSize),
          Math.ceil(pxSize)
        );
      }
    }
    fruitSpriteCache.set(key, sprite);
  }
}

function initRenderCaches() {
  backgroundTileCanvas = document.createElement('canvas');
  backgroundTileCanvas.width = SPATIAL_CELL_SIZE;
  backgroundTileCanvas.height = SPATIAL_CELL_SIZE;
  const tileCtx = backgroundTileCanvas.getContext('2d');
  tileCtx.strokeStyle = 'rgba(160, 220, 235, 0.06)';
  tileCtx.lineWidth = 1;
  tileCtx.strokeRect(0.5, 0.5, SPATIAL_CELL_SIZE - 1, SPATIAL_CELL_SIZE - 1);
  backgroundGridPattern = ctx.createPattern(backgroundTileCanvas, 'repeat');
  backgroundLayerCanvas = document.createElement('canvas');
  backgroundLayerCanvas.width = 320;
  backgroundLayerCanvas.height = 180;
  backgroundLayerContext = backgroundLayerCanvas.getContext('2d');
  backgroundCacheFrame = -1;
  initFruitSpriteCache();
}

function getGlowSprite(color) {
  let sprite = glowSpriteCache.get(color);
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = 64;
  sprite.height = 64;
  const glowCtx = sprite.getContext('2d');
  const gradient = glowCtx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.32, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  glowCtx.fillStyle = gradient;
  glowCtx.fillRect(0, 0, 64, 64);
  glowSpriteCache.set(color, sprite);
  return sprite;
}

function drawCachedGlow(color, x, y, radius, opacity = 1, targetCtx = ctx) {
  const size = radius * 4;
  const previousAlpha = targetCtx.globalAlpha;
  targetCtx.globalAlpha = previousAlpha * opacity;
  targetCtx.drawImage(getGlowSprite(color), x - size / 2, y - size / 2, size, size);
  targetCtx.globalAlpha = previousAlpha;
}

function updateSettingsUI() {
  if (!settingsScreenEl) return;
  for (const button of settingsScreenEl.querySelectorAll('[data-quality]')) {
    button.classList.toggle('active', button.dataset.quality === qualityPreference);
  }
  if (fpsToggleEl) {
    fpsToggleEl.textContent = fpsCounterEnabled ? 'On' : 'Off';
    fpsToggleEl.classList.toggle('active', fpsCounterEnabled);
  }
  const sfxBtn = document.getElementById('sfx-toggle-btn');
  if (sfxBtn) {
    sfxBtn.textContent = !isMuted ? 'On' : 'Off';
    sfxBtn.classList.toggle('active', !isMuted);
  }
  const musicBtn = document.getElementById('music-toggle-btn');
  if (musicBtn) {
    musicBtn.textContent = !isMusicMuted ? 'On' : 'Off';
    musicBtn.classList.toggle('active', !isMusicMuted);
  }
  const volSlider = document.getElementById('volume-slider');
  const volLabel = document.getElementById('vol-label');
  if (volSlider) volSlider.value = Math.round(masterVolume * 100);
  if (volLabel) volLabel.textContent = `${Math.round(masterVolume * 100)}%`;

  if (typeof profileData !== 'undefined' && profileData && profileData.settings) {
    const s = profileData.settings;
    const vibBtn = document.getElementById('vib-toggle');
    if (vibBtn) {
      vibBtn.textContent = s.vibration ? 'On' : 'Off';
      vibBtn.classList.toggle('active', Boolean(s.vibration));
    }
    for (const btn of settingsScreenEl.querySelectorAll('[data-ctrl]')) {
      btn.classList.toggle('active', btn.dataset.ctrl === (s.controlStyle || 'joystick'));
    }
    const sensSlider = document.getElementById('sens-slider');
    const sensLabel = document.getElementById('sens-label');
    if (sensSlider) sensSlider.value = s.joystickSensitivity || 100;
    if (sensLabel) sensLabel.textContent = `${s.joystickSensitivity || 100}%`;
    for (const btn of settingsScreenEl.querySelectorAll('[data-jsize]')) {
      btn.classList.toggle('active', btn.dataset.jsize === (s.joystickSize || 'medium'));
    }
    const lhBtn = document.getElementById('lefthand-toggle');
    if (lhBtn) {
      lhBtn.textContent = s.leftHanded ? 'On' : 'Off';
      lhBtn.classList.toggle('active', Boolean(s.leftHanded));
    }
  }
  const envEl = document.getElementById('settings-ad-env');
  const envWrap = document.getElementById('settings-ad-env-wrap');
  const isProdEnv = typeof AdManager !== 'undefined' && typeof AdManager.getEnvironment === 'function' && AdManager.getEnvironment() === 'production';
  if (envWrap && isProdEnv) {
    envWrap.style.display = 'none';
  }
  if (envEl) {
    envEl.textContent = (typeof AdManager !== 'undefined' && typeof AdManager.isWebAdsDisabled === 'function' && AdManager.isWebAdsDisabled())
      ? 'web (disabled)'
      : ((typeof AdManager !== 'undefined' && typeof AdManager.getEnvironment === 'function')
        ? AdManager.getEnvironment()
        : (GAME_CONFIG.ADMOB ? GAME_CONFIG.ADMOB.environment : 'development'));
  }
  const fsRow = document.getElementById('fullscreen-setting-row');
  const fsBtn = document.getElementById('fullscreen-toggle-btn');
  const fsSupported = Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !AdManager.isNativeAndroidApp();
  if (fsRow) fsRow.style.display = fsSupported ? 'flex' : 'none';
  if (fsBtn && fsSupported) {
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    fsBtn.textContent = isFs ? 'On' : 'Off';
    fsBtn.classList.toggle('active', isFs);
  }
  const hasBillingPlugin = Boolean((window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativePurchases) || window.CdvPurchase);
  if (!hasBillingPlugin) {
    const menuRemoveAdsBtn = document.getElementById('menu-removeads-btn');
    if (menuRemoveAdsBtn) menuRemoveAdsBtn.style.display = 'none';
    const settingsRemoveAdsBtn = document.querySelector('#settings-screen button[data-action="open-screen"][data-arg="removeads"]');
    if (settingsRemoveAdsBtn && settingsRemoveAdsBtn.parentElement) {
      settingsRemoveAdsBtn.parentElement.style.display = 'none';
    }
  }
}

function toggleFullscreenMode() {
  try {
    const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    if (isFs) {
      const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFn) Promise.resolve(exitFn.call(document)).finally(() => updateSettingsUI());
    } else {
      const el = document.documentElement;
      const reqFn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (reqFn) Promise.resolve(reqFn.call(el)).finally(() => updateSettingsUI());
    }
  } catch (_) {}
}

function initializeGraphicsSettings() {
  const savedQuality = safeStorageGet('serpentRun_graphicsQuality') || GAME_CONFIG.GRAPHICS_QUALITY || 'auto';
  qualityPreference = ['auto', 'high', 'medium', 'low'].includes(savedQuality) ? savedQuality : 'auto';
  const savedFps = safeStorageGet('serpentRun_fpsCounter');
  fpsCounterEnabled = savedFps === null ? Boolean(GAME_CONFIG.FPS_COUNTER_DEFAULT) : savedFps === '1';
  applyGraphicsQuality(qualityPreference === 'auto' ? (isMobileDevice ? 'low' : 'high') : qualityPreference);
  updateSettingsUI();
}

function applyGraphicsQuality(level) {
  graphicsQuality = level;
  maxParticles = PARTICLE_LIMITS[level] || PARTICLE_LIMITS.medium;
  if (particles.length > maxParticles) particles.length = maxParticles;
  backgroundCacheFrame = -1;
  if (fpsCounterEl) fpsCounterEl.style.display = (fpsCounterEnabled && isGameRunning) ? 'block' : 'none';
  updateSettingsUI();
}

function setGraphicsQuality(level) {
  qualityPreference = level;
  if (level === 'auto') {
    applyGraphicsQuality(isMobileDevice ? 'low' : 'high');
  } else {
    safeStorageSet('serpentRun_graphicsQuality', level);
    applyGraphicsQuality(level);
  }
  if (level === 'auto') safeStorageSet('serpentRun_graphicsQuality', 'auto');
}

function toggleFpsCounter() {
  fpsCounterEnabled = !fpsCounterEnabled;
  safeStorageSet('serpentRun_fpsCounter', fpsCounterEnabled ? '1' : '0');
  if (fpsCounterEl) fpsCounterEl.style.display = (fpsCounterEnabled && isGameRunning) ? 'block' : 'none';
  updateSettingsUI();
}

function trimExcessBotsToCap(cap) {
  while (bots.length > cap) {
    // Prefer removing a dead bot or the bot farthest from the player
    let removeIdx = -1;
    let maxDistSq = -1;
    for (let i = bots.length - 1; i >= 0; i--) {
      const b = bots[i];
      if (!b.alive) {
        removeIdx = i;
        break;
      }
      const dSq = toroidDistSq(player.x, player.y, b.x, b.y);
      if (dSq > maxDistSq) {
        maxDistSq = dSq;
        removeIdx = i;
      }
    }
    if (removeIdx === -1) break;
    const removed = bots.splice(removeIdx, 1)[0];
    const rIdx = snakeRoster.indexOf(removed);
    if (rIdx !== -1) snakeRoster.splice(rIdx, 1);
    const lIdx = leaderboardOrder.indexOf(removed);
    if (lIdx !== -1) leaderboardOrder.splice(lIdx, 1);
  }
}

function updateFrameMetrics(frameNow, frameMs) {
  averageFrameMs += (frameMs - averageFrameMs) * 0.08;
  // Under 40 FPS (< 40 FPS => > 25 ms/frame) for 3 seconds: lower bot cap in steps of 10 down to 40 and step down graphics quality
  if (averageFrameMs > 25) {
    if (!lowFpsSince) lowFpsSince = frameNow;
    if (frameNow - lowFpsSince >= 3000) {
      if (activeBotMax > BOT_MIN_CAP) {
        activeBotMax = Math.max(BOT_MIN_CAP, activeBotMax - 10);
        activeTargetBotCount = Math.min(activeTargetBotCount, activeBotMax);
        trimExcessBotsToCap(activeBotMax);
      }
      if (graphicsQuality !== 'low') {
        const currentIndex = QUALITY_ORDER.indexOf(graphicsQuality);
        applyGraphicsQuality(QUALITY_ORDER[Math.min(QUALITY_ORDER.length - 1, currentIndex + 1)]);
      }
      lowFpsSince = frameNow;
    }
  } else {
    lowFpsSince = 0;
  }
  if (fpsCounterEnabled && fpsCounterEl && frameNow - lastFpsDisplayAt >= 500) {
    fpsCounterEl.textContent = `${Math.round(1000 / Math.max(1, averageFrameMs))} FPS · ${graphicsQuality}`;
    lastFpsDisplayAt = frameNow;
  }
}

function loadUnlockedSkins() {
  try {
    const defaults = SKINS.filter(s => s.unlock.type === 'default').map(s => s.id);
    const stored = JSON.parse(safeStorageGet(SKIN_UNLOCKS_KEY) || '[]');
    return new Set([...defaults, ...(Array.isArray(stored) ? stored.filter(id => SKINS.some(skin => skin.id === id)) : [])]);
  } catch (_) { return new Set(['classic', 'cobra', 'python']); }
}

const unlockedSkinIds = loadUnlockedSkins();
let selectedSkinId = safeStorageGet(SELECTED_SKIN_KEY) || 'classic';
if (!unlockedSkinIds.has(selectedSkinId)) selectedSkinId = 'classic';

function getSkin(skinId = selectedSkinId) {
  return SKINS.find(skin => skin.id === skinId) || SKINS[0];
}

const BOT_CONFIGS = [
  {
    name: 'Viper',
    rarity: 'common',
    palette: {
      head: '#10b981', bodyStart: '#059669', bodyEnd: '#047857',
      scale: 'rgba(167, 243, 208, 0.55)', glow: 'rgba(16, 185, 129, 0.55)',
      eyeIris: '#fde047', eyePupil: '#022c22', tongue: '#f87171',
      pattern: 'lightning', headShape: 'viper', eyeStyle: 'slit'
    }
  },
  {
    name: 'Hydra',
    rarity: 'rare',
    palette: {
      head: '#c084fc', bodyStart: '#9333ea', bodyEnd: '#4c1d95',
      scale: 'rgba(233, 213, 255, 0.52)', glow: 'rgba(192, 132, 252, 0.55)',
      eyeIris: '#e9d5ff', eyePupil: '#2e1065', tongue: '#fb7185',
      pattern: 'dragon', headShape: 'dragon', eyeStyle: 'slit'
    }
  },
  {
    name: 'Cobra',
    rarity: 'uncommon',
    palette: {
      head: '#f59e0b', bodyStart: '#d97706', bodyEnd: '#78350f',
      scale: 'rgba(254, 240, 138, 0.6)', glow: 'rgba(245, 158, 11, 0.55)',
      eyeIris: '#fef08a', eyePupil: '#451a03', tongue: '#f43f5e',
      pattern: 'chevron', headShape: 'cobra', eyeStyle: 'slit', hoodWidth: 1.72
    }
  },
  {
    name: 'Abyss',
    rarity: 'uncommon',
    palette: {
      head: '#f43f5e', bodyStart: '#e11d48', bodyEnd: '#881337',
      scale: 'rgba(254, 205, 211, 0.52)', glow: 'rgba(244, 63, 94, 0.55)',
      eyeIris: '#fda4af', eyePupil: '#4c0519', tongue: '#fda4af',
      pattern: 'bands', headShape: 'leviathan', eyeStyle: 'angry'
    }
  },
  {
    name: 'Phantom',
    rarity: 'rare',
    palette: {
      head: '#f472b6', bodyStart: '#db2777', bodyEnd: '#831843',
      scale: 'rgba(251, 207, 232, 0.5)', glow: 'rgba(244, 114, 182, 0.55)',
      eyeIris: '#fbcfe8', eyePupil: '#500724', tongue: '#a78bfa',
      pattern: 'ocelli', headShape: 'coffin', eyeStyle: 'glowing'
    }
  },
  {
    name: 'Apex',
    rarity: 'uncommon',
    palette: {
      head: '#a3e635', bodyStart: '#65a30d', bodyEnd: '#365314',
      scale: 'rgba(217, 249, 157, 0.58)', glow: 'rgba(163, 230, 53, 0.55)',
      eyeIris: '#fef08a', eyePupil: '#1a2e05', tongue: '#f43f5e',
      pattern: 'diamonds', headShape: 'arrow', eyeStyle: 'slit'
    }
  }
];
// 70% Aggressive (3 Hunter, 2 Encircler, 2 Opportunist) + 30% Scavenger (3 Scavenger)
const BOT_PERSONALITIES = [
  { name: 'Hunter', icon: '⚔', style: 'hunter', aggressive: true },
  { name: 'Encircler', icon: '◉', style: 'encircler', aggressive: true },
  { name: 'Opportunist', icon: '⚡', style: 'opportunist', aggressive: true },
  { name: 'Hunter', icon: '⚔', style: 'hunter', aggressive: true },
  { name: 'Scavenger', icon: '✦', style: 'scavenger', aggressive: false },
  { name: 'Encircler', icon: '◉', style: 'encircler', aggressive: true },
  { name: 'Hunter', icon: '⚔', style: 'hunter', aggressive: true },
  { name: 'Scavenger', icon: '✦', style: 'scavenger', aggressive: false },
  { name: 'Opportunist', icon: '⚡', style: 'opportunist', aggressive: true },
  { name: 'Scavenger', icon: '✦', style: 'scavenger', aggressive: false }
];

// ============================================================
// §2  STATE & AUDIO
// ============================================================
let canvas = null;
let ctx = null;
let width = window.innerWidth;
let height = window.innerHeight;
let cameraX = WORLD_WIDTH / 2;
let cameraY = WORLD_HEIGHT / 2;
let cameraZoom = 1;
let deviceScale = 1;
let animFrame = 0;
let loopActive = false;
const FIXED_STEP_MS = 1000 / 60;
let fixedStepAccumulator = 0;
let lastLoopFrameTime = performance.now();
let isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
const cycleEpoch = performance.now();
let currentCycle = { ...CYCLE_PHASES[0], progress: 0, nightFactor: 0 };
let rareOrb = null;
let nextRareOrbAt = performance.now() + RARE_ORB_MIN_INTERVAL_MS + Math.random() * (RARE_ORB_MAX_INTERVAL_MS - RARE_ORB_MIN_INTERVAL_MS);

let currentDifficulty = 'medium';
let isGameRunning = false;
let isPaused = false;
let isGameOver = false;

let gameStartTime = 0;
let pauseStartTime = 0;
let totalPausedDuration = 0;
let survivalSeconds = 0;
let shakeIntensity = 0;

let audioCtx = null;
let isMuted = false;
let ambientOsc1 = null;
let ambientOsc2 = null;
let ambientGain = null;

const foodOrbs = [];
const particles = [];
const plankton = [];
const bots = [];
const foodOrbPool = [];
const particlePool = [];
const floatingTextPool = [];
const glowTrailSamplePool = [];
const visualRings = [];
const visualRingPool = [];
const aliveLeaderboardSnakes = [];
const glowSpriteCache = new Map();
let backgroundTileCanvas = null;
let backgroundGridPattern = null;
let backgroundLayerCanvas = null;
let backgroundLayerContext = null;
let backgroundCacheFrame = -1;
let backgroundCacheQuality = '';

const player = {
  name: 'You',
  isPlayer: true,
  x: WORLD_WIDTH / 2,
  y: WORLD_HEIGHT / 2,
  prevX: WORLD_WIDTH / 2,
  prevY: WORLD_HEIGHT / 2,
  angle: -Math.PI / 2,
  targetAngle: -Math.PI / 2,
  speed: SPEED_CONFIGS.normal,
  turnRate: TURN_RATE,
  length: INITIAL_SEGMENTS,
  segments: [],
  palette: getSkin().palette,
  rarity: getSkin().rarity || 'common',
  eatPulses: [],
  lastEatAt: 0,
  lastRarityParticleAt: 0,
  tongueTimer: 0,
  tongueProgress: 0,
  glowTrailUntil: 0,
  glowTrailSamples: [],
  trailWorldX: WORLD_WIDTH / 2,
  trailWorldY: WORLD_HEIGHT / 2,
  lastTrailSampleAt: 0,
  growQueue: 0,
  alive: true,
  protectedUntil: 0,
  ghostUntil: 0,
  magnetUntil: 0,
  dashUntil: 0,
  speedBoostUntil: 0,
  abilityReadyAt: { ghost: 0, magnet: 0, dash: 0 },
};
const snakeRoster = [player];
const leaderboardOrder = [player];
const SPATIAL_CELL_SIZE = 200;
const SPATIAL_COLUMNS = WORLD_WIDTH / SPATIAL_CELL_SIZE;
const SPATIAL_ROWS = WORLD_HEIGHT / SPATIAL_CELL_SIZE;
const spatialHeads = new Int32Array(SPATIAL_COLUMNS * SPATIAL_ROWS);
let spatialCapacity = 4096;
let spatialNext = new Int32Array(spatialCapacity);
let spatialX = new Float32Array(spatialCapacity);
let spatialY = new Float32Array(spatialCapacity);
let spatialRadius = new Float32Array(spatialCapacity);
let spatialIndex = new Int32Array(spatialCapacity);
let spatialKind = new Uint8Array(spatialCapacity);
let spatialOwner = new Array(spatialCapacity);
let spatialSegment = new Array(spatialCapacity);
let spatialItemCount = 0;

function growSpatialCapacity(minimum) {
  if (minimum <= spatialCapacity) return;
  let capacity = spatialCapacity;
  while (capacity < minimum) capacity *= 2;
  const next = new Int32Array(capacity); next.set(spatialNext); spatialNext = next;
  const x = new Float32Array(capacity); x.set(spatialX); spatialX = x;
  const y = new Float32Array(capacity); y.set(spatialY); spatialY = y;
  const radius = new Float32Array(capacity); radius.set(spatialRadius); spatialRadius = radius;
  const index = new Int32Array(capacity); index.set(spatialIndex); spatialIndex = index;
  const kind = new Uint8Array(capacity); kind.set(spatialKind); spatialKind = kind;
  spatialOwner.length = capacity;
  spatialSegment.length = capacity;
  spatialCapacity = capacity;
}

function insertSpatialItem(x, y, owner, segment, segmentIndex, kind, radius) {
  const slot = spatialItemCount++;
  if (slot >= spatialCapacity) growSpatialCapacity(slot + 1);
  const cellX = Math.floor(wrap(x, WORLD_WIDTH) / SPATIAL_CELL_SIZE);
  const cellY = Math.floor(wrap(y, WORLD_HEIGHT) / SPATIAL_CELL_SIZE);
  const cell = cellY * SPATIAL_COLUMNS + cellX;
  spatialX[slot] = x;
  spatialY[slot] = y;
  spatialRadius[slot] = radius;
  spatialIndex[slot] = segmentIndex;
  spatialKind[slot] = kind;
  spatialOwner[slot] = owner;
  spatialSegment[slot] = segment;
  spatialNext[slot] = spatialHeads[cell];
  spatialHeads[cell] = slot;
}

function getSnakeBodyGrowthScale(len) {
  const excess = Math.max(0, (len || INITIAL_SEGMENTS) - 18);
  return Math.min(1.82, 1.12 + 0.66 * (1 - Math.exp(-excess / 160)));
}

function getSnakeHeadGrowthScale(len) {
  const bodyMul = getSnakeBodyGrowthScale(len);
  return 1.0 + (bodyMul - 1.0) * 0.85;
}

function getSnakeAgilityFactor(len) {
  const excess = Math.max(0, (len || INITIAL_SEGMENTS) - INITIAL_SEGMENTS);
  return Math.max(0.76, 1.0 - 0.24 * (1 - Math.exp(-excess / 190)));
}

function buildSpatialHash() {
  spatialHeads.fill(-1);
  spatialItemCount = 0;
  const isMobViewport = width <= 768 || isMobileDevice;
  const mobileBodyBase = isMobViewport ? 1.42 : 1.0;
  const mobileHeadBase = isMobViewport ? 1.28 : 1.0;
  const bodyTaper = isMobViewport ? 0.46 : 0.56;
  for (const snake of snakeRoster) {
    if (!snake.alive) continue;
    const headGrowth = getSnakeHeadGrowthScale(snake.length) * mobileHeadBase;
    const bodyGrowth = getSnakeBodyGrowthScale(snake.length) * mobileBodyBase;
    const minSegRadius = (isMobViewport ? 5.6 : 4.2) * Math.min(1.45, 0.85 + (getSnakeBodyGrowthScale(snake.length) - 1) * 0.7);
    insertSpatialItem(snake.x, snake.y, snake, null, -1, 1, HEAD_RADIUS * headGrowth);
    const length = snake.segments.length;
    // Stride-2 body insertion with actual lateral slither coordinates & explicit tail inclusion
    for (let i = 1; i < length; i += 2) {
      const segment = snake.segments[i];
      const progress = i / length;
      const taperCurve = Math.pow(progress, 1.42);
      const bodyRadius = Math.max(minSegRadius, HEAD_RADIUS * bodyGrowth * (1 - taperCurve * bodyTaper));
      const perp = segment.angle + Math.PI / 2;
      const sx = wrap(segment.x + Math.cos(perp) * (segment.lateralOffset || 0), WORLD_WIDTH);
      const sy = wrap(segment.y + Math.sin(perp) * (segment.lateralOffset || 0), WORLD_HEIGHT);
      insertSpatialItem(sx, sy, snake, segment, i, 0, bodyRadius);
    }
    if (length > 2 && (length - 1) % 2 === 0) {
      const tailIdx = length - 1;
      const tailSeg = snake.segments[tailIdx];
      const tailRadius = Math.max(minSegRadius, HEAD_RADIUS * bodyGrowth * (1 - bodyTaper));
      const perp = tailSeg.angle + Math.PI / 2;
      const tx = wrap(tailSeg.x + Math.cos(perp) * (tailSeg.lateralOffset || 0), WORLD_WIDTH);
      const ty = wrap(tailSeg.y + Math.sin(perp) * (tailSeg.lateralOffset || 0), WORLD_HEIGHT);
      insertSpatialItem(tx, ty, snake, tailSeg, tailIdx, 0, tailRadius);
    }
  }
  for (const orb of foodOrbs) {
    insertSpatialItem(orb.x, orb.y, null, orb, -1, 2, FOOD_PICKUP_RADIUS);
  }
}

function spatialDangerAt(x, y, radius, requester) {
  const cellX = Math.floor(wrap(x, WORLD_WIDTH) / SPATIAL_CELL_SIZE);
  const cellY = Math.floor(wrap(y, WORLD_HEIGHT) / SPATIAL_CELL_SIZE);
  const radiusSq = radius * radius;
  let danger = 0;
  for (let oy = -1; oy <= 1; oy++) {
    const row = wrap(cellY + oy, SPATIAL_ROWS);
    for (let ox = -1; ox <= 1; ox++) {
      const column = wrap(cellX + ox, SPATIAL_COLUMNS);
      for (let slot = spatialHeads[row * SPATIAL_COLUMNS + column]; slot !== -1; slot = spatialNext[slot]) {
        if (spatialKind[slot] === 2) continue;
        const owner = spatialOwner[slot];
        if (!owner.alive || (owner === requester && (spatialKind[slot] === 1 || spatialIndex[slot] < 6))) continue;
        const distanceSq = toroidDistSq(x, y, spatialX[slot], spatialY[slot]);
        if (distanceSq < radiusSq) {
          danger += 1 / (1 + Math.sqrt(distanceSq));
          if (danger >= 1.5) return danger;
        }
      }
    }
  }
  return danger;
}

function findSpatialBodyCollision(snake, now) {
  const isMobViewport = width <= 768 || isMobileDevice;
  const mobileHeadBase = isMobViewport ? 1.28 : 1.0;
  const myHeadR = HEAD_RADIUS * mobileHeadBase * getSnakeHeadGrowthScale(snake.length);
  const hasPrev = snake.prevX !== undefined && snake.prevY !== undefined;
  const stepDx = hasPrev ? toroidDelta(snake.prevX, snake.x, WORLD_WIDTH) : 0;
  const stepDy = hasPrev ? toroidDelta(snake.prevY, snake.y, WORLD_HEIGHT) : 0;
  const checkMidpoint = (stepDx * stepDx + stepDy * stepDy) > (HEAD_RADIUS * HEAD_RADIUS * 0.64);
  const midX = checkMidpoint ? wrap(snake.prevX + stepDx * 0.5, WORLD_WIDTH) : snake.x;
  const midY = checkMidpoint ? wrap(snake.prevY + stepDy * 0.5, WORLD_HEIGHT) : snake.y;

  const cellX = Math.floor(wrap(snake.x, WORLD_WIDTH) / SPATIAL_CELL_SIZE);
  const cellY = Math.floor(wrap(snake.y, WORLD_HEIGHT) / SPATIAL_CELL_SIZE);
  for (let oy = -1; oy <= 1; oy++) {
    const row = wrap(cellY + oy, SPATIAL_ROWS);
    for (let ox = -1; ox <= 1; ox++) {
      const column = wrap(cellX + ox, SPATIAL_COLUMNS);
      for (let slot = spatialHeads[row * SPATIAL_COLUMNS + column]; slot !== -1; slot = spatialNext[slot]) {
        const owner = spatialOwner[slot];
        if (owner === player && now < player.ghostUntil) continue;
        if (spatialKind[slot] !== 0 || owner === snake || !owner.alive || now < owner.protectedUntil) continue;
        const sx = spatialX[slot];
        const sy = spatialY[slot];
        const hitRadius = Math.max(9.0, (myHeadR + spatialRadius[slot]) * 0.76);
        const hitRadiusSq = hitRadius * hitRadius;
        if (toroidDistSq(snake.x, snake.y, sx, sy) < hitRadiusSq) return owner;
        if (checkMidpoint && toroidDistSq(midX, midY, sx, sy) < hitRadiusSq) return owner;
      }
    }
  }
  return null;
}

const keys = { left: false, right: false };
const mouse = { x: width / 2, y: height / 2, active: false };
const joystick = { active: false, pointerId: null, originX: 0, originY: 0, dx: 0, dy: 0, hasDirection: false };
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;

let hudEl = null;
let lbEl = null;
let menuScreenEl = null;
let pauseOverlayEl = null;
let statTimeEl = null;
let statLengthEl = null;
let statRankEl = null;
let lbListEl = null;
let overlayEl = null;
let finalTimeEl = null;
let bestTimeEl = null;
let finalLengthEl = null;
let bestLengthEl = null;
let muteBtnEl = null;
let diffNameLabel = null;
let menuBestTime = null;
let menuBestLen = null;
let cardDiffLabel = null;
let cycleIconEl = null;
let cycleNameEl = null;
let rareIndicatorEl = null;
let skinsScreenEl = null;
let skinListEl = null;
let skinUnlockToastEl = null;
let skinUnlockToastTimer = 0;
let statKillsEl = null;
let killMessageEl = null;
let killMessageTimer = 0;
let playerKillCount = 0;
const floatingTexts = [];
let joystickEl = null;
let joystickThumbEl = null;
let settingsScreenEl = null;
let fpsCounterEl = null;
let fpsToggleEl = null;

// ============================================================
// §3  AUDIO SYNTHESIS (NO EXTERNAL FILES)
// ============================================================

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 140;

    ambientGain = audioCtx.createGain();
    const initialActive = !isMuted && !isMusicMuted;
    ambientGain.gain.setValueAtTime(initialActive ? 0.035 * masterVolume : 0, audioCtx.currentTime);

    ambientOsc1 = audioCtx.createOscillator();
    ambientOsc1.type = 'sine';
    ambientOsc1.frequency.value = 55;

    ambientOsc2 = audioCtx.createOscillator();
    ambientOsc2.type = 'sine';
    ambientOsc2.frequency.value = 58.5;

    ambientOsc1.connect(filter);
    ambientOsc2.connect(filter);
    filter.connect(ambientGain);
    ambientGain.connect(audioCtx.destination);

    ambientOsc1.start();
    ambientOsc2.start();
  } catch (_) {}
}

function playTone(freqStart, freqEnd, duration, type = 'sine', volume = 0.1) {
  if (isMuted || !audioCtx || masterVolume <= 0.001) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const effectiveVol = Math.max(0.0002, volume * masterVolume);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, audioCtx.currentTime);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), audioCtx.currentTime + duration);
    }
    gain.gain.setValueAtTime(effectiveVol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (_) {}
}

function sfxEat() {
  playTone(840, 1280, 0.08, 'sine', 0.09);
}

function sfxEatFruit(fruitType) {
  if (fruitType === 'grapes') {
    playTone(660, 990, 0.065, 'sine', 0.10);
    setTimeout(() => playTone(990, 1320, 0.065, 'triangle', 0.085), 38);
    setTimeout(() => playTone(1320, 1760, 0.085, 'sine', 0.08), 76);
  } else if (fruitType === 'cherry') {
    playTone(880, 1320, 0.06, 'triangle', 0.095);
    setTimeout(() => playTone(1174.66, 1567.98, 0.075, 'sine', 0.085), 44);
  } else {
    // Apple: crisp chiptune pop
    playTone(780, 1180, 0.07, 'sine', 0.09);
    playTone(1180, 1440, 0.055, 'triangle', 0.05);
  }
}

function sfxRareOrbSpawn() {
  playTone(620, 1040, 0.24, 'sine', 0.12);
  playTone(930, 1390, 0.3, 'triangle', 0.07);
}

function sfxRareOrbEat() {
  playTone(880, 1480, 0.2, 'sine', 0.13);
  playTone(1320, 1760, 0.32, 'sine', 0.08);
}

function sfxBotDeath() {
  playTone(280, 70, 0.28, 'triangle', 0.12);
}

function sfxPlayerDeath() {
  playTone(180, 40, 0.75, 'sawtooth', 0.16);
}

function sfxReward() {
  playTone(587.33, 880, 0.14, 'sine', 0.12);
  setTimeout(() => playTone(880, 1174.66, 0.18, 'triangle', 0.1), 90);
}

let isMusicMuted = false;
let masterVolume = 0.8;

function applyAmbientAudioGain() {
  if (ambientGain && audioCtx) {
    try {
      const active = !isMuted && !isMusicMuted && masterVolume > 0.001;
      if (active && audioCtx.state === 'suspended' && !(typeof AdManager !== 'undefined' && AdManager.adInProgress)) {
        audioCtx.resume().catch(() => {});
      }
      ambientGain.gain.setValueAtTime(active ? 0.035 * masterVolume : 0, audioCtx.currentTime);
    } catch (_) {}
  }
}

function toggleMute() {
  isMuted = !isMuted;
  safeStorageSet('neonSerpents_muted', isMuted ? '1' : '0');
  if (muteBtnEl) muteBtnEl.textContent = isMuted ? '🔇' : '🔊';
  applyAmbientAudioGain();
  if (typeof saveProfileData === 'function') saveProfileData();
  updateSettingsUI();
}

function toggleMusic() {
  isMusicMuted = !isMusicMuted;
  applyAmbientAudioGain();
  if (typeof saveProfileData === 'function') saveProfileData();
  updateSettingsUI();
}

function setMasterVolume(val) {
  masterVolume = Math.max(0, Math.min(1, Number(val) / 100));
  const label = document.getElementById('vol-label');
  if (label) label.textContent = `${Math.round(masterVolume * 100)}%`;
  applyAmbientAudioGain();
  if (typeof saveProfileData === 'function') saveProfileData();
}

function triggerHaptic(ms = 18) {
  try {
    if (profileData && profileData.settings && !profileData.settings.vibration) return;
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (_) {}
}

// ============================================================
// §3.5  SAVE SYSTEM v3 (BACKWARD-COMPATIBLE), 3-TIER MISSIONS, 42 ACHIEVEMENTS & REWARD REVEAL
// ============================================================
const SAVE_STORAGE_KEY = 'serpentRun_save_v2';
const SAVE_SCHEMA_VERSION = 3;

const LEVEL_TITLES = [
  'Starter Serpent', 'Reef Hatchling', 'Tidal Glider', 'Kelp Stalker', 'Current Rider',
  'Abyssal Striker', 'Venom Vanguard', 'Coil Tactician', 'Apex Predator', 'Leviathan',
  'Mythic Wyrm', 'Sovereign King', 'Cosmic Overlord', 'Quantum Immortal'
];

const DAILY_REWARDS_CYCLE = [
  { day: 1, type: 'coins', amount: 120, title: '120 Coins', sub: 'Starter Bonus' },
  { day: 2, type: 'coins', amount: 180, title: '180 Coins', sub: 'Coin Pouch' },
  { day: 3, type: 'coins', amount: 260, title: '260 Coins', sub: 'Treasure Chest' },
  { day: 4, type: 'xp', amount: 350, title: '+350 XP', sub: 'Level Boost' },
  { day: 5, type: 'coins', amount: 450, title: '450 Coins', sub: 'Royal Vault' },
  { day: 6, type: 'skin_or_coins', skinId: 'anaconda', fallbackCoins: 600, title: 'Anaconda Skin', sub: 'Rare Skin or 600c' },
  { day: 7, type: 'skin_or_coins', skinId: 'cyber', fallbackCoins: 1100, title: 'Cyber Neon Skin', sub: 'Epic Skin or 1100c' }
];

// A. DAILY MISSIONS POOL (10 Definitions — 4 Rotate Daily at Local Midnight)
const MISSION_POOL = [
  { id: 'eat_100', tier: 'daily', difficulty: 'Easy', rarity: 'common', title: 'Hungry Serpent', desc: 'Collect 100 food value across matches today', type: 'food', target: 100, rewardCoins: 140, rewardXp: 90 },
  { id: 'survive_180', tier: 'daily', difficulty: 'Medium', rarity: 'uncommon', title: 'Deep Survivor', desc: 'Survive 3 minutes (180s) total in the arena today', type: 'survive', target: 180, rewardCoins: 160, rewardXp: 110 },
  { id: 'kill_5', tier: 'daily', difficulty: 'Medium', rarity: 'rare', title: 'Coil Trapper', desc: 'Eliminate 5 rival snakes today', type: 'kills', target: 5, rewardCoins: 175, rewardXp: 120 },
  { id: 'len_120', tier: 'daily', difficulty: 'Medium', rarity: 'rare', title: 'Colossus', desc: 'Reach a snake length of 120 in a single run', type: 'max_length', target: 120, rewardCoins: 190, rewardXp: 130 },
  { id: 'powerup_3', tier: 'daily', difficulty: 'Easy', rarity: 'uncommon', title: 'Power Collector', desc: 'Pick up 3 map power-ups today', type: 'powerups', target: 3, rewardCoins: 150, rewardXp: 100 },
  { id: 'dash_10', tier: 'daily', difficulty: 'Easy', rarity: 'common', title: 'High Voltage', desc: 'Activate the Dash ability 10 times today', type: 'dash', target: 10, rewardCoins: 135, rewardXp: 90 },
  { id: 'nodie_90', tier: 'daily', difficulty: 'Medium', rarity: 'uncommon', title: 'Untouchable', desc: 'Survive at least 90 seconds in one match', type: 'single_survive', target: 90, rewardCoins: 165, rewardXp: 110 },
  { id: 'king_1', tier: 'daily', difficulty: 'Hard', rarity: 'epic', title: 'Regicide', desc: 'Eliminate 1 crowned King Snake today', type: 'king_kills', target: 1, rewardCoins: 240, rewardXp: 160 },
  { id: 'matches_3', tier: 'daily', difficulty: 'Easy', rarity: 'common', title: 'Arena Regular', desc: 'Play 3 matches in any difficulty mode', type: 'matches', target: 3, rewardCoins: 140, rewardXp: 95 },
  { id: 'coins_200', tier: 'daily', difficulty: 'Medium', rarity: 'uncommon', title: 'Treasure Hunter', desc: 'Earn 200 coins from matches or rewards today', type: 'coins_earned', target: 200, rewardCoins: 170, rewardXp: 115 }
];

// B. WEEKLY MISSIONS POOL (7 Definitions — 5 Rotate Weekly by ISO Week)
const WEEKLY_MISSION_POOL = [
  { id: 'wk_kill_50', tier: 'weekly', difficulty: 'Hard', rarity: 'epic', title: 'Swarm Decimator', desc: 'Eliminate 50 enemy snakes this week', type: 'kills', target: 50, rewardCoins: 650, rewardXp: 450 },
  { id: 'wk_survive_20m', tier: 'weekly', difficulty: 'Medium', rarity: 'rare', title: 'Abyssal Endurance', desc: 'Survive 20 minutes (1,200s) total across matches', type: 'survive', target: 1200, rewardCoins: 600, rewardXp: 420 },
  { id: 'wk_len300_3x', tier: 'weekly', difficulty: 'Hard', rarity: 'epic', title: 'Triple Titan', desc: 'Reach length 150+ in 3 separate matches this week', type: 'matches_len150', target: 3, rewardCoins: 700, rewardXp: 500 },
  { id: 'wk_top3_10', tier: 'weekly', difficulty: 'Medium', rarity: 'rare', title: 'Podium Dominator', desc: 'Finish in the Top 3 arena rank in 10 matches', type: 'top3_matches', target: 10, rewardCoins: 680, rewardXp: 480 },
  { id: 'wk_powerups_30', tier: 'weekly', difficulty: 'Medium', rarity: 'rare', title: 'Relic Overcharge', desc: 'Collect 30 map power-ups this week', type: 'powerups', target: 30, rewardCoins: 580, rewardXp: 400 },
  { id: 'wk_kings_5', tier: 'weekly', difficulty: 'Hard', rarity: 'legendary', title: 'Crown Breaker', desc: 'Defeat 5 crowned King Snakes this week', type: 'king_kills', target: 5, rewardCoins: 850, rewardXp: 600 },
  { id: 'wk_dailies_12', tier: 'weekly', difficulty: 'Medium', rarity: 'epic', title: 'Dedicated Striker', desc: 'Claim 12 daily missions this week', type: 'dailies_claimed', target: 12, rewardCoins: 750, rewardXp: 520 }
];

// C. ELITE CHALLENGES POOL (8 High-Skill Long-Term Challenges with Exclusive Rewards)
const ELITE_MISSION_POOL = [
  { id: 'el_hard_8m', tier: 'elite', difficulty: 'Elite', rarity: 'mythic', title: 'Hellfire Marathon', desc: 'Survive Hard mode for 8 minutes (480s) in a single match', stat: 'hardSurvivalTime', target: 480, rewardCoins: 1500, rewardXp: 1000, bonusSkinId: 'phoenix', bonusTitle: 'Hellfire Immortal' },
  { id: 'el_kills_15_one', tier: 'elite', difficulty: 'Elite', rarity: 'legendary', title: 'Arena Executioner', desc: 'Eliminate 15 snakes in a single match', stat: 'singleMatchKills', target: 15, rewardCoins: 1200, rewardXp: 850, bonusSkinId: 'cyber_samurai', bonusTitle: 'Blade of the Abyss' },
  { id: 'el_len_500', tier: 'elite', difficulty: 'Elite', rarity: 'mythic', title: 'World Serpent', desc: 'Reach an extraordinary snake length of 500', stat: 'highestLength', target: 500, rewardCoins: 1800, rewardXp: 1200, bonusSkinId: 'quantum', bonusTitle: 'Jormungandr' },
  { id: 'el_king_flawless', tier: 'elite', difficulty: 'Elite', rarity: 'legendary', title: 'Usurper Unscathed', desc: 'Defeat the crowned King Snake without using a revive', stat: 'kingKillNoDeath', target: 1, rewardCoins: 1000, rewardXp: 700, bonusTitle: 'Crown Usurper' },
  { id: 'el_hard_streak_3', tier: 'elite', difficulty: 'Elite', rarity: 'mythic', title: 'Hardcore Dynasty', desc: 'Reach Top 3 in Hard mode 3 matches consecutively', stat: 'hardWinsStreakBest', target: 3, rewardCoins: 1600, rewardXp: 1100, bonusSkinId: 'celestial_dragon', bonusTitle: 'Apex Sovereign' },
  { id: 'el_purist_5m', tier: 'elite', difficulty: 'Elite', rarity: 'legendary', title: 'Pure Instinct', desc: 'Survive 5 minutes (300s) in one match without using abilities', stat: 'noAbilitySurvivalTime', target: 300, rewardCoins: 1250, rewardXp: 900, bonusSkinId: 'ancient_guardian', bonusTitle: 'Zen Master' },
  { id: 'el_rare_10', tier: 'elite', difficulty: 'Elite', rarity: 'epic', title: 'Starlight Harvester', desc: 'Collect 10 rare glowing food orbs across your career', stat: 'rareOrbsCollected', target: 10, rewardCoins: 950, rewardXp: 680, bonusSkinId: 'cosmic', bonusTitle: 'Star Eater' },
  { id: 'el_streak_10', tier: 'elite', difficulty: 'Elite', rarity: 'legendary', title: 'Unstoppable Rampage', desc: 'Achieve a 10-kill streak in a single life without reviving', stat: 'killStreakBest', target: 10, rewardCoins: 1350, rewardXp: 950, bonusSkinId: 'void_snake', bonusTitle: 'Void Reaper' }
];

// 42 ACHIEVEMENTS ACROSS 8 CATEGORIES (Bronze, Silver, Gold, Diamond, Mythic)
const ACHIEVEMENTS_LIST = [
  // 1. SURVIVAL (6)
  { id: 'first_match', category: 'survival', rarity: 'bronze', icon: '🌊', title: 'First Dive', desc: 'Complete your first match in Slythox', stat: 'totalMatches', target: 1, rewardCoins: 80, rewardXp: 50 },
  { id: 'surv_1m', category: 'survival', rarity: 'bronze', icon: '⏱', title: 'Treading Water', desc: 'Survive for 1 minute (60s) in a single match', stat: 'bestSurvivalTime', target: 60, rewardCoins: 110, rewardXp: 70 },
  { id: 'survivor_3m', category: 'survival', rarity: 'silver', icon: '🛡', title: 'Arena Survivor', desc: 'Survive for 3 minutes (180s) in a single match', stat: 'bestSurvivalTime', target: 180, rewardCoins: 200, rewardXp: 130 },
  { id: 'master_survivor', category: 'survival', rarity: 'gold', icon: '⚓', title: 'Master Survivor', desc: 'Survive 5 minutes (300s) in a single match', stat: 'bestSurvivalTime', target: 300, rewardCoins: 400, rewardXp: 260 },
  { id: 'surv_10m', category: 'survival', rarity: 'diamond', icon: '🌌', title: 'Immortal Coil', desc: 'Survive 10 minutes (600s) in a single match', stat: 'bestSurvivalTime', target: 600, rewardCoins: 900, rewardXp: 650, bonusTitle: 'The Undying' },
  { id: 'matches_100', category: 'survival', rarity: 'gold', icon: '🎖', title: 'Centurion Veteran', desc: 'Complete 100 lifetime arena matches', stat: 'totalMatches', target: 100, rewardCoins: 750, rewardXp: 500 },

  // 2. COMBAT (6)
  { id: 'first_kill', category: 'combat', rarity: 'bronze', icon: '⚔', title: 'First Blood', desc: 'Trap and defeat your first rival snake', stat: 'totalKills', target: 1, rewardCoins: 100, rewardXp: 60 },
  { id: 'kills_10', category: 'combat', rarity: 'bronze', icon: '🗡', title: 'Ambush Striker', desc: 'Defeat 10 enemy snakes across matches', stat: 'totalKills', target: 10, rewardCoins: 150, rewardXp: 100 },
  { id: 'kills_50', category: 'combat', rarity: 'silver', icon: '💥', title: 'Coil Gladiator', desc: 'Defeat 50 enemy snakes across matches', stat: 'totalKills', target: 50, rewardCoins: 350, rewardXp: 240 },
  { id: 'kills_100', category: 'combat', rarity: 'gold', icon: '☠', title: 'Apex Eliminator', desc: 'Defeat 100 enemy snakes across matches', stat: 'totalKills', target: 100, rewardCoins: 800, rewardXp: 600 },
  { id: 'kills_500', category: 'combat', rarity: 'mythic', icon: '🩸', title: 'God of War', desc: 'Defeat 500 enemy snakes in your career', stat: 'totalKills', target: 500, rewardCoins: 2000, rewardXp: 1500, bonusSkinId: 'blood_moon', bonusTitle: 'Abyssal Warlord' },
  { id: 'match_kills_8', category: 'combat', rarity: 'diamond', icon: '🔥', title: 'Octa-Slayer', desc: 'Eliminate 8 enemy snakes in a single match', stat: 'singleMatchKills', target: 8, rewardCoins: 550, rewardXp: 380 },

  // 3. GROWTH (6)
  { id: 'food_250', category: 'growth', rarity: 'bronze', icon: '🍏', title: 'Food Collector', desc: 'Consume 250 total food value across matches', stat: 'totalFoodEaten', target: 250, rewardCoins: 160, rewardXp: 100 },
  { id: 'food_1000', category: 'growth', rarity: 'silver', icon: '🍖', title: 'Insatiable', desc: 'Consume 1,000 total food value', stat: 'totalFoodEaten', target: 1000, rewardCoins: 500, rewardXp: 350 },
  { id: 'food_5000', category: 'growth', rarity: 'diamond', icon: '🍽', title: 'Black Hole Appetite', desc: 'Consume 5,000 total food value', stat: 'totalFoodEaten', target: 5000, rewardCoins: 1100, rewardXp: 800 },
  { id: 'giant_120', category: 'growth', rarity: 'silver', icon: '🐍', title: 'Giant Serpent', desc: 'Grow your snake to length 120', stat: 'highestLength', target: 120, rewardCoins: 250, rewardXp: 150 },
  { id: 'giant_250', category: 'growth', rarity: 'gold', icon: '🐉', title: 'Mega Behemoth', desc: 'Grow your snake to length 250', stat: 'highestLength', target: 250, rewardCoins: 600, rewardXp: 420 },
  { id: 'giant_400', category: 'growth', rarity: 'diamond', icon: '🪐', title: 'Titan Leviathan', desc: 'Grow your snake to length 400', stat: 'highestLength', target: 400, rewardCoins: 1200, rewardXp: 850, bonusSkinId: 'leviathan' },

  // 4. ABILITIES (5)
  { id: 'speed_demon', category: 'abilities', rarity: 'bronze', icon: '⚡', title: 'Speed Demon', desc: 'Use Dash or collect Speed Boosts 25 times', stat: 'totalDashes', target: 25, rewardCoins: 180, rewardXp: 110 },
  { id: 'dash_100', category: 'abilities', rarity: 'gold', icon: '🚀', title: 'Hyperdrive', desc: 'Activate Dash 100 times across matches', stat: 'totalDashes', target: 100, rewardCoins: 480, rewardXp: 320 },
  { id: 'ghost_25', category: 'abilities', rarity: 'silver', icon: '👻', title: 'Phase Walker', desc: 'Activate Ghost ability 25 times', stat: 'ghostUses', target: 25, rewardCoins: 260, rewardXp: 180 },
  { id: 'magnet_25', category: 'abilities', rarity: 'silver', icon: '🧲', title: 'Magnetic Field', desc: 'Activate Magnet ability 25 times', stat: 'magnetUses', target: 25, rewardCoins: 260, rewardXp: 180 },
  { id: 'powerups_50', category: 'abilities', rarity: 'gold', icon: '✨', title: 'Power Overwhelming', desc: 'Collect 50 map power-ups', stat: 'totalPowerups', target: 50, rewardCoins: 520, rewardXp: 360 },

  // 5. COLLECTION (5)
  { id: 'skins_10', category: 'collection', rarity: 'bronze', icon: '🎨', title: 'Wardrobe Starter', desc: 'Own 10 unique snake skins', stat: 'skinsUnlockedCount', target: 10, rewardCoins: 220, rewardXp: 150 },
  { id: 'skins_25', category: 'collection', rarity: 'gold', icon: '💎', title: 'Skin Connoisseur', desc: 'Own 25 unique snake skins', stat: 'skinsUnlockedCount', target: 25, rewardCoins: 650, rewardXp: 450 },
  { id: 'skins_50', category: 'collection', rarity: 'mythic', icon: '👑', title: 'Grand Curator', desc: 'Own 50 unique snake skins in your vault', stat: 'skinsUnlockedCount', target: 50, rewardCoins: 2200, rewardXp: 1600, bonusTitle: 'Vault Emperor' },
  { id: 'coins_5000', category: 'collection', rarity: 'silver', icon: '💰', title: 'Golden Hoarder', desc: 'Earn 5,000 lifetime coins', stat: 'totalCoinsEarned', target: 5000, rewardCoins: 450, rewardXp: 300 },
  { id: 'level_20', category: 'collection', rarity: 'diamond', icon: '🌟', title: 'Ascended Rank', desc: 'Reach Player Level 20', stat: 'playerLevel', target: 20, rewardCoins: 1000, rewardXp: 700 },

  // 6. KING SLAYER (4)
  { id: 'king_slayer', category: 'kingslayer', rarity: 'silver', icon: '👑', title: 'King Slayer', desc: 'Eliminate the crowned #1 King Snake', stat: 'kingKills', target: 1, rewardCoins: 240, rewardXp: 160 },
  { id: 'king_5', category: 'kingslayer', rarity: 'gold', icon: '⚔', title: 'Throne Shatterer', desc: 'Eliminate 5 crowned King Snakes', stat: 'kingKills', target: 5, rewardCoins: 550, rewardXp: 380 },
  { id: 'king_15', category: 'kingslayer', rarity: 'diamond', icon: '🏰', title: 'Dynasty Ender', desc: 'Eliminate 15 crowned King Snakes', stat: 'kingKills', target: 15, rewardCoins: 1100, rewardXp: 780 },
  { id: 'king_30', category: 'kingslayer', rarity: 'mythic', icon: '🐉', title: 'Bane of Monarchs', desc: 'Eliminate 30 crowned King Snakes', stat: 'kingKills', target: 30, rewardCoins: 2000, rewardXp: 1400, bonusTitle: 'Godslayer' },

  // 7. HARD MODE (4)
  { id: 'hard_2m', category: 'hardmode', rarity: 'silver', icon: '🔥', title: 'Trial by Fire', desc: 'Survive 2 minutes (120s) in Hard Mode', stat: 'hardSurvivalTime', target: 120, rewardCoins: 320, rewardXp: 220 },
  { id: 'hard_4m', category: 'hardmode', rarity: 'gold', icon: '🌋', title: 'Crucible Master', desc: 'Survive 4 minutes (240s) in Hard Mode', stat: 'hardSurvivalTime', target: 240, rewardCoins: 680, rewardXp: 460 },
  { id: 'hard_top1', category: 'hardmode', rarity: 'diamond', icon: '🏆', title: 'Apex of the Swarm', desc: 'Finish a Hard Mode match at Rank #1', stat: 'hardRank1Count', target: 1, rewardCoins: 850, rewardXp: 600 },
  { id: 'hard_kills_10', category: 'hardmode', rarity: 'diamond', icon: '💀', title: 'Swarm Butcher', desc: 'Get 10 kills in a single Hard Mode match', stat: 'hardSingleMatchKills', target: 10, rewardCoins: 1150, rewardXp: 820 },

  // 8. SECRET ACHIEVEMENTS (6 — Description hidden until unlocked!)
  { id: 'sec_night_stalker', category: 'secret', secret: true, rarity: 'gold', icon: '🌙', title: 'Night Stalker', desc: 'Eliminate 3 rival snakes during the Night cycle phase', stat: 'nightKills', target: 3, rewardCoins: 500, rewardXp: 350, bonusSkinId: 'shadow_assassin' },
  { id: 'sec_danger_dweller', category: 'secret', secret: true, rarity: 'gold', icon: '☢', title: 'Eye of the Maelstrom', desc: 'Spend 60 cumulative seconds inside the central Danger Zone', stat: 'dangerZoneTime', target: 60, rewardCoins: 550, rewardXp: 380 },
  { id: 'sec_pacifist', category: 'secret', secret: true, rarity: 'diamond', icon: '🕊', title: 'Abyssal Pacifist', desc: 'Survive 3 minutes in a single match with 0 kills', stat: 'pacifist3m', target: 1, rewardCoins: 750, rewardXp: 520, bonusSkinId: 'spirit_snake' },
  { id: 'sec_meme_lord', category: 'secret', secret: true, rarity: 'gold', icon: '🍌', title: 'Comedy Gold', desc: 'Eliminate 5 snakes while wearing any Funny/Meme skin', stat: 'funnySkinKills', target: 5, rewardCoins: 520, rewardXp: 360, bonusSkinId: 'disco' },
  { id: 'sec_rare_feast', category: 'secret', secret: true, rarity: 'diamond', icon: '🌠', title: 'Shooting Star', desc: 'Catch a rare glowing orb while Dash or Speed Boost is active', stat: 'dashingRareOrb', target: 1, rewardCoins: 700, rewardXp: 480 },
  { id: 'sec_comeback', category: 'secret', secret: true, rarity: 'mythic', icon: '🐦‍🔥', title: 'From the Ashes', desc: 'Revive once and go on to reach Rank #1 in that same match', stat: 'reviveToRank1', target: 1, rewardCoins: 1400, rewardXp: 950, bonusTitle: 'Reborn Sovereign' }
];

function getLocalDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getLocalWeekKey() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d - jan1) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getXpRequiredForLevel(lvl) {
  return Math.round(150 * Math.pow(1.22, Math.max(0, lvl - 1)));
}

function createDefaultProfile() {
  return {
    version: SAVE_SCHEMA_VERSION,
    coins: 250,
    xp: 0,
    level: 1,
    removeForcedAds: false,
    unlockedTitles: ['Starter Serpent'],
    selectedTitle: '',
    settings: {
      sound: !isMuted,
      music: true,
      volume: 80,
      vibration: true,
      controlStyle: 'joystick',
      joystickSensitivity: 100,
      joystickSize: 'medium',
      leftHanded: false
    },
    stats: {
      bestScore: 0,
      bestSurvivalTime: getOverallBestTime(),
      highestLength: getOverallBestLength(),
      totalFoodEaten: 0,
      totalKills: 0,
      kingKills: 0,
      totalMatches: 0,
      totalDashes: 0,
      totalPowerups: 0,
      totalCoinsEarned: 250,
      hardSurvivalTime: getBestTime('hard'),
      hardRank1Count: 0,
      hardSingleMatchKills: 0,
      hardWinsStreak: 0,
      hardWinsStreakBest: 0,
      singleMatchKills: 0,
      killStreakBest: 0,
      kingKillNoDeath: 0,
      noAbilitySurvivalTime: 0,
      rareOrbsCollected: 0,
      ghostUses: 0,
      magnetUses: 0,
      nightKills: 0,
      dangerZoneTime: 0,
      pacifist3m: 0,
      funnySkinKills: 0,
      dashingRareOrb: 0,
      reviveToRank1: 0,
      dailyMissionsCompleted: 0,
      weeklyMissionsCompleted: 0,
      eliteMissionsCompleted: 0,
      skinsUnlockedCount: 3,
      playerLevel: 1
    },
    dailyReward: {
      streakDay: 1,
      lastClaimDate: '',
      totalClaims: 0
    },
    dailyMissions: {
      dateKey: '',
      items: []
    },
    weeklyMissions: {
      weekKey: '',
      items: []
    },
    eliteMissionsClaimed: {},
    achievementsClaimed: {},
    ads: {
      matchesSinceInterstitial: 0,
      lastInterstitialAt: 0
    }
  };
}

const cachedBestTimes = { easy: null, medium: null, normal: null, hard: null };
const cachedBestLengths = { easy: null, medium: null, normal: null, hard: null };

const MAX_SAFE_COINS = 1000000;
const MAX_SAFE_XP = 500000;
const MAX_SAFE_LEVEL = 100;
const MAX_SAFE_SURVIVAL_SEC = 86400;
const MAX_SAFE_SNAKE_LENGTH = 10000;
const MAX_SAFE_SCORE = 50000000;
const MAX_SAFE_GENERIC_STAT = 10000000;
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'normal', 'hard']);

function normalizeDifficulty(diff) {
  if (diff === 'normal' || diff === 'medium') return 'medium';
  if (diff === 'easy' || diff === 'hard') return diff;
  return 'medium';
}
const VALID_SKIN_IDS = new Set(SKINS.map(s => s.id));
const VALID_MISSION_IDS = new Set(MISSION_POOL.map(m => m.id));
const VALID_WEEKLY_MISSION_IDS = new Set(WEEKLY_MISSION_POOL.map(m => m.id));
const VALID_ELITE_MISSION_IDS = new Set(ELITE_MISSION_POOL.map(m => m.id));
const VALID_ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS_LIST.map(a => a.id));
const VALID_TITLES = new Set([
  ...LEVEL_TITLES,
  ...ELITE_MISSION_POOL.map(m => m.bonusTitle).filter(Boolean),
  ...ACHIEVEMENTS_LIST.map(a => a.bonusTitle).filter(Boolean)
]);

let profileData = createDefaultProfile();
let currentSkinFilter = 'all';
let currentSkinCategory = 'all';
let currentSkinSearch = '';
let previewSkinId = 'classic';
let currentMissionTier = 'daily';
let currentAchCategory = 'all';
let trialSkinId = null;
let matchFoodEaten = 0;
let matchPowerupsCollected = 0;
let matchDashesUsed = 0;
let matchAbilitiesUsed = 0;
let matchCurrentKillStreak = 0;
let matchDangerZoneAccum = 0;
let matchCoinsEarned = 0;
let matchXpEarned = 0;
let matchScore = 0;
let matchReviveUsed = false;
let matchDoubleClaimed = false;
let matchReachedLen150 = false;
let matchPacifist3mAwarded = false;
let lastRecordedSurvivalSecond = 0;
let ingameQuestToastTimer = 0;


function sanitizeNonNegNumber(val, fallback = 0, max = MAX_SAFE_GENERIC_STAT) {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.min(max, num);
}

function sanitizeBoundedInt(val, min, max, fallback = min) {
  const num = Number(val);
  if (!Number.isFinite(num) || num < min) return fallback;
  return Math.min(max, Math.round(num));
}

function isPlainObject(obj) {
  return Boolean(obj && typeof obj === 'object' && !Array.isArray(obj));
}

function countCompletedAchievements(statsObj) {
  if (!statsObj) return 0;
  let count = 0;
  for (let i = 0; i < ACHIEVEMENTS_LIST.length; i++) {
    const a = ACHIEVEMENTS_LIST[i];
    if ((statsObj[a.stat] || 0) >= a.target) count++;
  }
  return count;
}

function syncDerivedProfileStats() {
  if (!profileData || !profileData.stats) return;
  profileData.stats.skinsUnlockedCount = unlockedSkinIds.size;
  profileData.stats.playerLevel = sanitizeBoundedInt(profileData.level, 1, MAX_SAFE_LEVEL, 1);
  profileData.stats.bestSurvivalTime = Math.min(MAX_SAFE_SURVIVAL_SEC, Math.max(sanitizeNonNegNumber(profileData.stats.bestSurvivalTime, 0, MAX_SAFE_SURVIVAL_SEC), getOverallBestTime()));
  profileData.stats.highestLength = Math.min(MAX_SAFE_SNAKE_LENGTH, Math.max(sanitizeBoundedInt(profileData.stats.highestLength, INITIAL_SEGMENTS, MAX_SAFE_SNAKE_LENGTH, INITIAL_SEGMENTS), getOverallBestLength()));
  profileData.stats.hardSurvivalTime = Math.min(MAX_SAFE_SURVIVAL_SEC, Math.max(sanitizeNonNegNumber(profileData.stats.hardSurvivalTime, 0, MAX_SAFE_SURVIVAL_SEC), getBestTime('hard')));
  profileData.stats._cachedAchDone = countCompletedAchievements(profileData.stats);
}

function migrateAndSanitizeProfile(parsed, def) {
  if (!isPlainObject(parsed)) return def;
  const rawSettings = isPlainObject(parsed.settings) ? parsed.settings : {};
  const rawStats = isPlainObject(parsed.stats) ? parsed.stats : {};
  const rawDailyReward = isPlainObject(parsed.dailyReward) ? parsed.dailyReward : {};
  const rawDailyMissions = isPlainObject(parsed.dailyMissions) ? parsed.dailyMissions : {};
  const rawWeeklyMissions = isPlainObject(parsed.weeklyMissions) ? parsed.weeklyMissions : {};
  const rawEliteClaimed = isPlainObject(parsed.eliteMissionsClaimed) ? parsed.eliteMissionsClaimed : {};
  const rawAchClaimed = isPlainObject(parsed.achievementsClaimed) ? parsed.achievementsClaimed : {};
  const rawAds = isPlainObject(parsed.ads) ? parsed.ads : {};

  // Schema v1 / v2 migration support (known skin IDs only)
  if (Array.isArray(parsed.unlockedSkins)) {
    for (const skinId of parsed.unlockedSkins) {
      if (typeof skinId === 'string' && VALID_SKIN_IDS.has(skinId)) unlockedSkinIds.add(skinId);
    }
    persistUnlockedSkins();
  }

  // Strictly validate only known stat keys and clamp each to its domain cap
  const cleanStats = { ...def.stats };
  const timeStatKeys = new Set(['bestSurvivalTime', 'hardSurvivalTime', 'noAbilitySurvivalTime', 'dangerZoneTime']);
  for (const key of Object.keys(def.stats)) {
    const cap = key === 'bestScore'
      ? MAX_SAFE_SCORE
      : key === 'highestLength'
        ? MAX_SAFE_SNAKE_LENGTH
        : timeStatKeys.has(key)
          ? MAX_SAFE_SURVIVAL_SEC
          : MAX_SAFE_GENERIC_STAT;
    cleanStats[key] = sanitizeBoundedInt(rawStats[key], 0, cap, def.stats[key]);
  }
  if (parsed.highScore !== undefined) {
    cleanStats.bestScore = Math.max(cleanStats.bestScore, sanitizeBoundedInt(parsed.highScore, 0, MAX_SAFE_SCORE, 0));
  }
  cleanStats.highestLength = Math.max(INITIAL_SEGMENTS, Math.min(MAX_SAFE_SNAKE_LENGTH, cleanStats.highestLength));

  const sanitizeMissionItems = (items, pool, validIdSet, maxCount) => {
    if (!Array.isArray(items)) return [];
    const valid = [];
    const seen = new Set();
    for (const it of items) {
      if (valid.length >= maxCount) break;
      if (!isPlainObject(it) || typeof it.id !== 'string') continue;
      if (!validIdSet.has(it.id) || seen.has(it.id)) continue;
      const defItem = pool.find(m => m.id === it.id);
      if (!defItem) continue;
      seen.add(it.id);
      valid.push({
        id: it.id,
        progress: sanitizeBoundedInt(it.progress, 0, defItem.target, 0),
        claimed: Boolean(it.claimed)
      });
    }
    return valid;
  };

  const cleanTitles = Array.isArray(parsed.unlockedTitles)
    ? [...new Set(parsed.unlockedTitles.filter(t => typeof t === 'string' && VALID_TITLES.has(t)))]
    : [...def.unlockedTitles];
  if (!cleanTitles.includes('Starter Serpent')) cleanTitles.unshift('Starter Serpent');

  const cleanEliteClaimed = {};
  for (const [k, v] of Object.entries(rawEliteClaimed)) {
    if (typeof k === 'string' && VALID_ELITE_MISSION_IDS.has(k) && Boolean(v)) {
      cleanEliteClaimed[k] = true;
    }
  }
  const cleanAchClaimed = {};
  for (const [k, v] of Object.entries(rawAchClaimed)) {
    if (typeof k === 'string' && VALID_ACHIEVEMENT_IDS.has(k) && Boolean(v)) {
      cleanAchClaimed[k] = true;
    }
  }

  const validDateKey = typeof rawDailyMissions.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDailyMissions.dateKey)
    ? rawDailyMissions.dateKey
    : '';
  const validWeekKey = typeof rawWeeklyMissions.weekKey === 'string' && /^\d{4}-W\d{1,2}$/.test(rawWeeklyMissions.weekKey)
    ? rawWeeklyMissions.weekKey
    : '';
  const validLastClaimDate = typeof rawDailyReward.lastClaimDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDailyReward.lastClaimDate)
    ? rawDailyReward.lastClaimDate
    : '';
  const validConsentStatuses = ['UNKNOWN', 'REQUIRED', 'NOT_REQUIRED', 'OBTAINED'];

  return {
    version: SAVE_SCHEMA_VERSION,
    coins: sanitizeBoundedInt(parsed.coins, 0, MAX_SAFE_COINS, def.coins),
    xp: sanitizeBoundedInt(parsed.xp, 0, MAX_SAFE_XP, 0),
    level: sanitizeBoundedInt(parsed.level, 1, MAX_SAFE_LEVEL, 1),
    removeForcedAds: Boolean(parsed.removeForcedAds),
    unlockedTitles: cleanTitles,
    selectedTitle: typeof parsed.selectedTitle === 'string' && cleanTitles.includes(parsed.selectedTitle) ? parsed.selectedTitle : '',
    settings: {
      sound: rawSettings.sound !== undefined ? Boolean(rawSettings.sound) : def.settings.sound,
      music: rawSettings.music !== undefined ? Boolean(rawSettings.music) : def.settings.music,
      volume: sanitizeBoundedInt(rawSettings.volume, 0, 100, def.settings.volume),
      vibration: rawSettings.vibration !== undefined ? Boolean(rawSettings.vibration) : def.settings.vibration,
      controlStyle: rawSettings.controlStyle === 'swipe' ? 'swipe' : 'joystick',
      joystickSensitivity: sanitizeBoundedInt(rawSettings.joystickSensitivity, 50, 160, 100),
      joystickSize: ['small', 'medium', 'large'].includes(rawSettings.joystickSize) ? rawSettings.joystickSize : 'medium',
      leftHanded: Boolean(rawSettings.leftHanded)
    },
    stats: cleanStats,
    dailyReward: {
      streakDay: sanitizeBoundedInt(rawDailyReward.streakDay, 1, 7, 1),
      lastClaimDate: validLastClaimDate,
      totalClaims: sanitizeBoundedInt(rawDailyReward.totalClaims, 0, 10000, 0)
    },
    dailyMissions: {
      dateKey: validDateKey,
      items: sanitizeMissionItems(rawDailyMissions.items, MISSION_POOL, VALID_MISSION_IDS, 4)
    },
    weeklyMissions: {
      weekKey: validWeekKey,
      items: sanitizeMissionItems(rawWeeklyMissions.items, WEEKLY_MISSION_POOL, VALID_WEEKLY_MISSION_IDS, 5)
    },
    eliteMissionsClaimed: cleanEliteClaimed,
    achievementsClaimed: cleanAchClaimed,
    ads: {
      matchesSinceInterstitial: sanitizeBoundedInt(rawAds.matchesSinceInterstitial, 0, 1000, 0),
      lastInterstitialAt: sanitizeBoundedInt(rawAds.lastInterstitialAt, 0, Date.now() + 60000, 0),
      consentStatus: validConsentStatuses.includes(rawAds.consentStatus) ? rawAds.consentStatus : 'UNKNOWN',
      personalizedAds: rawAds.personalizedAds === true,
      consentUpdatedAt: sanitizeBoundedInt(rawAds.consentUpdatedAt, 0, Date.now() + 60000, 0)
    }
  };
}

function loadProfileData() {
  cachedBestTimes.easy = cachedBestTimes.normal = cachedBestTimes.hard = null;
  cachedBestLengths.easy = cachedBestLengths.normal = cachedBestLengths.hard = null;
  try {
    const raw = safeStorageGet(SAVE_STORAGE_KEY) || safeStorageGet('serpentRun_save_v1') || safeStorageGet('serpentRun_save');
    const def = createDefaultProfile();
    if (!raw) {
      profileData = def;
      syncDerivedProfileStats();
      ensureDailyMissionsForToday();
      ensureWeeklyMissionsForWeek();
      saveProfileData();
      return;
    }
    const parsed = JSON.parse(raw);
    profileData = migrateAndSanitizeProfile(parsed, def);
  } catch (_) {
    profileData = createDefaultProfile();
  }
  syncDerivedProfileStats();
  isMuted = !profileData.settings.sound;
  isMusicMuted = !profileData.settings.music;
  masterVolume = Math.max(0, Math.min(1, (profileData.settings.volume ?? 80) / 100));
  if (!unlockedSkinIds.has(selectedSkinId)) selectedSkinId = 'classic';
  previewSkinId = selectedSkinId || 'classic';
  applyControlSettingsToDOM();
  ensureDailyMissionsForToday();
  ensureWeeklyMissionsForWeek();
  saveProfileData();
}

function saveProfileData() {
  if (!profileData) return;
  syncDerivedProfileStats();
  profileData.settings.sound = !isMuted;
  profileData.settings.music = !isMusicMuted;
  profileData.settings.volume = Math.round(masterVolume * 100);
  safeStorageSet(SAVE_STORAGE_KEY, JSON.stringify(profileData));
}

function showIngameQuestToast(badgeText, titleText) {
  const toast = document.getElementById('ingame-quest-toast');
  const badgeEl = document.getElementById('qt-badge');
  const textEl = document.getElementById('qt-text');
  if (!toast || !badgeEl || !textEl) return;
  badgeEl.textContent = badgeText;
  textEl.textContent = titleText;
  toast.style.display = 'inline-flex';
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(ingameQuestToastTimer);
  ingameQuestToastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.style.display = 'none'; }, 240);
  }, 3000);
}

// Skippable Animated Reward Reveal Modal with Particle Burst
let rewardParticles = [];
let rewardParticleAnimId = 0;

function showRewardRevealModal({ icon = '🏆', typeLabel = 'REWARD UNLOCKED', title = 'Congratulations!', subtitle = '', items = [], accentColor = '#FFB020' }) {
  // Never interrupt active unpaused gameplay
  if (isGameRunning && !isPaused && !isGameOver) {
    showIngameQuestToast(typeLabel, `${title} ${items.join(' • ')}`);
    return;
  }
  const modal = document.getElementById('reward-reveal-modal');
  const card = document.getElementById('reward-reveal-card');
  const iconEl = document.getElementById('reward-reveal-icon');
  const typeEl = document.getElementById('reward-reveal-type');
  const titleEl = document.getElementById('reward-reveal-title');
  const subEl = document.getElementById('reward-reveal-sub');
  const itemsEl = document.getElementById('reward-items-row');
  if (!modal || !iconEl || !typeEl || !titleEl || !subEl || !itemsEl) return;

  iconEl.textContent = icon;
  typeEl.textContent = typeLabel;
  typeEl.style.color = accentColor;
  if (card) card.style.borderColor = accentColor;
  titleEl.textContent = title;
  subEl.textContent = subtitle;
  itemsEl.innerHTML = items.map(it => `<span class="reward-pill-item">${it}</span>`).join('');
  modal.style.display = 'flex';
  sfxReward();
  triggerHaptic(32);
  startRewardParticles(accentColor);
}

function closeRewardRevealModal() {
  const modal = document.getElementById('reward-reveal-modal');
  if (modal) modal.style.display = 'none';
  if (rewardParticleAnimId) {
    cancelAnimationFrame(rewardParticleAnimId);
    rewardParticleAnimId = 0;
  }
}

function startRewardParticles(accentColor = '#FFB020') {
  const pCanvas = document.getElementById('reward-particle-canvas');
  if (!pCanvas) return;
  pCanvas.width = window.innerWidth;
  pCanvas.height = window.innerHeight;
  const pCtx = pCanvas.getContext('2d');
  const cx = pCanvas.width / 2;
  const cy = pCanvas.height / 2;
  const palette = [accentColor, '#00F5A0', '#00D9FF', '#A855F7', '#FF477E', '#FFB020', '#FFFFFF'];
  rewardParticles = [];
  const count = graphicsQuality === 'low' ? 28 : 56;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
    const speed = 3 + Math.random() * 8;
    rewardParticles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      size: 3 + Math.random() * 4.5,
      color: palette[i % palette.length],
      alpha: 1,
      decay: 0.014 + Math.random() * 0.012
    });
  }
  if (rewardParticleAnimId) cancelAnimationFrame(rewardParticleAnimId);
  const step = () => {
    const modal = document.getElementById('reward-reveal-modal');
    if (!modal || modal.style.display === 'none') {
      rewardParticleAnimId = 0;
      return;
    }
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    let alive = 0;
    for (const p of rewardParticles) {
      if (p.alpha <= 0) continue;
      alive++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.14;
      p.vx *= 0.98;
      p.alpha = Math.max(0, p.alpha - p.decay);
      pCtx.globalAlpha = p.alpha;
      pCtx.fillStyle = p.color;
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      pCtx.fill();
    }
    pCtx.globalAlpha = 1;
    if (alive > 0) rewardParticleAnimId = requestAnimationFrame(step);
    else rewardParticleAnimId = 0;
  };
  rewardParticleAnimId = requestAnimationFrame(step);
}

function addCoins(amount, trackMission = true) {
  const clean = sanitizeBoundedInt(amount, 0, MAX_SAFE_COINS, 0);
  if (clean <= 0) return;
  profileData.coins = Math.min(MAX_SAFE_COINS, Math.max(0, profileData.coins + clean));
  profileData.stats.totalCoinsEarned = Math.min(MAX_SAFE_GENERIC_STAT, (profileData.stats.totalCoinsEarned || 0) + clean);
  if (trackMission) recordMissionProgress('coins_earned', clean);
  saveProfileData();
  refreshMenuHeaderUI();
}

function addXp(amount) {
  const clean = sanitizeBoundedInt(amount, 0, MAX_SAFE_XP, 0);
  if (clean <= 0) return;
  profileData.xp = Math.min(MAX_SAFE_XP, profileData.xp + clean);
  let leveledUp = false;
  let totalBonusCoins = 0;
  const unlockedMilestoneNames = [];
  while (profileData.level < MAX_SAFE_LEVEL && profileData.xp >= getXpRequiredForLevel(profileData.level)) {
    profileData.xp -= getXpRequiredForLevel(profileData.level);
    profileData.level = Math.min(MAX_SAFE_LEVEL, profileData.level + 1);
    leveledUp = true;
    const levelBonusCoins = 60 + profileData.level * 20;
    totalBonusCoins += levelBonusCoins;
    profileData.coins = Math.min(MAX_SAFE_COINS, profileData.coins + levelBonusCoins);
    // Milestone skin unlocks at levels 5, 10, 12, 15, 20
    const milestones = { 5: 'viper', 10: 'rattlesnake', 12: 'neon_overlord', 15: 'cosmic', 20: 'aurora' };
    const mSkinId = milestones[profileData.level];
    if (mSkinId && !unlockedSkinIds.has(mSkinId)) {
      unlockedSkinIds.add(mSkinId);
      const sk = SKINS.find(s => s.id === mSkinId);
      if (sk) unlockedMilestoneNames.push(sk.name);
    }
    persistUnlockedSkins();
  }
  if (profileData.level >= MAX_SAFE_LEVEL) {
    profileData.xp = Math.min(profileData.xp, getXpRequiredForLevel(MAX_SAFE_LEVEL));
  }
  if (leveledUp) {
    sfxReward();
    const rewardItems = [`+${totalBonusCoins} Coins`];
    for (const n of unlockedMilestoneNames) rewardItems.push(`🐍 ${n}`);
    showRewardRevealModal({
      icon: '⚡',
      typeLabel: 'LEVEL UP!',
      title: `Reached Level ${profileData.level}`,
      subtitle: LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((profileData.level - 1) / 2))],
      items: rewardItems,
      accentColor: '#A855F7'
    });
  }
  saveProfileData();
  refreshMenuHeaderUI();
}

function showGlobalToast(message) {
  if (!skinUnlockToastEl) return;
  skinUnlockToastEl.textContent = message;
  skinUnlockToastEl.style.display = 'block';
  clearTimeout(skinUnlockToastTimer);
  skinUnlockToastTimer = setTimeout(() => { skinUnlockToastEl.style.display = 'none'; }, 3400);
}

function ensureDailyMissionsForToday() {
  const today = getLocalDateKey();
  if (profileData.dailyMissions && profileData.dailyMissions.dateKey === today && Array.isArray(profileData.dailyMissions.items) && profileData.dailyMissions.items.length === 4) {
    return;
  }
  let hash = 0;
  for (let i = 0; i < today.length; i++) hash = (hash * 31 + today.charCodeAt(i)) >>> 0;
  const chosen = [];
  const poolCopy = [...MISSION_POOL];
  for (let i = 0; i < 4 && poolCopy.length > 0; i++) {
    const idx = (hash + i * 7) % poolCopy.length;
    const m = poolCopy.splice(idx, 1)[0];
    chosen.push({ id: m.id, progress: 0, claimed: false });
  }
  profileData.dailyMissions = { dateKey: today, items: chosen };
  saveProfileData();
}

function ensureWeeklyMissionsForWeek() {
  const weekKey = getLocalWeekKey();
  if (profileData.weeklyMissions && profileData.weeklyMissions.weekKey === weekKey && Array.isArray(profileData.weeklyMissions.items) && profileData.weeklyMissions.items.length === 5) {
    return;
  }
  let hash = 0;
  for (let i = 0; i < weekKey.length; i++) hash = (hash * 37 + weekKey.charCodeAt(i)) >>> 0;
  const chosen = [];
  const poolCopy = [...WEEKLY_MISSION_POOL];
  for (let i = 0; i < 5 && poolCopy.length > 0; i++) {
    const idx = (hash + i * 5) % poolCopy.length;
    const m = poolCopy.splice(idx, 1)[0];
    chosen.push({ id: m.id, progress: 0, claimed: false });
  }
  profileData.weeklyMissions = { weekKey, items: chosen };
  saveProfileData();
}

let saveProfileDirty = false;
let lastIngameSaveAt = 0;

function flushDeferredProfileSave(force = false) {
  if (!saveProfileDirty) return;
  const now = performance.now();
  if (force || !isGameRunning || isPaused || isGameOver || now - lastIngameSaveAt >= 3000) {
    saveProfileDirty = false;
    lastIngameSaveAt = now;
    saveProfileData();
  }
}

function recordMissionProgress(type, value, isAbsoluteMax = false) {
  let updated = false;

  const updateList = (items, pool, badgeLabel) => {
    if (!items) return;
    for (const item of items) {
      if (item.claimed) continue;
      const def = pool.find(m => m.id === item.id);
      if (!def || def.type !== type) continue;
      const prev = item.progress || 0;
      if (prev >= def.target) continue;
      item.progress = isAbsoluteMax ? Math.min(def.target, Math.max(prev, value)) : Math.min(def.target, prev + value);
      if (item.progress !== prev) {
        updated = true;
        if (item.progress >= def.target && prev < def.target) {
          showIngameQuestToast(badgeLabel, `${def.title} Ready to Claim!`);
        }
      }
    }
  };

  updateList(profileData.dailyMissions && profileData.dailyMissions.items, MISSION_POOL, 'DAILY MISSION');
  updateList(profileData.weeklyMissions && profileData.weeklyMissions.items, WEEKLY_MISSION_POOL, 'WEEKLY MISSION');

  if (updated) {
    if (isGameRunning && !isPaused && !isGameOver) {
      saveProfileDirty = true;
      flushDeferredProfileSave(false);
    } else {
      saveProfileData();
      refreshNavBadges();
    }
  }
}

function claimMissionReward(missionId, tier = 'daily') {
  ensureDailyMissionsForToday();
  ensureWeeklyMissionsForWeek();

  if (tier === 'elite') {
    const def = ELITE_MISSION_POOL.find(m => m.id === missionId);
    if (!def || profileData.eliteMissionsClaimed[missionId]) return;
    const curVal = profileData.stats[def.stat] || 0;
    if (curVal < def.target) return;
    profileData.eliteMissionsClaimed[missionId] = true;
    profileData.stats.eliteMissionsCompleted = (profileData.stats.eliteMissionsCompleted || 0) + 1;
    addCoins(def.rewardCoins, false);
    addXp(def.rewardXp);
    const items = [`+${def.rewardCoins} Coins`, `+${def.rewardXp} XP`];
    if (def.bonusSkinId && !unlockedSkinIds.has(def.bonusSkinId)) {
      unlockedSkinIds.add(def.bonusSkinId);
      persistUnlockedSkins();
      const sk = SKINS.find(s => s.id === def.bonusSkinId);
      if (sk) items.push(`🐍 ${sk.name}`);
    }
    if (def.bonusTitle) {
      if (!profileData.unlockedTitles.includes(def.bonusTitle)) profileData.unlockedTitles.push(def.bonusTitle);
      profileData.selectedTitle = def.bonusTitle;
      items.push(`👑 Title: ${def.bonusTitle}`);
    }
    saveProfileData();
    renderMissionsScreen();
    refreshNavBadges();
    showRewardRevealModal({
      icon: '👑',
      typeLabel: 'ELITE CHALLENGE CONQUERED',
      title: def.title,
      subtitle: def.desc,
      items,
      accentColor: '#FF477E'
    });
    return;
  }

  const isWeekly = tier === 'weekly';
  const list = isWeekly ? profileData.weeklyMissions.items : profileData.dailyMissions.items;
  const pool = isWeekly ? WEEKLY_MISSION_POOL : MISSION_POOL;
  const item = list.find(m => m.id === missionId);
  const def = pool.find(m => m.id === missionId);
  if (!item || !def || item.claimed || item.progress < def.target) return;
  item.claimed = true;
  if (isWeekly) {
    profileData.stats.weeklyMissionsCompleted = (profileData.stats.weeklyMissionsCompleted || 0) + 1;
  } else {
    profileData.stats.dailyMissionsCompleted = (profileData.stats.dailyMissionsCompleted || 0) + 1;
    recordMissionProgress('dailies_claimed', 1);
  }
  addCoins(def.rewardCoins, false);
  addXp(def.rewardXp);
  checkSkinUnlocks();
  saveProfileData();
  renderMissionsScreen();
  refreshNavBadges();
  showRewardRevealModal({
    icon: isWeekly ? '📆' : '⚡',
    typeLabel: isWeekly ? 'WEEKLY MISSION COMPLETE' : 'DAILY MISSION COMPLETE',
    title: def.title,
    subtitle: def.desc,
    items: [`+${def.rewardCoins} Coins`, `+${def.rewardXp} XP`],
    accentColor: isWeekly ? '#A855F7' : '#00D9FF'
  });
}

function canClaimDailyRewardToday() {
  return profileData.dailyReward.lastClaimDate !== getLocalDateKey();
}

function claimDailyLoginReward() {
  if (!canClaimDailyRewardToday()) return;
  const dayIdx = ((profileData.dailyReward.streakDay - 1) % 7);
  const reward = DAILY_REWARDS_CYCLE[dayIdx];
  profileData.dailyReward.lastClaimDate = getLocalDateKey();
  profileData.dailyReward.streakDay = (dayIdx + 1) % 7 + 1;
  profileData.dailyReward.totalClaims = (profileData.dailyReward.totalClaims || 0) + 1;

  const items = [];
  if (reward.type === 'coins') {
    addCoins(reward.amount);
    items.push(`+${reward.amount} Coins`);
  } else if (reward.type === 'xp') {
    addXp(reward.amount);
    items.push(`+${reward.amount} XP`);
  } else if (reward.type === 'skin_or_coins') {
    if (!unlockedSkinIds.has(reward.skinId)) {
      unlockedSkinIds.add(reward.skinId);
      persistUnlockedSkins();
      items.push(`🐍 ${reward.title}`);
    } else {
      addCoins(reward.fallbackCoins);
      items.push(`+${reward.fallbackCoins} Coins`);
    }
  }
  saveProfileData();
  renderDailyRewardsScreen();
  refreshNavBadges();
  showRewardRevealModal({
    icon: '🎁',
    typeLabel: `DAY ${reward.day} LOGIN REWARD`,
    title: reward.title,
    subtitle: reward.sub,
    items,
    accentColor: '#FFB020'
  });
}

function claimAchievement(achId) {
  syncDerivedProfileStats();
  const def = ACHIEVEMENTS_LIST.find(a => a.id === achId);
  if (!def || profileData.achievementsClaimed[achId]) return;
  const curVal = profileData.stats[def.stat] || 0;
  if (curVal < def.target) return;
  profileData.achievementsClaimed[achId] = true;
  addCoins(def.rewardCoins, false);
  addXp(def.rewardXp);
  const items = [`+${def.rewardCoins} Coins`, `+${def.rewardXp} XP`];
  if (def.bonusSkinId && !unlockedSkinIds.has(def.bonusSkinId)) {
    unlockedSkinIds.add(def.bonusSkinId);
    persistUnlockedSkins();
    const sk = SKINS.find(s => s.id === def.bonusSkinId);
    if (sk) items.push(`🐍 ${sk.name}`);
  }
  if (def.bonusTitle) {
    if (!profileData.unlockedTitles.includes(def.bonusTitle)) profileData.unlockedTitles.push(def.bonusTitle);
    profileData.selectedTitle = def.bonusTitle;
    items.push(`👑 Title: ${def.bonusTitle}`);
  }
  checkSkinUnlocks();
  saveProfileData();
  renderAchievementsScreen();
  refreshNavBadges();
  showRewardRevealModal({
    icon: def.icon || '🏆',
    typeLabel: `${(def.rarity || 'bronze').toUpperCase()} ACHIEVEMENT`,
    title: def.title,
    subtitle: def.desc,
    items,
    accentColor: def.rarity === 'mythic' ? '#FF477E' : def.rarity === 'diamond' ? '#00D9FF' : '#FFB020'
  });
}

// ============================================================
// §3.6  MODULAR GOOGLE ADMOB & BILLING MANAGER
// ============================================================
const AD_CONSENT_STORAGE_KEY = 'serpentRun_adConsent_v1';

const CrazyGamesBridge = {
  initialized: false,
  active: false,
  environment: 'disabled',
  gameplayActive: false,
  loadingStopped: false,
  getSDK() {
    return (typeof window !== 'undefined' && window.CrazyGames && window.CrazyGames.SDK) ? window.CrazyGames.SDK : null;
  },
  isActive() {
    return this.active && this.environment !== 'disabled';
  },
  async init() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
        return;
      }
    } catch (_) {}
    const sdk = this.getSDK();
    if (!sdk || typeof sdk.init !== 'function') return;
    try {
      await sdk.init();
      this.environment = sdk.environment || 'disabled';
      this.active = this.environment !== 'disabled';
      if (this.isActive() && sdk.game) {
        if (typeof sdk.game.loadingStart === 'function' && !this.loadingStopped) {
          try { sdk.game.loadingStart(); } catch (_) {}
        }
        if (sdk.game.settings && sdk.game.settings.muteAudio) {
          isMuted = true;
          if (muteBtnEl) muteBtnEl.textContent = '🔇';
          applyAmbientAudioGain();
        }
        if (typeof sdk.game.addSettingsChangeListener === 'function') {
          sdk.game.addSettingsChangeListener((newSettings) => {
            if (newSettings && typeof newSettings.muteAudio === 'boolean') {
              isMuted = newSettings.muteAudio;
              if (muteBtnEl) muteBtnEl.textContent = isMuted ? '🔇' : '🔊';
              applyAmbientAudioGain();
              updateSettingsUI();
            }
          });
        }
      }
    } catch (_) {
      this.active = false;
      this.environment = 'disabled';
    }
  },
  loadingStop() {
    if (this.loadingStopped) return;
    this.loadingStopped = true;
    const sdk = this.getSDK();
    if (this.isActive() && sdk && sdk.game && typeof sdk.game.loadingStop === 'function') {
      try { sdk.game.loadingStop(); } catch (_) {}
    }
  },
  gameplayStart() {
    if (this.gameplayActive) return;
    this.gameplayActive = true;
    const sdk = this.getSDK();
    if (this.isActive() && sdk && sdk.game && typeof sdk.game.gameplayStart === 'function') {
      try { sdk.game.gameplayStart(); } catch (_) {}
    }
  },
  gameplayStop() {
    if (!this.gameplayActive) return;
    this.gameplayActive = false;
    const sdk = this.getSDK();
    if (this.isActive() && sdk && sdk.game && typeof sdk.game.gameplayStop === 'function') {
      try { sdk.game.gameplayStop(); } catch (_) {}
    }
  },
  happytime() {
    const sdk = this.getSDK();
    if (this.isActive() && sdk && sdk.game && typeof sdk.game.happytime === 'function') {
      try { sdk.game.happytime(); } catch (_) {}
    }
  },
  requestAd(type, { onStarted, onFinished, onError } = {}) {
    const sdk = this.getSDK();
    if (!this.isActive() || !sdk || !sdk.ad || typeof sdk.ad.requestAd !== 'function') {
      if (onError) onError(new Error('CrazyGames SDK not active'));
      return false;
    }
    try {
      sdk.ad.requestAd(type, {
        adStarted: () => { if (onStarted) onStarted(); },
        adFinished: () => { if (onFinished) onFinished(); },
        adError: (err) => { if (onError) onError(err); }
      });
      return true;
    } catch (err) {
      if (onError) onError(err);
      return false;
    }
  }
};

const AdManager = {
  initialized: false,
  sdkReady: false,
  canRequestAds: false,
  nonPersonalizedAds: true,
  consentStatus: 'UNKNOWN',
  privacyOptionsRequired: false,
  adInProgress: false,
  bannerShown: false,
  bannerMountActive: false,
  audioWasMutedBeforeAd: false,
  getConfig() {
    return GAME_CONFIG.ADMOB || {
      environment: 'development',
      interstitialEveryMatches: 3,
      interstitialCooldownMs: 90000,
      rewardedBonusCoins: 75,
      testIds: {
        appId: 'ca-app-pub-3940256099942544~3347511713',
        banner: 'ca-app-pub-3940256099942544/6300978111',
        interstitial: 'ca-app-pub-3940256099942544/1033173712',
        rewarded: 'ca-app-pub-3940256099942544/5224354917'
      }
    };
  },
  getEnvironment() {
    try {
      if (window.SerpentBuildConfig && typeof window.SerpentBuildConfig.getBuildEnvironment === 'function') {
        return window.SerpentBuildConfig.getBuildEnvironment() === 'production' ? 'production' : 'development';
      }
      if (window.SerpentBuildConfig && typeof window.SerpentBuildConfig.isDebugBuild === 'function') {
        return window.SerpentBuildConfig.isDebugBuild() ? 'development' : 'production';
      }
      if (window.__SERPENT_BUILD_ENV__ === 'production') {
        return 'production';
      }
    } catch (_) {}
    const cfg = this.getConfig();
    return cfg.environment === 'production' ? 'production' : 'development';
  },
  isTestingMode() {
    return this.getEnvironment() !== 'production';
  },
  isValidAdUnitId(id) {
    return typeof id === 'string' && /^ca-app-pub-\d{16}\/\d{10}$/.test(id);
  },
  getActiveUnitId(kind) {
    const cfg = this.getConfig();
    const isProd = this.getEnvironment() === 'production';
    const prodCandidate = cfg.productionIds && cfg.productionIds[kind];
    if (isProd) {
      return this.isValidAdUnitId(prodCandidate) ? prodCandidate : '';
    }
    return (cfg.testIds && cfg.testIds[kind]) || '';
  },
  loadSavedConsentState() {
    try {
      const raw = safeStorageGet(AD_CONSENT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isPlainObject(parsed)) {
          const validStatuses = ['UNKNOWN', 'REQUIRED', 'NOT_REQUIRED', 'OBTAINED'];
          this.consentStatus = validStatuses.includes(parsed.status) ? parsed.status : 'UNKNOWN';
          this.canRequestAds = Boolean(parsed.canRequestAds);
          this.nonPersonalizedAds = parsed.nonPersonalizedAds !== false;
          this.privacyOptionsRequired = Boolean(parsed.privacyOptionsRequired);
          return true;
        }
      }
    } catch (_) {}
    if (profileData && profileData.ads && profileData.ads.consentStatus && profileData.ads.consentStatus !== 'UNKNOWN') {
      this.consentStatus = profileData.ads.consentStatus;
      this.nonPersonalizedAds = !profileData.ads.personalizedAds;
      this.canRequestAds = true;
      return true;
    }
    return false;
  },
  saveConsentState(status, canRequest, npa, privacyOptionsReq) {
    const validStatuses = ['UNKNOWN', 'REQUIRED', 'NOT_REQUIRED', 'OBTAINED'];
    this.consentStatus = validStatuses.includes(status) ? status : 'UNKNOWN';
    this.canRequestAds = Boolean(canRequest);
    this.nonPersonalizedAds = Boolean(npa);
    this.privacyOptionsRequired = Boolean(privacyOptionsReq);
    const payload = {
      status: this.consentStatus,
      canRequestAds: this.canRequestAds,
      nonPersonalizedAds: this.nonPersonalizedAds,
      privacyOptionsRequired: this.privacyOptionsRequired,
      updatedAt: Date.now()
    };
    safeStorageSet(AD_CONSENT_STORAGE_KEY, JSON.stringify(payload));
    if (profileData && profileData.ads) {
      profileData.ads.consentStatus = this.consentStatus;
      profileData.ads.personalizedAds = !this.nonPersonalizedAds;
      profileData.ads.consentUpdatedAt = payload.updatedAt;
      saveProfileData();
    }
  },
  isNativeAndroidApp() {
    try {
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function') {
        return Boolean(window.Capacitor.isNativePlatform());
      }
      if (window.Capacitor && typeof window.Capacitor.getPlatform === 'function') {
        return window.Capacitor.getPlatform() === 'android' || window.Capacitor.getPlatform() === 'ios';
      }
    } catch (_) {}
    return false;
  },
  isWebAdsDisabled() {
    if (CrazyGamesBridge.isActive()) return false;
    return !this.isNativeAndroidApp() && (GAME_CONFIG.WEB_DISABLE_ADS !== false);
  },
  applyWebNoAdsUI() {
    const isWeb = !this.isNativeAndroidApp();
    if (!isWeb) return;
    // Hide Android/AdMob-only controls and external policy links on web & CrazyGames
    const menuRemoveAdsBtn = document.getElementById('menu-removeads-btn');
    if (menuRemoveAdsBtn) menuRemoveAdsBtn.style.display = 'none';
    const settingsRemoveAdsBtn = document.querySelector('#settings-screen button[data-action="open-screen"][data-arg="removeads"]');
    if (settingsRemoveAdsBtn && settingsRemoveAdsBtn.parentElement) {
      settingsRemoveAdsBtn.parentElement.style.display = 'none';
    }
    const privacyBtn = document.getElementById('privacy-options-btn');
    if (privacyBtn && privacyBtn.parentElement && privacyBtn.parentElement.parentElement) {
      privacyBtn.parentElement.parentElement.style.display = 'none';
    }
    const menuPrivacyLink = document.querySelector('#menu-screen .privacy-link');
    if (menuPrivacyLink) menuPrivacyLink.style.display = 'none';
    const adEnvWrap = document.getElementById('settings-ad-env-wrap');
    if (adEnvWrap) adEnvWrap.style.display = 'none';

    if (!this.isWebAdsDisabled()) return;

    const reviveBtn = document.getElementById('revive-watch-btn');
    if (reviveBtn) reviveBtn.textContent = '▶ Revive Snake';
    const reviveDesc = document.querySelector('#revive-modal p');
    if (reviveDesc) {
      const lenEl = document.getElementById('revive-len-preview');
      const lenVal = lenEl ? lenEl.textContent : '22';
      const boldEl = document.createElement('b');
      boldEl.id = 'revive-len-preview';
      boldEl.textContent = lenVal;
      reviveDesc.replaceChildren(
        document.createTextNode('Use your second chance to continue with '),
        boldEl,
        document.createTextNode(' length and 3 seconds of spawn shield.')
      );
    }
    const doubleCoinsBtn = document.getElementById('double-coins-btn');
    if (doubleCoinsBtn) doubleCoinsBtn.textContent = '▶ CLAIM 2x COINS';

    const bonusChestBtn = document.querySelector('#rewards-screen button[data-action="watch-bonus-coins"]');
    if (bonusChestBtn) {
      bonusChestBtn.textContent = '🎁 Claim Bonus (+75 Coins)';
      const descEl = bonusChestBtn.parentElement && bonusChestBtn.parentElement.querySelector('div > div:nth-child(2)');
      if (descEl) descEl.textContent = 'Claim a free bonus chest (+75 Coins & +40 XP) anytime.';
    }
  },
  getNativePlugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || window.AdMob || null;
  },
  suspendGameAudioForAd() {
    this.audioWasMutedBeforeAd = isMuted;
    if (ambientGain && audioCtx) {
      try { ambientGain.gain.setValueAtTime(0, audioCtx.currentTime); } catch (_) {}
    }
    const plugin = this.getNativePlugin();
    if (plugin && typeof plugin.setApplicationMuted === 'function') {
      try { plugin.setApplicationMuted({ muted: Boolean(isMuted) }); } catch (_) {}
    }
    if (plugin && typeof plugin.setApplicationVolume === 'function') {
      try {
        const roundedVol = Math.round(Math.max(0, Math.min(1, masterVolume)) * 10) / 10;
        plugin.setApplicationVolume({ volume: roundedVol });
      } catch (_) {}
    }
  },
  resumeGameAudioAfterAd() {
    applyAmbientAudioGain();
    lastLoopFrameTime = performance.now();
    fixedStepAccumulator = 0;
  },
  registerNativeListeners(plugin) {
    if (!plugin || typeof plugin.addListener !== 'function') return;
    try {
      plugin.addListener('onRewardedVideoAdShowed', () => { this.suspendGameAudioForAd(); });
      plugin.addListener('onRewardedVideoAdDismissed', () => { this.resumeGameAudioAfterAd(); });
      plugin.addListener('onRewardedVideoAdFailedToShow', () => { this.resumeGameAudioAfterAd(); });
      plugin.addListener('interstitialAdShowed', () => { this.suspendGameAudioForAd(); });
      plugin.addListener('interstitialAdDismissed', () => { this.resumeGameAudioAfterAd(); });
      plugin.addListener('interstitialAdFailedToShow', () => { this.resumeGameAudioAfterAd(); });
      plugin.addListener('bannerAdLoaded', () => {
        document.querySelectorAll('.banner-status-text').forEach(el => {
          el.textContent = this.isTestingMode() ? 'AdMob Native Test Banner Active' : 'AdMob Banner Active';
        });
      });
      plugin.addListener('bannerAdFailedToLoad', () => {
        this.bannerShown = false;
      });
    } catch (_) {}
  },
  async handleConsentFlow(plugin) {
    // Load any previously saved consent state first, but do not allow new personalized requests until UMP verifies
    this.loadSavedConsentState();
    this.canRequestAds = false;
    if (!plugin || typeof plugin.requestConsentInfo !== 'function') {
      // Non-native fallback: default to non-personalized ads only
      this.saveConsentState(this.consentStatus === 'OBTAINED' ? 'OBTAINED' : 'NOT_REQUIRED', true, this.nonPersonalizedAds, false);
      return;
    }
    try {
      const info = await plugin.requestConsentInfo({
        tagForUnderAgeOfConsent: false
      });
      let finalInfo = info || {};

      if (finalInfo.status === 'REQUIRED' && finalInfo.isConsentFormAvailable && typeof plugin.showConsentForm === 'function') {
        const formResult = await plugin.showConsentForm();
        if (formResult) finalInfo = { ...finalInfo, ...formResult };
      }

      const status = typeof finalInfo.status === 'string' ? finalInfo.status : 'UNKNOWN';
      const canReq = typeof finalInfo.canRequestAds === 'boolean'
        ? finalInfo.canRequestAds
        : (status === 'OBTAINED' || status === 'NOT_REQUIRED');
      const privReq = finalInfo.privacyOptionsRequirementStatus === 'REQUIRED';
      // Never request personalized ads unless consent status is OBTAINED or NOT_REQUIRED and user hasn't opted into NPA
      const userChoseNpa = profileData && profileData.ads && profileData.ads.personalizedAds === false && profileData.ads.consentUpdatedAt > 0;
      const npa = (status !== 'OBTAINED' && status !== 'NOT_REQUIRED') || Boolean(userChoseNpa);
      this.saveConsentState(status, canReq, npa, privReq);
    } catch (_) {
      // If UMP check fails (offline or no UMP form configured), fall back to non-personalized ads only (npa: true)
      this.saveConsentState('UNKNOWN', true, true, false);
    }
  },
  async openPrivacyOptions() {
    const plugin = this.getNativePlugin();
    if (plugin && typeof plugin.showPrivacyOptionsForm === 'function' && this.privacyOptionsRequired) {
      try {
        await plugin.showPrivacyOptionsForm();
        if (typeof plugin.requestConsentInfo === 'function') {
          const updated = await plugin.requestConsentInfo({ tagForUnderAgeOfConsent: false });
          if (updated) {
            const status = typeof updated.status === 'string' ? updated.status : this.consentStatus;
            const canReq = typeof updated.canRequestAds === 'boolean' ? updated.canRequestAds : true;
            const privReq = updated.privacyOptionsRequirementStatus === 'REQUIRED';
            const npa = status !== 'OBTAINED' && status !== 'NOT_REQUIRED';
            this.saveConsentState(status, canReq, npa, privReq);
          }
        }
        showGlobalToast('Ad consent preferences saved.');
        return;
      } catch (_) {}
    }

    const currentModeText = this.nonPersonalizedAds
      ? 'Non-Personalized Ads Only (NPA)'
      : 'Personalized Ads Enabled';
    showConfirmModal(
      'Ad Consent Preferences',
      `Current Setting: ${currentModeText}. Choose whether Google AdMob may serve personalized ads or strictly non-personalized contextual ads on this device. Your preference is saved locally.`,
      [
        {
          label: 'Use Non-Personalized Ads Only',
          primary: this.nonPersonalizedAds,
          onClick: () => {
            closeConfirmModal();
            this.saveConsentState('OBTAINED', true, true, this.privacyOptionsRequired);
            showGlobalToast('Saved: Non-Personalized Ads Only');
          }
        },
        {
          label: 'Allow Personalized Ads',
          primary: !this.nonPersonalizedAds,
          onClick: () => {
            closeConfirmModal();
            this.saveConsentState('OBTAINED', true, false, this.privacyOptionsRequired);
            showGlobalToast('Saved: Personalized Ads Enabled');
          }
        },
        { label: 'Close', primary: false, onClick: closeConfirmModal }
      ]
    );
  },
  async init() {
    if (this.initialized) return;
    this.initialized = true;
    await CrazyGamesBridge.init();
    if (!this.isNativeAndroidApp()) {
      this.applyWebNoAdsUI();
      updateSettingsUI();
      this.refreshBannerVisibility();
      if (this.isWebAdsDisabled() || CrazyGamesBridge.isActive()) {
        return;
      }
    }
    this.loadSavedConsentState();
    const plugin = this.getNativePlugin();
    if (plugin && typeof plugin.initialize === 'function') {
      this.registerNativeListeners(plugin);
      await this.handleConsentFlow(plugin);
      try {
        await plugin.initialize({
          initializeForTesting: this.isTestingMode(),
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
          maxAdContentRating: 'General'
        });
        this.sdkReady = true;
      } catch (_) {
        this.sdkReady = false;
      }
    } else {
      // Non-native browser environment: ensure consent state is initialized safely
      if (this.consentStatus === 'UNKNOWN') {
        this.saveConsentState('NOT_REQUIRED', true, true, false);
      } else {
        this.canRequestAds = true;
      }
    }
    updateSettingsUI();
    this.refreshBannerVisibility();
  },
  async syncNativeBannerForScreen(screenName) {
    const plugin = this.getNativePlugin();
    const removed = Boolean(profileData && profileData.removeForcedAds);
    const eligibleScreens = ['skins', 'missions', 'rewards'];
    const shouldShow = !removed && !isGameRunning && eligibleScreens.includes(screenName) && navigator.onLine && this.canRequestAds;

    if (!plugin || typeof plugin.showBanner !== 'function') return;

    if (!shouldShow) {
      if (this.bannerShown || this.bannerMountActive) {
        this.bannerShown = false;
        this.bannerMountActive = false;
        try { await plugin.hideBanner(); } catch (_) {}
        try { await plugin.removeBanner(); } catch (_) {}
      }
      return;
    }

    if (this.bannerShown) {
      try {
        await plugin.resumeBanner();
        return;
      } catch (_) {}
    }

    try {
      const unitId = this.getActiveUnitId('banner');
      if (!unitId) return;
      this.bannerMountActive = true;
      await plugin.showBanner({
        adId: unitId,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 0,
        isTesting: this.isTestingMode(),
        npa: Boolean(this.nonPersonalizedAds)
      });
      this.bannerShown = true;
    } catch (_) {
      this.bannerShown = false;
      this.bannerMountActive = false;
    }
  },
  async hideNativeBanner() {
    const plugin = this.getNativePlugin();
    if (!plugin) return;
    if (this.bannerShown || this.bannerMountActive) {
      this.bannerShown = false;
      this.bannerMountActive = false;
      try { await plugin.hideBanner(); } catch (_) {}
      try { await plugin.removeBanner(); } catch (_) {}
    }
  },
  refreshBannerVisibility() {
    const removed = Boolean(profileData && profileData.removeForcedAds);
    const isNative = this.isNativeAndroidApp() && Boolean(this.getNativePlugin());
    document.querySelectorAll('.ad-banner-slot').forEach(slot => {
      // On native Android, @capacitor-community/admob renders a real native AdView anchored at BOTTOM_CENTER;
      // keep space at the bottom so UI cards are never covered by the native banner.
      if (removed || this.isWebAdsDisabled() || !isNative) {
        slot.style.display = 'none';
      } else {
        slot.style.display = 'flex';
        slot.style.opacity = '0.01';
        slot.style.pointerEvents = 'none';
      }
    });
  },
  async showRewardedAd({ placement, onReward, onDismiss }) {
    // Rule 10: Never show or interrupt during active unpaused gameplay
    if (isGameRunning && !isPaused && !isGameOver) return;
    if (this.adInProgress) return;

    // CrazyGames SDK v3 rewarded ad execution
    if (CrazyGamesBridge.isActive()) {
      this.adInProgress = true;
      CrazyGamesBridge.gameplayStop();
      this.suspendGameAudioForAd();
      CrazyGamesBridge.requestAd('rewarded', {
        onStarted: () => {
          this.suspendGameAudioForAd();
        },
        onFinished: () => {
          this.adInProgress = false;
          this.resumeGameAudioAfterAd();
          if (onReward) onReward({ type: 'coins', amount: 1 });
        },
        onError: () => {
          this.adInProgress = false;
          this.resumeGameAudioAfterAd();
          if (onDismiss) onDismiss(false);
        }
      });
      return;
    }

    // Web / itch.io fallback: no ad modals, fake ads, or "Ad Unavailable" popups.
    // Grant the reward directly so revive, 2x coins, skin trials, and bonus chests remain playable.
    if (this.isWebAdsDisabled()) {
      this.adInProgress = false;
      if (onReward) onReward({ type: 'coins', amount: 1 });
      return;
    }

    if (!navigator.onLine) {
      showConfirmModal('No Internet Connection', 'Rewarded advertisements require an active internet connection. You can continue playing offline anytime!', [
        { label: 'Continue', primary: true, onClick: closeConfirmModal }
      ]);
      if (onDismiss) onDismiss(false);
      return;
    }

    this.adInProgress = true;
    const unitId = this.getActiveUnitId('rewarded');
    const plugin = this.getNativePlugin();
    const isNative = this.isNativeAndroidApp();

    // 1. REAL NATIVE ANDROID ADMOB EXECUTION
    // On Android devices, NEVER simulate ads—always use the real Google Mobile Ads SDK via @capacitor-community/admob.
    if (plugin && typeof plugin.prepareRewardVideoAd === 'function') {
      try {
        if (!this.sdkReady) {
          await this.init();
        }
        if (!this.canRequestAds || !unitId) {
          throw new Error('ADS_NOT_PERMITTED');
        }
        await plugin.prepareRewardVideoAd({
          adId: unitId,
          isTesting: this.isTestingMode(),
          npa: Boolean(this.nonPersonalizedAds)
        });
        this.suspendGameAudioForAd();
        // In @capacitor-community/admob v8.4.2, showRewardVideoAd() resolves ONLY inside OnUserEarnedRewardListener
        // and rejects with "REWARDED_AD_CANCELLED" if the user closes the video before earning the reward.
        const rewardItem = await plugin.showRewardVideoAd();
        this.resumeGameAudioAfterAd();
        this.adInProgress = false;
        if (rewardItem && (rewardItem.amount !== undefined || rewardItem.type !== undefined)) {
          if (onReward) onReward(rewardItem);
        } else if (onDismiss) {
          onDismiss(false);
        }
        return;
      } catch (err) {
        this.resumeGameAudioAfterAd();
        this.adInProgress = false;
        const errCode = (err && (err.code || err.message)) ? String(err.code || err.message) : '';
        const wasCancelled = errCode.includes('CANCELLED') || errCode.includes('dismissed before earning');
        if (!wasCancelled) {
          showConfirmModal(
            'Ad Not Ready',
            'A rewarded video could not be loaded right now. No problem—you can continue playing normally!',
            [{ label: 'Continue', primary: true, onClick: closeConfirmModal }]
          );
        }
        if (onDismiss) onDismiss(false);
        return;
      }
    }

    // If running on a native Android device OR in production mode without the native plugin bound, never fake or simulate ads.
    if (isNative || !this.isTestingMode()) {
      this.adInProgress = false;
      showConfirmModal(
        'Ad Unavailable',
        'Rewarded video is temporarily unavailable. You can continue playing normally.',
        [{ label: 'Continue', primary: true, onClick: closeConfirmModal }]
      );
      if (onDismiss) onDismiss(false);
      return;
    }

    // 2. Desktop Web Browser Development Test Preview (Only in non-native desktop browser during development)
    let secondsLeft = 3;
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const bodyEl = document.getElementById('confirm-modal-body');
    const actionsEl = document.getElementById('confirm-modal-actions');
    if (!modal || !titleEl || !bodyEl || !actionsEl) {
      this.adInProgress = false;
      return;
    }

    titleEl.textContent = `Web Dev Preview — Rewarded Ad`;
    bodyEl.innerHTML = `Placement: <b>${placement}</b><br><small style="color:var(--text-faint)">Environment: development (test mode)</small><br><br>On Android, this renders the real native Google AdMob video.<br>Reward callback fires in <b id="ad-sim-timer">${secondsLeft}s</b>...`;
    actionsEl.innerHTML = '';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'menu-secondary';
    cancelBtn.textContent = 'Dismiss Early (No Reward)';
    actionsEl.appendChild(cancelBtn);
    modal.style.display = 'flex';

    const interval = setInterval(() => {
      secondsLeft--;
      const timerEl = document.getElementById('ad-sim-timer');
      if (timerEl) timerEl.textContent = `${Math.max(0, secondsLeft)}s`;
      if (secondsLeft <= 0) {
        clearInterval(interval);
        bodyEl.innerHTML = `Placement: <b>${placement}</b><br><span style="color:var(--accent);font-weight:800;">✓ onUserEarnedReward Callback Verified!</span>`;
        actionsEl.innerHTML = '';
        const claimBtn = document.createElement('button');
        claimBtn.type = 'button';
        claimBtn.className = 'ad-watch-btn';
        claimBtn.textContent = 'Grant Reward & Close';
        claimBtn.onclick = () => {
          modal.style.display = 'none';
          this.adInProgress = false;
          if (onReward) onReward({ type: 'coins', amount: 1 });
        };
        actionsEl.appendChild(claimBtn);
      }
    }, 1000);

    cancelBtn.onclick = () => {
      clearInterval(interval);
      modal.style.display = 'none';
      this.adInProgress = false;
      if (onDismiss) onDismiss(false);
    };
  },
  async maybeShowInterstitialAfterMatch() {
    if (this.isWebAdsDisabled()) return;
    if (!profileData || profileData.removeForcedAds) return;
    // Never show during active gameplay or if another ad is active
    if ((isGameRunning && !isPaused && !isGameOver) || this.adInProgress) return;
    const cfg = this.getConfig();
    profileData.ads.matchesSinceInterstitial = (profileData.ads.matchesSinceInterstitial || 0) + 1;
    const now = Date.now();
    const cooldownOk = (now - (profileData.ads.lastInterstitialAt || 0)) >= (cfg.interstitialCooldownMs || 90000);
    const freqOk = profileData.ads.matchesSinceInterstitial >= (cfg.interstitialEveryMatches || 3);
    saveProfileData();

    if (!freqOk || !cooldownOk || !navigator.onLine) return;

    if (CrazyGamesBridge.isActive()) {
      this.adInProgress = true;
      profileData.ads.matchesSinceInterstitial = 0;
      profileData.ads.lastInterstitialAt = Date.now();
      saveProfileData();
      this.suspendGameAudioForAd();
      CrazyGamesBridge.requestAd('midgame', {
        onStarted: () => { this.suspendGameAudioForAd(); },
        onFinished: () => {
          this.adInProgress = false;
          this.resumeGameAudioAfterAd();
        },
        onError: () => {
          this.adInProgress = false;
          this.resumeGameAudioAfterAd();
        }
      });
      return;
    }

    if (!this.canRequestAds) return;

    const plugin = this.getNativePlugin();
    const unitId = this.getActiveUnitId('interstitial');
    if (plugin && typeof plugin.prepareInterstitial === 'function' && unitId) {
      try {
        if (!this.sdkReady) await this.init();
        if (!this.canRequestAds) return;
        await plugin.prepareInterstitial({
          adId: unitId,
          isTesting: this.isTestingMode(),
          npa: Boolean(this.nonPersonalizedAds)
        });
        // Re-verify player hasn't already started a new match while the interstitial was loading
        if (isGameRunning && !isPaused && !isGameOver) return;
        this.adInProgress = true;
        profileData.ads.matchesSinceInterstitial = 0;
        profileData.ads.lastInterstitialAt = Date.now();
        saveProfileData();
        this.suspendGameAudioForAd();
        await plugin.showInterstitial();
      } catch (_) {
        // Non-blocking: if interstitial fails to load or show, gameplay continues seamlessly
      } finally {
        this.adInProgress = false;
        this.resumeGameAudioAfterAd();
      }
    }
  }
};

// ============================================================
// §4  TOROIDAL WRAP & PERSISTENCE
// ============================================================

function wrap(val, max) {
  const m = val % max;
  return m < 0 ? m + max : m;
}

/** Robust shortest toroidal delta across seams (fast path when coordinates are in [0, size)) */
function toroidDelta(a, b, size) {
  let d = b - a;
  if (d > size * 0.5) {
    d -= size;
    if (d > size * 0.5) d = wrap(b, size) - wrap(a, size);
  } else if (d < -size * 0.5) {
    d += size;
    if (d < -size * 0.5) d = wrap(b, size) - wrap(a, size);
  }
  return d;
}

function toroidDistSq(x1, y1, x2, y2) {
  const dx = toroidDelta(x1, x2, WORLD_WIDTH);
  const dy = toroidDelta(y1, y2, WORLD_HEIGHT);
  return dx * dx + dy * dy;
}

function screenToWorld(screenX, screenY) {
  return {
    x: wrap(cameraX + (screenX - width / 2) / cameraZoom, WORLD_WIDTH),
    y: wrap(cameraY + (screenY - height / 2) / cameraZoom, WORLD_HEIGHT),
  };
}

function updateCamera() {
  cameraX = wrap(cameraX + toroidDelta(cameraX, player.x, WORLD_WIDTH) * CAMERA_LERP, WORLD_WIDTH);
  cameraY = wrap(cameraY + toroidDelta(cameraY, player.y, WORLD_HEIGHT) * CAMERA_LERP, WORLD_HEIGHT);
  const isMobViewport = width <= 768 || isMobileDevice;
  const mobilePortraitBoost = (isMobViewport && width < height) ? 1.30 : (isMobViewport ? 1.14 : 1.0);
  const baseZoom = Math.sqrt((width * height) / (REFERENCE_VIEW_WIDTH * REFERENCE_VIEW_HEIGHT)) * mobilePortraitBoost;
  const maxZoomOut = isMobViewport ? Math.min(0.18, CAMERA_ZOOM_OUT_MAX) : CAMERA_ZOOM_OUT_MAX;
  const growthZoomOut = Math.min(maxZoomOut, Math.max(0, (player.length - INITIAL_SEGMENTS) / 140 * maxZoomOut));
  const targetZoom = baseZoom / (1 + growthZoomOut);
  cameraZoom += (targetZoom - cameraZoom) * 0.08;
}

function cameraViewBounds(margin = 0) {
  const halfWidth = width / (2 * cameraZoom) + margin;
  const halfHeight = height / (2 * cameraZoom) + margin;
  cameraBounds.left = cameraX - halfWidth;
  cameraBounds.right = cameraX + halfWidth;
  cameraBounds.top = cameraY - halfHeight;
  cameraBounds.bottom = cameraY + halfHeight;
  return cameraBounds;
}

const cameraBounds = { left: 0, right: 0, top: 0, bottom: 0 };

function angleDifference(current, target) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function interpolateColor(hex1, hex2, factor) {
  const c1 = parseInt(hex1.slice(1), 16);
  const c2 = parseInt(hex2.slice(1), 16);

  const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
  const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;

  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));

  return `rgb(${r}, ${g}, ${b})`;
}

function mixRgb(a, b, amount) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * amount)}, ${Math.round(a[1] + (b[1] - a[1]) * amount)}, ${Math.round(a[2] + (b[2] - a[2]) * amount)})`;
}

function updateDayNightCycle(now = performance.now()) {
  const cycleProgress = ((now - cycleEpoch) % CYCLE_DURATION_MS) / CYCLE_DURATION_MS;
  const phasePosition = cycleProgress * CYCLE_PHASES.length;
  const phaseIndex = Math.floor(phasePosition);
  const from = CYCLE_PHASES[phaseIndex];
  const to = CYCLE_PHASES[(phaseIndex + 1) % CYCLE_PHASES.length];
  const linear = phasePosition - phaseIndex;
  const blend = linear * linear * (3 - 2 * linear);
  currentCycle.name = from.name;
  currentCycle.icon = from.icon;
  currentCycle.top = mixRgb(from.top, to.top, blend);
  currentCycle.mid = mixRgb(from.mid, to.mid, blend);
  currentCycle.bottom = mixRgb(from.bot, to.bot, blend);
  const rayR = Math.round(from.ray[0] + (to.ray[0] - from.ray[0]) * blend);
  const rayG = Math.round(from.ray[1] + (to.ray[1] - from.ray[1]) * blend);
  const rayB = Math.round(from.ray[2] + (to.ray[2] - from.ray[2]) * blend);
  const rayStrength = from.rays + (to.rays - from.rays) * blend;
  currentCycle.rayColor = `rgba(${rayR}, ${rayG}, ${rayB}, ${rayStrength.toFixed(3)})`;
  currentCycle.rayStrength = rayStrength;
  currentCycle.glow = from.glow + (to.glow - from.glow) * blend;
  currentCycle.plankton = from.plankton + (to.plankton - from.plankton) * blend;
  currentCycle.nightFactor = (from.name === 'Night' ? 1 : 0) + ((to.name === 'Night' ? 1 : 0) - (from.name === 'Night' ? 1 : 0)) * blend;
  currentCycle.progress = cycleProgress;

  if (cycleIconEl && cycleIconEl.textContent !== currentCycle.icon) cycleIconEl.textContent = currentCycle.icon;
  if (cycleNameEl && cycleNameEl.textContent !== currentCycle.name) cycleNameEl.textContent = currentCycle.name;
}

function initPlankton() {
  plankton.length = 0;
  for (let i = 0; i < 20; i++) {
    plankton.push({
      x: Math.random() * WORLD_WIDTH,
      y: Math.random() * WORLD_HEIGHT,
      size: 0.7 + Math.random() * 1.1,
      drift: 0.08 + Math.random() * 0.18,
      phase: Math.random() * Math.PI * 2,
      updateOffset: Math.floor(Math.random() * 4)
    });
  }
}

function updatePlankton() {
  if (graphicsQuality === 'low') return;
  const halfWidth = width / (2 * cameraZoom) + 100;
  const halfHeight = height / (2 * cameraZoom) + 100;
  for (const dot of plankton) {
    const far = Math.abs(toroidDelta(cameraX, dot.x, WORLD_WIDTH)) > halfWidth || Math.abs(toroidDelta(cameraY, dot.y, WORLD_HEIGHT)) > halfHeight;
    if (far && animFrame % 4 !== dot.updateOffset) continue;
    dot.y -= dot.drift * (far ? 4 : 1);
    if (dot.y < -4) {
      dot.y = wrap(dot.y, WORLD_HEIGHT);
      dot.x = wrap(dot.x, WORLD_WIDTH);
    }
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function getBestTime(diff) {
  const safeDiff = normalizeDifficulty(diff);
  if (cachedBestTimes[safeDiff] !== null && cachedBestTimes[safeDiff] !== undefined) return cachedBestTimes[safeDiff];
  const rawVal = safeStorageGet(`neonSerpents_bestTime_${safeDiff}`) ||
    (safeDiff === 'medium' ? safeStorageGet('neonSerpents_bestTime_normal') : null) || '0';
  const parsed = parseInt(rawVal, 10);
  const clean = Number.isFinite(parsed) && parsed >= 0 ? Math.min(MAX_SAFE_SURVIVAL_SEC, parsed) : 0;
  cachedBestTimes[safeDiff] = clean;
  if (safeDiff === 'medium') cachedBestTimes.normal = clean;
  return clean;
}

function getBestLength(diff) {
  const safeDiff = normalizeDifficulty(diff);
  if (cachedBestLengths[safeDiff] !== null && cachedBestLengths[safeDiff] !== undefined) return cachedBestLengths[safeDiff];
  const rawVal = safeStorageGet(`neonSerpents_bestLength_${safeDiff}`) ||
    (safeDiff === 'medium' ? safeStorageGet('neonSerpents_bestLength_normal') : null) || `${INITIAL_SEGMENTS}`;
  const parsed = parseInt(rawVal, 10);
  const clean = Number.isFinite(parsed) && parsed >= INITIAL_SEGMENTS ? Math.min(MAX_SAFE_SNAKE_LENGTH, parsed) : INITIAL_SEGMENTS;
  cachedBestLengths[safeDiff] = clean;
  if (safeDiff === 'medium') cachedBestLengths.normal = clean;
  return clean;
}

function saveBestRecords(diff, time, len) {
  const safeDiff = normalizeDifficulty(diff);
  const cleanTime = sanitizeBoundedInt(time, 0, MAX_SAFE_SURVIVAL_SEC, 0);
  const cleanLen = sanitizeBoundedInt(len, INITIAL_SEGMENTS, MAX_SAFE_SNAKE_LENGTH, INITIAL_SEGMENTS);
  const curBestTime = getBestTime(safeDiff);
  const curBestLen = getBestLength(safeDiff);
  if (cleanTime > curBestTime) {
    cachedBestTimes[safeDiff] = cleanTime;
    if (safeDiff === 'medium') cachedBestTimes.normal = cleanTime;
    safeStorageSet(`neonSerpents_bestTime_${safeDiff}`, cleanTime.toString());
  }
  if (cleanLen > curBestLen) {
    cachedBestLengths[safeDiff] = cleanLen;
    if (safeDiff === 'medium') cachedBestLengths.normal = cleanLen;
    safeStorageSet(`neonSerpents_bestLength_${safeDiff}`, cleanLen.toString());
  }
}

function updateMenuRecordsDisplay() {
  const diff = normalizeDifficulty(currentDifficulty);
  const bTime = getBestTime(diff);
  const bLen = getBestLength(diff);
  const capitalized = diff.charAt(0).toUpperCase() + diff.slice(1);
  if (diffNameLabel) diffNameLabel.textContent = capitalized;
  if (menuBestTime) menuBestTime.textContent = formatTime(bTime);
  if (menuBestLen) menuBestLen.textContent = bLen;
  if (cardDiffLabel) cardDiffLabel.textContent = capitalized;
}

function getOverallBestTime() {
  return Math.max(0, getBestTime('easy'), getBestTime('medium'), getBestTime('hard'));
}

function getOverallBestLength() {
  return Math.max(INITIAL_SEGMENTS, getBestLength('easy'), getBestLength('medium'), getBestLength('hard'));
}

function persistUnlockedSkins() {
  safeStorageSet(SKIN_UNLOCKS_KEY, JSON.stringify([...unlockedSkinIds]));
}

function getSkinUnlockProgress(skin, skipSync = false) {
  if (!skipSync) syncDerivedProfileStats();
  const u = skin.unlock || { type: 'default' };
  const s = (profileData && profileData.stats) ? profileData.stats : {};
  const bestTime = Math.max(s.bestSurvivalTime || 0, isGameRunning ? survivalSeconds : 0);
  const bestLength = Math.max(s.highestLength || INITIAL_SEGMENTS, isGameRunning ? player.length : INITIAL_SEGMENTS);
  const hardTime = Math.max(s.hardSurvivalTime || 0, (isGameRunning && currentDifficulty === 'hard') ? survivalSeconds : 0);
  const totalKills = (s.totalKills || 0);
  const kingKills = (s.kingKills || 0);
  const lvl = (profileData && profileData.level) ? profileData.level : 1;
  const achDone = s._cachedAchDone !== undefined ? s._cachedAchDone : countCompletedAchievements(s);
  const missionsDone = (s.dailyMissionsCompleted || 0) + (s.weeklyMissionsCompleted || 0) + (s.eliteMissionsCompleted || 0);

  if (u.type === 'default') {
    return { text: 'Starter Skin (Unlocked by default)', current: 1, target: 1, pct: 100, earned: true };
  }
  if (u.type === 'time') {
    const cur = Math.min(u.seconds, bestTime);
    const pct = Math.min(100, Math.round((cur / u.seconds) * 100));
    return { text: `Survive ${formatTime(u.seconds)} (${formatTime(cur)} / ${formatTime(u.seconds)})`, current: cur, target: u.seconds, pct, earned: bestTime >= u.seconds };
  }
  if (u.type === 'length') {
    const cur = Math.min(u.length, bestLength);
    const pct = Math.min(100, Math.round((cur / u.length) * 100));
    return { text: `Reach Length ${u.length} (${cur} / ${u.length})`, current: cur, target: u.length, pct, earned: bestLength >= u.length };
  }
  if (u.type === 'kills') {
    const cur = Math.min(u.count, totalKills);
    const pct = Math.min(100, Math.round((cur / u.count) * 100));
    return { text: `Defeat ${u.count} Snakes (${cur} / ${u.count})`, current: cur, target: u.count, pct, earned: totalKills >= u.count };
  }
  if (u.type === 'hard_time') {
    const cur = Math.min(u.seconds, hardTime);
    const pct = Math.min(100, Math.round((cur / u.seconds) * 100));
    return { text: `Survive ${formatTime(u.seconds)} in Hard Mode (${formatTime(cur)})`, current: cur, target: u.seconds, pct, earned: hardTime >= u.seconds };
  }
  if (u.type === 'king_kills') {
    const cur = Math.min(u.count, kingKills);
    const pct = Math.min(100, Math.round((cur / u.count) * 100));
    return { text: `Slay ${u.count} King Snakes (${cur} / ${u.count})`, current: cur, target: u.count, pct, earned: kingKills >= u.count };
  }
  if (u.type === 'level') {
    const cur = Math.min(u.level, lvl);
    const pct = Math.min(100, Math.round((cur / u.level) * 100));
    return { text: `Reach Player Level ${u.level} (Lv.${cur} / ${u.level})`, current: cur, target: u.level, pct, earned: lvl >= u.level };
  }
  if (u.type === 'achievements') {
    const cur = Math.min(u.count, achDone);
    const pct = Math.min(100, Math.round((cur / u.count) * 100));
    return { text: `Complete ${u.count} Achievements (${cur} / ${u.count})`, current: cur, target: u.count, pct, earned: achDone >= u.count };
  }
  if (u.type === 'missions') {
    const cur = Math.min(u.count, missionsDone);
    const pct = Math.min(100, Math.round((cur / u.count) * 100));
    return { text: `Complete ${u.count} Missions (${cur} / ${u.count})`, current: cur, target: u.count, pct, earned: missionsDone >= u.count };
  }
  return { text: 'Special Unlock', current: 0, target: 1, pct: 0, earned: false };
}

function setSkinFilter(filter) {
  currentSkinFilter = filter;
  document.querySelectorAll('#skin-filter-bar .filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderSkinMenu();
}

function setSkinCategory(cat) {
  currentSkinCategory = cat;
  document.querySelectorAll('#skin-category-bar .filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  renderSkinMenu();
}

function setSkinSearch(query) {
  currentSkinSearch = String(query || '').trim().toLowerCase();
  renderSkinMenu();
}

function previewSkin(skinId) {
  previewSkinId = skinId;
  renderSkinShowcase();
  document.querySelectorAll('#skin-list .skin-card').forEach(card => {
    card.classList.toggle('previewing', card.dataset.skinId === skinId);
  });
}

function renderSkinShowcase() {
  const skin = getSkin(previewSkinId || selectedSkinId);
  if (!skin) return;
  const unlocked = unlockedSkinIds.has(skin.id);
  const isTrial = !unlocked && trialSkinId === skin.id;
  const selected = selectedSkinId === skin.id;
  const rarity = skin.rarity || 'common';
  const price = skin.price || 250;
  const prog = getSkinUnlockProgress(skin);
  const catNames = { funny: 'Funny & Meme', creature: 'Creature', fantasy: 'Fantasy', cyber: 'Cyber & Neon' };

  const nameEl = document.getElementById('showcase-skin-name');
  const rarityEl = document.getElementById('showcase-skin-rarity');
  const catEl = document.getElementById('showcase-skin-cat');
  const descEl = document.getElementById('showcase-skin-desc');
  const reqTextEl = document.getElementById('showcase-req-text');
  const reqPctEl = document.getElementById('showcase-req-pct');
  const reqFillEl = document.getElementById('showcase-req-fill');
  const actionsEl = document.getElementById('showcase-actions-row');

  const showcaseCardEl = document.getElementById('shop-showcase-card');
  if (showcaseCardEl) showcaseCardEl.dataset.rarity = rarity;

  if (nameEl) nameEl.textContent = skin.name;
  if (rarityEl) {
    rarityEl.className = `rarity-badge rarity-${rarity}`;
    rarityEl.textContent = rarity.toUpperCase();
  }
  if (catEl) catEl.textContent = catNames[skin.category] || 'Special';
  if (descEl) descEl.textContent = skin.desc || 'Custom procedural arena serpent.';
  if (reqTextEl) reqTextEl.textContent = unlocked ? '✓ Owned in Collection' : `${prog.text} • or ${price} Coins`;
  if (reqPctEl) reqPctEl.textContent = unlocked ? 'OWNED' : `${prog.pct}%`;
  if (reqFillEl) reqFillEl.style.width = `${unlocked ? 100 : prog.pct}%`;

  if (actionsEl) {
    if (unlocked || isTrial) {
      actionsEl.innerHTML = `<button type="button" class="skin-act-btn equip" data-action="select-skin" data-arg="${skin.id}">${selected ? '✓ Currently Equipped' : 'Equip Skin'}</button>`;
    } else {
      actionsEl.innerHTML = `
        <button type="button" class="skin-act-btn buy" data-action="buy-skin" data-arg="${skin.id}">Unlock (${price} Coins)</button>
        <button type="button" class="skin-act-btn trial" data-action="trial-skin" data-arg="${skin.id}">▶ Try 1 Match Free (Ad)</button>
      `;
    }
  }
  drawShowcaseSnakePreview();
}

let skinCardObserver = null;

function renderSkinCardPreviewCanvas(canvasEl) {
  if (!canvasEl || canvasEl.dataset.rendered === '1') return;
  const skinId = canvasEl.dataset.skinPreviewId;
  const skin = SKINS.find(s => s.id === skinId);
  if (!skin) return;
  canvasEl.dataset.rendered = '1';
  drawSnakePreviewOnCanvas(canvasEl, skin, 1.05);
}

function observeVisibleSkinCardCanvases() {
  if (!skinListEl) return;
  const canvases = skinListEl.querySelectorAll('canvas.skin-card-canvas');
  if (typeof IntersectionObserver !== 'undefined') {
    if (skinCardObserver) skinCardObserver.disconnect();
    skinCardObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          renderSkinCardPreviewCanvas(entry.target);
          skinCardObserver.unobserve(entry.target);
        }
      }
    }, { root: null, rootMargin: '140px' });
    canvases.forEach(c => skinCardObserver.observe(c));
  } else {
    canvases.forEach(c => renderSkinCardPreviewCanvas(c));
  }
}

function renderSkinMenu() {
  if (!skinListEl) return;
  const shopCoinsEl = document.getElementById('shop-coins-val');
  if (shopCoinsEl && profileData) shopCoinsEl.textContent = profileData.coins.toLocaleString();
  const completionPct = Math.min(100, Math.round((unlockedSkinIds.size / Math.max(1, SKINS.length)) * 100));
  const counterEl = document.getElementById('skin-collection-counter');
  if (counterEl) counterEl.textContent = `${unlockedSkinIds.size} / ${SKINS.length} Unlocked (${completionPct}%) • Purely cosmetic, identical hitboxes`;
  const vFill = document.getElementById('vault-completion-fill');
  const vPct = document.getElementById('vault-completion-pct');
  if (vFill) vFill.style.width = `${completionPct}%`;
  if (vPct) vPct.textContent = `${completionPct}%`;
  const searchEl = document.getElementById('skin-search-input');
  if (searchEl) searchEl.placeholder = `Search ${SKINS.length} skins...`;

  if (!previewSkinId || !SKINS.some(s => s.id === previewSkinId)) {
    previewSkinId = selectedSkinId || 'classic';
  }
  renderSkinShowcase();

  const filtered = SKINS.filter(skin => {
    if (currentSkinCategory !== 'all' && skin.category !== currentSkinCategory) return false;
    if (currentSkinFilter === 'unlocked' && !(unlockedSkinIds.has(skin.id) || trialSkinId === skin.id)) return false;
    if (currentSkinFilter !== 'all' && currentSkinFilter !== 'unlocked' && (skin.rarity || 'common') !== currentSkinFilter) return false;
    if (currentSkinSearch) {
      const hay = `${skin.name} ${skin.desc || ''} ${skin.category || ''} ${skin.rarity || ''}`.toLowerCase();
      if (!hay.includes(currentSkinSearch)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    skinListEl.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:var(--text-dim);font-size:13px;">No skins matched your filter. Try clearing the search or selecting All Rarity.</div>`;
    return;
  }

  skinListEl.innerHTML = filtered.map(skin => {
    const unlocked = unlockedSkinIds.has(skin.id);
    const isTrial = !unlocked && trialSkinId === skin.id;
    const selected = selectedSkinId === skin.id;
    const isPreviewing = previewSkinId === skin.id;
    const rarity = skin.rarity || 'common';
    const price = skin.price || 250;
    const prog = getSkinUnlockProgress(skin);
    const state = selected ? 'Equipped' : unlocked ? 'Owned' : isTrial ? 'Trial' : `${price}c`;

    let actionsHtml = '';
    if (unlocked || isTrial) {
      actionsHtml = `<div class="skin-actions-row">
        <button type="button" class="skin-act-btn equip" data-action="select-skin" data-arg="${skin.id}">${selected ? '✓ Equipped' : 'Equip'}</button>
      </div>`;
    } else {
      actionsHtml = `<div class="skin-actions-row">
        <button type="button" class="skin-act-btn buy" data-action="buy-skin" data-arg="${skin.id}">Buy (${price}c)</button>
        <button type="button" class="skin-act-btn trial" data-action="trial-skin" data-arg="${skin.id}">▶ Try</button>
      </div>`;
    }

    return `<div class="skin-card rarity-card-${rarity} ${selected ? 'selected' : ''} ${isPreviewing ? 'previewing' : ''} ${(unlocked || isTrial) ? '' : 'locked'}" data-skin-id="${skin.id}" data-action="preview-skin" data-arg="${skin.id}">
      <div class="skin-card-stage">
        <canvas class="skin-card-canvas" width="220" height="84" data-skin-preview-id="${skin.id}"></canvas>
      </div>
      <div class="skin-name-row">
        <span>${skin.name}</span>
        <span class="rarity-badge rarity-${rarity}">${rarity}</span>
      </div>
      <div class="skin-meta-row">
        <span class="skin-progress">${unlocked ? (skin.desc || 'Ready to equip') : prog.text}</span>
        <span class="skin-state">${state}</span>
      </div>
      <div class="skin-mini-bar"><div class="skin-mini-bar-fill" style="width:${unlocked ? 100 : prog.pct}%"></div></div>
      ${actionsHtml}
    </div>`;
  }).join('');

  observeVisibleSkinCardCanvases();
}

function promptBuySkin(skinId) {
  const skin = SKINS.find(s => s.id === skinId);
  if (!skin || unlockedSkinIds.has(skinId)) return;
  previewSkinId = skinId;
  const price = skin.price || 250;
  if (profileData.coins < price) {
    showConfirmModal('Not Enough Coins', `You need ${price} Coins to unlock ${skin.name} (you have ${profileData.coins} Coins). Play matches, complete missions, or watch an optional bonus ad to earn more!`, [
      { label: 'Watch Ad (+75 Coins)', primary: true, onClick: () => { closeConfirmModal(); watchRewardedBonusCoins(); } },
      { label: 'Cancel', primary: false, onClick: closeConfirmModal }
    ]);
    return;
  }
  showConfirmModal('Unlock Skin?', `Purchase ${skin.name} (${(skin.rarity || 'common').toUpperCase()}) for ${price} Coins?`, [
    {
      label: `Confirm (${price} Coins)`,
      primary: true,
      onClick: () => {
        closeConfirmModal();
        if (profileData.coins < price || unlockedSkinIds.has(skinId)) return;
        profileData.coins = Math.max(0, profileData.coins - price);
        unlockedSkinIds.add(skinId);
        persistUnlockedSkins();
        saveProfileData();
        selectSkin(skinId);
        const isHighTier = ['epic', 'legendary', 'mythic'].includes(skin.rarity);
        if (isHighTier) {
          showRewardRevealModal({
            icon: '🐍',
            typeLabel: `${skin.rarity.toUpperCase()} SKIN UNLOCKED`,
            title: skin.name,
            subtitle: skin.desc || 'Added to your permanent collection!',
            items: ['✓ Equipped to Snake'],
            accentColor: skin.rarity === 'mythic' ? '#FF477E' : skin.rarity === 'legendary' ? '#FFB020' : '#A855F7'
          });
        } else {
          sfxReward();
          triggerHaptic(30);
          showGlobalToast(`${skin.name} Purchased & Equipped!`);
        }
      }
    },
    { label: 'Cancel', primary: false, onClick: closeConfirmModal }
  ]);
}

function trySkinWithAd(skinId) {
  const skin = SKINS.find(s => s.id === skinId);
  if (!skin || unlockedSkinIds.has(skinId)) return;
  AdManager.showRewardedAd({
    placement: `1-Match Skin Trial: ${skin.name}`,
    onReward: () => {
      trialSkinId = skinId;
      selectedSkinId = skinId;
      previewSkinId = skinId;
      player.palette = getSkin().palette;
  player.rarity = getSkin().rarity || 'common';
      sfxReward();
      renderSkinMenu();
      refreshMenuHeaderUI();
      showGlobalToast(`Trial Active: ${skin.name} equipped for your next match!`);
    }
  });
}

let activeSubscreenId = null;
let settingsOpenedFromGame = false;
let leaderboardCollapsed = false;

function toggleLeaderboardCollapse() {
  if (!lbEl) lbEl = document.getElementById('leaderboard');
  if (!lbEl) return;
  leaderboardCollapsed = !leaderboardCollapsed;
  lbEl.classList.toggle('collapsed', leaderboardCollapsed);
  const btn = document.getElementById('lb-toggle-btn');
  if (btn) btn.setAttribute('aria-expanded', leaderboardCollapsed ? 'false' : 'true');
  safeStorageSet('serpentRun_lbCollapsed', leaderboardCollapsed ? '1' : '0');
}

function openIngameSettings() {
  if (!isGameRunning || isGameOver) {
    openScreen('settings');
    return;
  }
  settingsOpenedFromGame = true;
  if (!isPaused) {
    isPaused = true;
    pauseStartTime = performance.now();
    resetActiveControls();
    stopGameLoop();
  }
  if (canvas) canvas.style.pointerEvents = 'none';
  if (pauseOverlayEl) pauseOverlayEl.style.display = 'none';
  document.querySelectorAll('.subscreen').forEach(el => { el.style.display = 'none'; });
  activeSubscreenId = 'settings-screen';
  const target = document.getElementById(activeSubscreenId);
  if (target) {
    target.style.display = 'flex';
    target.scrollTop = 0;
    const backBtn = target.querySelector('.back-pill');
    if (backBtn) backBtn.textContent = '← Resume Game';
  }
  updateSettingsUI();
}

function openScreen(name) {
  settingsOpenedFromGame = false;
  resetActiveControls();
  if (canvas) canvas.style.pointerEvents = 'none';
  if (menuScreenEl) menuScreenEl.style.display = 'none';
  document.querySelectorAll('.subscreen').forEach(el => { el.style.display = 'none'; });
  activeSubscreenId = `${name}-screen`;
  const target = document.getElementById(activeSubscreenId);
  if (target) {
    target.style.display = 'flex';
    target.scrollTop = 0;
    if (name === 'settings') {
      const backBtn = target.querySelector('.back-pill');
      if (backBtn) backBtn.textContent = '← Menu';
    }
  }
  AdManager.refreshBannerVisibility();
  AdManager.syncNativeBannerForScreen(name);
  if (name === 'levels') {
    if (typeof LevelsMode !== 'undefined') LevelsMode.renderLevelSelect();
  } else if (name === 'skins') {
    previewSkinId = selectedSkinId || 'classic';
    renderSkinMenu();
  }
  else if (name === 'missions') renderMissionsScreen();
  else if (name === 'rewards') renderDailyRewardsScreen();
  else if (name === 'achievements') renderAchievementsScreen();
  else if (name === 'leaderboard') renderCareerStatsScreen();
  else if (name === 'removeads') renderRemoveAdsScreen();
  else if (name === 'settings') updateSettingsUI();
}

function closeSubscreen() {
  document.querySelectorAll('.subscreen').forEach(el => { el.style.display = 'none'; });
  activeSubscreenId = null;
  AdManager.hideNativeBanner();
  if (settingsOpenedFromGame && isGameRunning && !isGameOver) {
    settingsOpenedFromGame = false;
    if (isPaused) {
      isPaused = false;
      const pauseDelta = performance.now() - pauseStartTime;
      if (gameMode === 'levels') {
        if (typeof LevelsMode !== 'undefined') LevelsMode.shiftTimers(pauseDelta);
      } else {
        shiftActiveTimersByPauseDuration(pauseDelta);
      }
      lastLoopFrameTime = performance.now();
      fixedStepAccumulator = 0;
      if (pauseOverlayEl) pauseOverlayEl.style.display = 'none';
      if (canvas) canvas.style.pointerEvents = 'auto';
      ensureGameLoop();
    }
    return;
  }
  settingsOpenedFromGame = false;
  if (canvas) canvas.style.pointerEvents = 'none';
  if (menuScreenEl) {
    menuScreenEl.style.display = 'flex';
    menuScreenEl.scrollTop = 0;
  }
  refreshMenuHeaderUI();
}

function selectSkin(skinId) {
  if (!unlockedSkinIds.has(skinId) && trialSkinId !== skinId) return;
  selectedSkinId = skinId;
  previewSkinId = skinId;
  if (unlockedSkinIds.has(skinId)) safeStorageSet(SELECTED_SKIN_KEY, selectedSkinId);
  player.palette = getSkin().palette;
  player.rarity = getSkin().rarity || 'common';
  renderSkinMenu();
  refreshMenuHeaderUI();
}

function setMissionTier(tier) {
  currentMissionTier = ['daily', 'weekly', 'elite'].includes(tier) ? tier : 'daily';
  document.querySelectorAll('#missions-tier-tabs .tier-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tier === currentMissionTier);
  });
  renderMissionsScreen();
}

function renderMissionsScreen() {
  ensureDailyMissionsForToday();
  ensureWeeklyMissionsForWeek();
  syncDerivedProfileStats();
  const listEl = document.getElementById('missions-list');
  const timerEl = document.getElementById('missions-reset-timer');
  if (!listEl) return;

  if (timerEl) {
    if (currentMissionTier === 'daily') {
      const now = new Date();
      const hrs = 23 - now.getHours();
      const mins = 59 - now.getMinutes();
      timerEl.textContent = `Daily Rotation • Resets in ${hrs}h ${mins}m`;
    } else if (currentMissionTier === 'weekly') {
      timerEl.textContent = `Weekly Operations (${profileData.weeklyMissions.weekKey}) • High-value rewards`;
    } else {
      timerEl.textContent = `Elite Challenges • Permanent high-skill trials with Mythic & Legendary rewards`;
    }
  }

  if (currentMissionTier === 'elite') {
    listEl.innerHTML = ELITE_MISSION_POOL.map(def => {
      const cur = Math.min(def.target, profileData.stats[def.stat] || 0);
      const pct = Math.min(100, Math.round((cur / def.target) * 100));
      const done = cur >= def.target;
      const claimed = Boolean(profileData.eliteMissionsClaimed[def.id]);
      const btnLabel = claimed ? '✓ Conquered' : done ? 'Claim Elite' : `${pct}%`;
      const bonusSkin = def.bonusSkinId ? SKINS.find(s => s.id === def.bonusSkinId) : null;
      return `<div class="mission-card tier-elite ${(done && !claimed) ? 'ready-claim' : ''} ${claimed ? 'is-claimed' : ''}">
        <div class="ach-badge-icon tier-mythic">👑</div>
        <div class="mission-info">
          <div class="mission-head-row">
            <span class="mission-title">${def.title}</span>
            <span class="rarity-badge rarity-${def.rarity || 'legendary'}">${def.difficulty}</span>
          </div>
          <div class="mission-desc">${def.desc}</div>
          <div class="mission-prog-wrap">
            <div class="mission-bar"><div class="mission-bar-fill" style="width:${pct}%"></div></div>
            <span class="mission-count">${cur} / ${def.target}</span>
          </div>
        </div>
        <div class="mission-reward-col">
          <span class="reward-tag">+${def.rewardCoins}c &bull; +${def.rewardXp} XP</span>
          ${bonusSkin ? `<span class="reward-bonus-tag">🐍 ${bonusSkin.name}</span>` : ''}
          ${def.bonusTitle ? `<span class="reward-bonus-tag">👑 ${def.bonusTitle}</span>` : ''}
          <button type="button" class="claim-btn" ${(!done || claimed) ? 'disabled' : ''} data-action="claim-mission" data-arg="${def.id}" data-tier="elite">${btnLabel}</button>
        </div>
      </div>`;
    }).join('');
    return;
  }

  const isWeekly = currentMissionTier === 'weekly';
  const items = isWeekly ? profileData.weeklyMissions.items : profileData.dailyMissions.items;
  const pool = isWeekly ? WEEKLY_MISSION_POOL : MISSION_POOL;
  const tierClass = isWeekly ? 'tier-weekly' : 'tier-daily';
  const typeIcons = { food: '🍎', kills: '⚔️', survive: '⏱️', single_survive: '🛡', matches: '🎮', dash: '⚡', max_length: '🐍', king_kills: '👑', powerups: '💎', top3_matches: '🏆', dailies_claimed: '📆' };

  listEl.innerHTML = items.map(item => {
    const def = pool.find(m => m.id === item.id);
    if (!def) return '';
    const prog = Math.min(def.target, item.progress || 0);
    const pct = Math.min(100, Math.round((prog / def.target) * 100));
    const done = prog >= def.target;
    const btnLabel = item.claimed ? '✓ Claimed' : done ? 'Claim Reward' : `${pct}%`;
    const mIcon = typeIcons[def.type] || (isWeekly ? '📆' : '⚡');
    return `<div class="mission-card ${tierClass} ${(done && !item.claimed) ? 'ready-claim' : ''} ${item.claimed ? 'is-claimed' : ''}">
      <div class="ach-badge-icon ${isWeekly ? 'tier-diamond' : 'tier-silver'}">${mIcon}</div>
      <div class="mission-info">
        <div class="mission-head-row">
          <span class="mission-title">${def.title}</span>
          <span class="rarity-badge rarity-${def.rarity || 'common'}">${def.difficulty || 'Medium'}</span>
        </div>
        <div class="mission-desc">${def.desc}</div>
        <div class="mission-prog-wrap">
          <div class="mission-bar"><div class="mission-bar-fill" style="width:${pct}%"></div></div>
          <span class="mission-count">${prog} / ${def.target}</span>
        </div>
      </div>
      <div class="mission-reward-col">
        <span class="reward-tag">+${def.rewardCoins}c &bull; +${def.rewardXp} XP</span>
        <button type="button" class="claim-btn" ${(!done || item.claimed) ? 'disabled' : ''} data-action="claim-mission" data-arg="${def.id}" data-tier="${isWeekly ? 'weekly' : 'daily'}">${btnLabel}</button>
      </div>
    </div>`;
  }).join('');
}

function renderDailyRewardsScreen() {
  const gridEl = document.getElementById('daily-rewards-grid');
  const subEl = document.getElementById('daily-streak-subtitle');
  if (!gridEl) return;
  const canClaim = canClaimDailyRewardToday();
  const currentDay = ((profileData.dailyReward.streakDay - 1) % 7) + 1;
  if (subEl) {
    subEl.textContent = canClaim
      ? `Day ${currentDay} reward is ready to claim!`
      : `Today's reward claimed! Come back tomorrow for Day ${currentDay}.`;
  }
  gridEl.innerHTML = DAILY_REWARDS_CYCLE.map(r => {
    const isCurrent = r.day === currentDay;
    const isPast = r.day < currentDay || (!canClaim && r.day === currentDay);
    const cardClass = `day-card ${r.day === 7 ? 'day-7' : ''} ${isPast ? 'claimed' : ''} ${(isCurrent && canClaim) ? 'active-day' : ''}`;
    let actionHtml = '';
    if (isCurrent && canClaim) {
      actionHtml = `<button type="button" class="claim-btn" style="width:100%;margin-top:4px;" data-action="claim-daily-reward">Claim Day ${r.day}</button>`;
    } else if (isPast) {
      actionHtml = `<span style="font-size:11px;font-weight:800;color:var(--accent);">✓ Claimed</span>`;
    } else {
      actionHtml = `<span style="font-size:11px;color:var(--text-faint);">Locked</span>`;
    }
    return `<div class="${cardClass}">
      <span class="day-num">Day ${r.day}</span>
      <span class="day-val">${r.title}</span>
      <span class="day-sub">${r.sub}</span>
      ${actionHtml}
    </div>`;
  }).join('');
}

function setAchievementCategory(cat) {
  currentAchCategory = cat || 'all';
  document.querySelectorAll('#ach-category-bar .filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.acat === currentAchCategory);
  });
  renderAchievementsScreen();
}

function renderAchievementsScreen() {
  syncDerivedProfileStats();
  const listEl = document.getElementById('achievements-list');
  const sumEl = document.getElementById('achievements-summary-text');
  const pctEl = document.getElementById('ach-completion-pct');
  const fillEl = document.getElementById('ach-completion-fill');
  if (!listEl) return;

  let totalUnlocked = 0;
  for (const a of ACHIEVEMENTS_LIST) {
    if ((profileData.stats[a.stat] || 0) >= a.target) totalUnlocked++;
  }
  const overallPct = Math.min(100, Math.round((totalUnlocked / ACHIEVEMENTS_LIST.length) * 100));
  if (sumEl) sumEl.textContent = `${totalUnlocked} / ${ACHIEVEMENTS_LIST.length} Unlocked (${overallPct}%)`;
  if (pctEl) pctEl.textContent = `${overallPct}%`;
  if (fillEl) fillEl.style.width = `${overallPct}%`;

  const filtered = ACHIEVEMENTS_LIST.filter(a => currentAchCategory === 'all' || a.category === currentAchCategory);

  listEl.innerHTML = filtered.map(a => {
    const cur = Math.min(a.target, profileData.stats[a.stat] || 0);
    const done = cur >= a.target;
    const claimed = Boolean(profileData.achievementsClaimed[a.id]);
    const pct = Math.min(100, Math.round((cur / a.target) * 100));
    const btnLabel = claimed ? '✓ Claimed' : done ? 'Claim' : `${pct}%`;
    const isHiddenSecret = Boolean(a.secret && !done && !claimed);
    const displayTitle = isHiddenSecret ? '??? Secret Achievement' : a.title;
    const displayDesc = isHiddenSecret ? 'Hidden secret challenge — discover it in the arena to reveal!' : a.desc;
    const bonusSkin = a.bonusSkinId ? SKINS.find(s => s.id === a.bonusSkinId) : null;

    return `<div class="mission-card ${(done && !claimed) ? 'ready-claim' : ''} ${claimed ? 'is-claimed' : ''} ${isHiddenSecret ? 'is-secret-locked' : ''}">
      <div class="ach-badge-icon tier-${a.rarity || 'bronze'}">${isHiddenSecret ? '❓' : (a.icon || '🏆')}</div>
      <div class="mission-info">
        <div class="mission-head-row">
          <span class="mission-title">${displayTitle}</span>
          <span class="rarity-badge ach-rarity-${a.rarity || 'bronze'}">${a.rarity || 'bronze'}</span>
        </div>
        <div class="mission-desc">${displayDesc}</div>
        <div class="mission-prog-wrap">
          <div class="mission-bar"><div class="mission-bar-fill" style="width:${pct}%"></div></div>
          <span class="mission-count">${isHiddenSecret ? '? / ?' : `${cur} / ${a.target}`}</span>
        </div>
      </div>
      <div class="mission-reward-col">
        <span class="reward-tag">+${a.rewardCoins}c &bull; +${a.rewardXp} XP</span>
        ${bonusSkin ? `<span class="reward-bonus-tag">🐍 ${bonusSkin.name}</span>` : ''}
        ${a.bonusTitle ? `<span class="reward-bonus-tag">👑 ${a.bonusTitle}</span>` : ''}
        <button type="button" class="claim-btn" ${(!done || claimed) ? 'disabled' : ''} data-action="claim-achievement" data-arg="${a.id}">${btnLabel}</button>
      </div>
    </div>`;
  }).join('');
}

function renderCareerStatsScreen() {
  syncDerivedProfileStats();
  const kpiEl = document.getElementById('career-kpi-row');
  const gridEl = document.getElementById('career-stats-grid');
  if (!gridEl) return;
  const s = profileData.stats;
  if (kpiEl) {
    kpiEl.innerHTML = `
      <div class="kpi-card kpi-green">
        <span class="kpi-label">Best Match Score</span>
        <span class="kpi-val" style="color:var(--accent);">${(s.bestScore || 0).toLocaleString()}</span>
        <span class="kpi-sub">Level ${profileData.level} Serpent</span>
      </div>
      <div class="kpi-card kpi-cyan">
        <span class="kpi-label">Highest Length</span>
        <span class="kpi-val" style="color:var(--accent-2);">${(s.highestLength || INITIAL_SEGMENTS).toLocaleString()}</span>
        <span class="kpi-sub">Longest survival: ${formatTime(s.bestSurvivalTime || 0)}</span>
      </div>
      <div class="kpi-card kpi-pink">
        <span class="kpi-label">Total Enemy Kills</span>
        <span class="kpi-val" style="color:var(--pink);">${(s.totalKills || 0).toLocaleString()}</span>
        <span class="kpi-sub">Best single match: ${(s.singleMatchKills || 0).toLocaleString()}</span>
      </div>
      <div class="kpi-card kpi-gold">
        <span class="kpi-label">Lifetime Coins</span>
        <span class="kpi-val" style="color:var(--gold);">${(s.totalCoinsEarned || 0).toLocaleString()}</span>
        <span class="kpi-sub">King Snakes slain: ${(s.kingKills || 0).toLocaleString()}</span>
      </div>
    `;
  }
  const skinPct = Math.min(100, Math.round((unlockedSkinIds.size / Math.max(1, SKINS.length)) * 100));
  const bestEasy = getBestTime('easy');
  const bestMed = getBestTime('medium');
  const bestHard = getBestTime('hard');
  const maxTimeRef = Math.max(60, bestEasy, bestMed, bestHard);
  const items = [
    { label: 'Total Matches Played', val: (s.totalMatches || 0).toLocaleString(), pct: Math.min(100, Math.round(((s.totalMatches || 0) / 50) * 100)) },
    { label: 'Total Food Eaten', val: (s.totalFoodEaten || 0).toLocaleString(), pct: Math.min(100, Math.round(((s.totalFoodEaten || 0) / 2500) * 100)) },
    { label: 'Rare Glowing Orbs', val: (s.rareOrbsCollected || 0).toLocaleString(), pct: Math.min(100, Math.round(((s.rareOrbsCollected || 0) / 25) * 100)) },
    { label: 'Skins Unlocked', val: `${unlockedSkinIds.size} / ${SKINS.length}`, pct: skinPct },
    { label: 'Achievements Done', val: `${s._cachedAchDone || 0} / ${ACHIEVEMENTS_LIST.length}`, pct: Math.min(100, Math.round(((s._cachedAchDone || 0) / ACHIEVEMENTS_LIST.length) * 100)) },
    { label: 'King Snakes Slain', val: (s.kingKills || 0).toLocaleString(), pct: Math.min(100, Math.round(((s.kingKills || 0) / 10) * 100)) },
    { label: 'Best Time (Easy)', val: formatTime(bestEasy), pct: Math.round((bestEasy / maxTimeRef) * 100) },
    { label: 'Best Time (Medium)', val: formatTime(bestMed), pct: Math.round((bestMed / maxTimeRef) * 100) },
    { label: 'Best Time (Hard)', val: formatTime(bestHard), pct: Math.round((bestHard / maxTimeRef) * 100) }
  ];
  gridEl.innerHTML = items.map(it => `
    <div class="stat-tile">
      <div class="stat-tile-top">
        <span class="stat-tile-lbl">${it.label}</span>
        <span class="stat-tile-val">${it.val}</span>
      </div>
      <div class="skin-mini-bar"><div class="skin-mini-bar-fill" style="width:${Math.max(4, it.pct)}%"></div></div>
    </div>
  `).join('');
}

function renderRemoveAdsScreen() {
  const badge = document.getElementById('removeads-status-badge');
  const btn = document.getElementById('purchase-removeads-btn');
  if (!badge || !btn) return;
  if (profileData.removeForcedAds) {
    badge.textContent = '✓ Ad-Free Active';
    badge.style.color = 'var(--accent)';
    btn.textContent = 'Forced Ads Removed';
    btn.disabled = true;
  } else {
    badge.textContent = 'Standard Mode (With Ads)';
    badge.style.color = 'var(--text-dim)';
    btn.textContent = 'Check Google Play Billing Availability';
    btn.disabled = false;
  }
}

function attemptRemoveAdsPurchase() {
  const billingPlugin = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativePurchases) || window.CdvPurchase || null;
  if (!billingPlugin) {
    showConfirmModal(
      'Google Play Billing Setup Required',
      'In-App Purchases require a signed Google Play build with Google Play Billing configured for product ID "com.muneeb.neonserpents.remove_ads". No fake purchase has been charged.',
      [{ label: 'Understood', primary: true, onClick: closeConfirmModal }]
    );
    return;
  }
}

function watchRewardedBonusCoins() {
  const bonus = (AdManager.getConfig().rewardedBonusCoins || 75);
  AdManager.showRewardedAd({
    placement: `Bonus Chest (+${bonus} Coins & +40 XP)`,
    onReward: () => {
      addCoins(bonus);
      addXp(40);
      renderSkinMenu();
      renderDailyRewardsScreen();
      showRewardRevealModal({
        icon: '💎',
        typeLabel: 'BONUS CHEST OPENED',
        title: 'Rewarded Video Bonus',
        subtitle: 'Thanks for watching! Your rewards have been added.',
        items: [`+${bonus} Coins`, '+40 XP'],
        accentColor: '#FFB020'
      });
    }
  });
}

function showConfirmModal(title, bodyText, buttons) {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-modal-title');
  const bodyEl = document.getElementById('confirm-modal-body');
  const actionsEl = document.getElementById('confirm-modal-actions');
  if (!modal || !titleEl || !bodyEl || !actionsEl) return;
  titleEl.textContent = title;
  bodyEl.textContent = bodyText;
  actionsEl.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = b.primary ? 'play-btn' : 'menu-secondary';
    btn.style.minHeight = '44px';
    btn.style.fontSize = '14px';
    btn.textContent = b.label;
    btn.onclick = b.onClick;
    actionsEl.appendChild(btn);
  }
  modal.style.display = 'flex';
}

function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.style.display = 'none';
}

function promptDeleteMyData() {
  showConfirmModal(
    'Delete My Data?',
    'This will permanently delete all local game data stored on this device, including your level, coins, unlocked skins, mission progress, achievements, high scores, settings, and saved ad consent preferences.',
    [
      {
        label: 'Delete All My Data',
        primary: false,
        onClick: () => {
          closeConfirmModal();
          try { localStorage.clear(); } catch (_) {}
          cachedBestTimes.easy = 0;
          cachedBestTimes.medium = 0;
          cachedBestTimes.normal = 0;
          cachedBestTimes.hard = 0;
          cachedBestLengths.easy = INITIAL_SEGMENTS;
          cachedBestLengths.medium = INITIAL_SEGMENTS;
          cachedBestLengths.normal = INITIAL_SEGMENTS;
          cachedBestLengths.hard = INITIAL_SEGMENTS;
          unlockedSkinIds.clear();
          unlockedSkinIds.add('classic');
          unlockedSkinIds.add('cobra');
          unlockedSkinIds.add('python');
          selectedSkinId = 'classic';
          previewSkinId = 'classic';
          trialSkinId = null;
          profileData = createDefaultProfile();
          AdManager.consentStatus = 'UNKNOWN';
          AdManager.nonPersonalizedAds = true;
          ensureDailyMissionsForToday();
          ensureWeeklyMissionsForWeek();
          saveProfileData();
          persistUnlockedSkins();
          refreshMenuHeaderUI();
          updateMenuRecordsDisplay();
          updateSettingsUI();
          showGlobalToast('All local data has been permanently deleted.');
        }
      },
      { label: 'Cancel', primary: true, onClick: closeConfirmModal }
    ]
  );
}

const promptResetProgress = promptDeleteMyData;

function refreshNavBadges() {
  ensureDailyMissionsForToday();
  ensureWeeklyMissionsForWeek();
  syncDerivedProfileStats();
  const dailyReady = profileData.dailyMissions.items.some(it => {
    const def = MISSION_POOL.find(m => m.id === it.id);
    return def && !it.claimed && (it.progress || 0) >= def.target;
  });
  const weeklyReady = profileData.weeklyMissions.items.some(it => {
    const def = WEEKLY_MISSION_POOL.find(m => m.id === it.id);
    return def && !it.claimed && (it.progress || 0) >= def.target;
  });
  const eliteReady = ELITE_MISSION_POOL.some(def => !profileData.eliteMissionsClaimed[def.id] && (profileData.stats[def.stat] || 0) >= def.target);
  const missionReady = dailyReady || weeklyReady || eliteReady;
  const rewardReady = canClaimDailyRewardToday();
  const achReady = ACHIEVEMENTS_LIST.some(a => !profileData.achievementsClaimed[a.id] && (profileData.stats[a.stat] || 0) >= a.target);

  const mBadge = document.getElementById('badge-missions');
  const rBadge = document.getElementById('badge-rewards');
  const aBadge = document.getElementById('badge-achievements');
  if (mBadge) mBadge.classList.toggle('show', missionReady);
  if (rBadge) rBadge.classList.toggle('show', rewardReady);
  if (aBadge) aBadge.classList.toggle('show', achReady);
}

function refreshMenuHeaderUI() {
  if (!profileData) return;
  const lvlNum = document.getElementById('menu-lvl-num');
  const lvlTitle = document.getElementById('menu-lvl-title');
  const xpText = document.getElementById('menu-xp-text');
  const xpFill = document.getElementById('menu-xp-fill');
  const coinsVal = document.getElementById('menu-coins-val');
  const shopCoinsVal = document.getElementById('shop-coins-val');
  const heroSkinName = document.getElementById('hero-skin-name');
  const heroSkinRarity = document.getElementById('hero-skin-rarity');

  const reqXp = getXpRequiredForLevel(profileData.level);
  const titleIdx = Math.min(LEVEL_TITLES.length - 1, Math.floor((profileData.level - 1) / 2));
  const activeTitle = profileData.selectedTitle || LEVEL_TITLES[titleIdx];
  if (lvlNum) lvlNum.textContent = profileData.level;
  if (lvlTitle) lvlTitle.textContent = activeTitle;
  if (xpText) xpText.textContent = `${profileData.xp} / ${reqXp} XP`;
  if (xpFill) xpFill.style.width = `${Math.min(100, Math.round((profileData.xp / reqXp) * 100))}%`;
  if (coinsVal) coinsVal.textContent = profileData.coins.toLocaleString();
  if (shopCoinsVal) shopCoinsVal.textContent = profileData.coins.toLocaleString();

  const curSkin = getSkin();
  if (heroSkinName) heroSkinName.textContent = curSkin.name + (trialSkinId === curSkin.id && !unlockedSkinIds.has(curSkin.id) ? ' (Trial)' : '');
  if (heroSkinRarity) heroSkinRarity.textContent = `${(curSkin.rarity || 'common').toUpperCase()} SKIN`;

  refreshNavBadges();
  updateMenuDailyWidget();
  updateProgressionStripUI();
  drawMenuSnakePreview();
}

function updateMenuDailyWidget() {
  if (!profileData || !profileData.dailyReward) return;
  const streakEl = document.getElementById('menu-daily-streak');
  const titleEl = document.getElementById('menu-daily-reward-title');
  const timerEl = document.getElementById('menu-daily-timer');
  const ctaEl = document.getElementById('menu-daily-cta');
  const canClaim = canClaimDailyRewardToday();
  const currentDay = ((profileData.dailyReward.streakDay - 1) % 7) + 1;
  const reward = DAILY_REWARDS_CYCLE[currentDay - 1] || DAILY_REWARDS_CYCLE[0];
  const now = new Date();
  const hrs = 23 - now.getHours();
  const mins = 59 - now.getMinutes();

  if (streakEl) streakEl.textContent = `Day ${currentDay} / 7 Streak`;
  if (titleEl) titleEl.textContent = canClaim ? `Day ${currentDay}: ${reward.title}` : `Next: Day ${currentDay} (${reward.title})`;
  if (timerEl) timerEl.textContent = canClaim ? 'Ready to claim right now!' : `Next reward unlocks in ${hrs}h ${mins}m`;
  if (ctaEl) {
    ctaEl.textContent = canClaim ? 'Claim Now' : 'View 7-Day';
    ctaEl.classList.toggle('claimed', !canClaim);
  }
}

function updateProgressionStripUI() {
  if (!profileData) return;
  const reqXp = getXpRequiredForLevel(profileData.level);
  const titleIdx = Math.min(LEVEL_TITLES.length - 1, Math.floor((profileData.level - 1) / 2));
  const activeTitle = profileData.selectedTitle || LEVEL_TITLES[titleIdx];
  const nextLvl = profileData.level + 1;
  const nextCoinBonus = 85 + nextLvl * 15;
  const elNum = document.getElementById('prog-lvl-num');
  const elTitle = document.getElementById('prog-lvl-title');
  const elXp = document.getElementById('prog-xp-text');
  const elFill = document.getElementById('prog-xp-fill');
  const elNext = document.getElementById('prog-next-milestone');
  if (elNum) elNum.textContent = profileData.level;
  if (elTitle) elTitle.textContent = activeTitle;
  if (elXp) elXp.textContent = `${profileData.xp} / ${reqXp} XP`;
  if (elFill) elFill.style.width = `${Math.min(100, Math.round((profileData.xp / reqXp) * 100))}%`;
  if (elNext) elNext.textContent = `Level ${nextLvl}: +${nextCoinBonus} Coins`;
}

let menuPreviewAnimId = 0;
let menuPreviewPhase = 0;

function drawSnakePreviewOnCanvas(pCanvas, skin, phase) {
  if (!pCanvas || !skin || typeof SnakeRenderer === 'undefined') return;
  const pCtx = pCanvas.getContext('2d');
  const w = pCanvas.width;
  const h = pCanvas.height;
  pCtx.clearRect(0, 0, w, h);

  const pal = skin.palette || PALETTE_PLAYER;
  const count = 24;
  const startX = Math.max(24, w * 0.14);
  const endX = w - Math.max(36, w * 0.21);
  const baseR = Math.max(8, Math.min(15.5, h * 0.135));
  const waveAmp = h * 0.155;

  // Build natural slithering S-curve spine directly in SnakeRenderer's shared buffers
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = endX - t * (endX - startX);
    const y = h * 0.52 + Math.sin(phase - i * 0.34) * waveAmp * (0.6 + 0.4 * Math.sin(t * Math.PI));
    const taperCurve = Math.pow(t, 1.38);
    const r = Math.max(baseR * 0.34, baseR * (1 - taperCurve * 0.58));
    SnakeRenderer._px[i] = x;
    SnakeRenderer._py[i] = y;
    SnakeRenderer._pr[i] = r;
    SnakeRenderer._pt[i] = t;
    SnakeRenderer._pa[i] = 0;
  }

  // Head angle follows exact tangent of curve at nose
  const headDx = SnakeRenderer._px[0] - SnakeRenderer._px[1];
  const headDy = SnakeRenderer._py[0] - SnakeRenderer._py[1];
  const headAngle = Math.atan2(headDy, headDx);
  const tongueCycle = (phase * 0.38) % (Math.PI * 2);
  const tongueProgress = tongueCycle > 5.2 ? Math.sin(((tongueCycle - 5.2) / (Math.PI * 2 - 5.2)) * Math.PI) : 0;

  SnakeRenderer.drawSnake(pCtx, {
    count,
    palette: pal,
    rarity: skin.rarity || 'common',
    headX: SnakeRenderer._px[0],
    headY: SnakeRenderer._py[0],
    headAngle,
    headRadius: baseR * 1.12,
    nowMs: phase * 185,
    qualityMode: 'high',
    isPlayer: true,
    isBoosting: false,
    isGhost: false,
    isMagnet: false,
    isProtected: false,
    nightGlow: 0.28,
    tongueProgress,
    lookBias: Math.cos(phase) * 0.35
  });
}

function drawMenuSnakePreview() {
  const pCanvas = document.getElementById('menu-snake-canvas');
  if (!pCanvas) return;
  menuPreviewPhase += 0.085;
  drawSnakePreviewOnCanvas(pCanvas, getSkin(), menuPreviewPhase);
}

function drawShowcaseSnakePreview() {
  const sCanvas = document.getElementById('shop-showcase-canvas');
  if (!sCanvas) return;
  drawSnakePreviewOnCanvas(sCanvas, getSkin(previewSkinId || selectedSkinId), menuPreviewPhase);
}

function startMenuPreviewTicker() {
  if (menuPreviewAnimId) return;
  const tick = () => {
    try {
      if (!isGameRunning) {
        if (menuScreenEl && menuScreenEl.style.display !== 'none') {
          drawMenuSnakePreview();
        } else if (activeSubscreenId === 'skins-screen') {
          menuPreviewPhase += 0.085;
          drawShowcaseSnakePreview();
        }
      }
    } catch (_) {}
    menuPreviewAnimId = requestAnimationFrame(tick);
  };
  menuPreviewAnimId = requestAnimationFrame(tick);
}

// ---- Extended Mobile Controls & Settings ----
function applyControlSettingsToDOM() {
  if (!profileData || !profileData.settings) return;
  const s = profileData.settings;
  document.body.classList.toggle('left-handed', Boolean(s.leftHanded));
  if (joystickEl) {
    const sizePx = s.joystickSize === 'small' ? 90 : s.joystickSize === 'large' ? 138 : 112;
    joystickEl.style.width = `${sizePx}px`;
    joystickEl.style.height = `${sizePx}px`;
  }
}

function toggleVibration() {
  profileData.settings.vibration = !profileData.settings.vibration;
  if (profileData.settings.vibration) triggerHaptic(22);
  saveProfileData();
  updateSettingsUI();
}

function setControlStyle(style) {
  profileData.settings.controlStyle = style === 'swipe' ? 'swipe' : 'joystick';
  saveProfileData();
  updateSettingsUI();
}

function setJoystickSensitivity(val) {
  profileData.settings.joystickSensitivity = Math.max(50, Math.min(160, Number(val) || 100));
  const lbl = document.getElementById('sens-label');
  if (lbl) lbl.textContent = `${profileData.settings.joystickSensitivity}%`;
  saveProfileData();
}

function setJoystickSize(size) {
  profileData.settings.joystickSize = ['small', 'medium', 'large'].includes(size) ? size : 'medium';
  applyControlSettingsToDOM();
  saveProfileData();
  updateSettingsUI();
}

function toggleLeftHanded() {
  profileData.settings.leftHanded = !profileData.settings.leftHanded;
  applyControlSettingsToDOM();
  saveProfileData();
  updateSettingsUI();
}

function showSkinUnlockToast(skin) {
  if (isGameRunning && !isPaused && !isGameOver) {
    showIngameQuestToast('SKIN UNLOCKED', `🐍 ${skin.name}`);
    return;
  }
  if (!skinUnlockToastEl) return;
  skinUnlockToastEl.textContent = `${skin.name} unlocked`;
  skinUnlockToastEl.style.display = 'block';
  clearTimeout(skinUnlockToastTimer);
  skinUnlockToastTimer = setTimeout(() => { skinUnlockToastEl.style.display = 'none'; }, 3200);
}

function checkSkinUnlocks() {
  syncDerivedProfileStats();
  if (profileData && profileData.stats) {
    profileData.stats._cachedAchDone = countCompletedAchievements(profileData.stats);
  }
  let changed = false;
  for (const skin of SKINS) {
    if (unlockedSkinIds.has(skin.id) || (skin.unlock && skin.unlock.type === 'default')) continue;
    const prog = getSkinUnlockProgress(skin, true);
    if (!prog.earned) continue;
    unlockedSkinIds.add(skin.id);
    changed = true;
    showSkinUnlockToast(skin);
  }
  if (changed) {
    persistUnlockedSkins();
    saveProfileData();
    if (activeSubscreenId === 'skins-screen') renderSkinMenu();
  }
}

// ============================================================
// §5  BACKGROUND, FOOD & PARTICLES
// ============================================================

function isFarFromAllSnakes(x, y, minDist = 60) {
  const minDistSq = minDist * minDist;
  if (spatialItemCount > 0) {
    const cellX = Math.floor(wrap(x, WORLD_WIDTH) / SPATIAL_CELL_SIZE);
    const cellY = Math.floor(wrap(y, WORLD_HEIGHT) / SPATIAL_CELL_SIZE);
    const cellRadius = Math.max(1, Math.ceil(minDist / SPATIAL_CELL_SIZE));
    for (let oy = -cellRadius; oy <= cellRadius; oy++) {
      const row = wrap(cellY + oy, SPATIAL_ROWS);
      for (let ox = -cellRadius; ox <= cellRadius; ox++) {
        const column = wrap(cellX + ox, SPATIAL_COLUMNS);
        for (let slot = spatialHeads[row * SPATIAL_COLUMNS + column]; slot !== -1; slot = spatialNext[slot]) {
          if (spatialKind[slot] === 2) continue;
          const owner = spatialOwner[slot];
          if (!owner || !owner.alive) continue;
          if (toroidDistSq(spatialX[slot], spatialY[slot], x, y) < minDistSq) return false;
        }
      }
    }
    return true;
  }
  const allSnakes = snakeRoster;
  for (const s of allSnakes) {
    if (!s.alive) continue;
    if (toroidDistSq(s.x, s.y, x, y) < minDistSq) return false;
    for (let i = 0; i < s.segments.length; i += 2) {
      if (toroidDistSq(s.segments[i].x, s.segments[i].y, x, y) < minDistSq) return false;
    }
  }
  return true;
}

function isFarFromOtherFood(x, y, minDist = 48) {
  const minDistSq = minDist * minDist;
  for (let i = 0; i < foodOrbs.length; i++) {
    const o = foodOrbs[i];
    if (!o || o.consumed) continue;
    if (toroidDistSq(o.x, o.y, x, y) < minDistSq) return false;
  }
  for (let i = 0; i < powerups.length; i++) {
    const pu = powerups[i];
    if (toroidDistSq(pu.x, pu.y, x, y) < minDistSq) return false;
  }
  if (rareOrb && toroidDistSq(rareOrb.x, rareOrb.y, x, y) < minDistSq) return false;
  return true;
}

function isOutsidePlayerHeadClearCells(x, y, col = -1, row = -1) {
  if (!player || !player.alive) return true;
  const minCells = FRUITS_CONFIG.minHeadClearCells || 3;
  const cellWidth = WORLD_WIDTH / FOOD_GRID_COLUMNS;
  const cellHeight = WORLD_HEIGHT / FOOD_GRID_ROWS;
  const playerCol = Math.floor(wrap(player.x, WORLD_WIDTH) / cellWidth);
  const playerRow = Math.floor(wrap(player.y, WORLD_HEIGHT) / cellHeight);
  if (col >= 0 && row >= 0) {
    let dCol = Math.abs(col - playerCol);
    let dRow = Math.abs(row - playerRow);
    if (dCol > FOOD_GRID_COLUMNS / 2) dCol = FOOD_GRID_COLUMNS - dCol;
    if (dRow > FOOD_GRID_ROWS / 2) dRow = FOOD_GRID_ROWS - dRow;
    if (dCol <= minCells && dRow <= minCells) return false;
  }
  const minClearPx = Math.max(180, minCells * Math.min(cellWidth, cellHeight) * 0.65);
  return toroidDistSq(player.x, player.y, x, y) >= minClearPx * minClearPx;
}

function spawnFoodOrb(customX, customY, customColor) {
  let x = customX !== undefined ? customX : Math.random() * WORLD_WIDTH;
  let y = customY !== undefined ? customY : Math.random() * WORLD_HEIGHT;

  if (customX === undefined) {
    for (let attempt = 0; attempt < 25; attempt++) {
      if (isFarFromAllSnakes(x, y, 45) && isOutsidePlayerHeadClearCells(x, y)) break;
      x = Math.random() * WORLD_WIDTH;
      y = Math.random() * WORLD_HEIGHT;
    }
  }

  const now = performance.now();
  const isSpecialDrop = Boolean(customColor && (customColor.isDeathDrop === true || customColor.isDangerFood === true || (customColor.value ?? 1) > 1));
  const orb = foodOrbPool.pop() || {};
  orb.x = x;
  orb.y = y;
  orb.gridCell = -1;
  orb.pulseSpeed = 0.045 + Math.random() * 0.035;
  orb.pulsePhase = Math.random() * Math.PI * 2;
  orb.vx = 0;
  orb.vy = 0;
  orb.burstAt = 0;
  orb.burstDelay = 0;
  orb.updateOffset = Math.floor(Math.random() * 4);
  orb.consumed = false;

  if (isSpecialDrop) {
    orb.isFruit = false;
    orb.fruitType = null;
    orb.points = (customColor.value || 2) * 10;
    orb.growth = customColor.value ?? 2;
    orb.value = orb.growth;
    orb.isDeathDrop = true;
    orb.isDangerFood = customColor.isDangerFood === true;
    orb.baseRadius = (4.5 + Math.random() * 2) * 1.4 * FOOD_SIZE_SCALE;
    orb.color = customColor.core || '#facc15';
    orb.outline = '#fef08a';
    orb.glow = customColor.glow || 'rgba(250,204,21,.72)';
    orb.spawnedAt = now;
    orb.lifetimeMs = Infinity;
    orb.expiresAt = Infinity;
  } else {
    const fruitDef = (customColor && customColor.fruitType && FRUITS_CONFIG.types[customColor.fruitType])
      ? FRUITS_CONFIG.types[customColor.fruitType]
      : pickFruitTypeForLevel(currentArenaLevel);
    const lifetimeMs = getFruitLifetimeMs(currentArenaLevel);
    orb.isFruit = true;
    orb.fruitType = fruitDef.id;
    orb.points = fruitDef.points;
    orb.growth = fruitDef.growth;
    orb.value = fruitDef.growth;
    orb.isDeathDrop = Boolean(customColor && customColor.isDeathDrop);
    orb.isDangerFood = false;
    orb.baseRadius = (fruitDef.id === 'grapes' ? 11.5 : fruitDef.id === 'cherry' ? 10.8 : 10.2) * FOOD_SIZE_SCALE;
    orb.color = fruitDef.color;
    orb.outline = fruitDef.outline;
    orb.glow = fruitDef.glow;
    orb.spawnedAt = now;
    orb.lifetimeMs = lifetimeMs;
    orb.expiresAt = orb.isDeathDrop ? (now + lifetimeMs * 1.5) : (now + lifetimeMs);
  }
  return orb;
}

function recycleFoodOrb(orb) {
  if (foodOrbPool.length < 2560) foodOrbPool.push(orb);
}

function initFood() {
  for (let i = 0; i < foodOrbs.length; i++) {
    recycleFoodOrb(foodOrbs[i]);
  }
  foodOrbs.length = 0;
  normalFoodCount = 0;
  foodGridTaken.fill(0);
  foodGridCursor = 0;
  const now = performance.now();
  const baseLife = getFruitLifetimeMs(currentArenaLevel);
  for (let i = 0; i < FOOD_COUNT; i++) {
    const orb = spawnGridFoodOrb(false);
    if (!orb) break;
    // Stagger initial fruit expiration timestamps so the initial field cycles smoothly
    const staggerMs = (i % 12) * Math.round(baseLife / 13);
    orb.expiresAt = now + baseLife + staggerMs;
    foodOrbs.push(orb);
  }
  // Persistent Gold Energy Orb cluster in the central Danger Zone
  for (let i = 0; i < DANGER_ZONE_FOOD_COUNT; i++) {
    const angle = (i / DANGER_ZONE_FOOD_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const distance = (0.18 + 0.82 * Math.sqrt((i + Math.random()) / DANGER_ZONE_FOOD_COUNT)) * DANGER_ZONE_RADIUS * 0.84;
    const orb = spawnFoodOrb(WORLD_WIDTH / 2 + Math.cos(angle) * distance, WORLD_HEIGHT / 2 + Math.sin(angle) * distance,
      { core: '#facc15', glow: 'rgba(250,204,21,.72)', value: 3, isDeathDrop: true, isDangerFood: true });
    foodOrbs.push(orb);
  }
  nextFoodSpawnAt = now + (FRUITS_CONFIG.spawnIntervalMs || 2500);
}

function countNormalFood() {
  return normalFoodCount;
}

function countVisibleNormalFood() {
  const halfWidth = width / (2 * cameraZoom);
  const halfHeight = height / (2 * cameraZoom);
  let count = 0;
  for (const orb of foodOrbs) {
    if (orb.isDeathDrop) continue;
    if (Math.abs(toroidDelta(player.x, orb.x, WORLD_WIDTH)) <= halfWidth &&
        Math.abs(toroidDelta(player.y, orb.y, WORLD_HEIGHT)) <= halfHeight) count++;
  }
  return count;
}

function spawnGridFoodOrb(preferNearPlayer = false) {
  const cellWidth = WORLD_WIDTH / FOOD_GRID_COLUMNS;
  const cellHeight = WORLD_HEIGHT / FOOD_GRID_ROWS;
  const playerCol = Math.floor(wrap(player.x, WORLD_WIDTH) / cellWidth);
  const playerRow = Math.floor(wrap(player.y, WORLD_HEIGHT) / cellHeight);

  for (let attempt = 0; attempt < FOOD_COUNT; attempt++) {
    let cell;
    if (preferNearPlayer && attempt < 36) {
      // Sample a random grid cell near the active viewport but outside 3 cells of the player's head
      const minC = (FRUITS_CONFIG.minHeadClearCells || 3) + 1;
      const offsetCol = (Math.random() < 0.5 ? -1 : 1) * (minC + Math.floor(Math.random() * 5));
      const offsetRow = (Math.random() < 0.5 ? -1 : 1) * (minC + Math.floor(Math.random() * 4));
      const c = wrap(playerCol + offsetCol, FOOD_GRID_COLUMNS);
      const r = wrap(playerRow + offsetRow, FOOD_GRID_ROWS);
      cell = r * FOOD_GRID_COLUMNS + c;
      if (cell >= FOOD_COUNT) cell = (foodGridCursor + attempt) % FOOD_COUNT;
    } else {
      cell = (foodGridCursor + attempt) % FOOD_COUNT;
    }
    if (foodGridTaken[cell]) continue;
    const column = cell % FOOD_GRID_COLUMNS;
    const row = Math.floor(cell / FOOD_GRID_COLUMNS);
    const jitterX = (Math.random() - 0.5) * cellWidth * 0.36;
    const jitterY = (Math.random() - 0.5) * cellHeight * 0.36;
    const x = wrap((column + 0.5) * cellWidth + jitterX, WORLD_WIDTH);
    const y = wrap((row + 0.5) * cellHeight + jitterY, WORLD_HEIGHT);
    if (!isOutsidePlayerHeadClearCells(x, y, column, row)) continue;
    if (!isFarFromAllSnakes(x, y, 85)) continue;
    if (!isFarFromOtherFood(x, y, 42)) continue;
    const orb = spawnFoodOrb(x, y);
    orb.gridCell = cell;
    foodGridTaken[cell] = 1;
    normalFoodCount++;
    foodGridCursor = (cell + 1) % FOOD_COUNT;
    return orb;
  }
  return null;
}

function updateFood() {
  const now = performance.now();
  const halfWidth = width / (2 * cameraZoom) + 100;
  const halfHeight = height / (2 * cameraZoom) + 100;

  let write = 0;
  for (let read = 0; read < foodOrbs.length; read++) {
    const orb = foodOrbs[read];
    if (orb.consumed) {
      recycleFoodOrb(orb);
      continue;
    }
    // Expire fruits after their level-scaled lifetime (9s at level 1 down to 5s at higher levels)
    if (orb.isFruit && orb.expiresAt && now >= orb.expiresAt) {
      const inView = Math.abs(toroidDelta(cameraX, orb.x, WORLD_WIDTH)) <= halfWidth &&
                     Math.abs(toroidDelta(cameraY, orb.y, WORLD_HEIGHT)) <= halfHeight;
      if (inView) {
        spawnFoodBurst(orb.x, orb.y, orb.color, 5);
      }
      if (!orb.isDeathDrop) {
        normalFoodCount = Math.max(0, normalFoodCount - 1);
        if (orb.gridCell >= 0) foodGridTaken[orb.gridCell] = 0;
      }
      recycleFoodOrb(orb);
      continue;
    }

    foodOrbs[write++] = orb;

    if (now < orb.burstAt + orb.burstDelay) continue;
    if (now < player.magnetUntil && player.alive && toroidDistSq(player.x, player.y, orb.x, orb.y) < 650 ** 2) {
      const dx = toroidDelta(orb.x, player.x, WORLD_WIDTH);
      const dy = toroidDelta(orb.y, player.y, WORLD_HEIGHT);
      const distance = Math.max(1, Math.hypot(dx, dy));
      orb.vx = dx / distance * Math.min(8, 2.2 + distance * 0.008);
      orb.vy = dy / distance * Math.min(8, 2.2 + distance * 0.008);
    } else {
      orb.vx = 0;
      orb.vy = 0;
    }
    if (orb.vx === 0 && orb.vy === 0) continue;
    const far = Math.abs(toroidDelta(cameraX, orb.x, WORLD_WIDTH)) > halfWidth || Math.abs(toroidDelta(cameraY, orb.y, WORLD_HEIGHT)) > halfHeight;
    if (far && animFrame % 4 !== orb.updateOffset) continue;
    const updateStep = far ? 4 : 1;
    orb.x = wrap(orb.x + orb.vx * updateStep, WORLD_WIDTH);
    orb.y = wrap(orb.y + orb.vy * updateStep, WORLD_HEIGHT);
  }
  foodOrbs.length = write;

  // A new fruit appears every 2.5 seconds on a random free grid cell, and background grid cells replenish smoothly
  if (now >= nextFoodSpawnAt) {
    const canSpawnVisible = countVisibleNormalFood() < MAX_VISIBLE_FOOD;
    const orb = spawnGridFoodOrb(canSpawnVisible);
    if (orb) foodOrbs.push(orb);
    // Keep background world fruit population healthy for distant bots
    let bgReplenish = 0;
    while (countNormalFood() < FOOD_COUNT * 0.85 && bgReplenish < 4) {
      const bgOrb = spawnGridFoodOrb(false);
      if (!bgOrb) break;
      foodOrbs.push(bgOrb);
      bgReplenish++;
    }
    nextFoodSpawnAt = now + (FRUITS_CONFIG.spawnIntervalMs || 2500);
  }
}

function scheduleNextRareOrb(now = performance.now()) {
  nextRareOrbAt = now + RARE_ORB_MIN_INTERVAL_MS + Math.random() * (RARE_ORB_MAX_INTERVAL_MS - RARE_ORB_MIN_INTERVAL_MS);
}

// ---- Power-up system ----
function scheduleNextPowerup(now = performance.now()) {
  nextPowerupSpawnAt = now + POWERUP_SPAWN_MIN_MS + Math.random() * (POWERUP_SPAWN_MAX_MS - POWERUP_SPAWN_MIN_MS);
}

function spawnPowerup(now = performance.now()) {
  if (!isGameRunning || isPaused || isGameOver) return;
  if (powerups.length >= MAX_POWERUPS_ON_MAP || now < nextPowerupSpawnAt) return;
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = Math.random() * WORLD_WIDTH;
    const y = Math.random() * WORLD_HEIGHT;
    if (!isFarFromAllSnakes(x, y, 80)) continue;
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerups.push({ ...type, x, y, spawnedAt: now, expiresAt: now + POWERUP_LIFETIME_MS });
    scheduleNextPowerup(now);
    return;
  }
  nextPowerupSpawnAt = now + 2000;
}

function checkPowerupCollection(now = performance.now()) {
  const isMobViewport = width <= 768 || isMobileDevice;
  const mobileHeadBase = isMobViewport ? 1.28 : 1.0;
  for (let i = powerups.length - 1; i >= 0; i--) {
    const pu = powerups[i];
    if (now >= pu.expiresAt) { powerups.splice(i, 1); continue; }
    for (const snake of snakeRoster) {
      if (!snake.alive) continue;
      const headR = HEAD_RADIUS * mobileHeadBase * getSnakeHeadGrowthScale(snake.length);
      const pickupDistSq = (headR + 14) ** 2;
      if (toroidDistSq(snake.x, snake.y, pu.x, pu.y) >= pickupDistSq) continue;
      // Apply power-up (Magnet, Speed Boost, or Blue Plasma 2X Score Multiplier Orb)
      if (pu.id === 'magnet') {
        snake.magnetUntil = Math.max(snake.magnetUntil || 0, now + pu.duration);
      } else if (pu.id === 'speed') {
        snake.speedBoostUntil = now + pu.duration;
        snake.speedBoostMultiplier = pu.multiplier;
      } else if (pu.id === 'plasma') {
        snake.plasma2xUntil = Math.max(snake.plasma2xUntil || 0, now + pu.duration);
      }
      spawnFoodBurst(pu.x, pu.y, pu.color, 8);
      if (snake.isPlayer) {
        sfxRareOrbEat();
        triggerHaptic(20);
        showPowerupIndicator(pu.icon + ' ' + pu.label);
        matchPowerupsCollected++;
        if (profileData) {
          profileData.stats.totalPowerups = (profileData.stats.totalPowerups || 0) + 1;
          if (pu.id === 'speed') profileData.stats.totalDashes = (profileData.stats.totalDashes || 0) + 1;
          recordMissionProgress('powerups', 1);
        }
      }
      powerups.splice(i, 1);
      break;
    }
  }
}

function showPowerupIndicator(text) {
  if (!powerupIndicatorEl) return;
  powerupIndicatorEl.textContent = text;
  powerupIndicatorEl.style.display = 'block';
  powerupIndicatorEl.style.opacity = '1';
  clearTimeout(powerupIndicatorTimer);
  powerupIndicatorTimer = setTimeout(() => {
    if (powerupIndicatorEl) { powerupIndicatorEl.style.opacity = '0'; setTimeout(() => { if (powerupIndicatorEl) powerupIndicatorEl.style.display = 'none'; }, 250); }
  }, 2000);
}

function renderPowerups() {
  const now = performance.now();
  const bounds = cameraViewBounds(24);
  for (const pu of powerups) {
    const age = now - pu.spawnedAt;
    const remaining = pu.expiresAt - now;
    const blink = remaining < 4000 ? (Math.sin(now * 0.015) > 0 ? 1 : 0.3) : 1;
    const bob = Math.sin(now * 0.004 + age * 0.001) * 4;
    const x = cameraX + toroidDelta(cameraX, pu.x, WORLD_WIDTH);
    if (x + 20 < bounds.left || x - 20 > bounds.right) continue;
    const y = cameraY + toroidDelta(cameraY, pu.y, WORLD_HEIGHT) + bob;
    if (y + 20 < bounds.top || y - 20 > bounds.bottom) continue;
    ctx.save();
    ctx.globalAlpha = blink;
    drawCachedGlow(pu.glow, x, y, 16, 0.7);
    ctx.fillStyle = pu.color;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pu.icon, x, y + 1);
    ctx.restore();
  }
}

// ---- Big snake food production ----
function bigSnakeFoodProduction(now = performance.now()) {
  if (now - lastBigSnakeFoodAt < BIG_SNAKE_FOOD_INTERVAL_MS) return;
  lastBigSnakeFoodAt = now;
  if (foodOrbs.length >= FOOD_COUNT + MAX_DEATH_DROP_ORBS) return;
  for (const snake of snakeRoster) {
    if (!snake.alive || snake.length < BIG_SNAKE_FOOD_THRESHOLD) continue;
    if (foodOrbs.length >= FOOD_COUNT + MAX_DEATH_DROP_ORBS) break;
    // The bigger the snake, the more food it produces
    const extraFood = Math.min(3, Math.floor((snake.length - BIG_SNAKE_FOOD_THRESHOLD) / 25) + 1);
    for (let f = 0; f < extraFood; f++) {
      if (foodOrbs.length >= FOOD_COUNT + MAX_DEATH_DROP_ORBS) break;
      // Spawn food near the snake's tail area
      const tailIdx = Math.min(snake.segments.length - 1, Math.floor(snake.segments.length * 0.6) + Math.floor(Math.random() * Math.floor(snake.segments.length * 0.4)));
      const tail = snake.segments[tailIdx];
      if (!tail) continue;
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      const fx = wrap(tail.x + Math.cos(angle) * dist, WORLD_WIDTH);
      const fy = wrap(tail.y + Math.sin(angle) * dist, WORLD_HEIGHT);
      const orb = spawnFoodOrb(fx, fy);
      orb.isDeathDrop = true;
      orb.value = 1;
      foodOrbs.push(orb);
    }
  }
}

function isClearRareOrbSpot(x, y) {
  return isFarFromAllSnakes(x, y, 34);
}

function maybeSpawnRareOrb(now = performance.now()) {
  if (!isGameRunning || isPaused || isGameOver) return;
  if (rareOrb && now >= rareOrb.expiresAt) {
    rareOrb = null;
    scheduleNextRareOrb(now);
  }
  if (rareOrb || now < nextRareOrbAt) return;

  for (let attempt = 0; attempt < 50; attempt++) {
    const x = Math.random() * WORLD_WIDTH;
    const y = Math.random() * WORLD_HEIGHT;
    if (!isClearRareOrbSpot(x, y)) continue;
    rareOrb = { x, y, spawnedAt: now, expiresAt: now + RARE_ORB_LIFETIME_MS };
    nextRareOrbAt = Infinity;
    sfxRareOrbSpawn();
    return;
  }
  nextRareOrbAt = now + 2000;
}

function spawnFoodBurst(x, y, color, count = 10) {
  if (particles.length >= maxParticles) return;
  for (let i = 0; i < count; i++) {
    if (particles.length >= maxParticles) break;
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 3.2;
    const particle = particlePool.pop() || {};
    particle.x = x;
    particle.y = y;
    particle.vx = Math.cos(angle) * speed;
    particle.vy = Math.sin(angle) * speed;
    particle.size = 2 + Math.random() * 2.5;
    particle.alpha = 1;
    particle.color = color;
    particle.decay = 0.03 + Math.random() * 0.02;
    particle.updateOffset = Math.floor(Math.random() * 3);
    particles.push(particle);
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const far = Math.abs(toroidDelta(cameraX, p.x, WORLD_WIDTH)) > width / (2 * cameraZoom) + 120 ||
      Math.abs(toroidDelta(cameraY, p.y, WORLD_HEIGHT)) > height / (2 * cameraZoom) + 120;
    if (far && animFrame % 3 !== p.updateOffset) continue;
    const updateStep = far ? 3 : 1;
    p.x = wrap(p.x + p.vx * updateStep, WORLD_WIDTH);
    p.y = wrap(p.y + p.vy * updateStep, WORLD_HEIGHT);
    p.vx *= Math.pow(0.94, updateStep);
    p.vy *= Math.pow(0.94, updateStep);
    p.alpha -= p.decay * updateStep;
    if (p.alpha <= 0) {
      const last = particles.length - 1;
      particles[i] = particles[last];
      particles.pop();
      if (particlePool.length < maxParticles) particlePool.push(p);
    }
  }

}

// ============================================================
// §6  BOTS CREATION & BEHAVIOR (WITH ANTI-SPIN LOGIC)
// ============================================================

function getActiveSpeed() {
  return SPEED_CONFIGS[normalizeDifficulty(currentDifficulty)] || SPEED_CONFIGS.medium;
}

function findSafeSpawnCoords(minHeadDist = 260, bodyLen = INITIAL_SEGMENTS, spawnAngle = 0) {
  let bestX = Math.random() * WORLD_WIDTH;
  let bestY = Math.random() * WORLD_HEIGHT;
  let maxMinDistSq = -1;

  const headClearSq = minHeadDist * minHeadDist;
  const playerClearSq = Math.max(minHeadDist, BOT_RING_MIN_DIST) ** 2;
  const bodyClearDist = 140;
  const bodyClearSq = bodyClearDist * bodyClearDist;
  const tailSpan = Math.min(360, bodyLen * SEGMENT_SPACING);
  const cosA = Math.cos(spawnAngle);
  const sinA = Math.sin(spawnAngle);

  for (let attempt = 0; attempt < 48; attempt++) {
    const cx = Math.random() * WORLD_WIDTH;
    const cy = Math.random() * WORLD_HEIGHT;
    let closestDistSq = Infinity;
    let rejected = false;

    for (let sIdx = 0; sIdx < snakeRoster.length; sIdx++) {
      const s = snakeRoster[sIdx];
      if (!s || !s.alive) continue;
      const dHeadSq = toroidDistSq(cx, cy, s.x, s.y);
      if (dHeadSq < closestDistSq) closestDistSq = dHeadSq;
      const reqHeadSq = s.isPlayer ? playerClearSq : headClearSq;
      if (dHeadSq < reqHeadSq) {
        rejected = true;
      }
      const segs = s.segments;
      const stride = segs.length > 80 ? 4 : 3;
      for (let i = 0; i < segs.length; i += stride) {
        const dSegSq = toroidDistSq(cx, cy, segs[i].x, segs[i].y);
        if (dSegSq < closestDistSq) closestDistSq = dSegSq;
        if (dSegSq < bodyClearSq) {
          rejected = true;
          break;
        }
      }
    }

    if (!rejected && tailSpan > 30) {
      const midX = wrap(cx - cosA * (tailSpan * 0.5), WORLD_WIDTH);
      const midY = wrap(cy - sinA * (tailSpan * 0.5), WORLD_HEIGHT);
      const endX = wrap(cx - cosA * tailSpan, WORLD_WIDTH);
      const endY = wrap(cy - sinA * tailSpan, WORLD_HEIGHT);
      if (!isFarFromAllSnakes(midX, midY, 95) || !isFarFromAllSnakes(endX, endY, 95)) {
        rejected = true;
      }
    }

    if (!rejected && closestDistSq >= bodyClearSq) {
      return { x: cx, y: cy };
    }
    if (closestDistSq > maxMinDistSq) {
      maxMinDistSq = closestDistSq;
      bestX = cx;
      bestY = cy;
    }
  }
  return { x: bestX, y: bestY };
}

function findRingSpawnCoords(minClearDist = BOT_RING_MIN_DIST, bodyLen = INITIAL_SEGMENTS, spawnAngle = 0) {
  const viewHalfW = width / (2 * Math.max(0.25, cameraZoom));
  const viewHalfH = height / (2 * Math.max(0.25, cameraZoom));
  const viewHalfDiag = Math.hypot(viewHalfW, viewHalfH);
  const innerRing = Math.max(minClearDist, viewHalfDiag + 140);
  const outerRing = Math.min(WORLD_WIDTH * 0.46, Math.max(innerRing + 650, viewHalfDiag + 1150));
  const playerMinSq = minClearDist * minClearDist;
  const tailSpan = Math.min(360, bodyLen * SEGMENT_SPACING);
  const cosA = Math.cos(spawnAngle);
  const sinA = Math.sin(spawnAngle);

  let bestX = wrap(player.x + innerRing, WORLD_WIDTH);
  let bestY = wrap(player.y + innerRing, WORLD_HEIGHT);
  let maxMinDistSq = -1;

  for (let attempt = 0; attempt < 64; attempt++) {
    const theta = Math.random() * Math.PI * 2;
    const dist = innerRing + Math.random() * (outerRing - innerRing);
    const cx = wrap(player.x + Math.cos(theta) * dist, WORLD_WIDTH);
    const cy = wrap(player.y + Math.sin(theta) * dist, WORLD_HEIGHT);

    // Must be outside the current camera view rectangle and at least minClearDist (600) from the player
    const inViewX = Math.abs(toroidDelta(cameraX, cx, WORLD_WIDTH)) < viewHalfW + 80;
    const inViewY = Math.abs(toroidDelta(cameraY, cy, WORLD_HEIGHT)) < viewHalfH + 80;
    if (inViewX && inViewY) continue;
    if (toroidDistSq(cx, cy, player.x, player.y) < playerMinSq) continue;

    // First 36 attempts enforce full 600-unit clearance from all other snakes; remaining attempts gracefully step down if 120 bots pack the arena
    const otherClearDist = attempt < 36 ? minClearDist : (attempt < 50 ? 420 : 260);
    const otherClearSq = otherClearDist * otherClearDist;
    let closestDistSq = Infinity;
    let rejected = false;

    for (let sIdx = 0; sIdx < snakeRoster.length; sIdx++) {
      const s = snakeRoster[sIdx];
      if (!s || !s.alive) continue;
      const reqSq = s.isPlayer ? playerMinSq : otherClearSq;
      const dHeadSq = toroidDistSq(cx, cy, s.x, s.y);
      if (dHeadSq < closestDistSq) closestDistSq = dHeadSq;
      if (dHeadSq < reqSq) {
        rejected = true;
        break;
      }
      const segs = s.segments;
      const stride = segs.length > 80 ? 5 : 3;
      for (let i = 0; i < segs.length; i += stride) {
        const dSegSq = toroidDistSq(cx, cy, segs[i].x, segs[i].y);
        if (dSegSq < closestDistSq) closestDistSq = dSegSq;
        if (dSegSq < reqSq) {
          rejected = true;
          break;
        }
      }
      if (rejected) break;
    }

    if (!rejected && tailSpan > 30) {
      const midX = wrap(cx - cosA * (tailSpan * 0.5), WORLD_WIDTH);
      const midY = wrap(cy - sinA * (tailSpan * 0.5), WORLD_HEIGHT);
      const endX = wrap(cx - cosA * tailSpan, WORLD_WIDTH);
      const endY = wrap(cy - sinA * tailSpan, WORLD_HEIGHT);
      if (!isFarFromAllSnakes(midX, midY, 120) || !isFarFromAllSnakes(endX, endY, 120)) {
        rejected = true;
      }
    }

    if (!rejected && closestDistSq >= otherClearSq) {
      return { x: cx, y: cy };
    }
    if (closestDistSq > maxMinDistSq) {
      maxMinDistSq = closestDistSq;
      bestX = cx;
      bestY = cy;
    }
  }
  return { x: bestX, y: bestY };
}

function createBot(config, index, useRingSpawn = false) {
  const initialAngle = Math.random() * Math.PI * 2;
  // Seed tiered rival sizes identically in all difficulties
  const sizeTierBonus = index === 0 ? 45 : index < 4 ? 22 : index < 10 ? 10 : 0;
  const initialLength = INITIAL_SEGMENTS - 3 + Math.floor(Math.random() * 12) + sizeTierBonus;
  const pos = useRingSpawn
    ? findRingSpawnCoords(BOT_RING_MIN_DIST, initialLength, initialAngle)
    : findSafeSpawnCoords(280, initialLength, initialAngle);
  const segments = [];

  for (let i = 0; i < initialLength; i++) {
    segments.push({
      x: wrap(pos.x - Math.cos(initialAngle) * i * SEGMENT_SPACING, WORLD_WIDTH),
      y: wrap(pos.y - Math.sin(initialAngle) * i * SEGMENT_SPACING, WORLD_HEIGHT),
      angle: initialAngle,
      lateralOffset: 0
    });
  }

  const now = performance.now();
  const personalityBase = BOT_PERSONALITIES[index % BOT_PERSONALITIES.length];

  return {
    name: index < BOT_CONFIGS.length ? config.name : `${config.name}-${Math.floor(index / BOT_CONFIGS.length) + 1}`,
    aiOffset: index % 8,
    isPlayer: false,
    x: pos.x,
    y: pos.y,
    prevX: pos.x,
    prevY: pos.y,
    angle: initialAngle,
    targetAngle: initialAngle,
    speed: getActiveSpeed(),
    turnRate: TURN_RATE,
    length: initialLength,
    segments,
    palette: config.palette,
    rarity: config.rarity || 'common',
    eatPulses: [],
    lastEatAt: 0,
    lastRarityParticleAt: 0,
    tongueTimer: Math.floor(Math.random() * 150),
    tongueProgress: 0,
    glowTrailUntil: 0,
    glowTrailSamples: [],
    trailWorldX: pos.x,
    trailWorldY: pos.y,
    lastTrailSampleAt: 0,
    growQueue: 0,
    alive: true,
    protectedUntil: now + 2000,
    spawnFadeStartAt: now,
    spawnFadeDuration: BOT_SPAWN_FADE_MS,
    respawnTimer: 0,
    sameTurnCount: 0,
    turnDir: 0,
    unstickUntil: 0,
    unstickAngle: initialAngle,
    anchorX: pos.x,
    anchorY: pos.y,
    anchorTime: now,
    dashUntil: 0,
    speedBoostUntil: 0,
    botDashReadyAt: now + 3500 + Math.random() * 4500,
    packSlotIdx: -1,
    packCount: 0,
    packFlankAngle: 0,
    personality: {
      ...personalityBase,
      aggressiveness: personalityBase.aggressive ? (0.58 + Math.random() * 0.38) : (0.25 + Math.random() * 0.25),
      lookAheadDist: 82 + Math.random() * 34,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitRadius: 145,
      reactionMs: 36 + Math.random() * 24,
      nextDecisionAt: 0,
      cachedDesiredAngle: initialAngle,
      lastHadDanger: false,
      lastAvoidAngle: initialAngle
    }
  };
}

function initBots() {
  bots.length = 0;
  snakeRoster.length = 1;
  leaderboardOrder[0] = player;
  leaderboardOrder.length = 1;
  const isMob = width <= 768 || isMobileDevice;
  const cfgMax = Number(GAME_CONFIG.BOT_MAX);
  activeBotMax = (Number.isFinite(cfgMax) && cfgMax >= BOT_MIN_CAP)
    ? (isMob && cfgMax === BOT_MAX_DESKTOP ? BOT_MAX_MOBILE : cfgMax)
    : (isMob ? BOT_MAX_MOBILE : BOT_MAX_DESKTOP);
  activeTargetBotCount = Math.min(activeBotMax, BOT_START_COUNT);
  totalBotsCreatedInMatch = 0;
  const now = performance.now();
  nextBotWaveAt = now + BOT_WAVE_INTERVAL_MS;
  nextWaveBotSpawnAt = now + 450;
  for (let i = 0; i < activeTargetBotCount; i++) {
    const bot = createBot(BOT_CONFIGS[i % BOT_CONFIGS.length], totalBotsCreatedInMatch++, false);
    bots.push(bot);
    snakeRoster.push(bot);
    leaderboardOrder.push(bot);
  }
  buildSpatialHash();
}

function respawnBot(bot) {
  const newAngle = Math.random() * Math.PI * 2;
  // Identical progressive respawn scaling across all difficulties
  const timeProgression = Math.min(1, survivalSeconds / 180);
  const progressiveBonus = Math.round(timeProgression * 28 + Math.max(0, player.length - INITIAL_SEGMENTS) * 0.18);
  const newLength = INITIAL_SEGMENTS - 3 + Math.floor(Math.random() * 12) + Math.min(85, progressiveBonus);
  const pos = findRingSpawnCoords(BOT_RING_MIN_DIST, newLength, newAngle);
  bot.x = pos.x;
  bot.y = pos.y;
  bot.prevX = pos.x;
  bot.prevY = pos.y;
  bot.trailWorldX = pos.x;
  bot.trailWorldY = pos.y;
  bot.glowTrailUntil = 0;
  for (let i = 0; i < bot.glowTrailSamples.length; i++) {
    if (glowTrailSamplePool.length < 1024) glowTrailSamplePool.push(bot.glowTrailSamples[i]);
  }
  bot.glowTrailSamples.length = 0;
  bot.lastTrailSampleAt = 0;
  bot.angle = newAngle;
  bot.targetAngle = newAngle;
  bot.speed = getActiveSpeed();
  bot.length = newLength;
  bot.segments.length = 0;
  bot.growQueue = 0;
  bot.alive = true;
  const now = performance.now();
  bot.protectedUntil = now + 2000;
  bot.spawnFadeStartAt = now;
  bot.spawnFadeDuration = BOT_SPAWN_FADE_MS;
  bot.respawnTimer = 0;
  bot.sameTurnCount = 0;
  bot.turnDir = 0;
  bot.unstickUntil = 0;
  bot.unstickAngle = newAngle;
  bot.anchorX = pos.x;
  bot.anchorY = pos.y;
  bot.anchorTime = now;
  bot.dashUntil = 0;
  bot.speedBoostUntil = 0;
  bot.botDashReadyAt = now + 3500 + Math.random() * 4500;
  bot.packSlotIdx = -1;
  bot.packCount = 0;
  bot.personality.nextDecisionAt = 0;
  bot.personality.cachedDesiredAngle = newAngle;
  bot.personality.lastHadDanger = false;
  bot.personality.lastAvoidAngle = newAngle;
  bot.personality.orbitRadius = 145;

  for (let i = 0; i < bot.length; i++) {
    bot.segments.push({
      x: wrap(pos.x - Math.cos(bot.angle) * i * SEGMENT_SPACING, WORLD_WIDTH),
      y: wrap(pos.y - Math.sin(bot.angle) * i * SEGMENT_SPACING, WORLD_HEIGHT),
      angle: bot.angle,
      lateralOffset: 0
    });
  }
}

function updateBotWaves(now = performance.now()) {
  if (!isGameRunning || isPaused || isGameOver) return;
  if (typeof AdManager !== 'undefined' && AdManager.adInProgress) return;
  const elapsedMatchMs = Math.max(0, now - gameStartTime - totalPausedDuration);
  const waveSteps = Math.floor(elapsedMatchMs / BOT_WAVE_INTERVAL_MS);
  activeTargetBotCount = Math.min(activeBotMax, BOT_START_COUNT + waveSteps * BOT_WAVE_ADD);

  // Gradually spawn new wave bots in a ring outside the player's view (at least 600 units away) with 1.5s fade-in
  if (bots.length < activeTargetBotCount && now >= nextWaveBotSpawnAt) {
    const idx = totalBotsCreatedInMatch++;
    const bot = createBot(BOT_CONFIGS[idx % BOT_CONFIGS.length], idx, true);
    bots.push(bot);
    snakeRoster.push(bot);
    leaderboardOrder.push(bot);
    nextWaveBotSpawnAt = now + 420;
  }
}

function getMatchDifficultyPhase() {
  // Identical tactical AI progression in every difficulty mode; bots are ready to hunt and trap from the start (baseline 0.38)
  const timeFactor = Math.min(1, survivalSeconds / 180);
  const sizeFactor = Math.min(1, Math.max(0, player.length - INITIAL_SEGMENTS) / 180);
  return Math.min(1, 0.38 + timeFactor * 0.42 + sizeFactor * 0.20);
}

const activePackBots = [];

function updatePackCoordination() {
  if (animFrame % 4 !== 0 || !player.alive) return;
  activePackBots.length = 0;
  const packRadiusSq = 680 * 680;
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    if (!b.alive) {
      b.packSlotIdx = -1;
      b.packCount = 0;
      continue;
    }
    if (!b.personality.aggressive) {
      b.packSlotIdx = -1;
      b.packCount = 0;
      continue;
    }
    const dSq = toroidDistSq(player.x, player.y, b.x, b.y);
    if (dSq <= packRadiusSq) {
      activePackBots.push(b);
    } else {
      b.packSlotIdx = -1;
      b.packCount = 0;
    }
  }
  const count = activePackBots.length;
  if (count < 2) {
    if (count === 1) {
      activePackBots[0].packSlotIdx = -1;
      activePackBots[0].packCount = 1;
    }
    return;
  }
  // Sort pack members by current angle around the player so they take non-crossing pincer lanes
  activePackBots.sort((a, b) => {
    const angA = Math.atan2(toroidDelta(player.y, a.y, WORLD_HEIGHT), toroidDelta(player.x, a.x, WORLD_WIDTH));
    const angB = Math.atan2(toroidDelta(player.y, b.y, WORLD_HEIGHT), toroidDelta(player.x, b.x, WORLD_WIDTH));
    return angA - angB;
  });
  for (let i = 0; i < count; i++) {
    const b = activePackBots[i];
    b.packSlotIdx = i;
    b.packCount = count;
    // Spread flanking approach angles across a 250-degree arc centered on the player's forward path
    const spread = ((i / Math.max(1, count - 1)) - 0.5) * Math.PI * 1.38;
    b.packFlankAngle = player.angle + spread;
  }
}

function updateBotAI(bot) {
  if (!bot.alive) return;

  const allSnakes = snakeRoster;
  const brain = bot.personality;
  const now = performance.now();
  const phase = getMatchDifficultyPhase();
  const isEliteBot = bot.length >= 42 || isKingSnake(bot);
  const playerDistSq = player.alive ? toroidDistSq(bot.x, bot.y, player.x, player.y) : Infinity;

  // Level-of-Detail (LOD) AI:
  // - Far LOD (> 1200 units from player): simple cheap steering every 6 to 8 frames
  // - Near LOD (<= 1200 units from player): full tactical decisions every 2 to 3 frames
  if (playerDistSq > BOT_LOD_NEAR_DIST_SQ) {
    if ((animFrame + bot.aiOffset) % 7 === 0) {
      let target = rareOrb;
      let nearestDistance = target ? toroidDistSq(bot.x, bot.y, target.x, target.y) : Infinity;
      const stride = foodOrbs.length > 240 ? 3 : 1;
      for (let i = bot.aiOffset % stride; i < foodOrbs.length; i += stride) {
        const orb = foodOrbs[i];
        const distance = toroidDistSq(bot.x, bot.y, orb.x, orb.y);
        if (distance < nearestDistance) { nearestDistance = distance; target = orb; }
      }
      if (target) {
        bot.targetAngle = Math.atan2(toroidDelta(bot.y, target.y, WORLD_HEIGHT), toroidDelta(bot.x, target.x, WORLD_WIDTH));
      }
      const probeX = wrap(bot.x + Math.cos(bot.angle) * 76, WORLD_WIDTH);
      const probeY = wrap(bot.y + Math.sin(bot.angle) * 76, WORLD_HEIGHT);
      if (spatialDangerAt(probeX, probeY, HEAD_RADIUS + 12, bot) > 0) {
        bot.targetAngle = bot.angle + ((bot.aiOffset & 1) ? 1.45 : -1.45);
      }
    }
    const farTurn = angleDifference(bot.angle, bot.targetAngle);
    bot.angle += Math.sign(farTurn) * Math.min(Math.abs(farTurn), bot.turnRate * 0.78);
    return;
  }

  // Near LOD (<= 1200 units): full decisions every 2 to 3 frames with short reaction delay
  if ((animFrame + bot.aiOffset) % 3 === 0 && now >= brain.nextDecisionAt) {
    let nearestFood = null;
    let nearestFoodDistSq = Infinity;
    let nearestDrop = null;
    let nearestDropDistSq = Infinity;
    for (const orb of foodOrbs) {
      const dSq = toroidDistSq(bot.x, bot.y, orb.x, orb.y);
      // Aggressive bots treat Grapes (+50 pts, +2 growth) as high priority and race the player for them
      const isGrapes = orb.fruitType === 'grapes';
      const fruitWeight = isGrapes
        ? (brain.aggressive ? 3.8 : 2.4)
        : (orb.fruitType === 'cherry' ? 1.65 : (orb.value > 1 ? orb.value * 1.55 : 1));
      const weightedDistSq = fruitWeight > 1 ? dSq / fruitWeight : dSq;
      if (weightedDistSq < nearestFoodDistSq) { nearestFoodDistSq = weightedDistSq; nearestFood = orb; }
      if ((orb.value > 1 || isGrapes) && dSq < nearestDropDistSq) { nearestDropDistSq = dSq; nearestDrop = orb; }
    }

    let target = nearestDrop && nearestDropDistSq < 440 * 440 ? nearestDrop : nearestFood;
    if (brain.style === 'scavenger' && nearestDrop) target = nearestDrop;
    let targetDistSq = target ? toroidDistSq(bot.x, bot.y, target.x, target.y) : Infinity;
    let rareTarget = false;
    if (rareOrb) {
      const rareDistanceSq = toroidDistSq(bot.x, bot.y, rareOrb.x, rareOrb.y);
      if (rareDistanceSq < targetDistSq * 2.1 || rareDistanceSq < 680 * 680) {
        target = rareOrb;
        rareTarget = true;
      }
    }

    let desiredAngle = bot.angle;
    if (target) {
      desiredAngle = Math.atan2(toroidDelta(bot.y, target.y, WORLD_HEIGHT), toroidDelta(bot.x, target.x, WORLD_WIDTH));
    }

    let closestEnemy = null;
    let closestEnemyDistSq = Infinity;
    let threateningEnemy = null;
    let threateningDistSq = Infinity;
    for (const enemy of allSnakes) {
      if (enemy === bot || !enemy.alive) continue;
      const dSq = toroidDistSq(bot.x, bot.y, enemy.x, enemy.y);
      if (enemy.length < bot.length + 14 && dSq < closestEnemyDistSq) {
        closestEnemyDistSq = dSq;
        closestEnemy = enemy;
      }
      if (enemy.length >= bot.length + 12 && dSq < threateningDistSq) {
        threateningDistSq = dSq;
        threateningEnemy = enemy;
      }
    }

    const predictIntercept = (enemy, leadFrames = 56, offset = 46, flankAngleOffset = 0) => {
      const heading = enemy.angle + flankAngleOffset;
      const x = wrap(enemy.x + Math.cos(heading) * enemy.speed * leadFrames + Math.cos(heading) * offset, WORLD_WIDTH);
      const y = wrap(enemy.y + Math.sin(heading) * enemy.speed * leadFrames + Math.sin(heading) * offset, WORLD_HEIGHT);
      return Math.atan2(toroidDelta(bot.y, y, WORLD_HEIGHT), toroidDelta(bot.x, x, WORLD_WIDTH));
    };

    const engageRadiusSq = (420 + phase * 240) ** 2;

    // 1. Smart Evasion when threatened by a much larger snake at very close range
    if (threateningEnemy && threateningDistSq < (125 + phase * 35) ** 2 && bot.length < 36) {
      const awayX = toroidDelta(threateningEnemy.x, bot.x, WORLD_WIDTH);
      const awayY = toroidDelta(threateningEnemy.y, bot.y, WORLD_HEIGHT);
      desiredAngle = Math.atan2(awayY, awayX) + Math.sin(animFrame * 0.08 + bot.aiOffset) * 0.35;
    }
    // 2. Pack Pincer Coordination: when 2+ aggressive bots are near the player, approach from distributed flank angles to pin the player
    else if (!rareTarget && player.alive && bot.packCount >= 2 && bot.packSlotIdx >= 0 && playerDistSq < 660 * 660) {
      const pincerDist = 115 + (bot.packSlotIdx % 3) * 32;
      const leadX = wrap(player.x + Math.cos(player.angle) * player.speed * 26 + Math.cos(bot.packFlankAngle) * pincerDist, WORLD_WIDTH);
      const leadY = wrap(player.y + Math.sin(player.angle) * player.speed * 26 + Math.sin(bot.packFlankAngle) * pincerDist, WORLD_HEIGHT);
      desiredAngle = Math.atan2(toroidDelta(bot.y, leadY, WORLD_HEIGHT), toroidDelta(bot.x, leadX, WORLD_WIDTH));
      const distToPlayer = Math.sqrt(playerDistSq);
      if (distToPlayer > 75 && distToPlayer < 240 && now >= (bot.botDashReadyAt || 0)) {
        const angleToFront = Math.abs(angleDifference(bot.angle, desiredAngle));
        if (angleToFront < 0.42) {
          bot.dashUntil = now + 680;
          bot.botDashReadyAt = now + 7500 + Math.random() * 3000;
        }
      }
    }
    // 3. Hunter Route-Cutting & Interception against Player or nearby rivals
    else if (!rareTarget && (brain.style === 'hunter' || isEliteBot) && (player.alive || closestEnemy)) {
      const preferPlayer = player.alive && playerDistSq < engageRadiusSq && (brain.aggressiveness + phase * 0.35 > 0.42);
      const huntTarget = preferPlayer ? player : (closestEnemy || (player.alive ? player : null));
      if (huntTarget) {
        const distToTarget = Math.sqrt(toroidDistSq(bot.x, bot.y, huntTarget.x, huntTarget.y));
        const lead = Math.min(78, Math.max(24, distToTarget / Math.max(2.5, bot.speed) * (0.78 + phase * 0.42)));
        desiredAngle = predictIntercept(huntTarget, lead, 44 + phase * 26);
        if (huntTarget === player && distToTarget > 75 && distToTarget < 235 && now >= (bot.botDashReadyAt || 0)) {
          const angleToFront = Math.abs(angleDifference(bot.angle, desiredAngle));
          if (angleToFront < 0.45) {
            bot.dashUntil = now + 680;
            bot.botDashReadyAt = now + 7500 + Math.random() * 3000;
          }
        }
      }
    } else if (!rareTarget && brain.style === 'encircler') {
      let nearby = (player.alive && playerDistSq < engageRadiusSq) ? player : null;
      let nearbyDistSq = nearby ? playerDistSq : Infinity;
      if (!nearby) {
        for (const candidate of allSnakes) {
          if (candidate === bot || !candidate.alive) continue;
          const dSq = toroidDistSq(bot.x, bot.y, candidate.x, candidate.y);
          if (dSq < nearbyDistSq) { nearby = candidate; nearbyDistSq = dSq; }
        }
      }
      if (nearby) {
        brain.orbitAngle += (bot.name < nearby.name ? 1 : -1) * (0.08 + phase * 0.035);
        brain.orbitRadius = Math.max(54, brain.orbitRadius - (0.10 + phase * 0.08));
        const leadX = wrap(nearby.x + Math.cos(nearby.angle) * nearby.speed * (14 + phase * 18), WORLD_WIDTH);
        const leadY = wrap(nearby.y + Math.sin(nearby.angle) * nearby.speed * (14 + phase * 18), WORLD_HEIGHT);
        const orbitX = wrap(leadX + Math.cos(brain.orbitAngle) * brain.orbitRadius, WORLD_WIDTH);
        const orbitY = wrap(leadY + Math.sin(brain.orbitAngle) * brain.orbitRadius, WORLD_HEIGHT);
        desiredAngle = Math.atan2(toroidDelta(bot.y, orbitY, WORLD_HEIGHT), toroidDelta(bot.x, orbitX, WORLD_WIDTH));
      }
    } else if (!rareTarget && brain.style === 'opportunist') {
      if (player.alive && playerDistSq < (310 + phase * 140) ** 2) {
        desiredAngle = predictIntercept(player, 46 + phase * 22, 40);
      } else if (closestEnemy && closestEnemyDistSq < (260 + phase * 110) ** 2) {
        desiredAngle = predictIntercept(closestEnemy, 45, 34);
      }
    } else if (!rareTarget && brain.style === 'scavenger' && !nearestDrop) {
      let nearbyA = null;
      let nearbyB = null;
      let nearADist = 260 * 260;
      let nearBDist = 260 * 260;
      for (const candidate of allSnakes) {
        if (candidate === bot || !candidate.alive) continue;
        const dSq = toroidDistSq(bot.x, bot.y, candidate.x, candidate.y);
        if (dSq < nearADist) { nearbyB = nearbyA; nearBDist = nearADist; nearbyA = candidate; nearADist = dSq; }
        else if (dSq < nearBDist) { nearbyB = candidate; nearBDist = dSq; }
      }
      if (nearbyA && nearbyB) {
        const fightX = wrap((nearbyA.x + nearbyB.x) / 2, WORLD_WIDTH);
        const fightY = wrap((nearbyA.y + nearbyB.y) / 2, WORLD_HEIGHT);
        desiredAngle = Math.atan2(toroidDelta(bot.y, fightY, WORLD_HEIGHT), toroidDelta(bot.x, fightX, WORLD_WIDTH));
      }
    }

    // Small human-like imperfection and reaction delay so a skilled player can outmaneuver packs
    const errorChance = Math.max(0.008, 0.025 - phase * 0.014);
    if (Math.random() < errorChance) desiredAngle += (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.35);
    brain.cachedDesiredAngle = desiredAngle;
    brain.nextDecisionAt = now + brain.reactionMs * (1 - phase * 0.22);
  }

  const desiredAngle = brain.cachedDesiredAngle;

  // Whisker sensors check wrapped distances to bodies ahead (staggered on even/odd frames when many bots are nearby).
  const lookDist = bot.personality.lookAheadDist * (1 + phase * 0.18);
  const probeRadius = HEAD_RADIUS * getSnakeHeadGrowthScale(bot.length) + 14;
  let bestDanger = 0;
  let avoidTurn = 0;

  if ((animFrame + bot.aiOffset) % 2 === 0 || brain.lastHadDanger) {
    for (const sa of BOT_SENSOR_ANGLES) {
      const checkAngle = bot.angle + sa;
      const probeX = wrap(bot.x + Math.cos(checkAngle) * lookDist, WORLD_WIDTH);
      const probeY = wrap(bot.y + Math.sin(checkAngle) * lookDist, WORLD_HEIGHT);

      const probeDanger = spatialDangerAt(probeX, probeY, probeRadius, bot);

      if (probeDanger > 0) {
        const defaultTurn = (bot.turnDir || ((bot.aiOffset & 1) ? 1 : -1)) * 1.65;
        avoidTurn += (sa === 0 ? defaultTurn : -Math.sign(sa) * (1.35 + probeDanger * 0.65));
        bestDanger += probeDanger;
      }
    }
    brain.lastHadDanger = bestDanger > 0;
    if (bestDanger > 0) {
      brain.lastAvoidAngle = bot.angle + Math.sign(avoidTurn || 1) * Math.min(Math.PI * 0.85, Math.abs(avoidTurn));
    }
  }

  if (bestDanger > 0) {
    bot.targetAngle = brain.lastAvoidAngle;
  } else if (now < (bot.unstickUntil || 0)) {
    bot.targetAngle = bot.unstickAngle;
  } else if (brain.lastHadDanger) {
    bot.targetAngle = brain.lastAvoidAngle;
  } else {
    bot.targetAngle = desiredAngle;
  }

  // Anti-spin & anti-wall-rubbing watchdog: break circular loops and stalled wall-hugging
  const diff = angleDifference(bot.angle, bot.targetAngle);
  const turnSign = Math.abs(diff) > 0.04 ? Math.sign(diff) : 0;
  if (turnSign !== 0) {
    if (turnSign === bot.turnDir) {
      bot.sameTurnCount++;
    } else {
      bot.turnDir = turnSign;
      bot.sameTurnCount = Math.max(0, bot.sameTurnCount - 6);
    }
    if (bot.sameTurnCount > 75) {
      bot.unstickAngle = bot.angle + turnSign * Math.PI * 0.78;
      bot.unstickUntil = now + 900;
      bot.sameTurnCount = 0;
      brain.orbitRadius = 150;
      bot.targetAngle = bot.unstickAngle;
    }
  } else {
    bot.sameTurnCount = Math.max(0, bot.sameTurnCount - 2);
  }

  if (now - (bot.anchorTime || 0) >= 2200) {
    const movedSq = toroidDistSq(bot.x, bot.y, bot.anchorX ?? bot.x, bot.anchorY ?? bot.y);
    bot.anchorX = bot.x;
    bot.anchorY = bot.y;
    bot.anchorTime = now;
    if (movedSq < 68 * 68) {
      const escapeSign = bot.turnDir || ((bot.aiOffset & 1) ? 1 : -1);
      bot.unstickAngle = bot.angle + escapeSign * Math.PI * 0.82;
      bot.unstickUntil = now + 950;
      bot.sameTurnCount = 0;
      brain.orbitRadius = 150;
      bot.targetAngle = bot.unstickAngle;
    }
  }

  const finalDiff = angleDifference(bot.angle, bot.targetAngle);
  const agilityMul = getSnakeAgilityFactor(bot.length);
  bot.angle += Math.sign(finalDiff) * Math.min(Math.abs(finalDiff), bot.turnRate * agilityMul);
}

// ============================================================
// §7  PHYSICS & UPDATE
// ============================================================

function advanceSnake(snake) {
  if (!snake.alive) return;

  const now = performance.now();
  const inDangerZone = toroidDistSq(snake.x, snake.y, WORLD_WIDTH / 2, WORLD_HEIGHT / 2) < DANGER_ZONE_RADIUS ** 2;
  if (snake.isPlayer && inDangerZone) {
    matchDangerZoneAccum += FIXED_STEP_MS / 1000;
  }
  const isSpeedBoosted = snake.speedBoostUntil && now < snake.speedBoostUntil;
  const speedBoostMul = isSpeedBoosted ? (snake.speedBoostMultiplier || 1.6) : 1;
  const isDashing = now < snake.dashUntil;
  const speedScale = (inDangerZone ? DANGER_ZONE_SLOW : 1) * (isDashing ? 1.85 : 1) * speedBoostMul;
  const moveX = Math.cos(snake.angle) * snake.speed * speedScale;
  const moveY = Math.sin(snake.angle) * snake.speed * speedScale;
  snake.prevX = snake.x;
  snake.prevY = snake.y;
  snake.trailWorldX += moveX;
  snake.trailWorldY += moveY;
  snake.x = wrap(snake.x + moveX, WORLD_WIDTH);
  snake.y = wrap(snake.y + moveY, WORLD_HEIGHT);

  if (now < snake.glowTrailUntil) {
    if (now - snake.lastTrailSampleAt >= 32) {
      const sample = glowTrailSamplePool.pop() || {};
      sample.x = snake.trailWorldX;
      sample.y = snake.trailWorldY;
      sample.time = now;
      snake.glowTrailSamples.push(sample);
      snake.lastTrailSampleAt = now;
    }
    while (snake.glowTrailSamples.length && now - snake.glowTrailSamples[0].time > RARE_ORB_TRAIL_MS) {
      const expired = snake.glowTrailSamples.shift();
      if (glowTrailSamplePool.length < 1024) glowTrailSamplePool.push(expired);
    }
  } else if (snake.glowTrailSamples.length) {
    for (let i = 0; i < snake.glowTrailSamples.length; i++) {
      if (glowTrailSamplePool.length < 1024) glowTrailSamplePool.push(snake.glowTrailSamples[i]);
    }
    snake.glowTrailSamples.length = 0;
  }

  snake.tongueTimer++;
  if (snake.tongueTimer > 180) {
    snake.tongueProgress = Math.sin(((snake.tongueTimer - 180) / 25) * Math.PI);
    if (snake.tongueTimer >= 205) {
      snake.tongueTimer = 0;
      snake.tongueProgress = 0;
    }
  }

  if (snake.growQueue > 0 && snake.segments.length > 0) {
    if (snake.segments.length < 260) {
      const tail = snake.segments[snake.segments.length - 1];
      snake.segments.push({
        x: wrap(tail.x - Math.cos(tail.angle) * SEGMENT_SPACING, WORLD_WIDTH),
        y: wrap(tail.y - Math.sin(tail.angle) * SEGMENT_SPACING, WORLD_HEIGHT),
        angle: tail.angle,
        lateralOffset: 0,
        relX: 0,
        relY: 0
      });
      snake.growQueue--;
    } else {
      snake.growQueue = 0;
    }
  }

  let prevX = snake.x;
  let prevY = snake.y;
  let prevAngle = snake.angle;
  let minRelX = 0;
  let maxRelX = 0;
  let minRelY = 0;
  let maxRelY = 0;

  for (let i = 0; i < snake.segments.length; i++) {
    const seg = snake.segments[i];
    const dx = toroidDelta(seg.x, prevX, WORLD_WIDTH);
    const dy = toroidDelta(seg.y, prevY, WORLD_HEIGHT);
    const dist = Math.hypot(dx, dy);

    if (dist > 0.001) {
      const targetSegAngle = Math.atan2(dy, dx);
      const angleDiff = angleDifference(seg.angle, targetSegAngle);
      // Smooth angular blending prevents sharp-turn kinks while always keeping exact SEGMENT_SPACING
      // so the tail never stalls or bunches up when circling tightly.
      seg.angle = seg.angle + angleDiff * 0.72;
      seg.x = wrap(prevX - Math.cos(targetSegAngle) * SEGMENT_SPACING, WORLD_WIDTH);
      seg.y = wrap(prevY - Math.sin(targetSegAngle) * SEGMENT_SPACING, WORLD_HEIGHT);
    } else {
      seg.angle = prevAngle;
      seg.x = wrap(prevX - Math.cos(prevAngle) * SEGMENT_SPACING, WORLD_WIDTH);
      seg.y = wrap(prevY - Math.sin(prevAngle) * SEGMENT_SPACING, WORLD_HEIGHT);
    }

    const waveProgress = i / snake.segments.length;
    const waveAmp = Math.sin(waveProgress * Math.PI) * 3.8;
    const lat = Math.sin(animFrame * 0.14 - i * 0.32) * waveAmp;
    seg.lateralOffset = lat;
    const perp = seg.angle + Math.PI / 2;
    const rx = toroidDelta(snake.x, seg.x, WORLD_WIDTH) + Math.cos(perp) * lat;
    const ry = toroidDelta(snake.y, seg.y, WORLD_HEIGHT) + Math.sin(perp) * lat;
    seg.relX = rx;
    seg.relY = ry;
    if (rx < minRelX) minRelX = rx;
    if (rx > maxRelX) maxRelX = rx;
    if (ry < minRelY) minRelY = ry;
    if (ry > maxRelY) maxRelY = ry;

    prevX = seg.x;
    prevY = seg.y;
    prevAngle = seg.angle;
  }
  snake.minRelX = minRelX;
  snake.maxRelX = maxRelX;
  snake.minRelY = minRelY;
  snake.maxRelY = maxRelY;

  // Lightweight ambient rarity/trail & boost thruster particles (respecting graphicsQuality & pool limits)
  if (graphicsQuality !== 'low' && particles.length < maxParticles - 6) {
    const isNearPlayer = snake.isPlayer || toroidDistSq(player.x, player.y, snake.x, snake.y) < 900 * 900;
    if (isNearPlayer) {
      const rar = snake.isPlayer ? (getSkin().rarity || 'common') : (snake.rarity || 'common');
      const hasEffect = Boolean(snake.palette && snake.palette.trailEffect) || rar === 'epic' || rar === 'legendary' || rar === 'mythic';
      const emitInterval = isDashing || isSpeedBoosted ? 65 : (rar === 'mythic' ? 95 : (rar === 'legendary' ? 140 : 210));
      if ((hasEffect || isDashing || isSpeedBoosted) && now - (snake.lastRarityParticleAt || 0) >= emitInterval && snake.segments.length > 3) {
        snake.lastRarityParticleAt = now;
        const pickIdx = (isDashing || isSpeedBoosted)
          ? snake.segments.length - 1
          : Math.min(snake.segments.length - 1, 2 + Math.floor(Math.random() * Math.min(18, snake.segments.length - 2)));
        const emitSeg = snake.segments[pickIdx];
        const p = particlePool.pop() || {};
        const jitter = (Math.random() - 0.5) * 14;
        const perp = emitSeg.angle + Math.PI / 2;
        p.x = wrap(emitSeg.x + Math.cos(perp) * jitter, WORLD_WIDTH);
        p.y = wrap(emitSeg.y + Math.sin(perp) * jitter, WORLD_HEIGHT);
        p.vx = -Math.cos(emitSeg.angle) * (isDashing ? 2.4 : 0.7) + (Math.random() - 0.5) * 0.9;
        p.vy = -Math.sin(emitSeg.angle) * (isDashing ? 2.4 : 0.7) + (Math.random() - 0.5) * 0.9;
        p.size = (rar === 'mythic' ? 2.4 : 1.9) + Math.random() * 1.4;
        p.alpha = isDashing ? 0.92 : 0.76;
        p.color = (snake.palette.trailEffect === 'rainbow' || rar === 'mythic')
          ? `hsl(${(now * 0.14 + pickIdx * 24) % 360}, 92%, 65%)`
          : (isDashing ? '#E0F2FE' : (snake.palette.scale || snake.palette.head));
        p.decay = isDashing ? 0.045 : 0.028;
        p.updateOffset = Math.floor(Math.random() * 3);
        particles.push(p);
      }
    }
  }
}

function dissolveSnakeIntoFood(snake, rewardMultiplier = 1) {
  const orbValue = snake.length > 50 ? 4 : 2;
  let totalReward = 0;
  const segCount = snake.segments ? snake.segments.length : 0;
  const maxSnakeOrbs = Math.max(4, Math.min(80, Math.ceil(snake.length / (orbValue * 1.4))));
  const segStep = segCount > 0 ? Math.max(2, Math.ceil(segCount / maxSnakeOrbs)) : 1;
  const desiredDrops = segCount > 0 ? Math.max(1, Math.ceil(segCount / segStep)) : 1;

  let existingDeathDrops = 0;
  for (const orb of foodOrbs) if (orb.isDeathDrop) existingDeathDrops++;

  // Evict oldest death-drop orbs if the global cap is reached so every killed snake always drops food
  let toEvict = Math.max(0, existingDeathDrops + desiredDrops - MAX_DEATH_DROP_ORBS);
  if (toEvict > 0) {
    for (let i = 0; i < foodOrbs.length && toEvict > 0; ) {
      if (foodOrbs[i].isDeathDrop) {
        foodOrbs.splice(i, 1);
        toEvict--;
      } else {
        i++;
      }
    }
  }

  const now = performance.now();
  if (segCount > 0) {
    let dropIdx = 0;
    for (let i = 0; i < segCount; i += segStep, dropIdx++) {
      const seg = snake.segments[i];
      const foodScheme = {
        core: snake.palette.head,
        glow: snake.palette.glow,
        value: orbValue * rewardMultiplier,
        isDeathDrop: true
      };
      const orb = spawnFoodOrb(seg.x, seg.y, foodScheme);
      orb.burstAt = now;
      orb.burstDelay = Math.min(700, dropIdx * 16);
      foodOrbs.push(orb);
      totalReward += orbValue;
      if (dropIdx % 4 === 0) spawnFoodBurst(seg.x, seg.y, snake.palette.head, 1);
    }
  } else {
    const orb = spawnFoodOrb(snake.x, snake.y, {
      core: snake.palette.head,
      glow: snake.palette.glow,
      value: orbValue * rewardMultiplier,
      isDeathDrop: true
    });
    orb.burstAt = now;
    orb.burstDelay = 0;
    foodOrbs.push(orb);
    totalReward += orbValue;
  }
  spawnFoodBurst(snake.x, snake.y, snake.palette.head, graphicsQuality === 'low' ? 6 : 12);
  spawnVisualRing(snake.x, snake.y, snake.palette.head || '#00F5A0', HEAD_RADIUS, HEAD_RADIUS * 5.2, 420, 3.5);
  return totalReward;
}

function showKillMessage(bot, reward, wasKing = false) {
  playerKillCount++;
  matchCurrentKillStreak++;
  triggerHaptic(30);
  if (statKillsEl) statKillsEl.textContent = playerKillCount;
  if (profileData) {
    const s = profileData.stats;
    s.totalKills = (s.totalKills || 0) + 1;
    s.singleMatchKills = Math.max(s.singleMatchKills || 0, playerKillCount);
    s.killStreakBest = Math.max(s.killStreakBest || 0, matchCurrentKillStreak);
    if (currentDifficulty === 'hard') {
      s.hardSingleMatchKills = Math.max(s.hardSingleMatchKills || 0, playerKillCount);
    }
    if (wasKing) {
      s.kingKills = (s.kingKills || 0) + 1;
      if (!matchReviveUsed) s.kingKillNoDeath = (s.kingKillNoDeath || 0) + 1;
      recordMissionProgress('king_kills', 1);
    }
    if (currentCycle && currentCycle.name === 'Night') {
      s.nightKills = (s.nightKills || 0) + 1;
    }
    const curSkin = getSkin();
    if (curSkin && curSkin.category === 'funny') {
      s.funnySkinKills = (s.funnySkinKills || 0) + 1;
    }
    recordMissionProgress('kills', 1);
  }
  if (killMessageEl) {
    killMessageEl.textContent = `You trapped ${wasKing ? '👑 ' : ''}${bot.name} (+${reward})`;
    killMessageEl.style.opacity = '1';
    clearTimeout(killMessageTimer);
    killMessageTimer = setTimeout(() => { if (killMessageEl) killMessageEl.style.opacity = '0'; }, 2200);
  }
}

function killBot(bot, killer = null) {
  if (!bot.alive) return;
  const bounty = isKingSnake(bot);
  bot.alive = false;
  bot.glowTrailUntil = 0;
  for (let i = 0; i < bot.glowTrailSamples.length; i++) {
    if (glowTrailSamplePool.length < 1024) glowTrailSamplePool.push(bot.glowTrailSamples[i]);
  }
  bot.glowTrailSamples.length = 0;
  const reward = dissolveSnakeIntoFood(bot, bounty ? 2 : 1);
  bot.segments.length = 0;
  bot.growQueue = 0;
  if (killer === player) showKillMessage(bot, reward, bounty);
  sfxBotDeath();
  // Immediately respawn in the outer ring with a 1.5s fade-in so population never drops below current target
  if (bots.length <= activeTargetBotCount) {
    respawnBot(bot);
  } else {
    bot.respawnTimer = 0;
  }
}

let cachedKingSnake = null;
let cachedKingFrame = -1;

function getKingSnake() {
  if (cachedKingFrame === animFrame && cachedKingSnake && cachedKingSnake.alive) return cachedKingSnake;
  let king = null;
  for (const snake of snakeRoster) if (snake.alive && (!king || snake.length > king.length)) king = snake;
  cachedKingSnake = king;
  cachedKingFrame = animFrame;
  return king;
}

function isKingSnake(snake) {
  return snake === getKingSnake();
}

function activateAbility(name) {
  if (!isGameRunning || isPaused || isGameOver || !player.alive) return;
  const now = performance.now();
  if (now < player.abilityReadyAt[name]) return;
  const ability = ABILITY_CONFIG[name];
  if (!ability) return;
  player.abilityReadyAt[name] = now + ability.cooldown;
  player[`${name}Until`] = now + ability.duration;
  matchAbilitiesUsed++;
  triggerHaptic(18);
  if (profileData) {
    if (name === 'ghost') profileData.stats.ghostUses = (profileData.stats.ghostUses || 0) + 1;
    if (name === 'magnet') profileData.stats.magnetUses = (profileData.stats.magnetUses || 0) + 1;
  }
  if (name === 'dash') {
    spawnVisualRing(player.x, player.y, '#00F5A0', HEAD_RADIUS * 0.9, 130, 340, 4);
    spawnFoodBurst(player.x, player.y, '#00D9FF', graphicsQuality === 'low' ? 4 : 9);
    matchDashesUsed++;
    if (profileData) {
      profileData.stats.totalDashes = (profileData.stats.totalDashes || 0) + 1;
      recordMissionProgress('dash', 1);
    }
    for (const enemy of snakeRoster) {
      if (enemy === player || !enemy.alive) continue;
      const dx = toroidDelta(player.x, enemy.x, WORLD_WIDTH);
      const dy = toroidDelta(player.y, enemy.y, WORLD_HEIGHT);
      const distance = Math.hypot(dx, dy);
      if (distance > 240) continue;
      const push = (240 - distance) * 0.16;
      enemy.x = wrap(enemy.x + dx / Math.max(1, distance) * push, WORLD_WIDTH);
      enemy.y = wrap(enemy.y + dy / Math.max(1, distance) * push, WORLD_HEIGHT);
      enemy.angle = Math.atan2(dy, dx);
      enemy.targetAngle = enemy.angle;
    }
  }
  updateAbilityButtons(now);
}

function updateAbilityButtons(now = performance.now()) {
  for (const name of Object.keys(ABILITY_CONFIG)) {
    const button = document.getElementById(`${name}-btn`);
    if (!button) continue;
    const remaining = Math.max(0, player.abilityReadyAt[name] - now);
    const active = now < player[`${name}Until`];
    const labels = { ghost: '👻 Ghost', magnet: '🧲 Magnet', dash: '⚡ Dash' };
    button.classList.toggle('ready', remaining === 0);
    button.disabled = remaining > 0 || !isGameRunning || isPaused || isGameOver;
    button.innerHTML = `${labels[name]}<br><small>${active ? `${((player[`${name}Until`] - now) / 1000).toFixed(1)}s` : remaining ? `${Math.ceil(remaining / 1000)}s` : name === 'ghost' ? '1' : name === 'magnet' ? '2' : '3'}</small>`;
  }
}

let revivePauseStartAt = 0;

function shiftActiveTimersByPauseDuration(deltaMs) {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
  totalPausedDuration += deltaMs;

  const shiftIfPositive = (ts) => (ts > 0 && ts < Infinity) ? ts + deltaMs : ts;

  player.protectedUntil = shiftIfPositive(player.protectedUntil);
  player.ghostUntil = shiftIfPositive(player.ghostUntil);
  player.magnetUntil = shiftIfPositive(player.magnetUntil);
  player.dashUntil = shiftIfPositive(player.dashUntil);
  player.speedBoostUntil = shiftIfPositive(player.speedBoostUntil);
  player.plasma2xUntil = shiftIfPositive(player.plasma2xUntil);
  player.comboExpiresAt = shiftIfPositive(player.comboExpiresAt);
  player.glowTrailUntil = shiftIfPositive(player.glowTrailUntil);
  player.lastTrailSampleAt = shiftIfPositive(player.lastTrailSampleAt);
  if (player.abilityReadyAt) {
    player.abilityReadyAt.ghost = shiftIfPositive(player.abilityReadyAt.ghost);
    player.abilityReadyAt.magnet = shiftIfPositive(player.abilityReadyAt.magnet);
    player.abilityReadyAt.dash = shiftIfPositive(player.abilityReadyAt.dash);
  }
  for (let i = 0; i < player.glowTrailSamples.length; i++) {
    player.glowTrailSamples[i].time += deltaMs;
  }

  for (let b = 0; b < bots.length; b++) {
    const bot = bots[b];
    bot.protectedUntil = shiftIfPositive(bot.protectedUntil);
    bot.spawnFadeStartAt = shiftIfPositive(bot.spawnFadeStartAt);
    bot.dashUntil = shiftIfPositive(bot.dashUntil);
    bot.speedBoostUntil = shiftIfPositive(bot.speedBoostUntil);
    bot.botDashReadyAt = shiftIfPositive(bot.botDashReadyAt);
    bot.glowTrailUntil = shiftIfPositive(bot.glowTrailUntil);
    bot.lastTrailSampleAt = shiftIfPositive(bot.lastTrailSampleAt);
    bot.unstickUntil = shiftIfPositive(bot.unstickUntil);
    bot.anchorTime = shiftIfPositive(bot.anchorTime);
    if (bot.personality) {
      bot.personality.nextDecisionAt = shiftIfPositive(bot.personality.nextDecisionAt);
    }
    for (let i = 0; i < bot.glowTrailSamples.length; i++) {
      bot.glowTrailSamples[i].time += deltaMs;
    }
  }

  if (rareOrb) {
    rareOrb.spawnedAt = shiftIfPositive(rareOrb.spawnedAt);
    rareOrb.expiresAt = shiftIfPositive(rareOrb.expiresAt);
  }
  nextRareOrbAt = shiftIfPositive(nextRareOrbAt);
  nextPowerupSpawnAt = shiftIfPositive(nextPowerupSpawnAt);
  nextFoodSpawnAt = shiftIfPositive(nextFoodSpawnAt);
  lastBigSnakeFoodAt = shiftIfPositive(lastBigSnakeFoodAt);
  nextBotWaveAt = shiftIfPositive(nextBotWaveAt);
  nextWaveBotSpawnAt = shiftIfPositive(nextWaveBotSpawnAt);

  for (let i = 0; i < powerups.length; i++) {
    powerups[i].spawnedAt = shiftIfPositive(powerups[i].spawnedAt);
    powerups[i].expiresAt = shiftIfPositive(powerups[i].expiresAt);
  }
  for (let i = 0; i < floatingTexts.length; i++) {
    floatingTexts[i].time += deltaMs;
  }
  for (let i = 0; i < foodOrbs.length; i++) {
    if (foodOrbs[i].burstAt > 0) foodOrbs[i].burstAt += deltaMs;
    foodOrbs[i].spawnedAt = shiftIfPositive(foodOrbs[i].spawnedAt);
    foodOrbs[i].expiresAt = shiftIfPositive(foodOrbs[i].expiresAt);
  }
}

function handlePlayerDeath() {
  if (!player.alive || isGameOver) return;
  player.alive = false;
  isGameOver = true;
  resetActiveControls();
  stopGameLoop();
  if (canvas) canvas.style.pointerEvents = 'none';
  CrazyGamesBridge.gameplayStop();
  shakeIntensity = 18;
  triggerHaptic(55);
  sfxPlayerDeath();

  // Offer 1 optional AdMob Revive per match before dissolving and ending the run
  if (!matchReviveUsed && player.length >= INITIAL_SEGMENTS) {
    const reviveModal = document.getElementById('revive-modal');
    const lenPreview = document.getElementById('revive-len-preview');
    if (lenPreview) lenPreview.textContent = player.length;
    if (reviveModal) {
      revivePauseStartAt = performance.now();
      reviveModal.style.display = 'flex';
      return;
    }
  }

  finalizeGameOver();
}

function confirmWatchReviveAd() {
  const reviveModal = document.getElementById('revive-modal');
  if (reviveModal) reviveModal.style.display = 'none';
  AdManager.showRewardedAd({
    placement: 'Revive Snake (Continue Match)',
    onReward: () => {
      if (revivePauseStartAt > 0) {
        shiftActiveTimersByPauseDuration(performance.now() - revivePauseStartAt);
        revivePauseStartAt = 0;
      }
      matchReviveUsed = true;
      matchCurrentKillStreak = 0;
      const safePos = findSafeSpawnCoords(320, player.length, player.angle);
      player.x = safePos.x;
      player.y = safePos.y;
      player.prevX = safePos.x;
      player.prevY = safePos.y;
      player.trailWorldX = safePos.x;
      player.trailWorldY = safePos.y;
      player.targetAngle = player.angle;
      cameraX = safePos.x;
      cameraY = safePos.y;
      const cosA = Math.cos(player.angle);
      const sinA = Math.sin(player.angle);
      for (let i = 0; i < player.segments.length; i++) {
        player.segments[i].x = wrap(safePos.x - cosA * i * SEGMENT_SPACING, WORLD_WIDTH);
        player.segments[i].y = wrap(safePos.y - sinA * i * SEGMENT_SPACING, WORLD_HEIGHT);
        player.segments[i].angle = player.angle;
        player.segments[i].lateralOffset = 0;
      }
      resetActiveControls();
      if (canvas) canvas.style.pointerEvents = 'auto';
      player.alive = true;
      isGameOver = false;
      player.protectedUntil = performance.now() + 3200;
      lastLoopFrameTime = performance.now();
      fixedStepAccumulator = 0;
      sfxReward();
      showGlobalToast('Snake Revived! 3s Spawn Shield Active');
      CrazyGamesBridge.gameplayStart();
      ensureGameLoop();
    },
    onDismiss: () => {
      if (revivePauseStartAt > 0) {
        shiftActiveTimersByPauseDuration(performance.now() - revivePauseStartAt);
        revivePauseStartAt = 0;
      }
      finalizeGameOver();
    }
  });
}

function declineRevive() {
  const reviveModal = document.getElementById('revive-modal');
  if (reviveModal) reviveModal.style.display = 'none';
  if (revivePauseStartAt > 0) {
    shiftActiveTimersByPauseDuration(performance.now() - revivePauseStartAt);
    revivePauseStartAt = 0;
  }
  finalizeGameOver();
}

function finalizeGameOver() {
  const bounty = isKingSnake(player);
  dissolveSnakeIntoFood(player, bounty ? 2 : 1);

  const prevBestTime = getBestTime(currentDifficulty);
  const prevBestLength = getBestLength(currentDifficulty);
  saveBestRecords(currentDifficulty, survivalSeconds, player.length);

  // Calculate final score, coins, and XP (identical multiplier across all difficulties)
  const allSnakes = leaderboardOrder.slice().sort((a, b) => b.length - a.length);
  const finalRank = Math.max(1, allSnakes.findIndex(s => s.isPlayer) + 1);
  const diffMul = 1.0;

  matchScore = Math.round((matchFruitScore + player.length * 15 + survivalSeconds * 6 + playerKillCount * 120) * diffMul);
  matchCoinsEarned = Math.max(5, Math.round(8 + survivalSeconds * 0.35 + playerKillCount * 14 + Math.max(0, player.length - INITIAL_SEGMENTS) * 0.5));
  matchXpEarned = Math.max(12, Math.round(20 + survivalSeconds * 0.7 + playerKillCount * 25 + matchFoodEaten * 0.8));
  matchDoubleClaimed = false;

  if (profileData) {
    const s = profileData.stats;
    s.totalMatches = (s.totalMatches || 0) + 1;
    s.bestScore = Math.max(s.bestScore || 0, matchScore);
    s.bestSurvivalTime = Math.max(s.bestSurvivalTime || 0, survivalSeconds);
    s.highestLength = Math.max(s.highestLength || INITIAL_SEGMENTS, player.length);
    s.singleMatchKills = Math.max(s.singleMatchKills || 0, playerKillCount);

    if (matchAbilitiesUsed === 0) {
      s.noAbilitySurvivalTime = Math.max(s.noAbilitySurvivalTime || 0, survivalSeconds);
    }
    if (survivalSeconds >= 180 && playerKillCount === 0 && !matchPacifist3mAwarded) {
      matchPacifist3mAwarded = true;
      s.pacifist3m = (s.pacifist3m || 0) + 1;
    }
    if (matchReviveUsed && finalRank === 1) {
      s.reviveToRank1 = (s.reviveToRank1 || 0) + 1;
    }
    if (currentDifficulty === 'hard') {
      s.hardSurvivalTime = Math.max(s.hardSurvivalTime || 0, survivalSeconds);
      s.hardSingleMatchKills = Math.max(s.hardSingleMatchKills || 0, playerKillCount);
      if (finalRank === 1) s.hardRank1Count = (s.hardRank1Count || 0) + 1;
      if (finalRank <= 3) {
        s.hardWinsStreak = (s.hardWinsStreak || 0) + 1;
        s.hardWinsStreakBest = Math.max(s.hardWinsStreakBest || 0, s.hardWinsStreak);
      } else {
        s.hardWinsStreak = 0;
      }
    }

    const unrecordedSec = Math.max(0, survivalSeconds - lastRecordedSurvivalSecond);
    if (unrecordedSec > 0) {
      recordMissionProgress('survive', unrecordedSec, false);
      lastRecordedSurvivalSecond = survivalSeconds;
    }
    recordMissionProgress('matches', 1, false);
    recordMissionProgress('single_survive', survivalSeconds, true);
    recordMissionProgress('max_length', player.length, true);
    if (player.length >= 150 && !matchReachedLen150) {
      matchReachedLen150 = true;
      recordMissionProgress('matches_len150', 1, false);
    }
    if (finalRank <= 3) recordMissionProgress('top3_matches', 1, false);
    addCoins(matchCoinsEarned);
    addXp(matchXpEarned);
    checkSkinUnlocks();
  }

  // Expire 1-match skin trial if used
  if (trialSkinId && !unlockedSkinIds.has(trialSkinId)) {
    trialSkinId = null;
    selectedSkinId = safeStorageGet(SELECTED_SKIN_KEY) || 'classic';
    if (!unlockedSkinIds.has(selectedSkinId)) selectedSkinId = 'classic';
  }

  const newBestBadge = document.getElementById('new-best-badge');
  if (newBestBadge) {
    const isNewBest = (survivalSeconds > prevBestTime && survivalSeconds > 0) || player.length > prevBestLength;
    newBestBadge.style.display = isNewBest ? 'inline-flex' : 'none';
  }
  const bestT = getBestTime(currentDifficulty);
  const bestL = getBestLength(currentDifficulty);

  const elScore = document.getElementById('final-score');
  const elRank = document.getElementById('final-rank');
  const elKills = document.getElementById('final-kills');
  const elFood = document.getElementById('final-food');
  const elCoins = document.getElementById('final-coins');
  const elXp = document.getElementById('final-xp');
  const dblBtn = document.getElementById('double-coins-btn');

  if (elScore) elScore.textContent = matchScore.toLocaleString();
  if (elRank) elRank.textContent = `#${finalRank}`;
  if (elKills) elKills.textContent = playerKillCount;
  if (elFood) elFood.textContent = matchFoodEaten;
  if (elCoins) elCoins.textContent = `+${matchCoinsEarned}`;
  if (elXp) elXp.textContent = `+${matchXpEarned} XP`;
  if (dblBtn) {
    dblBtn.disabled = false;
    dblBtn.textContent = `▶ DOUBLE YOUR REWARDS (+${matchCoinsEarned} Extra Coins)`;
  }

  finalTimeEl.textContent = formatTime(survivalSeconds);
  bestTimeEl.textContent = formatTime(bestT);
  finalLengthEl.textContent = player.length;
  bestLengthEl.textContent = bestL;
  if (cardDiffLabel) {
    const normDiff = normalizeDifficulty(currentDifficulty);
    cardDiffLabel.textContent = normDiff.charAt(0).toUpperCase() + normDiff.slice(1);
  }
  const questBanner = document.getElementById('gameover-quest-banner');
  const questText = document.getElementById('gameover-quest-text');
  if (questBanner && questText && profileData) {
    const readyDaily = profileData.dailyMissions.items.filter(it => {
      const def = MISSION_POOL.find(m => m.id === it.id);
      return def && !it.claimed && (it.progress || 0) >= def.target;
    }).length;
    const readyWeekly = profileData.weeklyMissions.items.filter(it => {
      const def = WEEKLY_MISSION_POOL.find(m => m.id === it.id);
      return def && !it.claimed && (it.progress || 0) >= def.target;
    }).length;
    const readyAch = ACHIEVEMENTS_LIST.filter(a => !profileData.achievementsClaimed[a.id] && (profileData.stats[a.stat] || 0) >= a.target).length;
    const totalReady = readyDaily + readyWeekly + readyAch;
    if (totalReady > 0) {
      questText.textContent = `✦ ${totalReady} Mission / Achievement reward${totalReady > 1 ? 's' : ''} ready to claim!`;
      questBanner.style.display = 'flex';
    } else {
      questBanner.style.display = 'none';
    }
  }
  overlayEl.style.display = 'flex';
  AdManager.maybeShowInterstitialAfterMatch();
}

function watchDoubleCoinsAd() {
  if (matchDoubleClaimed || matchCoinsEarned <= 0) return;
  AdManager.showRewardedAd({
    placement: `Double Match Coins (+${matchCoinsEarned} Coins)`,
    onReward: () => {
      matchDoubleClaimed = true;
      addCoins(matchCoinsEarned);
      sfxReward();
      const elCoins = document.getElementById('final-coins');
      const dblBtn = document.getElementById('double-coins-btn');
      if (elCoins) elCoins.textContent = `+${matchCoinsEarned * 2} (2x!)`;
      if (dblBtn) {
        dblBtn.disabled = true;
        dblBtn.textContent = '✓ 2x Coins Claimed!';
      }
      showGlobalToast(`Doubled! +${matchCoinsEarned} Bonus Coins Added`);
    }
  });
}

function checkAllCollisions() {
  const allSnakes = snakeRoster;
  const now = performance.now();
  const isMobViewport = width <= 768 || isMobileDevice;
  const mobileHeadBase = isMobViewport ? 1.28 : 1.0;

  // Head-to-head collisions resolve by length. Spawn protection applies to both snakes.
  for (let a = 0; a < allSnakes.length; a++) {
    const first = allSnakes[a];
    if (!first.alive || now < first.protectedUntil || (first.isPlayer && now < player.ghostUntil)) continue;
    const firstHeadR = HEAD_RADIUS * mobileHeadBase * getSnakeHeadGrowthScale(first.length);
    for (let b = a + 1; b < allSnakes.length; b++) {
      const second = allSnakes[b];
      if (!second.alive || now < second.protectedUntil || (second.isPlayer && now < player.ghostUntil)) continue;
      const pairHitRadius = (firstHeadR + HEAD_RADIUS * mobileHeadBase * getSnakeHeadGrowthScale(second.length)) * 0.72;
      if (toroidDistSq(first.x, first.y, second.x, second.y) >= pairHitRadius * pairHitRadius) continue;
      const sizeDiff = Math.abs(first.length - second.length);
      if (sizeDiff <= 1) {
        if (first.isPlayer) handlePlayerDeath(); else killBot(first, null);
        if (second.isPlayer) handlePlayerDeath(); else killBot(second, null);
      } else {
        const loser = first.length < second.length ? first : second;
        const winner = loser === first ? second : first;
        if (loser.isPlayer) handlePlayerDeath(); else killBot(loser, winner);
      }
    }
  }

  for (const snake of allSnakes) {
    if (!snake.alive || now < snake.protectedUntil || (snake.isPlayer && now < player.ghostUntil)) continue;
    const other = findSpatialBodyCollision(snake, now);
    if (!other) continue;
    if (snake.isPlayer) handlePlayerDeath();
    else killBot(snake, other.isPlayer ? player : other);
  }
}

function checkFoodConsumptionAll() {
  const allSnakes = snakeRoster;
  const isMobViewport = width <= 768 || isMobileDevice;
  const mobilePickupBonus = isMobViewport ? 1.15 : 1.0;
  const baseEatRadius = FOOD_PICKUP_RADIUS * mobilePickupBonus;
  const baseRareEatRadius = RARE_ORB_PICKUP_RADIUS * mobilePickupBonus;
  const now = performance.now();

  for (const snake of allSnakes) {
    if (!snake.alive) continue;
    const headGrowthBonus = (getSnakeHeadGrowthScale(snake.length) - 1.0) * HEAD_RADIUS;
    const eatDistSq = (baseEatRadius + headGrowthBonus) ** 2;
    const rareEatDistSq = (baseRareEatRadius + headGrowthBonus) ** 2;
    const cellX = Math.floor(wrap(snake.x, WORLD_WIDTH) / SPATIAL_CELL_SIZE);
    const cellY = Math.floor(wrap(snake.y, WORLD_HEIGHT) / SPATIAL_CELL_SIZE);
    for (let oy = -1; oy <= 1; oy++) {
      const row = wrap(cellY + oy, SPATIAL_ROWS);
      for (let ox = -1; ox <= 1; ox++) {
        const column = wrap(cellX + ox, SPATIAL_COLUMNS);
        for (let slot = spatialHeads[row * SPATIAL_COLUMNS + column]; slot !== -1; slot = spatialNext[slot]) {
          if (spatialKind[slot] !== 2) continue;
          const orb = spatialSegment[slot];
          if (orb.consumed || now < orb.burstAt + orb.burstDelay || toroidDistSq(snake.x, snake.y, orb.x, orb.y) >= eatDistSq) continue;
          orb.consumed = true;
          spawnFoodBurst(orb.x, orb.y, orb.color, orb.isFruit ? 8 : 4);
          triggerSnakeEatVisual(snake, orb.color, orb.isFruit ? 1.15 : (orb.isDeathDrop ? 1.0 : 0.72));
          if (snake.isPlayer && (orb.isFruit || orb.isDeathDrop)) {
            spawnVisualRing(orb.x, orb.y, orb.color, 5, orb.isFruit ? 34 : 26, 260, 2.4);
          }
          if (!orb.isDeathDrop) {
            normalFoodCount = Math.max(0, normalFoodCount - 1);
            if (orb.gridCell >= 0) foodGridTaken[orb.gridCell] = 0;
          }
          const growth = orb.isFruit ? (orb.growth || 1) : (orb.isDeathDrop ? orb.value : Math.max(1, Math.round(FOOD_VALUE)));
          snake.growQueue += growth;
          snake.length += growth;
          if (snake.isPlayer) {
            if (orb.isFruit) {
              sfxEatFruit(orb.fruitType);
              triggerHaptic(14);
              if (player.comboExpiresAt && now < player.comboExpiresAt) {
                player.comboCount = Math.min(5, (player.comboCount || 1) + 1);
              } else {
                player.comboCount = 1;
              }
              player.comboExpiresAt = now + 3200;
              const comboMul = 1 + Math.max(0, (player.comboCount - 1)) * 0.25;
              const plasmaMul = (player.plasma2xUntil && now < player.plasma2xUntil) ? 2 : 1;
              const pts = Math.round((orb.points || 20) * comboMul * plasmaMul);
              matchFruitScore += pts;
              pushFloatingText(orb.x, orb.y, `+${pts}`, now, {
                boxed: true,
                color: orb.color,
                outline: orb.outline || '#00F5A0'
              });
            } else {
              sfxEat();
              const goldPts = (orb.points || (growth * 15)) * ((player.plasma2xUntil && now < player.plasma2xUntil) ? 2 : 1);
              matchFruitScore += goldPts;
              if (orb.isDeathDrop) pushFloatingText(snake.x, snake.y, `+${growth}`);
            }
            matchFoodEaten += growth;
            if (profileData) {
              profileData.stats.totalFoodEaten = (profileData.stats.totalFoodEaten || 0) + growth;
              profileData.stats.highestLength = Math.max(profileData.stats.highestLength || INITIAL_SEGMENTS, snake.length);
              recordMissionProgress('food', growth);
              recordMissionProgress('max_length', snake.length, true);
              if (snake.length >= 150 && !matchReachedLen150) {
                matchReachedLen150 = true;
                recordMissionProgress('matches_len150', 1, false);
              }
            }
            if (statLengthEl) statLengthEl.textContent = snake.length;
          }
        }
      }
    }

    if (rareOrb && toroidDistSq(snake.x, snake.y, rareOrb.x, rareOrb.y) < rareEatDistSq) {
      const eatenOrb = rareOrb;
      rareOrb = null;
      scheduleNextRareOrb();
      snake.length += 3;
      snake.growQueue += 3;
      for (let i = 0; i < snake.glowTrailSamples.length; i++) {
        if (glowTrailSamplePool.length < 1024) glowTrailSamplePool.push(snake.glowTrailSamples[i]);
      }
      snake.glowTrailSamples.length = 0;
      snake.glowTrailUntil = performance.now() + RARE_ORB_TRAIL_MS;
      snake.trailWorldX = snake.x;
      snake.trailWorldY = snake.y;
      snake.lastTrailSampleAt = 0;
      spawnFoodBurst(eatenOrb.x, eatenOrb.y, '#fff1b8', 7);
      triggerSnakeEatVisual(snake, '#FEF08A', 1.35);
      spawnVisualRing(eatenOrb.x, eatenOrb.y, '#FEF08A', 8, 52, 360, 3.2);
      sfxRareOrbEat();
      if (snake.isPlayer) {
        triggerHaptic(22);
        matchFoodEaten += 3;
        if (profileData) {
          profileData.stats.totalFoodEaten = (profileData.stats.totalFoodEaten || 0) + 3;
          profileData.stats.highestLength = Math.max(profileData.stats.highestLength || INITIAL_SEGMENTS, snake.length);
          profileData.stats.rareOrbsCollected = (profileData.stats.rareOrbsCollected || 0) + 1;
          if (now < player.dashUntil || (player.speedBoostUntil && now < player.speedBoostUntil)) {
            profileData.stats.dashingRareOrb = (profileData.stats.dashingRareOrb || 0) + 1;
          }
          recordMissionProgress('food', 3);
          recordMissionProgress('max_length', snake.length, true);
          if (snake.length >= 150 && !matchReachedLen150) {
            matchReachedLen150 = true;
            recordMissionProgress('matches_len150', 1, false);
          }
        }
        if (statLengthEl) statLengthEl.textContent = snake.length;
      }
    }
  }

  let write = 0;
  for (let read = 0; read < foodOrbs.length; read++) {
    const orb = foodOrbs[read];
    if (orb.consumed) recycleFoodOrb(orb);
    else foodOrbs[write++] = orb;
  }
  foodOrbs.length = write;
}

function updateHUDAndLeaderboard() {
  const now = performance.now();
  if (!isGameOver) {
    const elapsedMs = now - gameStartTime - totalPausedDuration;
    survivalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    if (statTimeEl) statTimeEl.textContent = formatTime(survivalSeconds);
    if (profileData && survivalSeconds > lastRecordedSurvivalSecond) {
      const deltaSec = survivalSeconds - lastRecordedSurvivalSecond;
      lastRecordedSurvivalSecond = survivalSeconds;
      const s = profileData.stats;
      s.bestSurvivalTime = Math.max(s.bestSurvivalTime || 0, survivalSeconds);
      if (currentDifficulty === 'hard') {
        s.hardSurvivalTime = Math.max(s.hardSurvivalTime || 0, survivalSeconds);
      }
      if (matchAbilitiesUsed === 0) {
        s.noAbilitySurvivalTime = Math.max(s.noAbilitySurvivalTime || 0, survivalSeconds);
      }
      if (survivalSeconds >= 180 && playerKillCount === 0 && !matchPacifist3mAwarded) {
        matchPacifist3mAwarded = true;
        s.pacifist3m = (s.pacifist3m || 0) + 1;
      }
      if (matchDangerZoneAccum >= 1) {
        const wholeDz = Math.floor(matchDangerZoneAccum);
        matchDangerZoneAccum -= wholeDz;
        s.dangerZoneTime = (s.dangerZoneTime || 0) + wholeDz;
      }
      recordMissionProgress('survive', deltaSec, false);
      recordMissionProgress('single_survive', survivalSeconds, true);
      checkSkinUnlocks();
    }
  }
  if (now - lastHudRefreshAt < 250) return;
  lastHudRefreshAt = now;
  flushDeferredProfileSave(false);

  aliveLeaderboardSnakes.length = 0;
  for (let i = 0; i < leaderboardOrder.length; i++) {
    const s = leaderboardOrder[i];
    if (s && s.alive) aliveLeaderboardSnakes.push(s);
  }
  aliveLeaderboardSnakes.sort((a, b) => b.length - a.length);
  const allSnakes = aliveLeaderboardSnakes;

  const playerRank = allSnakes.findIndex(s => s.isPlayer) + 1;
  if (statRankEl) statRankEl.textContent = `#${playerRank}`;
  const statLvlEl = document.getElementById('stat-level');
  const statCoinsEl = document.getElementById('stat-coins');
  const statTargetEl = document.getElementById('stat-target');
  if (statLvlEl && profileData) statLvlEl.textContent = profileData.level;
  if (statCoinsEl && profileData) statCoinsEl.textContent = profileData.coins.toLocaleString();
  if (statTargetEl) {
    const targetScore = computeLevelTargetScore(currentArenaLevel);
    statTargetEl.textContent = `${matchFruitScore.toLocaleString()} / ${targetScore.toLocaleString()}`;
  }

  if (lbListEl) {
    const LB_SHOWN = 10;
    const lbRow = (s, idx) => `
      <div class="lb-item ${s.isPlayer ? 'is-player' : ''}">
        <div class="lb-left">
          <span class="lb-dot" style="background:${s.palette.head}; box-shadow: 0 0 6px ${s.palette.glow}"></span>
          <span>${idx + 1}. ${idx === 0 ? '👑 ' : ''}${s.name}</span>
        </div>
        <span class="lb-length">${s.length}</span>
      </div>`;
    let lbHtml = allSnakes.slice(0, LB_SHOWN).map(lbRow).join('');
    if (playerRank > LB_SHOWN) {
      lbHtml += '<div class="lb-gap">···</div>' + lbRow(player, playerRank - 1);
    }
    lbListEl.innerHTML = lbHtml;
  }
  updateAbilityButtons(now);
}

function update(stepMs = FIXED_STEP_MS) {
  if (!isGameRunning || isPaused) return;

  const frameSeconds = Math.min(0.05, stepMs / 1000);
  animFrame++;
  updateBotWaves();
  buildSpatialHash();
  updatePackCoordination();
  maybeSpawnRareOrb();
  spawnPowerup();
  checkPowerupCollection();
  bigSnakeFoodProduction();

  if (player.alive) {
    const playerAgility = getSnakeAgilityFactor(player.length);
    const effectiveTurnRate = player.turnRate * playerAgility;
    if (joystick.active) {
      if (joystick.hasDirection) {
        const sensMul = (profileData && profileData.settings ? (profileData.settings.joystickSensitivity || 100) : 100) / 100;
        const isSwipe = profileData && profileData.settings && profileData.settings.controlStyle === 'swipe';
        player.targetAngle = Math.atan2(joystick.dy, joystick.dx);
        const diff = angleDifference(player.angle, player.targetAngle);
        const maxTurn = (isSwipe ? TOUCH_MAX_TURN_RATE * 1.45 : TOUCH_MAX_TURN_RATE) * sensMul * playerAgility * frameSeconds;
        player.angle += Math.sign(diff) * Math.min(Math.abs(diff), maxTurn);
      } else {
        player.targetAngle = player.angle;
      }
    } else {
      if (keys.left) {
        player.targetAngle -= effectiveTurnRate;
        mouse.active = false;
      } else if (keys.right) {
        player.targetAngle += effectiveTurnRate;
        mouse.active = false;
      } else if (mouse.active) {
        const target = screenToWorld(mouse.x, mouse.y);
        const dx = toroidDelta(player.x, target.x, WORLD_WIDTH);
        const dy = toroidDelta(player.y, target.y, WORLD_HEIGHT);
        if (Math.hypot(dx, dy) > 15) {
          player.targetAngle = Math.atan2(dy, dx);
        }
      }
      const diff = angleDifference(player.angle, player.targetAngle);
      player.angle += Math.sign(diff) * Math.min(Math.abs(diff), effectiveTurnRate);
    }
  }

  advanceSnake(player);

  for (let i = bots.length - 1; i >= 0; i--) {
    const bot = bots[i];
    if (!bot.alive) {
      bot.respawnTimer--;
      if (bot.respawnTimer <= 0) {
        if (bots.length > activeTargetBotCount) {
          bots.splice(i, 1);
          const rIdx = snakeRoster.indexOf(bot);
          if (rIdx !== -1) snakeRoster.splice(rIdx, 1);
          const lIdx = leaderboardOrder.indexOf(bot);
          if (lIdx !== -1) leaderboardOrder.splice(lIdx, 1);
        } else {
          respawnBot(bot);
        }
      }
      continue;
    }
    updateBotAI(bot);
    advanceSnake(bot);
  }

  updateCamera();

  checkAllCollisions();
  checkFoodConsumptionAll();

  updateFood();
  updateParticles();
  updatePlankton();
  updateHUDAndLeaderboard();

  if (shakeIntensity > 0) {
    shakeIntensity *= 0.9;
    if (shakeIntensity < 0.2) shakeIntensity = 0;
  }
}

// ============================================================
// §8  MENU, DIFFICULTY & PAUSE
// ============================================================

function setDifficulty(diff) {
  currentDifficulty = normalizeDifficulty(diff);
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === currentDifficulty);
  });
  updateMenuRecordsDisplay();
}

function applyDifficultySpeeds() {
  const spd = getActiveSpeed();
  player.speed = spd;
  for (const bot of bots) {
    bot.speed = spd;
  }
}

let onboardingHideTimer = null;
let onboardingActionTimer = null;
let onboardingVisible = false;

function showInGameOnboardingIfNeeded() {
  const el = document.getElementById('ingame-onboarding');
  if (!el) return;
  if (safeStorageGet('slythox_onboarded') === '1') {
    el.style.display = 'none';
    onboardingVisible = false;
    return;
  }
  el.classList.toggle('touch-mode', Boolean(isTouchDevice));
  el.classList.remove('fading');
  el.style.display = 'flex';
  onboardingVisible = true;
  if (onboardingHideTimer) clearTimeout(onboardingHideTimer);
  if (onboardingActionTimer) clearTimeout(onboardingActionTimer);
  // Auto-dismiss after 9s even if player hasn't clicked Skip
  onboardingHideTimer = setTimeout(() => hideInGameOnboarding(true), 9000);
}

function markOnboardingAction() {
  if (!onboardingVisible || onboardingActionTimer) return;
  // Once the player steers or boosts, fade out cleanly after 3 seconds
  onboardingActionTimer = setTimeout(() => hideInGameOnboarding(true), 3000);
}

function hideInGameOnboarding(markDone = true) {
  if (onboardingHideTimer) { clearTimeout(onboardingHideTimer); onboardingHideTimer = null; }
  if (onboardingActionTimer) { clearTimeout(onboardingActionTimer); onboardingActionTimer = null; }
  if (markDone) safeStorageSet('slythox_onboarded', '1');
  onboardingVisible = false;
  const el = document.getElementById('ingame-onboarding');
  if (!el || el.style.display === 'none') return;
  el.classList.add('fading');
  setTimeout(() => {
    if (!onboardingVisible) {
      el.style.display = 'none';
      el.classList.remove('fading');
    }
  }, 360);
}

function startGame() {
  stopGameLoop();
  resetActiveControls();
  gameMode = 'arena';
  if (typeof LevelsMode !== 'undefined') LevelsMode.reset();
  initAudio();
  AdManager.hideNativeBanner();
  if (canvas) canvas.style.pointerEvents = 'auto';
  menuScreenEl.style.display = 'none';
  document.querySelectorAll('.subscreen').forEach(el => { el.style.display = 'none'; });
  activeSubscreenId = null;
  hudEl.style.display = 'flex';
  lbEl.style.display = 'block';
  isGameRunning = true;
  isPaused = false;
  isGameOver = false;
  totalPausedDuration = 0;
  revivePauseStartAt = 0;
  if (fpsCounterEl) fpsCounterEl.style.display = fpsCounterEnabled ? 'block' : 'none';

  for (let i = 0; i < particles.length; i++) {
    if (particlePool.length < maxParticles) particlePool.push(particles[i]);
  }
  particles.length = 0;
  visualRings.length = 0;
  if (player.eatPulses) player.eatPulses.length = 0;
  initSnake();
  initBots();
  initFood();
  scheduleNextRareOrb();
  scheduleNextPowerup();
  powerups.length = 0;
  applyDifficultySpeeds();
  CrazyGamesBridge.gameplayStart();
  if (typeof showInGameOnboardingIfNeeded === 'function') showInGameOnboardingIfNeeded();
  ensureGameLoop();
}

function goHome() {
  try { flushDeferredProfileSave(true); } catch (_) {}
  try { CrazyGamesBridge.gameplayStop(); } catch (_) {}
  try { if (typeof hideInGameOnboarding === 'function') hideInGameOnboarding(false); } catch (_) {}
  try { if (typeof LevelsMode !== 'undefined') LevelsMode.reset(); } catch (_) {}
  stopGameLoop();
  gameMode = 'arena';
  isGameRunning = false;
  isPaused = false;
  isGameOver = false;
  rareOrb = null;
  powerups.length = 0;
  resetActiveControls();
  if (canvas) canvas.style.pointerEvents = 'none';
  try { AdManager.hideNativeBanner(); } catch (_) {}
  if (fpsCounterEl) fpsCounterEl.style.display = 'none';
  if (powerupIndicatorEl) powerupIndicatorEl.style.display = 'none';
  const lvlBanner = document.getElementById('level-intro-banner');
  if (lvlBanner) lvlBanner.style.display = 'none';
  if (rareIndicatorEl) rareIndicatorEl.style.display = 'none';
  const reviveModal = document.getElementById('revive-modal');
  if (reviveModal) reviveModal.style.display = 'none';
  const confirmModal = document.getElementById('confirm-modal');
  if (confirmModal && !AdManager.adInProgress) confirmModal.style.display = 'none';
  const rewardModal = document.getElementById('reward-reveal-modal');
  if (rewardModal) rewardModal.style.display = 'none';
  if (pauseOverlayEl) pauseOverlayEl.style.display = 'none';
  if (overlayEl) overlayEl.style.display = 'none';
  if (hudEl) hudEl.style.display = 'none';
  if (lbEl) lbEl.style.display = 'none';
  document.querySelectorAll('.subscreen').forEach(el => { el.style.display = 'none'; });
  activeSubscreenId = null;
  settingsOpenedFromGame = false;
  if (menuScreenEl) {
    menuScreenEl.style.display = 'flex';
    menuScreenEl.scrollTop = 0;
  }
  try { updateMenuRecordsDisplay(); } catch (_) {}
  try { refreshMenuHeaderUI(); } catch (_) {}
  startMenuPreviewTicker();
}

window.handleAndroidBack = function () {
  const rewardModal = document.getElementById('reward-reveal-modal');
  if (rewardModal && rewardModal.style.display === 'flex') {
    closeRewardRevealModal();
    return true;
  }
  const confirmModal = document.getElementById('confirm-modal');
  if (confirmModal && confirmModal.style.display === 'flex') {
    if (!AdManager.adInProgress) closeConfirmModal();
    return true;
  }
  const reviveModal = document.getElementById('revive-modal');
  if (reviveModal && reviveModal.style.display === 'flex') {
    declineRevive();
    return true;
  }
  if (activeSubscreenId) {
    closeSubscreen();
    return true;
  }
  if (isGameRunning && !isPaused && !isGameOver) {
    togglePause();
    return true;
  }
  if (isPaused || isGameOver) {
    goHome();
    return true;
  }
  return false;
};

function togglePause() {
  if (!isGameRunning || isGameOver) return;
  isPaused = !isPaused;
  if (isPaused) {
    pauseStartTime = performance.now();
    resetActiveControls();
    stopGameLoop();
    if (canvas) canvas.style.pointerEvents = 'none';
    flushDeferredProfileSave(true);
    CrazyGamesBridge.gameplayStop();
    if (pauseOverlayEl) pauseOverlayEl.style.display = 'flex';
  } else {
    const pauseDelta = performance.now() - pauseStartTime;
    if (gameMode === 'levels') {
      if (typeof LevelsMode !== 'undefined') LevelsMode.shiftTimers(pauseDelta);
    } else {
      shiftActiveTimersByPauseDuration(pauseDelta);
    }
    lastLoopFrameTime = performance.now();
    fixedStepAccumulator = 0;
    if (pauseOverlayEl) pauseOverlayEl.style.display = 'none';
    if (canvas) canvas.style.pointerEvents = 'auto';
    CrazyGamesBridge.gameplayStart();
    ensureGameLoop();
  }
}

function resetActiveControls() {
  const activePid = joystick.pointerId;
  keys.left = false;
  keys.right = false;
  mouse.active = false;
  joystick.active = false;
  joystick.pointerId = null;
  joystick.dx = 0;
  joystick.dy = 0;
  joystick.hasDirection = false;
  if (activePid !== null && canvas && typeof canvas.releasePointerCapture === 'function') {
    try { canvas.releasePointerCapture(activePid); } catch (_) {}
  }
  if (player) player.targetAngle = player.angle;
  if (joystickEl) joystickEl.style.display = 'none';
}

window.onNativeAppPause = function () {
  resetActiveControls();
  if (isGameRunning && !isPaused && !isGameOver) togglePause();
  if (ambientGain && audioCtx) {
    try { ambientGain.gain.setValueAtTime(0, audioCtx.currentTime); } catch (_) {}
  }
  saveProfileDirty = false;
  if (typeof saveProfileData === 'function') saveProfileData();
};

window.onNativeAppResume = function () {
  if (!AdManager.adInProgress) {
    if (audioCtx && audioCtx.state === 'suspended') {
      try { audioCtx.resume().catch(() => {}); } catch (_) {}
    }
    applyAmbientAudioGain();
    lastLoopFrameTime = performance.now();
    fixedStepAccumulator = 0;
    if (isGameRunning && !isPaused && !isGameOver) {
      if (canvas) canvas.style.pointerEvents = 'auto';
      ensureGameLoop();
    }
  }
};

function initInput() {
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.addEventListener('contextmenu', (e) => {
    if (!e.target || (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA')) {
      e.preventDefault();
    }
  });

  const pauseButton = document.getElementById('pause-btn');
  const homeButton = document.getElementById('home-btn');
  const muteButton = document.getElementById('mute-btn');
  const hudSettingsButton = document.getElementById('hud-settings-btn');
  const lbToggleButton = document.getElementById('lb-toggle-btn');
  const abilityDock = document.getElementById('ability-dock');
  pauseButton.addEventListener('pointerdown', (e) => e.stopPropagation());
  pauseButton.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  pauseButton.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePause();
  });
  homeButton.addEventListener('pointerdown', (e) => e.stopPropagation());
  homeButton.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  homeButton.addEventListener('click', (e) => { e.stopPropagation(); goHome(); });
  if (muteButton) {
    muteButton.addEventListener('pointerdown', (e) => e.stopPropagation());
    muteButton.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }
  if (hudSettingsButton) {
    hudSettingsButton.addEventListener('pointerdown', (e) => e.stopPropagation());
    hudSettingsButton.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }
  if (lbToggleButton) {
    lbToggleButton.addEventListener('pointerdown', (e) => e.stopPropagation());
    lbToggleButton.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }
  if (abilityDock) {
    abilityDock.addEventListener('pointerdown', (e) => e.stopPropagation());
    abilityDock.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }
  const levelsPauseBtn = document.querySelector('#levels-hud .lhud-pause-btn');
  if (levelsPauseBtn) {
    levelsPauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    levelsPauseBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }
  // Multi-touch instant ability activation while steering with virtual joystick on Android
  ['ghost', 'magnet', 'dash'].forEach(abName => {
    const abBtn = document.getElementById(`${abName}-btn`);
    if (!abBtn) return;
    abBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        e.preventDefault();
        abBtn.dataset.lastTouchAt = String(performance.now());
        activateAbility(abName);
      }
    });
    abBtn.addEventListener('click', (e) => {
      const lastTouchAt = Number(abBtn.dataset.lastTouchAt || 0);
      if (lastTouchAt > 0 && performance.now() - lastTouchAt < 450) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  });

  // CSP-compliant delegated UI click & input dispatcher (zero inline onclick/oninput attributes)
  document.addEventListener('click', (e) => {
    const target = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-action]') : null;
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    const arg = target.dataset.arg || '';
    switch (action) {
      case 'stop-prop':
        e.stopPropagation();
        break;
      case 'toggle-mute':
        toggleMute();
        break;
      case 'toggle-music':
        toggleMusic();
        break;
      case 'open-ingame-settings':
        openIngameSettings();
        break;
      case 'activate-ability':
        activateAbility(arg);
        break;
      case 'toggle-lb-collapse':
        toggleLeaderboardCollapse();
        break;
      case 'open-screen':
        openScreen(arg);
        break;
      case 'close-subscreen':
        closeSubscreen();
        break;
      case 'set-difficulty':
        setDifficulty(arg);
        break;
      case 'start-game':
        startGame();
        break;
      case 'restart-game':
        restartGame();
        break;
      case 'toggle-pause':
        togglePause();
        break;
      case 'go-home':
        goHome();
        break;
      case 'skip-onboarding':
        hideInGameOnboarding(true);
        break;
      case 'levels-select-world':
        if (typeof LevelsMode !== 'undefined') LevelsMode.selectWorld(Number(arg) || 0);
        break;
      case 'levels-play':
        if (typeof LevelsMode !== 'undefined') LevelsMode.startLevel(Number(arg) || 1);
        break;
      case 'levels-next':
        if (typeof LevelsMode !== 'undefined') LevelsMode.startLevel(Math.min(50, (LevelsMode.currentLevel || 1) + 1));
        break;
      case 'levels-retry':
        if (typeof LevelsMode !== 'undefined') LevelsMode.startLevel(LevelsMode.currentLevel || 1);
        break;
      case 'levels-map':
        goHome();
        openScreen('levels');
        break;
      case 'set-skin-category':
        setSkinCategory(arg);
        break;
      case 'set-skin-filter':
        setSkinFilter(arg);
        break;
      case 'preview-skin':
        previewSkin(arg);
        break;
      case 'select-skin':
        e.stopPropagation();
        selectSkin(arg);
        break;
      case 'buy-skin':
        e.stopPropagation();
        promptBuySkin(arg);
        break;
      case 'trial-skin':
        e.stopPropagation();
        trySkinWithAd(arg);
        break;
      case 'watch-bonus-coins':
        watchRewardedBonusCoins();
        break;
      case 'set-mission-tier':
        setMissionTier(arg);
        break;
      case 'claim-mission':
        claimMissionReward(arg, target.dataset.tier || 'daily');
        break;
      case 'claim-daily-reward':
        claimDailyLoginReward();
        break;
      case 'set-ach-category':
        setAchievementCategory(arg);
        break;
      case 'claim-achievement':
        claimAchievement(arg);
        break;
      case 'attempt-remove-ads':
        attemptRemoveAdsPurchase();
        break;
      case 'set-graphics-quality':
        setGraphicsQuality(arg);
        break;
      case 'toggle-fps':
        toggleFpsCounter();
        break;
      case 'toggle-fullscreen':
        toggleFullscreenMode();
        break;
      case 'toggle-vibration':
        toggleVibration();
        break;
      case 'set-control-style':
        setControlStyle(arg);
        break;
      case 'set-joystick-size':
        setJoystickSize(arg);
        break;
      case 'toggle-lefthanded':
        toggleLeftHanded();
        break;
      case 'open-privacy-options':
        AdManager.openPrivacyOptions();
        break;
      case 'delete-my-data':
        promptDeleteMyData();
        break;
      case 'close-reward-modal':
        closeRewardRevealModal();
        break;
      case 'confirm-revive':
        confirmWatchReviveAd();
        break;
      case 'decline-revive':
        declineRevive();
        break;
      case 'watch-double-coins':
        watchDoubleCoinsAd();
        break;
    }
  });

  document.addEventListener('input', (e) => {
    const target = e.target;
    if (!target || !target.dataset || !target.dataset.inputAction) return;
    const action = target.dataset.inputAction;
    if (action === 'set-skin-search') setSkinSearch(target.value);
    else if (action === 'set-master-volume') setMasterVolume(target.value);
    else if (action === 'set-joystick-sensitivity') setJoystickSensitivity(target.value);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.onNativeAppPause();
    } else {
      window.onNativeAppResume();
    }
  });
  window.addEventListener('blur', () => {
    resetActiveControls();
    if (typeof saveProfileData === 'function') saveProfileData();
  });
  window.addEventListener('pagehide', () => {
    window.onNativeAppPause();
  });

  window.addEventListener('keydown', (e) => {
    const code = e.code || '';
    const isPlaying = isGameRunning && !isGameOver;
    // Prevent iframe scroll on arrow keys & Space during gameplay (CrazyGames requirement)
    if (isPlaying && (code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight' || code === 'Space')) {
      e.preventDefault();
    }

    initAudio();
    if (code === 'KeyP') {
      if (isPlaying) {
        e.preventDefault();
        togglePause();
        return;
      }
    }

    if (isGameOver) {
      if (code === 'Enter' || e.key === 'Enter') restartGame();
      return;
    }

    if (!isPlaying || isPaused) return;

    if (code === 'Space') {
      if (gameMode === 'arena') activateAbility('dash');
      if (typeof markOnboardingAction === 'function') markOnboardingAction();
      return;
    }

    if (gameMode === 'arena') {
      if (code === 'Digit1' || e.key === '1') activateAbility('ghost');
      if (code === 'Digit2' || e.key === '2') activateAbility('magnet');
      if (code === 'Digit3' || e.key === '3') activateAbility('dash');
    }

    // Use physical key codes (KeyA / KeyD) so AZERTY (Q/D), QWERTZ, and QWERTY layouts all work automatically
    if (code === 'ArrowLeft' || code === 'KeyA') {
      keys.left = true;
      mouse.active = false;
      if (typeof markOnboardingAction === 'function') markOnboardingAction();
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      keys.right = true;
      mouse.active = false;
      if (typeof markOnboardingAction === 'function') markOnboardingAction();
    }
  });

  window.addEventListener('keyup', (e) => {
    const code = e.code || '';
    if (code === 'ArrowLeft' || code === 'KeyA') keys.left = false;
    if (code === 'ArrowRight' || code === 'KeyD') keys.right = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (isTouchDevice) return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
    if (isGameRunning && !isPaused && !isGameOver && typeof markOnboardingAction === 'function') {
      markOnboardingAction();
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    if ((e.pointerType !== 'touch' && e.pointerType !== 'pen') || !isGameRunning || isPaused || isGameOver || joystick.active) return;
    e.preventDefault();
    initAudio();
    markOnboardingAction();
    keys.left = false;
    keys.right = false;
    mouse.active = false;
    joystick.active = true;
    joystick.pointerId = e.pointerId;
    joystick.originX = e.clientX;
    joystick.originY = e.clientY;
    joystick.dx = 0;
    joystick.dy = 0;
    joystick.hasDirection = false;
    player.targetAngle = player.angle;
    const isSwipe = profileData && profileData.settings && profileData.settings.controlStyle === 'swipe';
    if (joystickEl && !isSwipe) {
      joystickEl.style.left = `${e.clientX}px`;
      joystickEl.style.top = `${e.clientY}px`;
      joystickEl.style.display = 'block';
    }
    if (joystickThumbEl) joystickThumbEl.style.transform = 'translate(0, 0)';
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!joystick.active || e.pointerId !== joystick.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - joystick.originX;
    const dy = e.clientY - joystick.originY;
    const distance = Math.hypot(dx, dy);
    joystick.hasDirection = distance >= TOUCH_DEAD_ZONE;
    if (joystick.hasDirection) {
      joystick.dx = dx;
      joystick.dy = dy;
      if (profileData && profileData.settings && profileData.settings.controlStyle === 'swipe' && distance > 42) {
        joystick.originX = e.clientX - (dx / distance) * 24;
        joystick.originY = e.clientY - (dy / distance) * 24;
      }
    } else {
      joystick.dx = 0;
      joystick.dy = 0;
      player.targetAngle = player.angle;
    }
    const maxRadius = profileData && profileData.settings && profileData.settings.joystickSize === 'large' ? 46 : (profileData && profileData.settings && profileData.settings.joystickSize === 'small' ? 28 : 36);
    const thumbDistance = Math.min(maxRadius, distance);
    const thumbX = distance ? dx / distance * thumbDistance : 0;
    const thumbY = distance ? dy / distance * thumbDistance : 0;
    if (joystickThumbEl) joystickThumbEl.style.transform = `translate(${thumbX}px, ${thumbY}px)`;
  });

  const stopTouchSteering = (e) => {
    if (!joystick.active || e.pointerId !== joystick.pointerId) return;
    joystick.active = false;
    joystick.pointerId = null;
    joystick.dx = 0;
    joystick.dy = 0;
    joystick.hasDirection = false;
    mouse.active = false;
    player.targetAngle = player.angle;
    if (joystickEl) joystickEl.style.display = 'none';
  };
  canvas.addEventListener('pointerup', stopTouchSteering);
  canvas.addEventListener('pointercancel', stopTouchSteering);
  canvas.addEventListener('lostpointercapture', stopTouchSteering);
}

function onResize() {
  width = window.innerWidth;
  height = window.innerHeight;
  isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  deviceScale = Math.min(window.devicePixelRatio || 1, isMobileDevice ? 1.25 : 2);
  canvas.width = Math.round(width * deviceScale);
  canvas.height = Math.round(height * deviceScale);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  if (joystick.active) resetActiveControls();
  const pCanvas = document.getElementById('reward-particle-canvas');
  if (pCanvas && pCanvas.offsetParent !== null) {
    pCanvas.width = width;
    pCanvas.height = height;
  }
  if (gameMode === 'levels' && typeof LevelsMode !== 'undefined') {
    LevelsMode.computeViewportLayout();
  } else {
    updateCamera();
  }
}

function initSnake() {
  player.x = WORLD_WIDTH / 2;
  player.y = WORLD_HEIGHT / 2;
  player.prevX = player.x;
  player.prevY = player.y;
  cameraX = player.x;
  cameraY = player.y;
  fixedStepAccumulator = 0;
  lastLoopFrameTime = performance.now();
  player.trailWorldX = player.x;
  player.trailWorldY = player.y;
  player.glowTrailUntil = 0;
  for (let i = 0; i < player.glowTrailSamples.length; i++) {
    if (glowTrailSamplePool.length < 1024) glowTrailSamplePool.push(player.glowTrailSamples[i]);
  }
  player.glowTrailSamples.length = 0;
  player.lastTrailSampleAt = 0;
  rareOrb = null;
  powerups.length = 0;
  if (powerupIndicatorEl) powerupIndicatorEl.style.display = 'none';
  if (rareIndicatorEl) rareIndicatorEl.style.display = 'none';
  const reviveModal = document.getElementById('revive-modal');
  if (reviveModal) reviveModal.style.display = 'none';
  player.angle = -Math.PI / 2;
  player.targetAngle = -Math.PI / 2;
  player.length = INITIAL_SEGMENTS;
  player.speed = getActiveSpeed();
  player.palette = getSkin().palette;
  player.rarity = getSkin().rarity || 'common';
  player.growQueue = 0;
  player.segments.length = 0;
  player.alive = true;
  player.protectedUntil = performance.now() + 2000;
  player.ghostUntil = 0;
  player.magnetUntil = 0;
  player.dashUntil = 0;
  player.speedBoostUntil = 0;
  player.plasma2xUntil = 0;
  player.comboCount = 0;
  player.comboExpiresAt = 0;
  player.abilityReadyAt = { ghost: 0, magnet: 0, dash: 0 };
  playerKillCount = 0;
  matchFoodEaten = 0;
  matchFruitScore = 0;
  currentArenaLevel = 1;
  matchPowerupsCollected = 0;
  matchDashesUsed = 0;
  matchAbilitiesUsed = 0;
  matchCurrentKillStreak = 0;
  matchDangerZoneAccum = 0;
  matchCoinsEarned = 0;
  matchXpEarned = 0;
  matchScore = 0;
  matchReviveUsed = false;
  matchDoubleClaimed = false;
  matchReachedLen150 = false;
  matchPacifist3mAwarded = false;
  lastRecordedSurvivalSecond = 0;
  for (let i = 0; i < floatingTexts.length; i++) {
    if (floatingTextPool.length < 64) floatingTextPool.push(floatingTexts[i]);
  }
  floatingTexts.length = 0;
  if (statKillsEl) statKillsEl.textContent = '0';

  for (let i = 0; i < player.length; i++) {
    player.segments.push({
      x: player.x,
      y: player.y + i * SEGMENT_SPACING,
      angle: player.angle,
      lateralOffset: 0
    });
  }

  gameStartTime = performance.now();
  totalPausedDuration = 0;
  revivePauseStartAt = 0;
  isGameOver = false;
  overlayEl.style.display = 'none';
  pauseOverlayEl.style.display = 'none';

  if (statLengthEl) statLengthEl.textContent = player.length;
  if (statRankEl) statRankEl.textContent = '#1';
}

function restartGame() {
  stopGameLoop();
  resetActiveControls();
  if (gameMode === 'levels' && typeof LevelsMode !== 'undefined') {
    LevelsMode.startLevel(LevelsMode.currentLevel || 1);
    return;
  }
  if (canvas) canvas.style.pointerEvents = 'auto';
  overlayEl.style.display = 'none';
  pauseOverlayEl.style.display = 'none';
  isPaused = false;
  isGameRunning = true;
  isGameOver = false;
  for (let i = 0; i < particles.length; i++) {
    if (particlePool.length < maxParticles) particlePool.push(particles[i]);
  }
  particles.length = 0;
  visualRings.length = 0;
  if (player.eatPulses) player.eatPulses.length = 0;
  initSnake();
  initBots();
  initFood();
  scheduleNextRareOrb();
  scheduleNextPowerup();
  powerups.length = 0;
  applyDifficultySpeeds();
  CrazyGamesBridge.gameplayStart();
  ensureGameLoop();
}

// ============================================================
// §9  RENDER: BACKGROUND, TRAIL, FOOD & SERPENTS
// ============================================================

function updateBackgroundCache() {
  if (animFrame - backgroundCacheFrame < 4 && backgroundCacheQuality === graphicsQuality) return;
  const offscreen = backgroundLayerContext;
  const cacheWidth = backgroundLayerCanvas.width;
  const cacheHeight = backgroundLayerCanvas.height;
  const gradient = offscreen.createLinearGradient(0, 0, 0, cacheHeight);
  gradient.addColorStop(0, currentCycle.top);
  gradient.addColorStop(0.5, currentCycle.mid);
  gradient.addColorStop(1, currentCycle.bottom);
  offscreen.fillStyle = gradient;
  offscreen.fillRect(0, 0, cacheWidth, cacheHeight);
  const rayStrength = graphicsQuality === 'low' ? 0 : currentCycle.rayStrength * (graphicsQuality === 'medium' ? 0.7 : 1);
  if (rayStrength > 0.005) {
    offscreen.save();
    offscreen.globalCompositeOperation = 'screen';
    offscreen.globalAlpha = Math.min(0.85, rayStrength * 4.2);
    for (let i = 0; i < 3; i++) {
      const x = cacheWidth * (0.16 + i * 0.34) + Math.sin(animFrame * 0.006 + i * 1.9) * 4;
      const ray = offscreen.createLinearGradient(x, 0, x + 22, cacheHeight);
      ray.addColorStop(0, currentCycle.rayColor);
      ray.addColorStop(1, 'rgba(255,255,255,0)');
      offscreen.fillStyle = ray;
      offscreen.beginPath();
      offscreen.moveTo(x - 8, 0);
      offscreen.lineTo(x + 7, 0);
      offscreen.lineTo(x + 36, cacheHeight);
      offscreen.lineTo(x + 9, cacheHeight);
      offscreen.closePath();
      offscreen.fill();
    }
    offscreen.restore();
  }
  backgroundCacheFrame = animFrame;
  backgroundCacheQuality = graphicsQuality;
}

function renderBackground() {
  const bounds = cameraViewBounds(20);
  const viewWidth = bounds.right - bounds.left;
  const viewHeight = bounds.bottom - bounds.top;
  updateBackgroundCache();
  ctx.drawImage(backgroundLayerCanvas, bounds.left, bounds.top, viewWidth, viewHeight);

  // The cached 200-unit tile divides the world evenly and stays aligned at wrap seams.
  if (backgroundGridPattern) {
    ctx.fillStyle = backgroundGridPattern;
    ctx.globalAlpha = graphicsQuality === 'low' ? 0.35 : 1;
    ctx.fillRect(bounds.left, bounds.top, viewWidth, viewHeight);
    ctx.globalAlpha = 1;
  }

  const planktonAlpha = graphicsQuality === 'low' ? 0 : currentCycle.plankton * (graphicsQuality === 'medium' ? 0.65 : 1);
  if (planktonAlpha > 0.005) {
    const bounds = cameraViewBounds(4);
    ctx.fillStyle = '#9cf8df';
    for (const dot of plankton) {
      const x = cameraX + toroidDelta(cameraX, dot.x, WORLD_WIDTH);
      if (x + dot.size < bounds.left || x - dot.size > bounds.right) continue;
      const y = cameraY + toroidDelta(cameraY, dot.y, WORLD_HEIGHT);
      if (y + dot.size < bounds.top || y - dot.size > bounds.bottom) continue;
      const twinkle = 0.72 + Math.sin(animFrame * 0.035 + dot.phase) * 0.28;
      ctx.globalAlpha = planktonAlpha * twinkle;
      ctx.beginPath();
      ctx.arc(x, y, dot.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function renderDangerZone() {
  const x = cameraX + toroidDelta(cameraX, WORLD_WIDTH / 2, WORLD_WIDTH);
  const y = cameraY + toroidDelta(cameraY, WORLD_HEIGHT / 2, WORLD_HEIGHT);
  const bounds = cameraViewBounds(DANGER_ZONE_RADIUS + 10);
  if (x + DANGER_ZONE_RADIUS < bounds.left || x - DANGER_ZONE_RADIUS > bounds.right || y + DANGER_ZONE_RADIUS < bounds.top || y - DANGER_ZONE_RADIUS > bounds.bottom) return;
  ctx.save();
  if (graphicsQuality === 'low') {
    ctx.fillStyle = 'rgba(250, 204, 21, 0.055)';
  } else {
    const gradient = ctx.createRadialGradient(x, y, DANGER_ZONE_RADIUS * 0.25, x, y, DANGER_ZONE_RADIUS);
    gradient.addColorStop(0, 'rgba(250,204,21,.10)');
    gradient.addColorStop(1, 'rgba(245,158,11,.015)');
    ctx.fillStyle = gradient;
  }
  ctx.beginPath();
  ctx.arc(x, y, DANGER_ZONE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(250,204,21,.28)';
  ctx.lineWidth = 5;
  ctx.setLineDash([22, 18]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function renderFood() {
  const now = performance.now();
  const bounds = cameraViewBounds(42);
  const isMobViewport = width <= 768 || isMobileDevice;
  const mobileFoodScale = isMobViewport ? 1.42 : 1.08;
  const zoomComp = isMobViewport && cameraZoom < 0.72 ? Math.min(1.22, 0.74 / Math.max(0.45, cameraZoom)) : 1.0;
  const visualScale = 0.82 * mobileFoodScale * zoomComp;
  const showAllFoodGlow = graphicsQuality !== 'low';
  const glowAlpha = graphicsQuality === 'low' ? 0.55 : (graphicsQuality === 'medium' ? 0.75 : 0.96);
  const glowScale = (isMobViewport ? 1.22 : 1.10) + currentCycle.nightFactor * 0.65;
  const scaleInDuration = FRUITS_CONFIG.scaleInMs || 240;
  const blinkWarningMs = FRUITS_CONFIG.blinkWarningMs || 2000;

  for (const orb of foodOrbs) {
    const birthProgress = orb.burstAt
      ? Math.min(1, Math.max(0, (now - orb.burstAt - orb.burstDelay) / 220))
      : Math.min(1, Math.max(0.08, (now - (orb.spawnedAt || 0)) / scaleInDuration));
    if (birthProgress <= 0) continue;

    // Special pickups (Gold Danger Zone Energy Orbs & Snake Death Drops) keep their glowing energy orb look
    if (!orb.isFruit) {
      const bonusScale = orb.isDangerFood ? 1.24 : (orb.value > 1 ? 1.16 : 1.0);
      const pulse = graphicsQuality === 'low' ? 1.0 : (1 + Math.sin(animFrame * (orb.pulseSpeed || 0.05) + (orb.pulsePhase || 0)) * 0.07);
      const radius = Math.max(2.2, orb.baseRadius * visualScale * bonusScale * pulse * birthProgress);
      const x = cameraX + toroidDelta(cameraX, orb.x, WORLD_WIDTH);
      if (x + radius < bounds.left || x - radius > bounds.right) continue;
      const y = cameraY + toroidDelta(cameraY, orb.y, WORLD_HEIGHT);
      if (y + radius < bounds.top || y - radius > bounds.bottom) continue;
      ctx.globalAlpha = birthProgress;
      if (showAllFoodGlow || orb.value > 1) drawCachedGlow(orb.glow, x, y, radius * glowScale, glowAlpha);
      ctx.fillStyle = orb.color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (radius >= 4.0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
        ctx.beginPath();
        ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }

    // Procedural cached pixel-art neon fruit rendering (Apple, Cherry, Grapes)
    const remainingMs = (orb.expiresAt || Infinity) - now;
    const isExpiring = remainingMs < blinkWarningMs;
    const shrinkFactor = isExpiring ? Math.max(0.45, 0.45 + 0.55 * (remainingMs / blinkWarningMs)) : 1.0;
    const blinkAlpha = isExpiring ? (Math.sin(now * 0.032) > -0.15 ? 1.0 : 0.24) : 1.0;
    const bobOffset = graphicsQuality === 'low' ? 0 : Math.sin(now * 0.0055 + (orb.pulsePhase || 0)) * 2.4;
    const drawRadius = Math.max(8, orb.baseRadius * visualScale * birthProgress * shrinkFactor);

    const x = cameraX + toroidDelta(cameraX, orb.x, WORLD_WIDTH);
    if (x + drawRadius + 8 < bounds.left || x - drawRadius - 8 > bounds.right) continue;
    const y = cameraY + toroidDelta(cameraY, orb.y, WORLD_HEIGHT) + bobOffset;
    if (y + drawRadius + 8 < bounds.top || y - drawRadius - 8 > bounds.bottom) continue;

    ctx.globalAlpha = birthProgress * blinkAlpha;
    if (showAllFoodGlow || orb.fruitType === 'grapes') {
      drawCachedGlow(orb.glow, x, y, drawRadius * 0.92 * glowScale, glowAlpha * 0.85);
    }

    // Faint glow ring during scale-in animation
    if (birthProgress < 0.99) {
      ctx.save();
      ctx.globalAlpha = (1 - birthProgress * 0.7) * 0.65;
      ctx.strokeStyle = orb.outline || orb.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, drawRadius * (0.95 + birthProgress * 0.55), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const sprite = fruitSpriteCache.get(orb.fruitType) || fruitSpriteCache.get('apple');
    if (sprite) {
      const spriteSize = drawRadius * 2.55;
      ctx.drawImage(sprite, x - spriteSize / 2, y - spriteSize / 2, spriteSize, spriteSize);
    }

    // Occasional CRT neon pixel sparkle
    if (graphicsQuality !== 'low' && Math.sin(now * 0.011 + (orb.pulsePhase || 0) * 3.7) > 0.91) {
      const spX = x + Math.cos(orb.pulsePhase || 0) * drawRadius * 0.52;
      const spY = y - drawRadius * 0.48;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(spX - 1.5, spY - 4.5, 3, 9);
      ctx.fillRect(spX - 4.5, spY - 1.5, 9, 3);
    }
  }
  ctx.globalAlpha = 1;
}

function renderFloatingTexts() {
  const now = performance.now();
  const bounds = cameraViewBounds(36);
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const item = floatingTexts[i];
    const age = now - item.time;
    if (age > 950) {
      const last = floatingTexts.length - 1;
      floatingTexts[i] = floatingTexts[last];
      floatingTexts.pop();
      if (floatingTextPool.length < 64) floatingTextPool.push(item);
      continue;
    }
    const x = cameraX + toroidDelta(cameraX, item.x, WORLD_WIDTH);
    if (x + 36 < bounds.left || x - 36 > bounds.right) continue;
    const y = cameraY + toroidDelta(cameraY, item.y - age * 0.038, WORLD_HEIGHT);
    if (y + 36 < bounds.top || y - 36 > bounds.bottom) continue;
    const fade = 1 - age / 950;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (item.boxed) {
      const boxW = Math.max(38, item.text.length * 9 + 14);
      const boxH = 22;
      ctx.fillStyle = 'rgba(8, 13, 24, 0.90)';
      ctx.strokeStyle = item.outline || item.color || '#00F5A0';
      ctx.lineWidth = 1.8;
      ctx.fillRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
      ctx.strokeRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
      ctx.fillStyle = item.outline || '#ffffff';
      ctx.fillText(item.text, x, y + 0.5);
    } else {
      ctx.fillStyle = '#fff1b8';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(15,23,42,.86)';
      ctx.strokeText(item.text, x, y);
      ctx.fillText(item.text, x, y);
    }
    ctx.restore();
  }
}

function pushFloatingText(x, y, text, time = performance.now(), opts = null) {
  const item = floatingTextPool.pop() || {};
  item.x = x;
  item.y = y;
  item.text = text;
  item.time = time;
  item.boxed = Boolean(opts && opts.boxed);
  item.color = (opts && opts.color) || '#fff1b8';
  item.outline = (opts && opts.outline) || '#00F5A0';
  floatingTexts.push(item);
}

function renderRareOrb() {
  if (!rareOrb) {
    if (rareIndicatorEl) rareIndicatorEl.style.display = 'none';
    return;
  }

  const now = performance.now();
  const shimmer = 0.85 + Math.sin(now * 0.009) * 0.15;
  const rotation = now * 0.0014;
  const isMobViewport = width <= 768 || isMobileDevice;
  const rareScale = FOOD_SIZE_SCALE * (isMobViewport ? 1.50 : 1.18);
  const bounds = cameraViewBounds(38);
  const x = cameraX + toroidDelta(cameraX, rareOrb.x, WORLD_WIDTH);
  const y = cameraY + toroidDelta(cameraY, rareOrb.y, WORLD_HEIGHT);
  const remainingSec = Math.max(0, Math.ceil((rareOrb.expiresAt - now) / 1000));
  const lifeFraction = Math.max(0, Math.min(1, (rareOrb.expiresAt - now) / RARE_ORB_LIFETIME_MS));
  if (x + 38 >= bounds.left && x - 38 <= bounds.right && y + 38 >= bounds.top && y - 38 <= bounds.bottom) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = shimmer;
    drawCachedGlow('rgba(255, 224, 145, 0.98)', 0, 0, (12 + currentCycle.nightFactor * 4) * rareScale, graphicsQuality === 'low' ? 0.65 : 0.98);
    ctx.fillStyle = '#fff8df';
    ctx.beginPath();
    ctx.arc(0, 0, 7.2 * rareScale, 0, Math.PI * 2);
    ctx.fill();
    // Gold Orb countdown ring
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.88)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, 18.5 * rareScale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lifeFraction);
    ctx.stroke();
    ctx.save();
    ctx.rotate(rotation);
    ctx.strokeStyle = '#ffe5a4';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([8, 4.5]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 14.5 * rareScale, 9.5 * rareScale, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const a = rotation * 1.7 + i * Math.PI * 2 / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 17 * rareScale, Math.sin(a) * 12 * rareScale, 1.6 * rareScale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Gold Orb countdown timer label
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${remainingSec}s`, 0, -22 * rareScale);
    ctx.restore();
  }

  if (rareIndicatorEl && animFrame % 4 === 0) {
    let dx = toroidDelta(player.x, rareOrb.x, WORLD_WIDTH) * cameraZoom;
    let dy = toroidDelta(player.y, rareOrb.y, WORLD_HEIGHT) * cameraZoom;
    if (Math.abs(dx) + Math.abs(dy) < 1) dy = -1;
    const edgeFactor = Math.min(
      (width / 2 - 32) / Math.max(1, Math.abs(dx)),
      (height / 2 - 32) / Math.max(1, Math.abs(dy))
    );
    rareIndicatorEl.style.left = `${width / 2 + dx * edgeFactor}px`;
    rareIndicatorEl.style.top = `${height / 2 + dy * edgeFactor}px`;
    rareIndicatorEl.style.transform = 'translate(-50%, -50%)';
    const arrow = rareIndicatorEl.querySelector('span');
    if (arrow) arrow.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI + 90}deg)`;
    rareIndicatorEl.style.display = 'flex';
  }
}

function drawGlowTrail(snake) {
  if (!snake.alive) return;
  const samples = snake.glowTrailSamples;
  if (!samples || samples.length < 2 || performance.now() >= snake.glowTrailUntil) return;
  const trailViewRadius = Math.hypot(width, height) / (2 * cameraZoom) + 1700;
  if (toroidDistSq(cameraX, cameraY, snake.x, snake.y) > trailViewRadius * trailViewRadius) return;
  const now = performance.now();
  const groupSize = 8;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff0bd';
  for (let start = 0; start < samples.length - 1; start += groupSize) {
    const end = Math.min(samples.length - 1, start + groupSize);
    const age = (now - samples[Math.floor((start + end) / 2)].time) / RARE_ORB_TRAIL_MS;
    const fade = Math.max(0, 1 - age);
    ctx.globalAlpha = fade * 0.72;
    ctx.lineWidth = 1.5 + fade * 4;
    ctx.beginPath();
    for (let i = start; i < end; i++) {
      const first = samples[i];
      const second = samples[i + 1];
      const x1 = snake.x + first.x - snake.trailWorldX;
      const y1 = snake.y + first.y - snake.trailWorldY;
      const x2 = snake.x + second.x - snake.trailWorldX;
      const y2 = snake.y + second.y - snake.trailWorldY;
      const shiftX = Math.round((cameraX - (x1 + x2) / 2) / WORLD_WIDTH) * WORLD_WIDTH;
      const shiftY = Math.round((cameraY - (y1 + y2) / 2) / WORLD_HEIGHT) * WORLD_HEIGHT;
      ctx.moveTo(x1 + shiftX, y1 + shiftY);
      ctx.lineTo(x2 + shiftX, y2 + shiftY);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function renderParticles() {
  const bounds = cameraViewBounds(12);
  for (const p of particles) {
    const x = cameraX + toroidDelta(cameraX, p.x, WORLD_WIDTH);
    if (x + p.size < bounds.left || x - p.size > bounds.right) continue;
    const y = cameraY + toroidDelta(cameraY, p.y, WORLD_HEIGHT);
    if (y + p.size < bounds.top || y - p.size > bounds.bottom) continue;
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    if (graphicsQuality === 'high') drawCachedGlow(p.color, x, y, p.size * 1.5, p.alpha * 0.35);
    ctx.beginPath();
    ctx.arc(x, y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============================================================
// §9.2  UNIFIED 3D-LIKE 2D SNAKE RENDERING ENGINE
// Shared by Arena Mode, Levels Mode, Main Menu & Skin Vault Previews
// ============================================================
const SnakeRenderer = (() => {
  const paletteCache = new WeakMap();
  const colorRgbCache = new Map();
  const MAX_PTS = 300;
  const _px = new Float32Array(MAX_PTS);
  const _py = new Float32Array(MAX_PTS);
  const _pr = new Float32Array(MAX_PTS);
  const _pa = new Float32Array(MAX_PTS);
  const _pt = new Float32Array(MAX_PTS);
  const _lx = new Float32Array(MAX_PTS);
  const _ly = new Float32Array(MAX_PTS);
  const _rx = new Float32Array(MAX_PTS);
  const _ry = new Float32Array(MAX_PTS);
  const _nx = new Float32Array(MAX_PTS);
  const _ny = new Float32Array(MAX_PTS);

  function parseRgb(color) {
    if (!color || typeof color !== 'string') return [0, 245, 160];
    let cached = colorRgbCache.get(color);
    if (cached) return cached;
    let r = 0, g = 245, b = 160;
    if (color[0] === '#') {
      const hex = color.slice(1);
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length >= 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }
    } else {
      const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
      if (m) {
        r = Number(m[1]) || 0;
        g = Number(m[2]) || 0;
        b = Number(m[3]) || 0;
      }
    }
    cached = [r, g, b];
    if (colorRgbCache.size > 400) colorRgbCache.clear();
    colorRgbCache.set(color, cached);
    return cached;
  }

  function rgbStr(r, g, b, a = 1) {
    const cr = Math.max(0, Math.min(255, Math.round(r)));
    const cg = Math.max(0, Math.min(255, Math.round(g)));
    const cb = Math.max(0, Math.min(255, Math.round(b)));
    return a >= 0.999 ? `rgb(${cr},${cg},${cb})` : `rgba(${cr},${cg},${cb},${a.toFixed(3)})`;
  }

  function shadeRgb(rgb, factor, alpha = 1) {
    return rgbStr(rgb[0] * factor, rgb[1] * factor, rgb[2] * factor, alpha);
  }

  function tintRgb(rgb, amount, alpha = 1) {
    return rgbStr(
      rgb[0] + (255 - rgb[0]) * amount,
      rgb[1] + (255 - rgb[1]) * amount,
      rgb[2] + (255 - rgb[2]) * amount,
      alpha
    );
  }

  function getDerived(pal) {
    let d = paletteCache.get(pal);
    if (d) return d;
    const headRgb = parseRgb(pal.head || '#00F5A0');
    const startRgb = parseRgb(pal.bodyStart || pal.body || pal.head || '#00F5A0');
    const endRgb = parseRgb(pal.bodyEnd || pal.body || pal.bodyStart || '#047857');
    const scaleRgb = parseRgb(pal.scale || tintRgb(startRgb, 0.45));
    d = {
      headRgb,
      startRgb,
      endRgb,
      scaleRgb,
      bodyStart: rgbStr(startRgb[0], startRgb[1], startRgb[2]),
      bodyMid: rgbStr((startRgb[0] + endRgb[0]) * 0.5, (startRgb[1] + endRgb[1]) * 0.5, (startRgb[2] + endRgb[2]) * 0.5),
      bodyEnd: rgbStr(endRgb[0], endRgb[1], endRgb[2]),
      darkOutline: shadeRgb(endRgb, 0.30, 0.94),
      bodyShadow: shadeRgb(startRgb, 0.46, 0.42),
      litFlank: tintRgb(startRgb, 0.34, 0.34),
      glossTint: tintRgb(headRgb, 0.72, 0.38),
      headLight: tintRgb(headRgb, 0.50),
      headBase: rgbStr(headRgb[0], headRgb[1], headRgb[2]),
      headDark: shadeRgb(headRgb, 0.54),
      headOutline: shadeRgb(headRgb, 0.28, 0.96),
      scaleShadow: shadeRgb(startRgb, 0.38, 0.42),
      scaleLip: tintRgb(scaleRgb, 0.35, 0.72),
      glowColor: pal.glow || rgbStr(headRgb[0], headRgb[1], headRgb[2], 0.75)
    };
    paletteCache.set(pal, d);
    return d;
  }

  function getRarityRank(rarity) {
    switch (rarity) {
      case 'mythic': return 5;
      case 'legendary': return 4;
      case 'epic': return 3;
      case 'rare': return 2;
      case 'uncommon': return 1;
      default: return 0;
    }
  }

  function computeNormalsAndEdges(count, widthScale) {
    for (let i = 0; i < count; i++) {
      let tx, ty;
      if (i === 0 && count > 1) {
        tx = _px[0] - _px[1];
        ty = _py[0] - _py[1];
      } else if (i === count - 1 && count > 1) {
        tx = _px[i - 1] - _px[i];
        ty = _py[i - 1] - _py[i];
      } else if (count > 2) {
        tx = _px[i - 1] - _px[i + 1];
        ty = _py[i - 1] - _py[i + 1];
      } else {
        tx = Math.cos(_pa[i]);
        ty = Math.sin(_pa[i]);
      }
      const len = Math.hypot(tx, ty);
      let nx, ny;
      if (len > 0.0001) {
        nx = -ty / len;
        ny = tx / len;
        _pa[i] = Math.atan2(ty, tx);
      } else {
        nx = -Math.sin(_pa[i]);
        ny = Math.cos(_pa[i]);
      }
      _nx[i] = nx;
      _ny[i] = ny;
      const r = _pr[i] * widthScale;
      _lx[i] = _px[i] + nx * r;
      _ly[i] = _py[i] + ny * r;
      _rx[i] = _px[i] - nx * r;
      _ry[i] = _py[i] - ny * r;
    }
  }

  function buildRibbonPath(tCtx, count, offX, offY) {
    const last = count - 1;
    const headAngle = _pa[0];
    const headR = _pr[0];
    const tailAngle = _pa[last];
    const tailR = _pr[last];

    tCtx.beginPath();
    // Rounded neck cap tucked cleanly inside head
    const neckTipX = _px[0] + Math.cos(headAngle) * (headR * 0.55) + offX;
    const neckTipY = _py[0] + Math.sin(headAngle) * (headR * 0.55) + offY;
    tCtx.moveTo(_rx[0] + offX, _ry[0] + offY);
    tCtx.quadraticCurveTo(neckTipX, neckTipY, _lx[0] + offX, _ly[0] + offY);

    // Smooth left silhouette from head to tail
    for (let i = 1; i < last; i++) {
      const mx = (_lx[i] + _lx[i + 1]) * 0.5 + offX;
      const my = (_ly[i] + _ly[i + 1]) * 0.5 + offY;
      tCtx.quadraticCurveTo(_lx[i] + offX, _ly[i] + offY, mx, my);
    }
    tCtx.lineTo(_lx[last] + offX, _ly[last] + offY);

    // Smooth tapered rounded tail tip
    const tailTipX = _px[last] - Math.cos(tailAngle) * (tailR * 1.35) + offX;
    const tailTipY = _py[last] - Math.sin(tailAngle) * (tailR * 1.35) + offY;
    tCtx.quadraticCurveTo(tailTipX, tailTipY, _rx[last] + offX, _ry[last] + offY);

    // Smooth right silhouette from tail back to head
    for (let i = last - 1; i >= 1; i--) {
      const mx = (_rx[i] + _rx[i - 1]) * 0.5 + offX;
      const my = (_ry[i] + _ry[i - 1]) * 0.5 + offY;
      tCtx.quadraticCurveTo(_rx[i] + offX, _ry[i] + offY, mx, my);
    }
    tCtx.lineTo(_rx[0] + offX, _ry[0] + offY);
    tCtx.closePath();
  }

  function strokeSpineCurve(tCtx, count, offX, offY, normalShiftFactor) {
    tCtx.beginPath();
    const x0 = _px[0] + _nx[0] * (_pr[0] * normalShiftFactor) + offX;
    const y0 = _py[0] + _ny[0] * (_pr[0] * normalShiftFactor) + offY;
    tCtx.moveTo(x0, y0);
    for (let i = 1; i < count - 1; i++) {
      const xi = _px[i] + _nx[i] * (_pr[i] * normalShiftFactor) + offX;
      const yi = _py[i] + _ny[i] * (_pr[i] * normalShiftFactor) + offY;
      const xn = _px[i + 1] + _nx[i + 1] * (_pr[i + 1] * normalShiftFactor) + offX;
      const yn = _py[i + 1] + _ny[i + 1] * (_pr[i + 1] * normalShiftFactor) + offY;
      tCtx.quadraticCurveTo(xi, yi, (xi + xn) * 0.5, (yi + yn) * 0.5);
    }
    const last = count - 1;
    tCtx.lineTo(
      _px[last] + _nx[last] * (_pr[last] * normalShiftFactor) + offX,
      _py[last] + _ny[last] * (_pr[last] * normalShiftFactor) + offY
    );
    tCtx.stroke();
  }

  function drawCurvedBand(tCtx, cx, cy, r, ang, bandW, color) {
    tCtx.save();
    tCtx.translate(cx, cy);
    tCtx.rotate(ang);
    tCtx.fillStyle = color;
    tCtx.beginPath();
    tCtx.moveTo(-bandW * 0.55, -r * 1.15);
    tCtx.quadraticCurveTo(bandW * 0.35, 0, -bandW * 0.55, r * 1.15);
    tCtx.lineTo(bandW * 0.55, r * 1.15);
    tCtx.quadraticCurveTo(bandW * 1.45, 0, bandW * 0.55, -r * 1.15);
    tCtx.closePath();
    tCtx.fill();
    tCtx.restore();
  }

  function drawScalePatterns(tCtx, count, pal, derived, rarityRank, nowSec, qualityMode) {
    const pattern = pal.pattern || 'scales';
    const scaleColor = pal.scale || derived.scaleLip;
    const stepBase = qualityMode === 'high' ? 1 : 2;
    const isRich = qualityMode !== 'low';

    for (let i = 1; i < count - 1; i++) {
      const r = _pr[i];
      if (r < 3.4) continue;
      const cx = _px[i];
      const cy = _py[i];
      const ang = _pa[i];

      // 1. EMERALD / CLASSIC OVERLAPPING CRESCENT SCALES
      if (pattern === 'scales') {
        if (i % (stepBase + 1) !== 0) continue;
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        const sR = r * 0.38;
        const rows = (i % 2 === 0 && r > 7.5) ? [-0.46, 0.46] : [0];
        for (let k = 0; k < rows.length; k++) {
          const sy = rows[k] * r;
          tCtx.beginPath();
          tCtx.arc(-sR * 0.15, sy, sR, -1.15, 1.15);
          tCtx.strokeStyle = derived.scaleShadow;
          tCtx.lineWidth = Math.max(1.0, r * 0.14);
          tCtx.stroke();
          tCtx.beginPath();
          tCtx.arc(-sR * 0.3, sy, sR * 0.88, -1.0, 1.0);
          tCtx.strokeStyle = scaleColor;
          tCtx.lineWidth = Math.max(0.85, r * 0.11);
          tCtx.stroke();
        }
        tCtx.restore();
        continue;
      }

      // 2. DRAGON ARMORED SCALES / ANCIENT RUNES / PHOENIX PLUMES
      if (pattern === 'dragon' || pattern === 'ancient_runes' || pattern === 'phoenix_plumes') {
        if (i % (stepBase + 1) !== 0) continue;
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        // Sculpted pointed overlapping armor ridge
        tCtx.beginPath();
        tCtx.moveTo(r * 0.56, 0);
        tCtx.quadraticCurveTo(r * 0.08, -r * 0.62, -r * 0.52, -r * 0.48);
        tCtx.quadraticCurveTo(-r * 0.22, 0, -r * 0.52, r * 0.48);
        tCtx.quadraticCurveTo(r * 0.08, r * 0.62, r * 0.56, 0);
        tCtx.closePath();
        tCtx.fillStyle = derived.scaleShadow;
        tCtx.fill();
        tCtx.strokeStyle = scaleColor;
        tCtx.lineWidth = Math.max(1.0, r * 0.13);
        tCtx.stroke();
        if (pattern === 'ancient_runes' && i % 4 === 0) {
          tCtx.strokeStyle = pal.head;
          tCtx.lineWidth = Math.max(1.1, r * 0.14);
          tCtx.beginPath();
          tCtx.moveTo(-r * 0.25, -r * 0.25);
          tCtx.lineTo(r * 0.22, 0);
          tCtx.lineTo(-r * 0.25, r * 0.25);
          tCtx.stroke();
        } else {
          // Luminous spinal keel highlight
          tCtx.fillStyle = scaleColor;
          tCtx.beginPath();
          tCtx.ellipse(r * 0.08, 0, r * 0.24, r * 0.1, 0, 0, Math.PI * 2);
          tCtx.fill();
        }
        tCtx.restore();
        continue;
      }

      // 3. DIAMOND SCALES / CRYSTAL FACETS / ICE SHARDS
      if (pattern === 'diamonds' || pattern === 'crystal_facets' || pattern === 'ice_shards') {
        if (i % (stepBase + 1) !== 0) continue;
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        tCtx.beginPath();
        tCtx.moveTo(r * 0.64, 0);
        tCtx.lineTo(0, -r * 0.68);
        tCtx.lineTo(-r * 0.64, 0);
        tCtx.lineTo(0, r * 0.68);
        tCtx.closePath();
        tCtx.fillStyle = pattern === 'diamonds' ? 'rgba(20, 14, 10, 0.68)' : 'rgba(255, 255, 255, 0.18)';
        tCtx.fill();
        // Top illuminated facet half for 3D prism look
        tCtx.beginPath();
        tCtx.moveTo(r * 0.64, 0);
        tCtx.lineTo(0, -r * 0.68);
        tCtx.lineTo(-r * 0.64, 0);
        tCtx.closePath();
        tCtx.fillStyle = pattern === 'diamonds' ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.28)';
        tCtx.fill();
        tCtx.strokeStyle = scaleColor;
        tCtx.lineWidth = Math.max(1.0, r * 0.15);
        tCtx.beginPath();
        tCtx.moveTo(r * 0.64, 0);
        tCtx.lineTo(0, -r * 0.68);
        tCtx.lineTo(-r * 0.64, 0);
        tCtx.lineTo(0, r * 0.68);
        tCtx.closePath();
        tCtx.stroke();
        tCtx.restore();
        continue;
      }

      // 4. HEXAGONAL MESH (RETICULATED PYTHON / LAVA CRACKS)
      if (pattern === 'reticulated' || pattern === 'lava_cracks') {
        if (i % (stepBase + 1) !== 0) continue;
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        const hr = r * 0.56;
        tCtx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          const vx = Math.cos(a) * hr;
          const vy = Math.sin(a) * hr;
          if (k === 0) tCtx.moveTo(vx, vy);
          else tCtx.lineTo(vx, vy);
        }
        tCtx.closePath();
        if (pattern === 'lava_cracks') {
          tCtx.fillStyle = 'rgba(20, 14, 14, 0.72)';
          tCtx.fill();
          const pulse = 0.65 + 0.35 * Math.sin(nowSec * 4.5 - i * 0.5);
          tCtx.strokeStyle = pal.scale || '#FACC15';
          tCtx.globalAlpha *= pulse;
          tCtx.lineWidth = Math.max(1.2, r * 0.18);
          tCtx.stroke();
        } else {
          tCtx.fillStyle = 'rgba(18, 12, 8, 0.42)';
          tCtx.fill();
          tCtx.strokeStyle = scaleColor;
          tCtx.lineWidth = Math.max(1.0, r * 0.15);
          tCtx.stroke();
        }
        tCtx.restore();
        continue;
      }

      // 5. CHEVRON / SAMURAI LAMELLAR ARMOR / ASSASSIN BLADES
      if (pattern === 'chevron' || pattern === 'samurai_armor' || pattern === 'assassin_blades') {
        if (i % (stepBase + 1) !== 0) continue;
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        if (pattern === 'samurai_armor') {
          // Layered lacquered curved plate + gold trim
          tCtx.beginPath();
          tCtx.moveTo(r * 0.35, -r * 0.85);
          tCtx.quadraticCurveTo(r * 0.72, 0, r * 0.35, r * 0.85);
          tCtx.lineTo(-r * 0.25, r * 0.85);
          tCtx.quadraticCurveTo(r * 0.1, 0, -r * 0.25, -r * 0.85);
          tCtx.closePath();
          tCtx.fillStyle = 'rgba(12, 18, 30, 0.52)';
          tCtx.fill();
          tCtx.strokeStyle = scaleColor;
          tCtx.lineWidth = Math.max(1.1, r * 0.14);
          tCtx.stroke();
        } else {
          tCtx.strokeStyle = derived.scaleShadow;
          tCtx.lineWidth = Math.max(1.6, r * 0.28);
          tCtx.lineCap = 'round';
          tCtx.lineJoin = 'round';
          tCtx.beginPath();
          tCtx.moveTo(-r * 0.45, -r * 0.72);
          tCtx.lineTo(r * 0.42, 0);
          tCtx.lineTo(-r * 0.45, r * 0.72);
          tCtx.stroke();
          tCtx.strokeStyle = scaleColor;
          tCtx.lineWidth = Math.max(1.1, r * 0.18);
          tCtx.beginPath();
          tCtx.moveTo(-r * 0.42, -r * 0.68);
          tCtx.lineTo(r * 0.40, 0);
          tCtx.lineTo(-r * 0.42, r * 0.68);
          tCtx.stroke();
        }
        tCtx.restore();
        continue;
      }

      // 6. CYBER PANELS / CIRCUIT BOARD / NEON GRID / HOLOGRAM / QUANTUM / MATRIX / GLITCH
      if (
        pattern === 'neon_grid' || pattern === 'circuit_board' || pattern === 'hologram_rings' ||
        pattern === 'plasma_pulse' || pattern === 'quantum_rings' || pattern === 'matrix_code' ||
        pattern === 'glitch_blocks' || pattern === 'noob_blocks'
      ) {
        if (pattern === 'noob_blocks') {
          if (i % 2 !== 0) continue;
          const col = (i % 6 < 2) ? '#FACC15' : (i % 6 < 4) ? '#3B82F6' : '#22C55E';
          drawCurvedBand(tCtx, cx, cy, r, ang, r * 0.95, col);
          continue;
        }
        if (i % (stepBase + 1) !== 0) continue;
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        if (pattern === 'matrix_code') {
          tCtx.fillStyle = 'rgba(0, 245, 160, 0.85)';
          const shift = ((Math.floor(nowSec * 8) + i) % 3 - 1) * r * 0.35;
          tCtx.fillRect(-r * 0.42, shift - r * 0.14, r * 0.84, Math.max(1.5, r * 0.26));
          tCtx.fillStyle = 'rgba(167, 243, 208, 0.65)';
          tCtx.fillRect(-r * 0.2, -shift - r * 0.1, r * 0.5, Math.max(1.2, r * 0.18));
        } else if (pattern === 'glitch_blocks') {
          const jx = Math.sin(nowSec * 14 + i * 2.1) * r * 0.22;
          tCtx.fillStyle = i % 2 === 0 ? 'rgba(0, 217, 255, 0.72)' : 'rgba(255, 71, 126, 0.72)';
          tCtx.fillRect(-r * 0.42 + jx, -r * 0.55, r * 0.75, r * 0.42);
          tCtx.fillStyle = 'rgba(0, 245, 160, 0.7)';
          tCtx.fillRect(-r * 0.25 - jx, r * 0.12, r * 0.62, r * 0.35);
        } else if (pattern === 'hologram_rings' || pattern === 'quantum_rings') {
          const pulse = 0.55 + 0.45 * Math.sin(nowSec * 5 - i * 0.45);
          tCtx.strokeStyle = scaleColor;
          tCtx.globalAlpha *= pulse;
          tCtx.lineWidth = Math.max(1.1, r * 0.16);
          tCtx.beginPath();
          tCtx.ellipse(0, 0, r * 0.32, r * 0.82, 0, 0, Math.PI * 2);
          tCtx.stroke();
          if (pattern === 'quantum_rings') {
            tCtx.fillStyle = pal.head;
            tCtx.beginPath();
            tCtx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
            tCtx.fill();
          }
        } else {
          // Segmented cyber tech panel + glowing circuit trace & core node
          tCtx.strokeStyle = 'rgba(4, 10, 22, 0.52)';
          tCtx.lineWidth = Math.max(1.2, r * 0.15);
          tCtx.beginPath();
          tCtx.moveTo(0, -r * 0.92);
          tCtx.lineTo(0, r * 0.92);
          tCtx.stroke();
          tCtx.strokeStyle = scaleColor;
          tCtx.lineWidth = Math.max(1.0, r * 0.14);
          tCtx.beginPath();
          tCtx.moveTo(-r * 0.42, -r * 0.45);
          tCtx.lineTo(r * 0.15, -r * 0.45);
          tCtx.lineTo(r * 0.32, 0);
          tCtx.lineTo(r * 0.15, r * 0.45);
          tCtx.lineTo(-r * 0.42, r * 0.45);
          tCtx.stroke();
          if (i % 4 === 0) {
            tCtx.fillStyle = pal.head;
            tCtx.beginPath();
            tCtx.arc(r * 0.32, 0, Math.max(1.3, r * 0.2), 0, Math.PI * 2);
            tCtx.fill();
          }
        }
        tCtx.restore();
        continue;
      }

      // 7. CURVED 3D STRIPES & ORGANIC BANDS
      if (
        pattern === 'coral_tricolor' || pattern === 'bee_stripes' || pattern === 'candy_stripes' ||
        pattern === 'meme_stripes' || pattern === 'krait_rings' || pattern === 'bands' ||
        pattern === 'penguin_tux' || pattern === 'feathers'
      ) {
        if (pattern === 'coral_tricolor') {
          if (i % 2 !== 0) continue;
          const m = i % 6;
          const col = m === 0 ? '#111827' : (m === 2 ? '#FACC15' : '#DC2626');
          drawCurvedBand(tCtx, cx, cy, r, ang, r * 0.85, col);
        } else if (pattern === 'bee_stripes') {
          if (i % 2 !== 0) continue;
          drawCurvedBand(tCtx, cx, cy, r, ang, r * 0.78, (i % 4 === 0) ? '#18181B' : '#FACC15');
        } else if (pattern === 'candy_stripes') {
          if (i % 2 !== 0) continue;
          drawCurvedBand(tCtx, cx, cy, r, ang + 0.35, r * 0.72, (i % 4 === 0) ? '#FFFFFF' : '#F43F5E');
        } else if (pattern === 'penguin_tux') {
          // Snowy bright belly strip along center
          if (i % 2 !== 0) continue;
          tCtx.save();
          tCtx.translate(cx, cy);
          tCtx.rotate(ang);
          tCtx.fillStyle = 'rgba(248, 250, 252, 0.85)';
          tCtx.beginPath();
          tCtx.ellipse(0, 0, r * 0.65, r * 0.44, 0, 0, Math.PI * 2);
          tCtx.fill();
          tCtx.restore();
        } else if (i % 3 === 0) {
          drawCurvedBand(tCtx, cx, cy, r, ang, r * 0.56, scaleColor);
        }
        continue;
      }

      // 8. LIGHTNING / STORM BOLTS / RIBBONS / AURORA
      if (pattern === 'lightning' || pattern === 'storm_bolts' || pattern === 'ribbons') {
        if (i % (stepBase + 1) !== 0) continue;
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        tCtx.strokeStyle = scaleColor;
        tCtx.lineWidth = Math.max(1.1, r * 0.18);
        tCtx.lineCap = 'round';
        tCtx.beginPath();
        if (pattern === 'ribbons') {
          const wave = Math.sin(nowSec * 3.2 - i * 0.55) * r * 0.42;
          tCtx.moveTo(-r * 0.6, wave);
          tCtx.quadraticCurveTo(0, -wave, r * 0.6, wave);
        } else {
          tCtx.moveTo(-r * 0.55, -r * 0.45);
          tCtx.lineTo(-r * 0.1, r * 0.25);
          tCtx.lineTo(r * 0.2, -r * 0.25);
          tCtx.lineTo(r * 0.58, r * 0.42);
        }
        tCtx.stroke();
        tCtx.restore();
        continue;
      }

      // 9. RAINBOW / DISCO / COSMIC / VOID / EMBERS / CELESTIAL HALOS
      if (
        pattern === 'rainbow_cycle' || pattern === 'disco_tiles' || pattern === 'cosmic_stars' ||
        pattern === 'void_stars' || pattern === 'embers' || pattern === 'celestial_halos'
      ) {
        if (i % (stepBase + 1) !== 0) continue;
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        if (pattern === 'disco_tiles') {
          const hue = (i * 42 + nowSec * 140) % 360;
          tCtx.fillStyle = `hsla(${hue}, 92%, 64%, 0.85)`;
          tCtx.fillRect(-r * 0.44, -r * 0.44, r * 0.42, r * 0.42);
          tCtx.fillStyle = `hsla(${(hue + 95) % 360}, 92%, 72%, 0.85)`;
          tCtx.fillRect(0.5, 0.5, r * 0.42, r * 0.42);
          tCtx.strokeStyle = 'rgba(255,255,255,0.55)';
          tCtx.lineWidth = 0.8;
          tCtx.strokeRect(-r * 0.44, -r * 0.44, r * 0.88, r * 0.88);
        } else if (pattern === 'rainbow_cycle') {
          // Soft iridescent crescent scale glint
          tCtx.strokeStyle = 'rgba(255, 255, 255, 0.48)';
          tCtx.lineWidth = Math.max(0.9, r * 0.12);
          tCtx.beginPath();
          tCtx.arc(-r * 0.1, 0, r * 0.45, -1.0, 1.0);
          tCtx.stroke();
        } else if (pattern === 'celestial_halos') {
          tCtx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
          tCtx.lineWidth = Math.max(1.0, r * 0.14);
          tCtx.beginPath();
          tCtx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
          tCtx.stroke();
          tCtx.fillStyle = '#FEF08A';
          tCtx.beginPath();
          tCtx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
          tCtx.fill();
        } else {
          // Twinkling stars / glowing magma embers
          const tw = 0.5 + 0.5 * Math.sin(nowSec * 5.2 + i * 1.9);
          tCtx.fillStyle = scaleColor;
          tCtx.globalAlpha *= (0.45 + 0.55 * tw);
          const offY = ((i % 3) - 1) * r * 0.34;
          tCtx.beginPath();
          tCtx.arc(0, offY, Math.max(1.1, r * 0.22 * (0.7 + 0.3 * tw)), 0, Math.PI * 2);
          tCtx.fill();
        }
        tCtx.restore();
        continue;
      }

      // 10. OCELLI / BLOOD MOON / SPOTS / NOVELTY FOOD PATTERNS
      if (pattern === 'hotdog_mustard') {
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        const my = Math.sin(i * 0.9) * r * 0.36;
        tCtx.fillStyle = '#FACC15';
        tCtx.beginPath();
        tCtx.arc(0, my, Math.max(1.5, r * 0.26), 0, Math.PI * 2);
        tCtx.fill();
        tCtx.fillStyle = 'rgba(255,255,255,0.45)';
        tCtx.beginPath();
        tCtx.arc(-r * 0.06, my - r * 0.06, Math.max(0.7, r * 0.09), 0, Math.PI * 2);
        tCtx.fill();
        tCtx.restore();
        continue;
      }

      if (pattern === 'donut_sprinkles') {
        if (i % stepBase !== 0) continue;
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang + (i * 1.1));
        const sy = ((i % 3) - 1) * r * 0.3;
        tCtx.fillStyle = ['#38BDF8', '#FDE047', '#00F5A0', '#FFFFFF', '#A855F7'][i % 5];
        tCtx.beginPath();
        tCtx.roundRect(-r * 0.32, sy - r * 0.11, r * 0.64, Math.max(1.8, r * 0.22), 2);
        tCtx.fill();
        tCtx.restore();
        continue;
      }

      if (pattern === 'ocelli' || pattern === 'blood_moon' || pattern === 'swirl_flush') {
        if (i % (stepBase + 2) !== 0) continue;
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        tCtx.fillStyle = pattern === 'ocelli' ? 'rgba(18, 18, 22, 0.72)' : 'rgba(10, 14, 24, 0.45)';
        tCtx.beginPath();
        tCtx.ellipse(0, 0, r * 0.46, r * 0.38, 0, 0, Math.PI * 2);
        tCtx.fill();
        tCtx.strokeStyle = scaleColor;
        tCtx.lineWidth = Math.max(1.1, r * 0.16);
        tCtx.stroke();
        if (pattern === 'blood_moon') {
          tCtx.fillStyle = pal.head;
          tCtx.beginPath();
          tCtx.arc(-r * 0.08, 0, r * 0.22, 0, Math.PI * 2);
          tCtx.fill();
        }
        tCtx.restore();
        continue;
      }

      if (
        pattern === 'pizza_pepperoni' || pattern === 'banana_spots' || pattern === 'frog_spots' ||
        pattern === 'bubbles' || pattern === 'venom_drip' || pattern === 'spots' || pattern === 'clouded'
      ) {
        if (i % (stepBase + 1) !== 0) continue;
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        const side = (i % 4 === 0 ? 1 : -1) * r * 0.28;
        if (pattern === 'bubbles') {
          tCtx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
          tCtx.lineWidth = Math.max(0.9, r * 0.11);
          tCtx.beginPath();
          tCtx.arc(0, side, r * 0.32, 0, Math.PI * 2);
          tCtx.stroke();
          tCtx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          tCtx.beginPath();
          tCtx.arc(-r * 0.1, side - r * 0.1, r * 0.09, 0, Math.PI * 2);
          tCtx.fill();
        } else if (pattern === 'clouded') {
          tCtx.fillStyle = 'rgba(254, 240, 138, 0.55)';
          tCtx.beginPath();
          tCtx.ellipse(0, side * 0.5, r * 0.58, r * 0.34, 0.2, 0, Math.PI * 2);
          tCtx.fill();
        } else {
          tCtx.fillStyle = scaleColor;
          tCtx.beginPath();
          tCtx.arc(0, side, r * (pattern === 'pizza_pepperoni' ? 0.38 : 0.28), 0, Math.PI * 2);
          tCtx.fill();
          if (isRich && (pattern === 'pizza_pepperoni' || pattern === 'venom_drip')) {
            tCtx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            tCtx.beginPath();
            tCtx.arc(-r * 0.1, side - r * 0.1, r * 0.1, 0, Math.PI * 2);
            tCtx.fill();
          }
        }
        tCtx.restore();
        continue;
      }

      // 11. SMOOTH SATIN / METALLIC MICRO-SHEEN
      if (pattern === 'smooth' && isRich && i % 4 === 0) {
        tCtx.save();
        tCtx.translate(cx, cy);
        tCtx.rotate(ang);
        tCtx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        tCtx.lineWidth = Math.max(0.9, r * 0.12);
        tCtx.beginPath();
        tCtx.arc(-r * 0.1, 0, r * 0.42, -0.9, 0.9);
        tCtx.stroke();
        tCtx.restore();
      }
    }
  }

  function drawEyes(tCtx, headR, pal, headShape, lookBias, nowSec, qualityMode) {
    const eyeStyle = pal.eyeStyle || 'normal';
    const eyeX = headR * (headShape === 'frog' ? 0.22 : (headShape === 'duck' || headShape === 'chicken' ? 0.16 : 0.24));
    const eyeY = headR * (headShape === 'frog' ? 0.72 : (headShape === 'cobra' ? 0.48 : 0.52));
    const baseEyeR = headR * ((eyeStyle === 'googly' || eyeStyle === 'cute' || headShape === 'frog') ? 0.36 : 0.29);

    if (eyeStyle === 'sunglasses') {
      const gw = headR * 0.46;
      const gh = headR * 0.44;
      const gx = headR * 0.08;
      // Bridge & pixel frames
      tCtx.fillStyle = '#070B14';
      tCtx.fillRect(gx + gw * 0.25, -headR * 0.14, gw * 0.45, headR * 0.28);
      for (let side = -1; side <= 1; side += 2) {
        const gy = side < 0 ? -eyeY - gh * 0.45 : eyeY - gh * 0.55;
        tCtx.fillStyle = '#090D16';
        tCtx.fillRect(gx, gy, gw, gh);
        tCtx.strokeStyle = '#FFFFFF';
        tCtx.lineWidth = Math.max(1.0, headR * 0.09);
        tCtx.strokeRect(gx, gy, gw, gh);
        // Glossy diagonal lens shine
        tCtx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        tCtx.fillRect(gx + gw * 0.16, gy + gh * 0.16, gw * 0.22, gh * 0.22);
        tCtx.fillRect(gx + gw * 0.44, gy + gh * 0.42, gw * 0.18, gh * 0.18);
      }
      return;
    }

    if (eyeStyle === 'visor') {
      const vw = headR * 0.42;
      const vh = headR * 1.18;
      const vx = headR * 0.16;
      tCtx.save();
      // Dark tactical visor housing
      tCtx.fillStyle = '#060B16';
      tCtx.beginPath();
      tCtx.roundRect(vx - 1, -vh * 0.54, vw + 2, vh * 1.08, headR * 0.18);
      tCtx.fill();
      // Glowing visor core
      const vGrad = tCtx.createLinearGradient(vx, -vh * 0.5, vx, vh * 0.5);
      const vc = pal.eyeIris || '#00D9FF';
      vGrad.addColorStop(0, vc);
      vGrad.addColorStop(0.5, '#FFFFFF');
      vGrad.addColorStop(1, vc);
      tCtx.fillStyle = vGrad;
      tCtx.beginPath();
      tCtx.roundRect(vx, -vh * 0.48, vw, vh * 0.96, headR * 0.15);
      tCtx.fill();
      // Animated scanner glint
      const scanY = Math.sin(nowSec * 5.2) * (vh * 0.34);
      tCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      tCtx.beginPath();
      tCtx.ellipse(vx + vw * 0.55, scanY, vw * 0.28, vh * 0.14, 0, 0, Math.PI * 2);
      tCtx.fill();
      tCtx.restore();
      return;
    }

    for (let side = -1; side <= 1; side += 2) {
      const ey = eyeY * side;
      const eR = (eyeStyle === 'derp' && side === 1) ? baseEyeR * 0.78 : baseEyeR;

      // Subtle eye socket shadow ring
      tCtx.fillStyle = 'rgba(4, 8, 18, 0.42)';
      tCtx.beginPath();
      tCtx.arc(eyeX - headR * 0.03, ey + headR * 0.02, eR * 1.14, 0, Math.PI * 2);
      tCtx.fill();

      // Spherical sclera
      if (eyeStyle === 'glowing') {
        tCtx.fillStyle = pal.eyeIris || '#00D9FF';
      } else if (qualityMode !== 'low') {
        const sGrad = tCtx.createRadialGradient(eyeX - eR * 0.25, ey - eR * 0.25, eR * 0.1, eyeX, ey, eR);
        sGrad.addColorStop(0, '#FFFFFF');
        sGrad.addColorStop(0.75, '#F1F5F9');
        sGrad.addColorStop(1, '#CBD5E1');
        tCtx.fillStyle = sGrad;
      } else {
        tCtx.fillStyle = '#FFFFFF';
      }
      tCtx.beginPath();
      tCtx.arc(eyeX, ey, eR, 0, Math.PI * 2);
      tCtx.fill();

      // Gaze tracking offset
      const gazeY = lookBias * eR * 0.35 + (eyeStyle === 'googly' ? Math.sin(nowSec * 9 + side * 2) * eR * 0.32 : (eyeStyle === 'derp' ? side * eR * 0.34 : 0));
      const gazeX = eR * 0.22 + (eyeStyle === 'googly' ? Math.cos(nowSec * 7 + side) * eR * 0.18 : 0);

      // Colored iris
      tCtx.fillStyle = pal.eyeIris || '#047857';
      tCtx.beginPath();
      tCtx.arc(eyeX + gazeX * 0.8, ey + gazeY * 0.7, eR * 0.66, 0, Math.PI * 2);
      tCtx.fill();

      // Pupil
      tCtx.fillStyle = eyeStyle === 'glowing' ? '#FFFFFF' : (pal.eyePupil || '#020617');
      tCtx.beginPath();
      if (eyeStyle === 'slit') {
        tCtx.ellipse(eyeX + gazeX, ey + gazeY, eR * 0.52, eR * 0.18, 0, 0, Math.PI * 2);
      } else if (eyeStyle === 'glowing') {
        tCtx.arc(eyeX + gazeX * 0.5, ey + gazeY * 0.5, eR * 0.36, 0, Math.PI * 2);
      } else {
        tCtx.arc(eyeX + gazeX, ey + gazeY, eR * (eyeStyle === 'cute' ? 0.48 : 0.40), 0, Math.PI * 2);
      }
      tCtx.fill();

      // Crisp specular eye catchlights (primary + secondary sparkle)
      tCtx.fillStyle = '#FFFFFF';
      tCtx.beginPath();
      tCtx.arc(eyeX - eR * 0.18, ey - eR * 0.26, eR * (eyeStyle === 'cute' ? 0.30 : 0.22), 0, Math.PI * 2);
      tCtx.fill();
      if (eyeStyle === 'cute' || qualityMode === 'high') {
        tCtx.beginPath();
        tCtx.arc(eyeX + eR * 0.26, ey + eR * 0.22, eR * 0.11, 0, Math.PI * 2);
        tCtx.fill();
      }

      // Fierce brow ridge for angry eyes
      if (eyeStyle === 'angry') {
        tCtx.strokeStyle = 'rgba(4, 8, 18, 0.85)';
        tCtx.lineWidth = Math.max(1.4, headR * 0.14);
        tCtx.lineCap = 'round';
        tCtx.beginPath();
        tCtx.moveTo(eyeX + eR * 0.85, ey - side * eR * 0.35);
        tCtx.lineTo(eyeX - eR * 0.75, ey + side * eR * 0.65);
        tCtx.stroke();
      }
    }
  }

  function drawHead(tCtx, hx, hy, angle, headR, pal, derived, opts) {
    const headShape = pal.headShape || 'round';
    const nowSec = opts.nowSec || 0;
    const tongueProgress = opts.tongueProgress || 0;
    const eatGlow = opts.eatGlow || 0;
    const lookBias = opts.lookBias || 0;
    const qualityMode = opts.qualityMode || 'high';
    const rarityRank = opts.rarityRank || 0;

    tCtx.save();
    tCtx.translate(hx, hy);
    tCtx.rotate(angle);

    // Subtle visual mouth/cheek expansion when eating
    if (eatGlow > 0.02) {
      const s = 1 + eatGlow * 0.11;
      tCtx.scale(s, s * (1 + eatGlow * 0.05));
    }

    // 1. Animated forked tongue (skipped on duck/chicken beak)
    if (tongueProgress > 0.02 && headShape !== 'duck' && headShape !== 'chicken') {
      const tLen = tongueProgress * headR * 1.25;
      const sway = Math.sin(nowSec * 24) * headR * 0.12 * tongueProgress;
      const startX = headR * 0.95;
      const tipX = startX + tLen;
      const forkLen = headR * 0.38 * tongueProgress;
      tCtx.strokeStyle = pal.tongue || '#F43F5E';
      tCtx.lineWidth = Math.max(1.4, headR * 0.14);
      tCtx.lineCap = 'round';
      tCtx.lineJoin = 'round';
      tCtx.beginPath();
      tCtx.moveTo(startX, 0);
      tCtx.quadraticCurveTo(startX + tLen * 0.5, sway, tipX, sway * 0.5);
      tCtx.lineTo(tipX + Math.cos(0.46) * forkLen, sway * 0.5 + Math.sin(0.46) * forkLen);
      tCtx.moveTo(tipX, sway * 0.5);
      tCtx.lineTo(tipX + Math.cos(-0.46) * forkLen, sway * 0.5 + Math.sin(-0.46) * forkLen);
      tCtx.stroke();
    }

    // Build shared 3D radial head gradient
    const hGrad = tCtx.createRadialGradient(-headR * 0.2, -headR * 0.25, headR * 0.12, 0, 0, headR * 1.5);
    hGrad.addColorStop(0, derived.headLight);
    hGrad.addColorStop(0.55, derived.headBase);
    hGrad.addColorStop(1, derived.headDark);

    // Helper to stroke & fill a head contour with drop shadow + crisp rim
    const fillSculpted = (pathFn, fillStyle, strokeStyle, lw) => {
      if (qualityMode !== 'low') {
        tCtx.save();
        tCtx.translate(1.8, 3.2);
        pathFn();
        tCtx.fillStyle = 'rgba(2, 6, 16, 0.38)';
        tCtx.fill();
        tCtx.restore();
      }
      pathFn();
      tCtx.fillStyle = fillStyle;
      tCtx.fill();
      if (strokeStyle) {
        tCtx.strokeStyle = strokeStyle;
        tCtx.lineWidth = lw;
        tCtx.lineJoin = 'round';
        tCtx.stroke();
      }
    };

    const rimW = Math.max(1.2, headR * 0.11);

    // 2. Sculpted head shape per skin personality
    if (headShape === 'cobra') {
      const hoodSpread = headR * (pal.hoodWidth || 1.85);
      const hoodGrad = tCtx.createRadialGradient(-headR * 0.4, 0, headR * 0.2, -headR * 0.6, 0, hoodSpread * 1.1);
      hoodGrad.addColorStop(0, derived.headLight);
      hoodGrad.addColorStop(0.65, derived.bodyStart);
      hoodGrad.addColorStop(1, derived.bodyEnd);
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.moveTo(headR * 0.72, 0);
        tCtx.quadraticCurveTo(headR * 0.12, hoodSpread, -headR * 1.45, hoodSpread * 0.74);
        tCtx.quadraticCurveTo(-headR * 2.05, hoodSpread * 0.28, -headR * 2.1, 0);
        tCtx.quadraticCurveTo(-headR * 2.05, -hoodSpread * 0.28, -headR * 1.45, -hoodSpread * 0.74);
        tCtx.quadraticCurveTo(headR * 0.12, -hoodSpread, headR * 0.72, 0);
        tCtx.closePath();
      }, hoodGrad, pal.scale || derived.headOutline, rimW * 1.15);

      // Ribbed hood arcs + spectacled eyespots
      tCtx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      tCtx.lineWidth = Math.max(1, headR * 0.08);
      for (let side = -1; side <= 1; side += 2) {
        tCtx.beginPath();
        tCtx.moveTo(-headR * 0.2, side * headR * 0.45);
        tCtx.quadraticCurveTo(-headR * 0.9, side * hoodSpread * 0.75, -headR * 1.65, side * hoodSpread * 0.35);
        tCtx.stroke();
        // Ornate hood mark
        tCtx.fillStyle = '#FEF08A';
        tCtx.beginPath();
        tCtx.ellipse(-headR * 1.02, side * hoodSpread * 0.34, headR * 0.32, headR * 0.24, side * 0.25, 0, Math.PI * 2);
        tCtx.fill();
        tCtx.fillStyle = '#1C1917';
        tCtx.beginPath();
        tCtx.ellipse(-headR * 1.02, side * hoodSpread * 0.34, headR * 0.16, headR * 0.12, side * 0.25, 0, Math.PI * 2);
        tCtx.fill();
      }
      // Sculpted cobra head crown on top of hood
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.ellipse(headR * 0.28, 0, headR * 1.12, headR * 0.84, 0, 0, Math.PI * 2);
      }, hGrad, derived.headOutline, rimW);

    } else if (headShape === 'dragon') {
      // Twin swept-back curved dragon horns behind head
      for (let side = -1; side <= 1; side += 2) {
        tCtx.beginPath();
        tCtx.moveTo(-headR * 0.15, side * headR * 0.58);
        tCtx.quadraticCurveTo(-headR * 1.05, side * headR * 1.38, -headR * 1.85, side * headR * 1.25);
        tCtx.quadraticCurveTo(-headR * 1.05, side * headR * 0.82, -headR * 0.58, side * headR * 0.38);
        tCtx.closePath();
        tCtx.fillStyle = pal.scale || '#FEF08A';
        tCtx.fill();
        tCtx.strokeStyle = derived.headOutline;
        tCtx.lineWidth = Math.max(1.0, headR * 0.08);
        tCtx.stroke();
      }
      // Angular fierce dragon snout & cheek crests
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.moveTo(headR * 1.52, 0);
        tCtx.lineTo(headR * 0.52, headR * 0.92);
        tCtx.lineTo(-headR * 0.35, headR * 1.22);
        tCtx.lineTo(-headR * 1.1, headR * 0.88);
        tCtx.lineTo(-headR * 0.95, 0);
        tCtx.lineTo(-headR * 1.1, -headR * 0.88);
        tCtx.lineTo(-headR * 0.35, -headR * 1.22);
        tCtx.lineTo(headR * 0.52, -headR * 0.92);
        tCtx.closePath();
      }, hGrad, derived.headOutline, rimW);
      // Armored forehead ridge
      tCtx.strokeStyle = pal.scale || 'rgba(255,255,255,0.5)';
      tCtx.lineWidth = Math.max(1.2, headR * 0.11);
      tCtx.beginPath();
      tCtx.moveTo(-headR * 0.65, 0);
      tCtx.lineTo(headR * 1.1, 0);
      tCtx.stroke();

    } else if (headShape === 'samurai') {
      // Kabuto helmet crest + swept gold kuwagata horns
      for (let side = -1; side <= 1; side += 2) {
        tCtx.beginPath();
        tCtx.moveTo(headR * 0.3, side * headR * 0.32);
        tCtx.quadraticCurveTo(headR * 0.95, side * headR * 1.45, -headR * 0.55, side * headR * 1.58);
        tCtx.quadraticCurveTo(headR * 0.25, side * headR * 0.95, -headR * 0.15, side * headR * 0.45);
        tCtx.closePath();
        tCtx.fillStyle = '#FFB020';
        tCtx.fill();
        tCtx.strokeStyle = '#78350F';
        tCtx.lineWidth = Math.max(0.9, headR * 0.07);
        tCtx.stroke();
      }
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.moveTo(headR * 1.38, 0);
        tCtx.lineTo(headR * 0.45, headR * 1.05);
        tCtx.lineTo(-headR * 0.95, headR * 1.12);
        tCtx.lineTo(-headR * 1.25, 0);
        tCtx.lineTo(-headR * 0.95, -headR * 1.12);
        tCtx.lineTo(headR * 0.45, -headR * 1.05);
        tCtx.closePath();
      }, hGrad, derived.headOutline, rimW);
      // Gold kabuto crown ornament
      tCtx.fillStyle = '#FFB020';
      tCtx.beginPath();
      tCtx.arc(-headR * 0.28, 0, headR * 0.24, 0, Math.PI * 2);
      tCtx.fill();

    } else if (headShape === 'phoenix') {
      // Animated flame plumage feathers fanning backward
      const flap = Math.sin(nowSec * 8) * 0.12;
      for (let side = -1; side <= 1; side += 2) {
        tCtx.beginPath();
        tCtx.moveTo(-headR * 0.1, side * headR * 0.5);
        tCtx.quadraticCurveTo(-headR * 1.1, side * headR * (1.45 + flap), -headR * 1.95, side * headR * (0.95 - flap));
        tCtx.quadraticCurveTo(-headR * 1.0, side * headR * 0.65, -headR * 0.65, side * headR * 0.2);
        tCtx.closePath();
        tCtx.fillStyle = '#FACC15';
        tCtx.fill();
      }
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.moveTo(headR * 1.55, 0);
        tCtx.quadraticCurveTo(headR * 0.45, headR * 1.12, -headR * 1.15, headR * 0.85);
        tCtx.lineTo(-headR * 1.55, 0);
        tCtx.lineTo(-headR * 1.15, -headR * 0.85);
        tCtx.quadraticCurveTo(headR * 0.45, -headR * 1.12, headR * 1.55, 0);
        tCtx.closePath();
      }, hGrad, '#FEF08A', rimW);

    } else if (headShape === 'leviathan') {
      // Swept bioluminescent translucent gill fins
      const sway = Math.sin(nowSec * 5) * 0.14;
      for (let side = -1; side <= 1; side += 2) {
        tCtx.beginPath();
        tCtx.moveTo(headR * 0.2, side * headR * 0.68);
        tCtx.quadraticCurveTo(-headR * 0.8, side * headR * (1.65 + sway), -headR * 1.75, side * headR * 1.15);
        tCtx.quadraticCurveTo(-headR * 0.85, side * headR * 0.72, -headR * 0.75, side * headR * 0.4);
        tCtx.closePath();
        tCtx.fillStyle = 'rgba(0, 245, 160, 0.55)';
        tCtx.fill();
        tCtx.strokeStyle = '#00F5A0';
        tCtx.lineWidth = Math.max(0.9, headR * 0.08);
        tCtx.stroke();
      }
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.moveTo(headR * 1.48, 0);
        tCtx.quadraticCurveTo(headR * 0.4, headR * 1.08, -headR * 1.1, headR * 0.82);
        tCtx.lineTo(-headR * 1.25, 0);
        tCtx.lineTo(-headR * 1.1, -headR * 0.82);
        tCtx.quadraticCurveTo(headR * 0.4, -headR * 1.08, headR * 1.48, 0);
        tCtx.closePath();
      }, hGrad, '#00D9FF', rimW);

    } else if (headShape === 'viper' || headShape === 'arrow' || headShape === 'crystal') {
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.moveTo(headR * 1.56, 0);
        tCtx.lineTo(-headR * 0.52, headR * 1.28);
        tCtx.quadraticCurveTo(-headR * 1.28, headR * 0.46, -headR * 1.0, 0);
        tCtx.quadraticCurveTo(-headR * 1.28, -headR * 0.46, -headR * 0.52, -headR * 1.28);
        tCtx.closePath();
      }, hGrad, headShape === 'crystal' ? '#FFFFFF' : derived.headOutline, rimW);
      if (headShape === 'crystal') {
        tCtx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        tCtx.lineWidth = Math.max(1.0, headR * 0.08);
        tCtx.beginPath();
        tCtx.moveTo(headR * 1.45, 0);
        tCtx.lineTo(-headR * 0.9, 0);
        tCtx.moveTo(headR * 0.25, 0);
        tCtx.lineTo(-headR * 0.48, -headR * 1.18);
        tCtx.moveTo(headR * 0.25, 0);
        tCtx.lineTo(-headR * 0.48, headR * 1.18);
        tCtx.stroke();
      } else if (headShape === 'arrow') {
        tCtx.fillStyle = pal.scale || '#00F5A0';
        tCtx.beginPath();
        tCtx.moveTo(headR * 0.95, 0);
        tCtx.lineTo(-headR * 0.35, headR * 0.28);
        tCtx.lineTo(-headR * 0.55, 0);
        tCtx.lineTo(-headR * 0.35, -headR * 0.28);
        tCtx.closePath();
        tCtx.fill();
      }

    } else if (headShape === 'python') {
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.moveTo(headR * 1.38, -headR * 0.38);
        tCtx.quadraticCurveTo(headR * 1.56, 0, headR * 1.38, headR * 0.38);
        tCtx.lineTo(headR * 0.22, headR * 1.14);
        tCtx.quadraticCurveTo(-headR * 1.1, headR * 1.05, -headR * 1.22, 0);
        tCtx.quadraticCurveTo(-headR * 1.1, -headR * 1.05, headR * 0.22, -headR * 1.14);
        tCtx.closePath();
      }, hGrad, derived.headOutline, rimW);

    } else if (headShape === 'coffin') {
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.moveTo(headR * 1.52, -headR * 0.34);
        tCtx.lineTo(headR * 1.52, headR * 0.34);
        tCtx.lineTo(headR * 0.32, headR * 0.96);
        tCtx.lineTo(-headR * 1.2, headR * 0.84);
        tCtx.lineTo(-headR * 1.2, -headR * 0.84);
        tCtx.lineTo(headR * 0.32, -headR * 0.96);
        tCtx.closePath();
      }, hGrad, derived.headOutline, rimW);

    } else if (headShape === 'paddle') {
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.ellipse(headR * 0.24, 0, headR * 1.42, headR * 0.76, 0, 0, Math.PI * 2);
      }, hGrad, derived.headOutline, rimW);

    } else if (headShape === 'frog') {
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.ellipse(headR * 0.12, 0, headR * 1.05, headR * 1.16, 0, 0, Math.PI * 2);
      }, hGrad, derived.headOutline, rimW);
      // Raised bulging eye domes
      for (let side = -1; side <= 1; side += 2) {
        tCtx.fillStyle = derived.headBase;
        tCtx.strokeStyle = derived.headOutline;
        tCtx.lineWidth = rimW * 0.85;
        tCtx.beginPath();
        tCtx.arc(headR * 0.22, side * headR * 0.72, headR * 0.48, 0, Math.PI * 2);
        tCtx.fill();
        tCtx.stroke();
        // Cute rosy cheek blush
        tCtx.fillStyle = 'rgba(251, 113, 133, 0.38)';
        tCtx.beginPath();
        tCtx.ellipse(headR * 0.56, side * headR * 0.56, headR * 0.22, headR * 0.14, 0, 0, Math.PI * 2);
        tCtx.fill();
      }

    } else if (headShape === 'bee') {
      // Curved bobbing bee antennae with glowing amber tips
      const bob = Math.sin(nowSec * 10) * headR * 0.12;
      tCtx.strokeStyle = '#18181B';
      tCtx.lineWidth = Math.max(1.4, headR * 0.13);
      tCtx.lineCap = 'round';
      for (let side = -1; side <= 1; side += 2) {
        const tx = headR * 1.45;
        const ty = side * (headR * 0.68 + bob * side);
        tCtx.beginPath();
        tCtx.moveTo(headR * 0.75, side * headR * 0.32);
        tCtx.quadraticCurveTo(headR * 1.18, side * headR * 0.45, tx, ty);
        tCtx.stroke();
        tCtx.fillStyle = '#FACC15';
        tCtx.beginPath();
        tCtx.arc(tx, ty, headR * 0.18, 0, Math.PI * 2);
        tCtx.fill();
      }
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.ellipse(headR * 0.12, 0, headR * 1.08, headR * 0.96, 0, 0, Math.PI * 2);
      }, hGrad, '#18181B', rimW);

    } else if (headShape === 'duck') {
      // Sculpted 3D orange duck bill
      const billGrad = tCtx.createLinearGradient(headR * 0.6, -headR * 0.5, headR * 1.7, headR * 0.5);
      billGrad.addColorStop(0, '#FDBA74');
      billGrad.addColorStop(0.55, '#FB923C');
      billGrad.addColorStop(1, '#C2410C');
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.ellipse(headR * 1.05, 0, headR * 0.72, headR * 0.52, 0, 0, Math.PI * 2);
      }, billGrad, '#9A3412', rimW * 0.9);
      // Bill nostrils
      tCtx.fillStyle = '#7C2D12';
      tCtx.beginPath();
      tCtx.arc(headR * 1.15, -headR * 0.16, headR * 0.07, 0, Math.PI * 2);
      tCtx.arc(headR * 1.15, headR * 0.16, headR * 0.07, 0, Math.PI * 2);
      tCtx.fill();
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.ellipse(headR * 0.08, 0, headR * 1.06, headR * 0.94, 0, 0, Math.PI * 2);
      }, hGrad, derived.headOutline, rimW);

    } else if (headShape === 'chicken') {
      // Sharp golden beak
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.moveTo(headR * 0.85, -headR * 0.34);
        tCtx.lineTo(headR * 1.72, 0);
        tCtx.lineTo(headR * 0.85, headR * 0.34);
        tCtx.closePath();
      }, '#F59E0B', '#92400E', rimW * 0.85);
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.ellipse(headR * 0.08, 0, headR * 1.06, headR * 0.92, 0, 0, Math.PI * 2);
      }, hGrad, derived.headOutline, rimW);
      // 3-lobe glossy crimson rooster comb
      tCtx.fillStyle = '#EF4444';
      tCtx.strokeStyle = '#991B1B';
      tCtx.lineWidth = Math.max(0.9, headR * 0.07);
      tCtx.beginPath();
      tCtx.arc(-headR * 0.38, 0, headR * 0.28, 0, Math.PI * 2);
      tCtx.arc(-headR * 0.02, 0, headR * 0.32, 0, Math.PI * 2);
      tCtx.arc(headR * 0.34, 0, headR * 0.24, 0, Math.PI * 2);
      tCtx.fill();
      tCtx.stroke();

    } else if (headShape === 'pixel') {
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.roundRect(-headR * 0.98, -headR * 0.92, headR * 2.08, headR * 1.84, headR * 0.16);
      }, hGrad, derived.headOutline, rimW);
      // Crisp top-left glossy voxel bevel
      tCtx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      tCtx.fillRect(-headR * 0.84, -headR * 0.78, headR * 1.78, headR * 0.26);

    } else {
      // Sculpted organic rounded serpent head (slightly tapered snout + cheeks)
      fillSculpted(() => {
        tCtx.beginPath();
        tCtx.moveTo(headR * 1.32, 0);
        tCtx.bezierCurveTo(headR * 1.28, headR * 0.78, headR * 0.25, headR * 1.04, -headR * 0.55, headR * 0.94);
        tCtx.quadraticCurveTo(-headR * 1.15, headR * 0.72, -headR * 1.15, 0);
        tCtx.quadraticCurveTo(-headR * 1.15, -headR * 0.72, -headR * 0.55, -headR * 0.94);
        tCtx.bezierCurveTo(headR * 0.25, -headR * 1.04, headR * 1.28, -headR * 0.78, headR * 1.32, 0);
        tCtx.closePath();
      }, hGrad, derived.headOutline, rimW);
    }

    // 3. Glossy forehead dome specular highlight
    if (headShape !== 'pixel') {
      tCtx.fillStyle = 'rgba(255, 255, 255, 0.36)';
      tCtx.beginPath();
      tCtx.ellipse(headR * 0.36, -headR * 0.16, headR * 0.44, headR * 0.24, -0.18, 0, Math.PI * 2);
      tCtx.fill();
      tCtx.fillStyle = 'rgba(255, 255, 255, 0.58)';
      tCtx.beginPath();
      tCtx.ellipse(headR * 0.46, -headR * 0.22, headR * 0.2, headR * 0.09, -0.18, 0, Math.PI * 2);
      tCtx.fill();
    }

    // 4. Delicate nostrils & subtle mouth crease (skip on duck/chicken bills & pixel)
    if (headShape !== 'duck' && headShape !== 'chicken' && headShape !== 'pixel') {
      tCtx.fillStyle = derived.headOutline;
      tCtx.beginPath();
      tCtx.arc(headR * 0.92, -headR * 0.21, Math.max(0.85, headR * 0.08), 0, Math.PI * 2);
      tCtx.arc(headR * 0.92, headR * 0.21, Math.max(0.85, headR * 0.08), 0, Math.PI * 2);
      tCtx.fill();
      // Subtle expressive mouth arc (expands briefly while gulping food)
      tCtx.strokeStyle = derived.headOutline;
      tCtx.lineWidth = Math.max(0.9, headR * 0.08);
      tCtx.lineCap = 'round';
      tCtx.beginPath();
      if (eatGlow > 0.18) {
        tCtx.fillStyle = 'rgba(30, 8, 18, 0.72)';
        tCtx.ellipse(headR * 1.05, 0, headR * 0.2 * eatGlow, headR * 0.28 * eatGlow, 0, 0, Math.PI * 2);
        tCtx.fill();
      } else {
        tCtx.arc(headR * 0.82, 0, headR * 0.36, -0.45, 0.45);
        tCtx.stroke();
      }
    }

    // 5. Expressive 3D eyes
    drawEyes(tCtx, headR, pal, headShape, lookBias, nowSec, qualityMode);

    // 6. Rarity head crown sparkle for Legendary / Mythic
    if (rarityRank >= 4 && qualityMode !== 'low') {
      const sparkle = 0.55 + 0.45 * Math.sin(nowSec * 6.0);
      tCtx.fillStyle = rarityRank >= 5 ? '#FFFFFF' : '#FEF08A';
      tCtx.globalAlpha *= sparkle * 0.85;
      tCtx.beginPath();
      tCtx.arc(-headR * 0.38, 0, headR * 0.15, 0, Math.PI * 2);
      tCtx.fill();
    }

    tCtx.restore();
  }

  function drawExternalAppendages(tCtx, count, pal, nowSec) {
    const headShape = pal.headShape || 'round';
    const pattern = pal.pattern || '';
    // Translucent animated Bee wings behind head
    if (headShape === 'bee' && count > 3) {
      const idx = Math.min(count - 1, 3);
      const wx = _px[idx];
      const wy = _py[idx];
      const wang = _pa[idx];
      const wr = _pr[idx];
      const flap = Math.sin(nowSec * 22) * 0.26;
      tCtx.save();
      tCtx.translate(wx, wy);
      tCtx.rotate(wang);
      for (let side = -1; side <= 1; side += 2) {
        tCtx.save();
        tCtx.rotate(side * (0.42 - flap));
        tCtx.fillStyle = 'rgba(224, 242, 254, 0.58)';
        tCtx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        tCtx.lineWidth = 1.1;
        tCtx.beginPath();
        tCtx.ellipse(-wr * 0.25, side * wr * 1.28, wr * 0.98, wr * 0.52, 0, 0, Math.PI * 2);
        tCtx.fill();
        tCtx.stroke();
        tCtx.restore();
      }
      tCtx.restore();
    }

    // Glowing Leviathan translucent side fins along flanks
    if (pattern === 'leviathan_fins' && count > 6) {
      const finStep = Math.max(4, Math.floor(count / 5));
      for (let i = 3; i < count - 2; i += finStep) {
        const fx = _px[i];
        const fy = _py[i];
        const fang = _pa[i];
        const fr = _pr[i];
        const wave = Math.sin(nowSec * 6 - i * 0.4) * 0.18;
        tCtx.save();
        tCtx.translate(fx, fy);
        tCtx.rotate(fang);
        tCtx.fillStyle = 'rgba(0, 245, 160, 0.48)';
        tCtx.strokeStyle = pal.scale || '#00F5A0';
        tCtx.lineWidth = 1;
        for (let side = -1; side <= 1; side += 2) {
          tCtx.beginPath();
          tCtx.moveTo(fr * 0.1, side * fr * 0.85);
          tCtx.quadraticCurveTo(-fr * 0.55, side * fr * (1.72 + wave), -fr * 1.05, side * fr * 1.25);
          tCtx.lineTo(-fr * 0.45, side * fr * 0.75);
          tCtx.closePath();
          tCtx.fill();
          tCtx.stroke();
        }
        tCtx.restore();
      }
    }
  }

  /**
   * Unified snake draw routine used by Arena Mode, Levels Mode, Menu Preview, and Skin Vault Showcase.
   */
  function drawSnake(tCtx, params) {
    const count = Math.min(MAX_PTS, params.count || 0);
    if (count < 2) return;

    const pal = params.palette || PALETTE_PLAYER;
    const derived = getDerived(pal);
    const rarity = params.rarity || 'common';
    const rarityRank = getRarityRank(rarity);
    const nowMs = params.nowMs || performance.now();
    const nowSec = nowMs * 0.001;
    const headR = params.headRadius || HEAD_RADIUS;
    const headX = params.headX;
    const headY = params.headY;
    const headAngle = params.headAngle || 0;
    const qualityMode = params.qualityMode || 'high'; // 'high' | 'medium' | 'low' | 'far'
    const isFar = qualityMode === 'far';
    const isPlayer = Boolean(params.isPlayer);
    const isBoosting = Boolean(params.isBoosting);
    const isGhost = Boolean(params.isGhost);
    const isMagnet = Boolean(params.isMagnet);
    const isProtected = Boolean(params.isProtected);
    const eatPulses = params.eatPulses || null;

    // Apply smooth visual eating gulp bulge along upper body
    let eatGlow = 0;
    let eatTintColor = null;
    if (eatPulses && eatPulses.length > 0) {
      for (let pIdx = eatPulses.length - 1; pIdx >= 0; pIdx--) {
        const ep = eatPulses[pIdx];
        const age = (nowMs - ep.startAt) / 420;
        if (age >= 1) {
          eatPulses.splice(pIdx, 1);
          continue;
        }
        if (age < 0.35) {
          eatGlow = Math.max(eatGlow, (1 - age / 0.35) * (ep.strength || 1));
          eatTintColor = ep.color || pal.head;
        }
        const waveT = age * 0.42;
        const amp = (1 - age) * 0.22 * (ep.strength || 1);
        for (let i = 0; i < count; i++) {
          const dt = _pt[i] - waveT;
          if (Math.abs(dt) < 0.14) {
            const bell = Math.cos((dt / 0.14) * (Math.PI * 0.5));
            _pr[i] *= (1 + bell * bell * amp);
          }
        }
      }
    }

    computeNormalsAndEdges(count, 1.0);

    tCtx.save();
    if (isGhost) {
      tCtx.globalAlpha *= 0.44;
    }

    // 1. UNDER-GLOW / RARITY & BOOST AURA (cached radial glow sprites - super fast)
    const nightBoost = params.nightGlow || 0;
    const rarityGlow = rarityRank >= 5 ? 0.58 : (rarityRank === 4 ? 0.46 : (rarityRank === 3 ? 0.34 : (rarityRank === 2 ? 0.22 : (isPlayer ? 0.16 : 0))));
    const totalAuraAlpha = Math.min(0.82, Math.max(nightBoost * 0.45, rarityGlow, isBoosting ? 0.52 : 0));
    if (!isFar && totalAuraAlpha > 0.06 && (qualityMode !== 'low' || isPlayer || isBoosting)) {
      const glowStep = Math.max(2, Math.floor(count / (qualityMode === 'high' ? 7 : 4)));
      const pulseMul = rarityRank >= 4 ? (0.88 + 0.16 * Math.sin(nowSec * 4.5)) : 1;
      for (let i = 0; i < count; i += glowStep) {
        const gColor = (pal.pattern === 'rainbow_cycle' || rarityRank >= 5)
          ? `hsla(${(i * 25 + nowSec * 120) % 360}, 92%, 62%, 0.72)`
          : derived.glowColor;
        drawCachedGlow(gColor, _px[i], _py[i], _pr[i] * (rarityRank >= 4 ? 1.55 : 1.25) * pulseMul, totalAuraAlpha * 0.65, tCtx);
      }
    }

    // 2. MAGNET ABILITY FIELD (rotating subtle energy rings around head)
    if (isMagnet && !isFar) {
      tCtx.save();
      tCtx.translate(headX, headY);
      const mPhase = (nowSec * 1.8) % 1;
      for (let k = 0; k < 2; k++) {
        const frac = (mPhase + k * 0.5) % 1;
        const mr = headR * (4.6 - frac * 3.1);
        tCtx.strokeStyle = 'rgba(0, 217, 255, 0.55)';
        tCtx.globalAlpha = (1 - Math.abs(frac - 0.5) * 2) * 0.55;
        tCtx.lineWidth = 2;
        tCtx.setLineDash([8, 8]);
        tCtx.beginPath();
        tCtx.arc(0, 0, mr, nowSec * 2 + k, nowSec * 2 + k + Math.PI * 2);
        tCtx.stroke();
      }
      tCtx.setLineDash([]);
      tCtx.restore();
    }

    // 3. SOFT 3D GROUND CONTACT DROP SHADOW
    if (!isFar && qualityMode !== 'low') {
      buildRibbonPath(tCtx, count, 2.2, 4.4);
      tCtx.fillStyle = 'rgba(2, 6, 16, 0.40)';
      tCtx.fill();
    }

    // 4. EXTERNAL APPENDAGES BEHIND BODY (Bee wings, Leviathan fins)
    if (!isFar) {
      drawExternalAppendages(tCtx, count, pal, nowSec);
    }

    // 5. CONTINUOUS CONNECTED 3D SCULPTED BODY RIBBON
    const firstX = _px[0], firstY = _py[0];
    const lastX = _px[count - 1], lastY = _py[count - 1];
    let bodyFill;
    if (pal.pattern === 'rainbow_cycle' || pal.pattern === 'disco_tiles') {
      const grad = tCtx.createLinearGradient(firstX, firstY, lastX, lastY);
      const baseHue = (nowSec * 90) % 360;
      grad.addColorStop(0.0, `hsl(${baseHue}, 92%, 58%)`);
      grad.addColorStop(0.25, `hsl(${(baseHue + 75) % 360}, 92%, 56%)`);
      grad.addColorStop(0.5, `hsl(${(baseHue + 150) % 360}, 92%, 54%)`);
      grad.addColorStop(0.75, `hsl(${(baseHue + 230) % 360}, 92%, 56%)`);
      grad.addColorStop(1.0, `hsl(${(baseHue + 305) % 360}, 90%, 52%)`);
      bodyFill = grad;
    } else if (Math.hypot(lastX - firstX, lastY - firstY) > 4) {
      const grad = tCtx.createLinearGradient(firstX, firstY, lastX, lastY);
      grad.addColorStop(0, derived.bodyStart);
      grad.addColorStop(0.55, derived.bodyMid);
      grad.addColorStop(1, derived.bodyEnd);
      bodyFill = grad;
    } else {
      bodyFill = derived.bodyStart;
    }

    if (isFar || qualityMode === 'low') {
      // High-performance smooth continuous body path (still zero circle-beading!)
      buildRibbonPath(tCtx, count, 0, 0);
      tCtx.fillStyle = bodyFill;
      tCtx.fill();
      tCtx.strokeStyle = derived.darkOutline;
      tCtx.lineWidth = 1.2;
      tCtx.stroke();

      // Lightweight dorsal gloss highlight
      tCtx.lineCap = 'round';
      tCtx.lineJoin = 'round';
      tCtx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
      tCtx.lineWidth = Math.max(1.6, _pr[0] * 0.28);
      strokeSpineCurve(tCtx, count, -1.2, -1.4, -0.18);

      if (!isFar && isPlayer) {
        tCtx.save();
        buildRibbonPath(tCtx, count, 0, 0);
        tCtx.clip();
        drawScalePatterns(tCtx, count, pal, derived, rarityRank, nowSec, 'low');
        tCtx.restore();
      }
    } else {
      // Full Premium 3D Clipped Cylindrical Shading + Scale Patterns + Wet Gloss Ridge
      tCtx.save();
      buildRibbonPath(tCtx, count, 0, 0);
      tCtx.fillStyle = bodyFill;
      tCtx.fill();
      tCtx.clip();

      // Cylindrical edge ambient occlusion darkening (creates rounded tube depth)
      tCtx.strokeStyle = 'rgba(2, 6, 18, 0.34)';
      tCtx.lineWidth = Math.max(3.5, _pr[0] * 0.56);
      tCtx.lineJoin = 'round';
      tCtx.stroke();

      // Directional bottom-right core shadow curve
      tCtx.lineCap = 'round';
      tCtx.lineJoin = 'round';
      tCtx.strokeStyle = derived.bodyShadow;
      tCtx.lineWidth = Math.max(2.5, _pr[0] * 0.65);
      strokeSpineCurve(tCtx, count, 1.5, 2.2, 0.38);

      // Upper-lit dorsal volume band
      tCtx.strokeStyle = derived.litFlank;
      tCtx.lineWidth = Math.max(2.5, _pr[0] * 0.72);
      strokeSpineCurve(tCtx, count, -0.9, -1.2, -0.18);

      // Detailed curvature-following skin scale pattern
      drawScalePatterns(tCtx, count, pal, derived, rarityRank, nowSec, qualityMode);

      // Eating gulp bioluminescent wave flash inside clipped body
      if (eatGlow > 0.04 && eatTintColor) {
        drawCachedGlow(eatTintColor, _px[Math.min(count - 1, 2)], _py[Math.min(count - 1, 2)], _pr[0] * 1.7, eatGlow * 0.55, tCtx);
      }

      // Legendary / Mythic animated traveling shimmer sheen along dorsal spine
      if (rarityRank >= 4) {
        const shimmerT = (nowSec * 0.75) % 1;
        const sIdx = Math.min(count - 1, Math.floor(shimmerT * (count - 1)));
        drawCachedGlow(
          rarityRank >= 5 ? 'rgba(255, 255, 255, 0.92)' : derived.glowColor,
          _px[sIdx], _py[sIdx], _pr[sIdx] * 1.45, 0.52, tCtx
        );
      }

      // Continuous glossy specular ridge (soft sheen + crisp pinpoint reflection)
      tCtx.strokeStyle = isBoosting ? 'rgba(255, 255, 255, 0.44)' : (rarityRank >= 1 ? 'rgba(255, 255, 255, 0.30)' : 'rgba(255, 255, 255, 0.24)');
      tCtx.lineWidth = Math.max(2.0, _pr[0] * 0.34);
      strokeSpineCurve(tCtx, count, -1.3, -1.6, -0.26);

      tCtx.strokeStyle = isBoosting ? 'rgba(255, 255, 255, 0.78)' : 'rgba(255, 255, 255, 0.55)';
      tCtx.lineWidth = Math.max(0.9, _pr[0] * 0.12);
      strokeSpineCurve(tCtx, count, -1.6, -2.0, -0.32);

      tCtx.restore();

      // Crisp sculpted outer outline + subtle rim light for readability
      buildRibbonPath(tCtx, count, 0, 0);
      tCtx.strokeStyle = isGhost
        ? 'rgba(0, 217, 255, 0.85)'
        : (isProtected ? '#E0F2FE' : derived.darkOutline);
      tCtx.lineWidth = isPlayer ? 1.7 : 1.35;
      tCtx.lineJoin = 'round';
      tCtx.stroke();

      if (isPlayer && !isGhost && !isProtected) {
        tCtx.strokeStyle = rarityRank >= 3 ? derived.glossTint : 'rgba(255, 255, 255, 0.24)';
        tCtx.lineWidth = 0.95;
        tCtx.stroke();
      }
    }

    // 6. BOOST / DASH AERODYNAMIC SLIPSTREAM LINES
    if (isBoosting && !isFar) {
      tCtx.save();
      tCtx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      tCtx.lineWidth = 1.6;
      tCtx.lineCap = 'round';
      const slipLen = headR * 2.2;
      for (let side = -1; side <= 1; side += 2) {
        const sx = headX - Math.cos(headAngle) * (headR * 0.4) + Math.cos(headAngle + Math.PI / 2) * (headR * 1.18 * side);
        const sy = headY - Math.sin(headAngle) * (headR * 0.4) + Math.sin(headAngle + Math.PI / 2) * (headR * 1.18 * side);
        tCtx.beginPath();
        tCtx.moveTo(sx, sy);
        tCtx.lineTo(sx - Math.cos(headAngle) * slipLen, sy - Math.sin(headAngle) * slipLen);
        tCtx.stroke();
      }
      tCtx.restore();
    }

    // 7. MYTHIC / EPIC DETERMINISTIC ORBITING SPARKLES (shared in gameplay + previews!)
    if (!isFar && qualityMode !== 'low' && (rarityRank >= 4 || pal.trailEffect)) {
      const moteCount = rarityRank >= 5 ? 6 : (rarityRank === 4 ? 4 : 3);
      for (let k = 0; k < moteCount; k++) {
        const frac = ((k / moteCount) + nowSec * 0.22) % 0.92;
        const idx = Math.min(count - 1, Math.floor(frac * (count - 1)));
        const orbit = Math.sin(nowSec * 3.8 + k * 2.1) * (_pr[idx] * 1.45);
        const mx = _px[idx] + _nx[idx] * orbit;
        const my = _py[idx] + _ny[idx] * orbit;
        const twinkle = 0.45 + 0.55 * Math.sin(nowSec * 7 + k * 1.7);
        const mColor = (pal.trailEffect === 'rainbow' || rarityRank >= 5)
          ? `hsl(${(nowSec * 110 + k * 60) % 360}, 95%, 68%)`
          : (pal.scale || pal.head);
        tCtx.save();
        tCtx.globalAlpha *= twinkle * (rarityRank >= 5 ? 0.9 : 0.72);
        tCtx.fillStyle = mColor;
        const sz = (rarityRank >= 5 ? 2.4 : 1.8) * (0.7 + 0.4 * twinkle);
        tCtx.beginPath();
        tCtx.arc(mx, my, sz, 0, Math.PI * 2);
        tCtx.fill();
        tCtx.restore();
      }
    }

    // 8. HEAD VOLUMETRIC GLOW & SCULPTED 3D HEAD
    const headGlowAlpha = Math.min(0.85, Math.max(nightBoost * 0.65, rarityRank >= 3 ? 0.48 : 0.28, isBoosting ? 0.65 : 0));
    if (qualityMode !== 'low' || isPlayer) {
      drawCachedGlow(derived.glowColor, headX, headY, headR * (1.55 + (rarityRank >= 4 ? 0.35 : 0)), headGlowAlpha, tCtx);
    }

    drawHead(tCtx, headX, headY, headAngle, headR, pal, derived, {
      nowSec,
      tongueProgress: params.tongueProgress || 0,
      eatGlow,
      lookBias: params.lookBias || 0,
      qualityMode,
      rarityRank
    });

    // 9. PROTECTION / SPAWN SHIELD RING
    if (isProtected) {
      const pAlpha = 0.45 + 0.35 * Math.sin(nowSec * 14);
      tCtx.save();
      tCtx.globalAlpha = pAlpha;
      tCtx.strokeStyle = '#7DD3FC';
      tCtx.lineWidth = 2.2;
      tCtx.beginPath();
      tCtx.arc(headX, headY, headR * 1.48, 0, Math.PI * 2);
      tCtx.stroke();
      tCtx.restore();
    }

    tCtx.restore();
  }

  return {
    _px, _py, _pr, _pa, _pt,
    MAX_PTS,
    drawSnake,
    getDerived
  };
})();

function triggerSnakeEatVisual(snake, color, strength = 1) {
  if (!snake) return;
  const now = performance.now();
  snake.lastEatAt = now;
  if (!snake.eatPulses) snake.eatPulses = [];
  if (snake.eatPulses.length >= 3) snake.eatPulses.shift();
  snake.eatPulses.push({ startAt: now, color: color || '#00F5A0', strength });
  // Quick happy tongue flick when eating
  if (typeof snake.tongueTimer === 'number' && snake.tongueTimer < 175) {
    snake.tongueTimer = 178;
  }
}

function spawnVisualRing(x, y, color, startR = 8, endR = 44, durationMs = 340, lineWidth = 3) {
  if (graphicsQuality === 'low' && visualRings.length >= 10) return;
  if (visualRings.length >= 28) return;
  const ring = visualRingPool.pop() || {};
  ring.x = x;
  ring.y = y;
  ring.color = color || '#00F5A0';
  ring.startR = startR;
  ring.endR = endR;
  ring.startAt = performance.now();
  ring.durationMs = durationMs;
  ring.lineWidth = lineWidth;
  visualRings.push(ring);
}

function renderVisualRings() {
  if (visualRings.length === 0) return;
  const now = performance.now();
  const bounds = cameraViewBounds(90);
  ctx.save();
  for (let i = visualRings.length - 1; i >= 0; i--) {
    const ring = visualRings[i];
    const t = (now - ring.startAt) / ring.durationMs;
    if (t >= 1) {
      visualRings.splice(i, 1);
      if (visualRingPool.length < 40) visualRingPool.push(ring);
      continue;
    }
    const x = cameraX + toroidDelta(cameraX, ring.x, WORLD_WIDTH);
    const y = cameraY + toroidDelta(cameraY, ring.y, WORLD_HEIGHT);
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) continue;
    const eased = 1 - Math.pow(1 - t, 3);
    const r = ring.startR + (ring.endR - ring.startR) * eased;
    ctx.globalAlpha = (1 - t) * 0.78;
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = Math.max(1, ring.lineWidth * (1 - t * 0.65));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

const nameTagWidthCache = new Map();

function drawNameTag(name, x, y, color, headVisualScale = 1) {
  ctx.save();
  ctx.font = 'bold 11px system-ui, sans-serif';
  let textWidth = nameTagWidthCache.get(name);
  if (textWidth === undefined) {
    textWidth = ctx.measureText(name).width;
    if (nameTagWidthCache.size > 160) nameTagWidthCache.clear();
    nameTagWidthCache.set(name, textWidth);
  }
  const paddingX = 8;
  const tagHeight = 18;
  const tagWidth = textWidth + paddingX * 2;
  const tagY = y - Math.round(28 * headVisualScale);

  ctx.fillStyle = 'rgba(8, 13, 24, 0.78)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  if (graphicsQuality === 'low') {
    ctx.fillRect(x - tagWidth / 2, tagY, tagWidth, tagHeight);
    ctx.strokeRect(x - tagWidth / 2, tagY, tagWidth, tagHeight);
  } else {
    ctx.beginPath();
    ctx.roundRect(x - tagWidth / 2, tagY, tagWidth, tagHeight, 9);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = '#F5F7FF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x, tagY + tagHeight / 2);
  ctx.restore();
}

function drawCrownOnKing(snake, headVisualScale = 1) {
  const crownScale = Math.max(22, Math.min(48, Math.round(width * 0.028 / Math.max(0.4, cameraZoom))));
  const crownY = snake.y - Math.round(34 * headVisualScale);
  drawCachedGlow('rgba(255, 176, 32, 0.78)', snake.x, crownY - crownScale * 0.4, crownScale * 0.42, 0.75);
  ctx.save();
  ctx.font = `${crownScale}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('👑', snake.x, crownY);
  ctx.restore();
}

function drawRealisticSnakeAt(snake, offsetX, offsetY) {
  if (!snake.alive) return;
  const segs = snake.segments;
  if (segs.length === 0) return;

  const isMobViewport = width <= 768 || isMobileDevice;
  const bodyGrowthMul = getSnakeBodyGrowthScale(snake.length);
  const headGrowthMul = getSnakeHeadGrowthScale(snake.length);
  const mobileBodyBase = isMobViewport ? 1.42 : 1.0;
  const mobileHeadBase = isMobViewport ? 1.28 : 1.0;
  const bodyVisualScale = mobileBodyBase * bodyGrowthMul;
  const headVisualScale = mobileHeadBase * headGrowthMul;
  const bodyTaper = isMobViewport ? 0.46 : 0.56;
  const minSegRadius = (isMobViewport ? 5.6 : 4.2) * Math.min(1.45, 0.85 + (bodyGrowthMul - 1) * 0.7);
  const getSegRadius = (progress) => {
    const taperCurve = Math.pow(progress, 1.42);
    return Math.max(minSegRadius, HEAD_RADIUS * bodyVisualScale * (1 - taperCurve * bodyTaper));
  };

  const nowRender = performance.now();
  const far = !snake.isPlayer && toroidDistSq(player.x, player.y, snake.x, snake.y) > (Math.min(width, height) / cameraZoom * 0.46) ** 2;
  const qualityMode = far ? 'far' : (graphicsQuality === 'low' ? 'low' : (graphicsQuality === 'medium' ? 'medium' : 'high'));

  // Sample smooth spine points into SnakeRenderer's zero-GC scratch arrays
  const stride = snake.isPlayer ? 1 : (far ? 3 : (graphicsQuality === 'low' ? 2 : 1));
  let count = 0;
  const maxAllowed = SnakeRenderer.MAX_PTS - 2;
  // Point 0 = head center for seamless head-to-neck junction
  SnakeRenderer._px[count] = snake.x;
  SnakeRenderer._py[count] = snake.y;
  SnakeRenderer._pr[count] = getSegRadius(0) * 0.96;
  SnakeRenderer._pa[count] = snake.angle;
  SnakeRenderer._pt[count] = 0;
  count++;

  for (let i = 0; i < segs.length && count < maxAllowed; i += stride) {
    const seg = segs[i];
    const progress = i / segs.length;
    const x = seg.relX !== undefined ? snake.x + seg.relX : snake.x + toroidDelta(snake.x, seg.x, WORLD_WIDTH);
    const y = seg.relY !== undefined ? snake.y + seg.relY : snake.y + toroidDelta(snake.y, seg.y, WORLD_HEIGHT);
    SnakeRenderer._px[count] = x;
    SnakeRenderer._py[count] = y;
    SnakeRenderer._pr[count] = getSegRadius(progress);
    SnakeRenderer._pa[count] = seg.angle;
    SnakeRenderer._pt[count] = progress;
    count++;
  }
  // Always append exact tail tip so tail never terminates early
  if (segs.length > 1 && count < SnakeRenderer.MAX_PTS) {
    const tailSeg = segs[segs.length - 1];
    const tx = tailSeg.relX !== undefined ? snake.x + tailSeg.relX : snake.x + toroidDelta(snake.x, tailSeg.x, WORLD_WIDTH);
    const ty = tailSeg.relY !== undefined ? snake.y + tailSeg.relY : snake.y + toroidDelta(snake.y, tailSeg.y, WORLD_HEIGHT);
    if (Math.hypot(tx - SnakeRenderer._px[count - 1], ty - SnakeRenderer._py[count - 1]) > 1.5) {
      SnakeRenderer._px[count] = tx;
      SnakeRenderer._py[count] = ty;
      SnakeRenderer._pr[count] = getSegRadius(1);
      SnakeRenderer._pa[count] = tailSeg.angle;
      SnakeRenderer._pt[count] = 1;
      count++;
    }
  }

  ctx.save();
  ctx.translate(offsetX, offsetY);
  if (!snake.isPlayer && snake.spawnFadeStartAt && nowRender - snake.spawnFadeStartAt < (snake.spawnFadeDuration || BOT_SPAWN_FADE_MS)) {
    const fadeProgress = Math.max(0.06, Math.min(1, (nowRender - snake.spawnFadeStartAt) / (snake.spawnFadeDuration || BOT_SPAWN_FADE_MS)));
    ctx.globalAlpha *= fadeProgress;
  }

  const pal = snake.palette;
  const rarity = snake.isPlayer ? (getSkin().rarity || 'common') : (snake.rarity || 'common');
  const isBoosting = Boolean((snake.dashUntil && nowRender < snake.dashUntil) || (snake.speedBoostUntil && nowRender < snake.speedBoostUntil));
  const isGhost = Boolean(snake.isPlayer && nowRender < snake.ghostUntil);
  const isMagnet = Boolean(snake.isPlayer && nowRender < snake.magnetUntil);
  const isProtected = Boolean(nowRender < snake.protectedUntil);
  const nightGlow = currentCycle.nightFactor * (graphicsQuality === 'low' ? 0.25 : (graphicsQuality === 'medium' ? 0.62 : 1));
  const lookBias = Math.max(-0.6, Math.min(0.6, angleDifference(snake.angle, snake.targetAngle || snake.angle) * 1.4));

  SnakeRenderer.drawSnake(ctx, {
    count,
    palette: pal,
    rarity,
    headX: snake.x,
    headY: snake.y,
    headAngle: snake.angle,
    headRadius: HEAD_RADIUS * headVisualScale,
    nowMs: nowRender,
    qualityMode,
    isPlayer: snake.isPlayer,
    isBoosting,
    isGhost,
    isMagnet,
    isProtected,
    nightGlow,
    tongueProgress: snake.tongueProgress || 0,
    lookBias,
    eatPulses: snake.eatPulses
  });

  const isKing = isKingSnake(snake);
  if (isKing) {
    drawCrownOnKing(snake, headVisualScale);
  }
  if (snake.isPlayer || isKing || !far || graphicsQuality === 'high') {
    const tagName = `${isKing ? '👑 ' : ''}${snake.isPlayer ? snake.name : `${snake.personality.icon} ${snake.name}`}`;
    drawNameTag(tagName, snake.x, snake.y, pal.head, headVisualScale);
  }

  ctx.restore();
}

function drawSnakeToroidal(snake) {
  if (!snake.alive) return;
  const pad = HEAD_RADIUS * 2.5 + 16;
  const bounds = cameraViewBounds(pad);
  const fallbackReach = Math.min(snake.segments.length * SEGMENT_SPACING, Math.max(WORLD_WIDTH, WORLD_HEIGHT) * 0.45);
  const minRelX = snake.minRelX !== undefined ? snake.minRelX : -fallbackReach;
  const maxRelX = snake.maxRelX !== undefined ? snake.maxRelX : fallbackReach;
  const minRelY = snake.minRelY !== undefined ? snake.minRelY : -fallbackReach;
  const maxRelY = snake.maxRelY !== undefined ? snake.maxRelY : fallbackReach;
  const baseX = cameraX + toroidDelta(cameraX, snake.x, WORLD_WIDTH);
  const baseY = cameraY + toroidDelta(cameraY, snake.y, WORLD_HEIGHT);
  const baseOffsetX = baseX - snake.x;
  const baseOffsetY = baseY - snake.y;
  for (let wrapX = -1; wrapX <= 1; wrapX++) {
    const shiftX = wrapX * WORLD_WIDTH;
    const headX = baseX + shiftX;
    if (headX + maxRelX < bounds.left || headX + minRelX > bounds.right) continue;
    for (let wrapY = -1; wrapY <= 1; wrapY++) {
      const shiftY = wrapY * WORLD_HEIGHT;
      const headY = baseY + shiftY;
      if (headY + maxRelY < bounds.top || headY + minRelY > bounds.bottom) continue;
      drawRealisticSnakeAt(snake, baseOffsetX + shiftX, baseOffsetY + shiftY);
    }
  }
}

function render() {
  updateDayNightCycle();
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.setTransform(
    deviceScale * cameraZoom, 0, 0, deviceScale * cameraZoom,
    deviceScale * (width / 2 - cameraX * cameraZoom),
    deviceScale * (height / 2 - cameraY * cameraZoom)
  );
  ctx.save();
  if (shakeIntensity > 0) {
    const sx = (Math.random() - 0.5) * shakeIntensity;
    const sy = (Math.random() - 0.5) * shakeIntensity;
    ctx.translate(sx / cameraZoom, sy / cameraZoom);
  }

  renderBackground();
  renderDangerZone();
  renderFood();
  renderPowerups();
  renderFloatingTexts();
  renderRareOrb();
  renderParticles();
  renderVisualRings();

  for (const bot of bots) drawGlowTrail(bot);
  drawGlowTrail(player);

  for (const bot of bots) {
    drawSnakeToroidal(bot);
  }

  drawSnakeToroidal(player);

  ctx.restore();
  ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
  renderMinimap();
}

function renderMinimap() {
  const isMobViewport = width <= 768 || isMobileDevice;
  const size = height <= 500
    ? 80
    : isMobViewport
      ? Math.min(102, Math.max(82, Math.min(width, height) * 0.21))
      : Math.min(132, Math.max(96, Math.min(width, height) * 0.22));
  const radius = size / 2;
  const cx = width - radius - (isMobViewport ? 10 : 14);
  const cy = height - radius - (isMobViewport ? 14 : 16);
  const mapRadius = radius - 6;

  ctx.save();
  // Dark futuristic abyssal radar base
  const bgGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius);
  bgGrad.addColorStop(0, 'rgba(16, 26, 45, 0.88)');
  bgGrad.addColorStop(1, 'rgba(7, 11, 22, 0.92)');
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = bgGrad;
  ctx.fill();
  ctx.clip();

  // Concentric radar range rings & subtle crosshairs
  ctx.strokeStyle = 'rgba(0, 217, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, mapRadius * 0.48, 0, Math.PI * 2);
  ctx.arc(cx, cy, mapRadius * 0.88, 0, Math.PI * 2);
  ctx.moveTo(cx - mapRadius, cy);
  ctx.lineTo(cx + mapRadius, cy);
  ctx.moveTo(cx, cy - mapRadius);
  ctx.lineTo(cx, cy + mapRadius);
  ctx.stroke();

  // Danger Zone radar sector
  const zoneDx = toroidDelta(player.x, WORLD_WIDTH / 2, WORLD_WIDTH) / WORLD_WIDTH * (mapRadius * 2);
  const zoneDy = toroidDelta(player.y, WORLD_HEIGHT / 2, WORLD_HEIGHT) / WORLD_HEIGHT * (mapRadius * 2);
  const zoneMapRadius = DANGER_ZONE_RADIUS / WORLD_WIDTH * (mapRadius * 2);
  ctx.fillStyle = 'rgba(255, 176, 32, 0.14)';
  ctx.strokeStyle = 'rgba(255, 176, 32, 0.68)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx + zoneDx, cy + zoneDy, zoneMapRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Nearby AI serpents
  const nearbyBotLimitSq = 1900 * 1900;
  for (const bot of bots) {
    if (bot.alive && toroidDistSq(player.x, player.y, bot.x, bot.y) <= nearbyBotLimitSq) {
      drawMinimapDot(bot.x, bot.y, bot.palette.head, 2.4, cx, cy, mapRadius);
    }
  }
  const king = getKingSnake();
  if (king && !king.isPlayer) drawMinimapDot(king.x, king.y, '#FFB020', 4.8, cx, cy, mapRadius);
  if (rareOrb) drawMinimapDot(rareOrb.x, rareOrb.y, '#FEF08A', 3.2, cx, cy, mapRadius);

  // Directional glowing player chevron
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(player.angle);
  ctx.fillStyle = '#00F5A0';
  ctx.beginPath();
  ctx.moveTo(6.2, 0);
  ctx.lineTo(-4.2, 4.0);
  ctx.lineTo(-2.4, 0);
  ctx.lineTo(-4.2, -4.0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ECFDF5';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.restore();

  if (king === player) {
    ctx.fillStyle = '#FFB020';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👑', cx, cy - 8);
  }
  ctx.restore();

  // Crisp glowing outer cyan radar bezel
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 217, 255, 0.58)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMinimapDot(x, y, color, dotRadius, cx, cy, mapRadius) {
  const dx = toroidDelta(player.x, x, WORLD_WIDTH) / WORLD_WIDTH * (mapRadius * 2);
  const dy = toroidDelta(player.y, y, WORLD_HEIGHT) / WORLD_HEIGHT * (mapRadius * 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx + dx, cy + dy, dotRadius, 0, Math.PI * 2);
  ctx.fill();
}

// ============================================================
// §9.5  SEPARATE FIXED-SCREEN WALLED LEVELS MODE
// Zero shared state with Arena's 8000x8000 world, wrap-around,
// camera follow/zoom, 50-bot waves, danger zone, or minimap.
// ============================================================
const LEVELS_PROGRESS_KEY = 'slythox_levels_progress_v1';

const LevelsMode = {
  cfg: window.LEVELS_CONFIG || null,
  selectedWorldIndex: 0,
  currentLevel: 1,
  levelData: null,
  active: false,
  finished: false,

  // Fixed logical grid & letterboxed viewport transform
  cols: 32,
  rows: 18,
  cellSize: 40,
  fieldW: 1280,
  fieldH: 720,
  viewScale: 1,
  viewOffsetX: 0,
  viewOffsetY: 0,

  // Round state
  timeLeftMs: 60000,
  score: 0,
  lives: 3,
  hasPlasmaShield: false,
  targetReached: false,
  comboCount: 1,
  comboExpiresAt: 0,
  nextFruitSpawnAt: 0,
  lastTickNow: 0,
  shakeMs: 0,

  // Entities (100% isolated from Arena)
  snake: null,
  bots: [],
  items: [], // fruits + gold/blue orbs
  hazards: { jellyfish: [], currents: [], mines: [] },
  pops: [], // floating score/status texts

  getConfig() {
    if (!this.cfg && window.LEVELS_CONFIG) this.cfg = window.LEVELS_CONFIG;
    return this.cfg;
  },

  loadProgress() {
    const fallback = { unlockedLevel: 1, stars: {} };
    try {
      const raw = safeStorageGet(LEVELS_PROGRESS_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed)) return fallback;
      const unlocked = Number.isInteger(parsed.unlockedLevel)
        ? Math.max(1, Math.min(50, parsed.unlockedLevel))
        : 1;
      const stars = {};
      if (isPlainObject(parsed.stars)) {
        for (const [k, v] of Object.entries(parsed.stars)) {
          const lvl = Number(k);
          const st = Number(v);
          if (Number.isInteger(lvl) && lvl >= 1 && lvl <= 50 && Number.isInteger(st) && st >= 1 && st <= 3) {
            stars[String(lvl)] = st;
          }
        }
      }
      return { unlockedLevel: unlocked, stars };
    } catch (_) {
      return fallback;
    }
  },

  saveProgress(progress) {
    const clean = {
      unlockedLevel: Math.max(1, Math.min(50, Math.floor(progress.unlockedLevel || 1))),
      stars: {}
    };
    if (progress.stars && typeof progress.stars === 'object') {
      for (const [k, v] of Object.entries(progress.stars)) {
        const lvl = Number(k);
        const st = Number(v);
        if (Number.isInteger(lvl) && lvl >= 1 && lvl <= 50 && Number.isInteger(st) && st >= 1 && st <= 3) {
          clean.stars[String(lvl)] = st;
        }
      }
    }
    safeStorageSet(LEVELS_PROGRESS_KEY, JSON.stringify(clean));
  },

  selectWorld(worldIdx) {
    const cfg = this.getConfig();
    if (!cfg) return;
    this.selectedWorldIndex = Math.max(0, Math.min(cfg.WORLDS.length - 1, worldIdx));
    this.renderLevelSelect();
  },

  renderLevelSelect() {
    const cfg = this.getConfig();
    if (!cfg) return;
    const progress = this.loadProgress();
    let totalStars = 0;
    for (const v of Object.values(progress.stars)) totalStars += v;

    const summaryEl = document.getElementById('levels-summary-text');
    if (summaryEl) summaryEl.textContent = `★ ${totalStars} / 150 Stars • 5 Worlds • 50 Handcrafted Stages`;
    if (typeof updateProgressionStripUI === 'function') updateProgressionStripUI();

    const tabsEl = document.getElementById('levels-world-tabs');
    if (tabsEl) {
      tabsEl.replaceChildren();
      cfg.WORLDS.forEach((w, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'world-tab-btn' + (idx === this.selectedWorldIndex ? ' active' : '');
        btn.dataset.action = 'levels-select-world';
        btn.dataset.arg = String(idx);
        btn.textContent = `${idx + 1}. ${w.name}`;
        tabsEl.appendChild(btn);
      });
    }

    const world = cfg.WORLDS[this.selectedWorldIndex] || cfg.WORLDS[0];
    const startLvl = this.selectedWorldIndex * 10 + 1;
    const endLvl = startLvl + 9;
    let worldStars = 0;
    for (let l = startLvl; l <= endLvl; l++) worldStars += (progress.stars[String(l)] || 0);

    const wTitle = document.getElementById('levels-world-title');
    const wDesc = document.getElementById('levels-world-desc');
    const wStars = document.getElementById('levels-world-stars');
    if (wTitle) {
      wTitle.textContent = `World ${this.selectedWorldIndex + 1}: ${world.name}`;
      wTitle.style.color = world.accent;
    }
    if (wDesc) wDesc.textContent = `${world.subtitle} — ${world.mechanic}`;
    if (wStars) wStars.textContent = `★ ${worldStars} / 30`;

    const gridEl = document.getElementById('levels-map-grid');
    if (!gridEl) return;
    gridEl.replaceChildren();

    for (let l = startLvl; l <= endLvl; l++) {
      const ld = cfg.LEVELS[l - 1];
      const unlocked = l <= progress.unlockedLevel;
      const earned = progress.stars[String(l)] || 0;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-node-btn' + (unlocked ? '' : ' locked') + (ld.isBoss ? ' boss' : '');
      btn.disabled = !unlocked;
      if (unlocked) {
        btn.dataset.action = 'levels-play';
        btn.dataset.arg = String(l);
      }

      if (ld.isBoss) {
        const tag = document.createElement('span');
        tag.className = 'level-node-boss-tag';
        tag.textContent = '👑 BOSS';
        btn.appendChild(tag);
      }

      const num = document.createElement('div');
      num.className = 'level-node-num';
      num.textContent = unlocked ? String(l) : '🔒';
      btn.appendChild(num);

      const starsRow = document.createElement('div');
      starsRow.className = 'level-node-stars';
      for (let s = 1; s <= 3; s++) {
        const sp = document.createElement('span');
        sp.textContent = '★';
        if (s > earned) sp.className = 'star-off';
        starsRow.appendChild(sp);
      }
      btn.appendChild(starsRow);

      const meta = document.createElement('div');
      meta.className = 'level-node-meta';
      meta.textContent = `${ld.targetScore} pts` + (ld.botCount > 0 ? ` • ${ld.botCount}🤖` : '');
      btn.appendChild(meta);

      gridEl.appendChild(btn);
    }
  },

  reset() {
    this.active = false;
    this.finished = false;
    this.snake = null;
    this.bots = [];
    this.items = [];
    this.hazards = { jellyfish: [], currents: [], mines: [] };
    this.pops = [];
    const lhud = document.getElementById('levels-hud');
    if (lhud) lhud.style.display = 'none';
    const res = document.getElementById('level-result-overlay');
    if (res) res.style.display = 'none';
  },

  computeViewportLayout() {
    const cfg = this.getConfig();
    if (!cfg) return;
    const isPortrait = height > width;
    const grid = isPortrait ? cfg.GRID_PORTRAIT : cfg.GRID_LANDSCAPE;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.cellSize = cfg.CELL_SIZE;
    this.fieldW = this.cols * this.cellSize;
    this.fieldH = this.rows * this.cellSize;

    const topSafe = isPortrait ? 86 : 68;
    const padX = 14;
    const padBottom = 14;
    const availW = Math.max(160, width - padX * 2);
    const availH = Math.max(160, height - topSafe - padBottom);
    this.viewScale = Math.min(availW / this.fieldW, availH / this.fieldH);
    this.viewOffsetX = Math.floor((width - this.fieldW * this.viewScale) / 2);
    this.viewOffsetY = Math.floor(topSafe + (availH - this.fieldH * this.viewScale) / 2);
  },

  getSkinPalette() {
    const skin = (typeof getSkin === 'function') ? getSkin() : null;
    if (skin && skin.palette) {
      return skin.palette;
    }
    return PALETTE_PLAYER;
  },

  spawnPlayerSnake(withShieldMs = 0) {
    const cfg = this.getConfig();
    const startX = this.fieldW * 0.5;
    const startY = this.fieldH * 0.5;
    const angle = 0; // moving right cleanly on start
    const segSpacing = 12;
    const startLen = cfg.START_LENGTH;
    const segments = [];
    for (let i = 0; i < startLen; i++) {
      segments.push({ x: startX - i * segSpacing, y: startY });
    }
    const activeSkin = (typeof getSkin === 'function') ? getSkin() : null;
    this.snake = {
      x: startX,
      y: startY,
      angle,
      targetAngle: angle,
      radius: 13,
      segSpacing,
      targetSegments: startLen,
      segments,
      shieldUntil: withShieldMs > 0 ? performance.now() + withShieldMs : 0,
      palette: this.getSkinPalette(),
      rarity: (activeSkin && activeSkin.rarity) ? activeSkin.rarity : 'common',
      eatPulses: [],
      tongueTimer: 0
    };
  },

  isSafeSpawnPoint(x, y, minHeadCells = 3, extraPad = 36) {
    if (x < extraPad || x > this.fieldW - extraPad || y < extraPad || y > this.fieldH - extraPad) return false;
    const minHeadDist = minHeadCells * this.cellSize;
    if (this.snake) {
      if (Math.hypot(x - this.snake.x, y - this.snake.y) < minHeadDist) return false;
      for (let i = 0; i < this.snake.segments.length; i += 2) {
        const s = this.snake.segments[i];
        if (Math.hypot(x - s.x, y - s.y) < 34) return false;
      }
    }
    for (const b of this.bots) {
      if (!b.alive) continue;
      if (Math.hypot(x - b.x, y - b.y) < 60) return false;
      for (let i = 0; i < b.segments.length; i += 2) {
        const s = b.segments[i];
        if (Math.hypot(x - s.x, y - s.y) < 34) return false;
      }
    }
    for (const m of this.hazards.mines) {
      if (Math.hypot(x - m.x, y - m.y) < m.radius + 32) return false;
    }
    for (const j of this.hazards.jellyfish) {
      if (Math.hypot(x - j.x, y - j.y) < j.radius + 32) return false;
    }
    return true;
  },

  findSafeCellCenter(minHeadCells = 3) {
    const marginCells = 2;
    for (let attempt = 0; attempt < 90; attempt++) {
      const c = marginCells + Math.floor(Math.random() * Math.max(1, this.cols - marginCells * 2));
      const r = marginCells + Math.floor(Math.random() * Math.max(1, this.rows - marginCells * 2));
      const x = (c + 0.5) * this.cellSize;
      const y = (r + 0.5) * this.cellSize;
      if (this.isSafeSpawnPoint(x, y, minHeadCells, this.cellSize * 1.1)) {
        return { x, y };
      }
    }
    return { x: this.fieldW * 0.2, y: this.fieldH * 0.2 };
  },

  initHazards(ld) {
    this.hazards = { jellyfish: [], currents: [], mines: [] };
    const h = ld.hazards || { jellyfish: 0, currents: 0, mines: 0 };

    // Coral Reef / Abyss Jellyfish
    for (let i = 0; i < (h.jellyfish || 0); i++) {
      const pt = this.findSafeCellCenter(4);
      const ang = Math.random() * Math.PI * 2;
      const spd = 48 + Math.random() * 34;
      this.hazards.jellyfish.push({
        x: pt.x,
        y: pt.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        radius: 20,
        phase: Math.random() * Math.PI * 2
      });
    }

    // Kelp Forest / Abyss Currents
    for (let i = 0; i < (h.currents || 0); i++) {
      const horizontal = (i % 2 === 0);
      const w = horizontal ? this.cellSize * 6 : this.cellSize * 2.5;
      const ch = horizontal ? this.cellSize * 2.5 : this.cellSize * 6;
      const cx = this.cellSize * 2 + Math.random() * Math.max(40, this.fieldW - w - this.cellSize * 4);
      const cy = this.cellSize * 2 + Math.random() * Math.max(40, this.fieldH - ch - this.cellSize * 4);
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.hazards.currents.push({
        x: cx,
        y: cy,
        w,
        h: ch,
        fx: horizontal ? dir * 105 : 0,
        fy: horizontal ? 0 : dir * 105
      });
    }

    // Volcano Vents / Abyss Mines
    for (let i = 0; i < (h.mines || 0); i++) {
      const pt = this.findSafeCellCenter(4);
      this.hazards.mines.push({
        x: pt.x,
        y: pt.y,
        radius: 17,
        phase: Math.random() * Math.PI * 2
      });
    }
  },

  createBot(type, idx) {
    const pt = this.findSafeCellCenter(5);
    const angle = Math.atan2(this.fieldH * 0.5 - pt.y, this.fieldW * 0.5 - pt.x);
    const segSpacing = 12;
    const len = 10;
    const segments = [];
    for (let i = 0; i < len; i++) {
      segments.push({ x: pt.x - Math.cos(angle) * i * segSpacing, y: pt.y - Math.sin(angle) * i * segSpacing });
    }
    const palette = type === 'hunter'
      ? {
          head: '#FF477E', bodyStart: '#E11D48', bodyEnd: '#881337',
          scale: '#FDA4AF', glow: 'rgba(255, 71, 126, 0.65)',
          eyeIris: '#FEF08A', eyePupil: '#4C0519', tongue: '#FDA4AF',
          pattern: 'chevron', headShape: 'viper', eyeStyle: 'angry'
        }
      : {
          head: '#FFB020', bodyStart: '#F59E0B', bodyEnd: '#92400E',
          scale: '#FEF08A', glow: 'rgba(255, 176, 32, 0.65)',
          eyeIris: '#FEF08A', eyePupil: '#451A03', tongue: '#F43F5E',
          pattern: 'diamonds', headShape: 'cobra', eyeStyle: 'slit', hoodWidth: 1.65
        };
    return {
      id: idx,
      type,
      alive: true,
      respawnAt: 0,
      x: pt.x,
      y: pt.y,
      angle,
      radius: 12.5,
      segSpacing,
      targetSegments: len,
      segments,
      palette,
      rarity: 'rare',
      eatPulses: [],
      tongueTimer: Math.floor(Math.random() * 140)
    };
  },

  initBots(ld) {
    this.bots = [];
    const count = Math.min(this.getConfig().BOT_MAX, ld.botCount || 0);
    for (let i = 0; i < count; i++) {
      const type = (ld.botTypes && ld.botTypes[i]) || (i === 0 ? 'hunter' : 'encircler');
      this.bots.push(this.createBot(type, i));
    }
  },

  spawnFruitOrOrb(now) {
    const cfg = this.getConfig();
    const ld = this.levelData;
    if (!cfg || !ld) return;
    // Cap simultaneous items so the field stays readable
    if (this.items.length >= 10) return;

    const pt = this.findSafeCellCenter(cfg.SPAWN_MIN_HEAD_CLEAR_CELLS);
    const roll = Math.random();
    if (roll < 0.12) {
      // Gold Orb (+45 pts)
      this.items.push({
        kind: 'gold',
        x: pt.x,
        y: pt.y,
        points: 45,
        growth: 2,
        radius: 14,
        color: '#FFB020',
        glow: 'rgba(255, 176, 32, 0.85)',
        spawnedAt: now,
        expiresAt: now + ld.fruitLifetimeMs
      });
    } else if (roll < 0.22) {
      // Blue Plasma Shield Orb (+25 pts + absorbs 1 crash)
      this.items.push({
        kind: 'plasma',
        x: pt.x,
        y: pt.y,
        points: 25,
        growth: 1,
        radius: 14,
        color: '#38BDF8',
        glow: 'rgba(56, 189, 248, 0.9)',
        spawnedAt: now,
        expiresAt: now + ld.fruitLifetimeMs
      });
    } else {
      // Standard Neon Pixel Fruit (apple / cherry / grapes)
      const fruitType = (typeof pickFruitTypeForLevel === 'function')
        ? pickFruitTypeForLevel(Math.min(10, Math.ceil(ld.level / 5)))
        : 'apple';
      const fDef = (typeof FRUITS_CONFIG !== 'undefined' && FRUITS_CONFIG.types && FRUITS_CONFIG.types[fruitType])
        ? FRUITS_CONFIG.types[fruitType]
        : { id: 'apple', points: 20, growth: 1, color: '#ff3b5c', glow: 'rgba(255,59,92,0.8)' };
      this.items.push({
        kind: 'fruit',
        fruitType: fDef.id || fruitType,
        x: pt.x,
        y: pt.y,
        points: fDef.points || 20,
        growth: fDef.growth || 1,
        radius: 16,
        color: fDef.color || '#ff3b5c',
        glow: fDef.glow || 'rgba(255,59,92,0.8)',
        spawnedAt: now,
        expiresAt: now + ld.fruitLifetimeMs
      });
    }
  },

  startLevel(levelNum) {
    const cfg = this.getConfig();
    if (!cfg) return;
    const clamped = Math.max(1, Math.min(50, Math.floor(levelNum || 1)));
    const ld = cfg.LEVELS[clamped - 1];
    if (!ld) return;

    // Explicit mode switch & complete Arena cleanup
    stopGameLoop();
    gameMode = 'levels';
    initAudio();
    AdManager.hideNativeBanner();
    resetActiveControls();
    if (canvas) canvas.style.pointerEvents = 'auto';

    if (menuScreenEl) menuScreenEl.style.display = 'none';
    document.querySelectorAll('.subscreen').forEach(el => { el.style.display = 'none'; });
    activeSubscreenId = null;
    if (hudEl) hudEl.style.display = 'none';
    if (lbEl) lbEl.style.display = 'none';
    if (overlayEl) overlayEl.style.display = 'none';
    if (pauseOverlayEl) pauseOverlayEl.style.display = 'none';
    if (rareIndicatorEl) rareIndicatorEl.style.display = 'none';
    if (powerupIndicatorEl) powerupIndicatorEl.style.display = 'none';
    const lvlBanner = document.getElementById('level-intro-banner');
    if (lvlBanner) lvlBanner.style.display = 'none';
    const reviveModal = document.getElementById('revive-modal');
    if (reviveModal) reviveModal.style.display = 'none';
    const resOverlay = document.getElementById('level-result-overlay');
    if (resOverlay) resOverlay.style.display = 'none';

    this.currentLevel = clamped;
    this.levelData = ld;
    this.selectedWorldIndex = ld.worldIndex;
    this.active = true;
    this.finished = false;
    this.timeLeftMs = cfg.ROUND_DURATION_SEC * 1000;
    this.score = 0;
    this.lives = cfg.START_LIVES;
    this.hasPlasmaShield = false;
    this.targetReached = false;
    this.comboCount = 1;
    this.comboExpiresAt = 0;
    this.items = [];
    this.pops = [];
    this.shakeMs = 0;

    this.computeViewportLayout();
    this.spawnPlayerSnake(1500);
    this.initHazards(ld);
    this.initBots(ld);

    const now = performance.now();
    this.lastTickNow = now;
    // Seed 3 initial fruits right away so gameplay starts immediately, then every 2.5s
    for (let i = 0; i < 3; i++) this.spawnFruitOrOrb(now);
    this.nextFruitSpawnAt = now + cfg.FRUIT_SPAWN_INTERVAL_MS;

    const lhud = document.getElementById('levels-hud');
    if (lhud) lhud.style.display = 'flex';
    this.updateHUD();

    isGameRunning = true;
    isPaused = false;
    isGameOver = false;
    CrazyGamesBridge.gameplayStart();
    if (typeof showInGameOnboardingIfNeeded === 'function') showInGameOnboardingIfNeeded();
    ensureGameLoop();
  },

  shiftTimers(deltaMs) {
    if (!deltaMs || deltaMs <= 0) return;
    this.nextFruitSpawnAt += deltaMs;
    if (this.comboExpiresAt > 0) this.comboExpiresAt += deltaMs;
    if (this.snake && this.snake.shieldUntil > 0) this.snake.shieldUntil += deltaMs;
    for (const it of this.items) {
      it.spawnedAt += deltaMs;
      it.expiresAt += deltaMs;
    }
    for (const b of this.bots) {
      if (b.respawnAt > 0) b.respawnAt += deltaMs;
    }
  },

  getEffectiveSpeed() {
    const cfg = this.getConfig();
    const diffMul = (cfg && cfg.SPEED_DIFFICULTY_MULTIPLIERS && cfg.SPEED_DIFFICULTY_MULTIPLIERS[currentDifficulty]) || 1.0;
    return (this.levelData ? this.levelData.snakeSpeed : 240) * diffMul;
  },

  pushPop(x, y, text, color = '#00F5A0') {
    this.pops.push({ x, y, text, color, life: 1.0 });
    if (this.pops.length > 24) this.pops.shift();
  },

  handlePlayerCrash(reason, now) {
    const cfg = this.getConfig();
    if (!this.snake || !this.active || this.finished) return;
    if (this.snake.shieldUntil > now) return;

    if (this.hasPlasmaShield) {
      this.hasPlasmaShield = false;
      this.snake.shieldUntil = now + 1200;
      this.shakeMs = 180;
      // Bounce gently back inside if near wall
      const pad = this.snake.radius + 10;
      this.snake.x = Math.max(pad, Math.min(this.fieldW - pad, this.snake.x));
      this.snake.y = Math.max(pad, Math.min(this.fieldH - pad, this.snake.y));
      this.snake.angle = Math.atan2(this.fieldH * 0.5 - this.snake.y, this.fieldW * 0.5 - this.snake.x);
      this.snake.targetAngle = this.snake.angle;
      this.pushPop(this.snake.x, this.snake.y - 16, 'SHIELD SAVED!', '#38BDF8');
      sfxReward();
      triggerHaptic(30);
      this.updateHUD();
      return;
    }

    this.lives = Math.max(0, this.lives - 1);
    this.comboCount = 1;
    this.comboExpiresAt = 0;
    this.shakeMs = 300;
    sfxPlayerDeath();
    triggerHaptic(55);
    this.updateHUD();

    if (this.lives <= 0) {
      this.finishLevel(false, 'Out of Hearts');
      return;
    }

    // Respawn at center with 2s shield + flicker, clock keeps running, length resets to starting length
    resetActiveControls();
    this.spawnPlayerSnake(cfg.RESPAWN_SHIELD_MS);
    this.pushPop(this.snake.x, this.snake.y - 20, `${this.lives} ♥ LEFT`, '#F43F5E');
  },

  finishLevel(won, failReason = '') {
    if (this.finished) return;
    this.finished = true;
    this.active = false;
    isGameOver = true;
    resetActiveControls();
    stopGameLoop();
    if (canvas) canvas.style.pointerEvents = 'none';
    CrazyGamesBridge.gameplayStop();

    const cfg = this.getConfig();
    const ld = this.levelData;
    const target = ld.targetScore;
    let stars = 0;
    if (won && this.score >= target) {
      stars = 1;
      if (this.score >= Math.round(target * cfg.STAR_THRESHOLDS.two)) stars = 2;
      if (this.score >= Math.round(target * cfg.STAR_THRESHOLDS.three)) stars = 3;
    }

    let coinsEarned = 0;
    let xpEarned = 0;
    if (won && stars > 0) {
      CrazyGamesBridge.happytime();
      sfxReward();
      const progress = this.loadProgress();
      const prevStars = progress.stars[String(ld.level)] || 0;
      if (stars > prevStars) progress.stars[String(ld.level)] = stars;
      if (ld.level < 50 && progress.unlockedLevel <= ld.level) {
        progress.unlockedLevel = ld.level + 1;
      }
      this.saveProgress(progress);

      coinsEarned = ld.rewardCoins + (stars === 3 && prevStars < 3 ? ld.threeStarBonusCoins : 0);
      xpEarned = ld.rewardXp;
      if (profileData) {
        profileData.coins = (profileData.coins || 0) + coinsEarned;
        if (typeof addProfileXp === 'function') addProfileXp(xpEarned);
        saveProfileData();
      }
    }

    // Populate Result Overlay
    const lvlLabel = document.getElementById('lr-level-label');
    const titleEl = document.getElementById('lr-title');
    const subEl = document.getElementById('lr-subtitle');
    const starsEl = document.getElementById('lr-stars');
    const scoreEl = document.getElementById('lr-score');
    const targetEl = document.getElementById('lr-target');
    const coinsEl = document.getElementById('lr-coins');
    const xpEl = document.getElementById('lr-xp');
    const nextBtn = document.getElementById('lr-next-btn');

    if (lvlLabel) lvlLabel.textContent = `LEVEL ${ld.level} • ${ld.worldName.toUpperCase()}${ld.isBoss ? ' (BOSS)' : ''}`;
    if (titleEl) {
      titleEl.textContent = won ? (stars === 3 ? 'PERFECT 3★!' : 'LEVEL COMPLETE!') : 'LEVEL FAILED';
      titleEl.style.color = won ? '#00F5A0' : '#F43F5E';
    }
    if (subEl) {
      subEl.textContent = won
        ? (ld.level === 50 ? 'You conquered all 50 levels of the Abyss!' : 'Target reached! Ready for the next stage.')
        : (failReason || 'Time ran out below the target score.');
    }
    if (starsEl) {
      starsEl.replaceChildren();
      for (let s = 1; s <= 3; s++) {
        const sp = document.createElement('span');
        sp.textContent = '★';
        if (s > stars) sp.className = 'star-off';
        starsEl.appendChild(sp);
      }
    }
    if (scoreEl) scoreEl.textContent = String(this.score);
    if (targetEl) targetEl.textContent = String(target);
    if (coinsEl) coinsEl.textContent = `+${coinsEarned}`;
    if (xpEl) xpEl.textContent = `+${xpEarned} XP`;
    if (nextBtn) nextBtn.style.display = (won && ld.level < 50) ? 'block' : 'none';

    const resOverlay = document.getElementById('level-result-overlay');
    if (resOverlay) resOverlay.style.display = 'flex';
  },

  advanceChain(entity, speed, dt) {
    entity.x += Math.cos(entity.angle) * speed * dt;
    entity.y += Math.sin(entity.angle) * speed * dt;

    // Apply Kelp Forest / Abyss directional currents
    for (const c of this.hazards.currents) {
      if (entity.x >= c.x && entity.x <= c.x + c.w && entity.y >= c.y && entity.y <= c.y + c.h) {
        entity.x += c.fx * dt;
        entity.y += c.fy * dt;
      }
    }

    const segs = entity.segments;
    if (!segs || segs.length === 0) return;
    segs[0].x = entity.x;
    segs[0].y = entity.y;
    const sp = entity.segSpacing;
    for (let i = 1; i < segs.length; i++) {
      const prev = segs[i - 1];
      const cur = segs[i];
      const dx = prev.x - cur.x;
      const dy = prev.y - cur.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        const ang = Math.atan2(dy, dx);
        cur.x = prev.x - Math.cos(ang) * sp;
        cur.y = prev.y - Math.sin(ang) * sp;
      }
    }
    while (segs.length < entity.targetSegments) {
      const last = segs[segs.length - 1];
      segs.push({ x: last.x, y: last.y });
    }
  },

  updateBotAI(bot, speed, dt, now) {
    if (!bot.alive) {
      if (now >= bot.respawnAt) {
        const fresh = this.createBot(bot.type, bot.id);
        Object.assign(bot, fresh);
      }
      return;
    }

    // Choose target: compete for nearest fruit OR intercept/pin player near walls
    let tx = this.fieldW * 0.5;
    let ty = this.fieldH * 0.5;
    let nearestFruit = null;
    let nearestDist = Infinity;
    for (const it of this.items) {
      const d = Math.hypot(it.x - bot.x, it.y - bot.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestFruit = it;
      }
    }

    const playerDist = this.snake ? Math.hypot(this.snake.x - bot.x, this.snake.y - bot.y) : Infinity;
    if (bot.type === 'encircler' && this.snake && playerDist < 340) {
      // Predict ahead of player to pin them against the nearest wall
      tx = this.snake.x + Math.cos(this.snake.angle) * 95;
      ty = this.snake.y + Math.sin(this.snake.angle) * 95;
    } else if (nearestFruit && (nearestDist < 380 || !this.snake)) {
      tx = nearestFruit.x;
      ty = nearestFruit.y;
    } else if (this.snake) {
      // Hunter aggressively cuts across player's path
      tx = this.snake.x + Math.cos(this.snake.angle) * 65;
      ty = this.snake.y + Math.sin(this.snake.angle) * 65;
    }

    let desiredAngle = Math.atan2(ty - bot.y, tx - bot.x);

    // Wall avoidance lookahead
    const lookX = bot.x + Math.cos(bot.angle) * 78;
    const lookY = bot.y + Math.sin(bot.angle) * 78;
    const margin = 52;
    if (lookX < margin || lookX > this.fieldW - margin || lookY < margin || lookY > this.fieldH - margin) {
      desiredAngle = Math.atan2(this.fieldH * 0.5 - bot.y, this.fieldW * 0.5 - bot.x);
    }

    // Avoid mines & jellyfish
    for (const m of this.hazards.mines) {
      const d = Math.hypot(m.x - bot.x, m.y - bot.y);
      if (d < m.radius + 58) {
        desiredAngle = Math.atan2(bot.y - m.y, bot.x - m.x);
        break;
      }
    }

    const diff = angleDifference(bot.angle, desiredAngle);
    const maxTurn = 4.2 * dt;
    bot.angle += Math.sign(diff) * Math.min(Math.abs(diff), maxTurn);

    this.advanceChain(bot, speed * 0.94, dt);

    // Bot wall collision -> bot dies and respawns in 3s
    const wPad = bot.radius + 4;
    if (bot.x < wPad || bot.x > this.fieldW - wPad || bot.y < wPad || bot.y > this.fieldH - wPad) {
      this.killBot(bot, now);
      return;
    }

    // Bot vs Player body collision
    if (this.snake) {
      for (let i = 2; i < this.snake.segments.length; i++) {
        const s = this.snake.segments[i];
        if (Math.hypot(bot.x - s.x, bot.y - s.y) < bot.radius + 10) {
          this.killBot(bot, now);
          return;
        }
      }
    }

    // Bot vs other bot body
    for (const other of this.bots) {
      if (other === bot || !other.alive) continue;
      for (let i = 1; i < other.segments.length; i++) {
        const s = other.segments[i];
        if (Math.hypot(bot.x - s.x, bot.y - s.y) < bot.radius + 9) {
          this.killBot(bot, now);
          return;
        }
      }
    }

    // Bot eats fruits (competes for target score!)
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (Math.hypot(bot.x - it.x, bot.y - it.y) < bot.radius + it.radius) {
        bot.targetSegments = Math.min(28, bot.targetSegments + (it.growth || 1));
        this.pushPop(it.x, it.y, 'BOT STOLE!', '#FF477E');
        this.items.splice(i, 1);
      }
    }
  },

  killBot(bot, now) {
    const cfg = this.getConfig();
    bot.alive = false;
    bot.respawnAt = now + cfg.BOT_RESPAWN_MS;
    this.pushPop(bot.x, bot.y, 'BOT CRASHED!', '#FFB020');
  },

  update(stepMs = FIXED_STEP_MS) {
    if (!this.active || this.finished || !this.snake) return;
    const cfg = this.getConfig();
    const ld = this.levelData;
    const now = performance.now();
    const dt = Math.min(0.05, stepMs / 1000);

    // 60-second countdown
    this.timeLeftMs = Math.max(0, this.timeLeftMs - stepMs);
    if (this.shakeMs > 0) this.shakeMs = Math.max(0, this.shakeMs - stepMs);

    // Spawn fruit/orb every 2.5s
    if (now >= this.nextFruitSpawnAt) {
      this.spawnFruitOrOrb(now);
      this.nextFruitSpawnAt = now + cfg.FRUIT_SPAWN_INTERVAL_MS;
    }

    // Expire old fruits
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (now >= this.items[i].expiresAt) this.items.splice(i, 1);
    }

    // Decay combo
    if (this.comboCount > 1 && now > this.comboExpiresAt) {
      this.comboCount = 1;
    }

    // Update floating pops
    for (let i = this.pops.length - 1; i >= 0; i--) {
      this.pops[i].y -= 28 * dt;
      this.pops[i].life -= 1.25 * dt;
      if (this.pops[i].life <= 0) this.pops.splice(i, 1);
    }

    // Update drifting Jellyfish (bounce off solid walls)
    for (const j of this.hazards.jellyfish) {
      j.x += j.vx * dt;
      j.y += j.vy * dt;
      j.phase += 3.2 * dt;
      const pad = j.radius + 14;
      if (j.x < pad) { j.x = pad; j.vx = Math.abs(j.vx); }
      if (j.x > this.fieldW - pad) { j.x = this.fieldW - pad; j.vx = -Math.abs(j.vx); }
      if (j.y < pad) { j.y = pad; j.vy = Math.abs(j.vy); }
      if (j.y > this.fieldH - pad) { j.y = this.fieldH - pad; j.vy = -Math.abs(j.vy); }
    }

    // Player steering: straight movement until finger moves (touch), or mouse/keyboard (desktop)
    const speed = this.getEffectiveSpeed();
    if (joystick.active) {
      if (joystick.hasDirection) {
        const sensMul = (profileData && profileData.settings ? (profileData.settings.joystickSensitivity || 100) : 100) / 100;
        this.snake.targetAngle = Math.atan2(joystick.dy, joystick.dx);
        const diff = angleDifference(this.snake.angle, this.snake.targetAngle);
        const maxTurn = 6.2 * sensMul * dt;
        this.snake.angle += Math.sign(diff) * Math.min(Math.abs(diff), maxTurn);
      } else {
        this.snake.targetAngle = this.snake.angle;
      }
    } else if (keys.left || keys.right) {
      const turnStep = 4.6 * dt;
      if (keys.left) this.snake.angle -= turnStep;
      if (keys.right) this.snake.angle += turnStep;
      this.snake.targetAngle = this.snake.angle;
    } else if (mouse.active) {
      // Map screen mouse coordinates into fixed logical playfield
      const lx = (mouse.x - this.viewOffsetX) / this.viewScale;
      const ly = (mouse.y - this.viewOffsetY) / this.viewScale;
      if (Math.hypot(lx - this.snake.x, ly - this.snake.y) > 14) {
        this.snake.targetAngle = Math.atan2(ly - this.snake.y, lx - this.snake.x);
        const diff = angleDifference(this.snake.angle, this.snake.targetAngle);
        const maxTurn = 6.0 * dt;
        this.snake.angle += Math.sign(diff) * Math.min(Math.abs(diff), maxTurn);
      }
    }

    this.advanceChain(this.snake, speed, dt);

    // Check Solid Border Wall Crash (NO wrap-around!)
    const wallPad = this.snake.radius + 4;
    if (
      this.snake.x < wallPad ||
      this.snake.x > this.fieldW - wallPad ||
      this.snake.y < wallPad ||
      this.snake.y > this.fieldH - wallPad
    ) {
      this.handlePlayerCrash('wall', now);
      if (this.finished) return;
    }

    // Check Self-Body Crash (skip head + neck segments)
    if (this.snake.shieldUntil <= now) {
      for (let i = 10; i < this.snake.segments.length; i++) {
        const s = this.snake.segments[i];
        if (Math.hypot(this.snake.x - s.x, this.snake.y - s.y) < this.snake.radius * 0.95) {
          this.handlePlayerCrash('self', now);
          if (this.finished) return;
          break;
        }
      }
    }

    // Check Hazard Crashes (Jellyfish & Volcano Mines)
    if (this.snake.shieldUntil <= now) {
      for (const j of this.hazards.jellyfish) {
        if (Math.hypot(this.snake.x - j.x, this.snake.y - j.y) < this.snake.radius + j.radius - 4) {
          this.handlePlayerCrash('jellyfish', now);
          if (this.finished) return;
          break;
        }
      }
    }
    if (this.snake.shieldUntil <= now) {
      for (const m of this.hazards.mines) {
        if (Math.hypot(this.snake.x - m.x, this.snake.y - m.y) < this.snake.radius + m.radius - 3) {
          this.handlePlayerCrash('mine', now);
          if (this.finished) return;
          break;
        }
      }
    }

    // Update Bots & Check Player vs Bot Body Crash
    for (const bot of this.bots) {
      this.updateBotAI(bot, speed, dt, now);
      if (bot.alive && this.snake && this.snake.shieldUntil <= now) {
        for (let i = 0; i < bot.segments.length; i++) {
          const s = bot.segments[i];
          if (Math.hypot(this.snake.x - s.x, this.snake.y - s.y) < this.snake.radius + 10) {
            this.handlePlayerCrash('bot', now);
            if (this.finished) return;
            break;
          }
        }
      }
    }

    // Player Fruit & Orb Collection
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (Math.hypot(this.snake.x - it.x, this.snake.y - it.y) < this.snake.radius + it.radius + 4) {
        if (now < this.comboExpiresAt) {
          this.comboCount = Math.min(4, this.comboCount + 1);
        } else {
          this.comboCount = 1;
        }
        this.comboExpiresAt = now + 3500;
        const comboMul = 1 + (this.comboCount - 1) * 0.25;
        const pts = Math.round(it.points * comboMul);
        this.score += pts;
        this.snake.targetSegments = Math.min(45, this.snake.targetSegments + (it.growth || 1));
        if (typeof triggerSnakeEatVisual === 'function') {
          triggerSnakeEatVisual(this.snake, it.color || '#00F5A0', it.kind === 'gold' || it.kind === 'plasma' ? 1.25 : 1.0);
        }

        if (it.kind === 'plasma') {
          this.hasPlasmaShield = true;
          sfxReward();
          this.pushPop(it.x, it.y, `+${pts} 💠 SHIELD`, '#38BDF8');
        } else if (it.kind === 'gold') {
          sfxEat();
          this.pushPop(it.x, it.y, `+${pts} ★`, '#FFB020');
        } else {
          if (typeof sfxEatFruit === 'function') sfxEatFruit(it.fruitType);
          else sfxEat();
          this.pushPop(it.x, it.y, `+${pts}`, it.color);
        }
        triggerHaptic(12);
        this.items.splice(i, 1);

        if (!this.targetReached && this.score >= ld.targetScore) {
          this.targetReached = true;
          this.pushPop(this.snake.x, this.snake.y - 26, 'TARGET REACHED! GO FOR 3★!', '#00F5A0');
          CrazyGamesBridge.happytime();
          sfxReward();
        }
        // Complete early with 3 stars if player hits 3-star threshold (+35%)!
        if (this.score >= Math.round(ld.targetScore * cfg.STAR_THRESHOLDS.three)) {
          this.updateHUD();
          this.finishLevel(true);
          return;
        }
      }
    }

    // Check 60s countdown completion
    if (this.timeLeftMs <= 0) {
      this.updateHUD();
      if (this.score >= ld.targetScore) {
        this.finishLevel(true);
      } else {
        this.finishLevel(false, 'Time ran out below target score.');
      }
      return;
    }

    this.updateHUD();
  },

  updateHUD() {
    const ld = this.levelData;
    if (!ld) return;
    const lvlNumEl = document.getElementById('lhud-level-num');
    const worldEl = document.getElementById('lhud-world-name');
    const timerEl = document.getElementById('lhud-timer');
    const scoreEl = document.getElementById('lhud-score');
    const targetEl = document.getElementById('lhud-target');
    const fillEl = document.getElementById('lhud-bar-fill');
    const comboEl = document.getElementById('lhud-combo');
    const heartsEl = document.getElementById('lhud-hearts');
    const shieldPip = document.getElementById('lhud-shield-pip');

    if (lvlNumEl) lvlNumEl.textContent = `LVL ${ld.level}${ld.isBoss ? ' 👑' : ''}`;
    if (worldEl) worldEl.textContent = ld.worldName;
    if (timerEl) {
      const secs = Math.ceil(this.timeLeftMs / 1000);
      timerEl.textContent = String(secs).padStart(2, '0');
      timerEl.classList.toggle('urgent', secs <= 10);
    }
    if (scoreEl) scoreEl.textContent = String(this.score);
    if (targetEl) targetEl.textContent = `/ ${ld.targetScore}`;
    if (fillEl) {
      const pct = Math.min(100, Math.round((this.score / Math.max(1, ld.targetScore)) * 100));
      fillEl.style.width = `${pct}%`;
    }
    if (comboEl) {
      comboEl.textContent = `x${this.comboCount}`;
      comboEl.classList.toggle('active', this.comboCount > 1);
    }
    if (heartsEl) {
      const spans = heartsEl.querySelectorAll('.lhud-heart');
      spans.forEach((sp, idx) => sp.classList.toggle('lost', idx >= this.lives));
    }
    if (shieldPip) {
      shieldPip.style.display = this.hasPlasmaShield ? 'inline' : 'none';
    }
  },

  renderSnake(entity, now, isPlayer) {
    if (!entity || !entity.segments || entity.segments.length === 0) return;
    const shielding = isPlayer && entity.shieldUntil > now;
    ctx.save();
    if (shielding && Math.floor(now / 90) % 2 === 0) {
      ctx.globalAlpha = 0.52;
    }

    const segs = entity.segments;
    const count = Math.min(SnakeRenderer.MAX_PTS, segs.length + 1);
    SnakeRenderer._px[0] = entity.x;
    SnakeRenderer._py[0] = entity.y;
    SnakeRenderer._pr[0] = entity.radius * 0.96;
    SnakeRenderer._pa[0] = entity.angle || 0;
    SnakeRenderer._pt[0] = 0;

    for (let i = 0; i < segs.length && (i + 1) < count; i++) {
      const progress = (i + 1) / count;
      const taperCurve = Math.pow(progress, 1.38);
      SnakeRenderer._px[i + 1] = segs[i].x;
      SnakeRenderer._py[i + 1] = segs[i].y;
      SnakeRenderer._pr[i + 1] = Math.max(entity.radius * 0.42, entity.radius * (1 - taperCurve * 0.54));
      SnakeRenderer._pa[i + 1] = entity.angle || 0;
      SnakeRenderer._pt[i + 1] = progress;
    }

    const tongueWave = ((now * 0.002 + (isPlayer ? 0 : 1.7)) % (Math.PI * 2));
    const tongueProgress = tongueWave > 5.35 ? Math.sin(((tongueWave - 5.35) / (Math.PI * 2 - 5.35)) * Math.PI) : 0;
    const lookBias = isPlayer && entity.targetAngle !== undefined
      ? Math.max(-0.6, Math.min(0.6, angleDifference(entity.angle, entity.targetAngle) * 1.4))
      : 0;

    SnakeRenderer.drawSnake(ctx, {
      count,
      palette: entity.palette || PALETTE_PLAYER,
      rarity: entity.rarity || 'common',
      headX: entity.x,
      headY: entity.y,
      headAngle: entity.angle || 0,
      headRadius: entity.radius * 1.06,
      nowMs: now,
      qualityMode: graphicsQuality === 'low' ? 'low' : 'high',
      isPlayer,
      isBoosting: false,
      isGhost: false,
      isMagnet: false,
      isProtected: shielding || (isPlayer && this.hasPlasmaShield),
      nightGlow: 0.25,
      tongueProgress,
      lookBias,
      eatPulses: entity.eatPulses
    });

    ctx.restore();
  },

  render() {
    if (!ctx) return;
    const now = performance.now();

    // Letterbox abyssal background
    ctx.save();
    ctx.fillStyle = '#040811';
    ctx.fillRect(0, 0, width, height);

    let sx = 0, sy = 0;
    if (this.shakeMs > 0) {
      const mag = (this.shakeMs / 300) * 7;
      sx = (Math.random() - 0.5) * mag * 2;
      sy = (Math.random() - 0.5) * mag * 2;
    }

    ctx.translate(this.viewOffsetX + sx, this.viewOffsetY + sy);
    ctx.scale(this.viewScale, this.viewScale);

    // CRT Playfield Interior
    ctx.fillStyle = '#081020';
    ctx.fillRect(0, 0, this.fieldW, this.fieldH);

    // Neon Grid inside CRT frame
    ctx.strokeStyle = 'rgba(0, 217, 255, 0.11)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = this.cellSize; x < this.fieldW; x += this.cellSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.fieldH);
    }
    for (let y = this.cellSize; y < this.fieldH; y += this.cellSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.fieldW, y);
    }
    ctx.stroke();

    // Subtle CRT Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let y = 0; y < this.fieldH; y += 6) {
      ctx.fillRect(0, y, this.fieldW, 2);
    }

    // Draw Kelp Currents
    for (const c of this.hazards.currents) {
      ctx.fillStyle = 'rgba(0, 245, 160, 0.12)';
      ctx.strokeStyle = 'rgba(0, 245, 160, 0.45)';
      ctx.lineWidth = 2;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeRect(c.x, c.y, c.w, c.h);
      // Animated flow arrows
      ctx.fillStyle = 'rgba(0, 245, 160, 0.65)';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const arrow = c.fx > 0 ? '»' : (c.fx < 0 ? '«' : (c.fy > 0 ? '⌄' : '⌃'));
      ctx.fillText(arrow, c.x + c.w * 0.5, c.y + c.h * 0.5);
    }

    // Draw Volcano Mines
    for (const m of this.hazards.mines) {
      const pulse = 0.8 + 0.2 * Math.sin(now * 0.008 + m.phase);
      ctx.save();
      ctx.shadowColor = 'rgba(255, 122, 24, 0.85)';
      ctx.shadowBlur = 14 * pulse;
      ctx.fillStyle = '#FF7A18';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2A0B02';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw Coral Reef Jellyfish
    for (const j of this.hazards.jellyfish) {
      const bob = 1 + 0.1 * Math.sin(j.phase);
      ctx.save();
      ctx.shadowColor = 'rgba(255, 71, 126, 0.85)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(255, 71, 126, 0.85)';
      ctx.beginPath();
      ctx.arc(j.x, j.y, j.radius * bob, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FDA4AF';
      ctx.lineWidth = 2;
      for (let t = -1; t <= 1; t++) {
        ctx.beginPath();
        ctx.moveTo(j.x + t * 8, j.y);
        ctx.lineTo(j.x + t * 10 + Math.sin(j.phase + t) * 4, j.y + 14);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw Fruits & Gold/Blue Orbs
    for (const it of this.items) {
      const remaining = it.expiresAt - now;
      if (remaining < 2000 && Math.floor(now / 120) % 2 === 0) continue; // blink warning
      if (it.kind === 'fruit' && typeof getFruitSprite === 'function') {
        const sprite = getFruitSprite(it.fruitType);
        if (sprite) {
          const sz = 36;
          ctx.drawImage(sprite, it.x - sz / 2, it.y - sz / 2, sz, sz);
          continue;
        }
      }
      ctx.save();
      ctx.shadowColor = it.glow;
      ctx.shadowBlur = 16;
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(it.x, it.y, it.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(it.x - 4, it.y - 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw Bots
    for (const bot of this.bots) {
      if (bot.alive) this.renderSnake(bot, now, false);
    }

    // Draw Player Snake
    this.renderSnake(this.snake, now, true);

    // Draw Floating Score Pops
    ctx.font = '900 16px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const p of this.pops) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    // Solid Glowing Double Cyan Border Wall (CRT Frame)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 217, 255, 0.85)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = '#00D9FF';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, this.fieldW - 4, this.fieldH - 4);
    ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(125, 249, 255, 0.72)';
    ctx.lineWidth = 2;
    ctx.strokeRect(9, 9, this.fieldW - 18, this.fieldH - 18);
    ctx.restore();

    ctx.restore();
  }
};

// ============================================================
// §10  LOOP & STARTUP
// ============================================================
let gameLoopRafId = 0;

function stopGameLoop() {
  if (gameLoopRafId) {
    cancelAnimationFrame(gameLoopRafId);
    gameLoopRafId = 0;
  }
  loopActive = false;
}

function gameLoop() {
  gameLoopRafId = 0;
  if (!isGameRunning || isPaused || isGameOver) {
    loopActive = false;
    return;
  }
  try {
    const now = performance.now();
    const elapsed = Math.min(100, Math.max(0, now - lastLoopFrameTime));
    lastLoopFrameTime = now;
    updateFrameMetrics(now, elapsed);
    fixedStepAccumulator = Math.min(fixedStepAccumulator + elapsed, FIXED_STEP_MS * 5);
    let updateSteps = 0;
    while (fixedStepAccumulator >= FIXED_STEP_MS && updateSteps < 5) {
      if (gameMode === 'levels') {
        LevelsMode.update(FIXED_STEP_MS);
      } else {
        update(FIXED_STEP_MS);
      }
      fixedStepAccumulator -= FIXED_STEP_MS;
      updateSteps++;
    }
    if (gameMode === 'levels') {
      LevelsMode.render();
    } else {
      render();
    }
  } catch (err) {
    console.error('gameLoop error:', err);
  }
  if (isGameRunning && !isPaused && !isGameOver) {
    gameLoopRafId = requestAnimationFrame(gameLoop);
  } else {
    loopActive = false;
  }
}

function ensureGameLoop() {
  if (loopActive && gameLoopRafId) return;
  loopActive = true;
  lastLoopFrameTime = performance.now();
  fixedStepAccumulator = 0;
  gameLoopRafId = requestAnimationFrame(gameLoop);
}

window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
  if (canvas) canvas.style.pointerEvents = 'none';
  ctx = canvas.getContext('2d');
  hudEl = document.getElementById('hud');
  lbEl = document.getElementById('leaderboard');
  menuScreenEl = document.getElementById('menu-screen');
  pauseOverlayEl = document.getElementById('pause-overlay');
  statTimeEl = document.getElementById('stat-time');
  statLengthEl = document.getElementById('stat-length');
  statRankEl = document.getElementById('stat-rank');
  statKillsEl = document.getElementById('stat-kills');
  killMessageEl = document.getElementById('kill-message');
  lbListEl = document.getElementById('lb-list');
  overlayEl = document.getElementById('overlay');
  finalTimeEl = document.getElementById('final-time');
  bestTimeEl = document.getElementById('best-time');
  finalLengthEl = document.getElementById('final-length');
  bestLengthEl = document.getElementById('best-length');
  muteBtnEl = document.getElementById('mute-btn');
  diffNameLabel = document.getElementById('diff-name-label');
  menuBestTime = document.getElementById('menu-best-time');
  menuBestLen = document.getElementById('menu-best-len');
  cardDiffLabel = document.getElementById('card-diff-label');
  cycleIconEl = document.getElementById('cycle-icon');
  cycleNameEl = document.getElementById('cycle-name');
  rareIndicatorEl = document.getElementById('rare-indicator');
  joystickEl = document.getElementById('touch-joystick');
  joystickThumbEl = document.getElementById('joystick-thumb');
  skinsScreenEl = document.getElementById('skins-screen');
  skinListEl = document.getElementById('skin-list');
  skinUnlockToastEl = document.getElementById('skin-unlock-toast');
  settingsScreenEl = document.getElementById('settings-screen');
  fpsCounterEl = document.getElementById('fps-counter');
  fpsToggleEl = document.getElementById('fps-toggle');

  powerupIndicatorEl = document.getElementById('powerup-indicator');

  isMuted = safeStorageGet('neonSerpents_muted') === '1';
  loadProfileData();
  if (muteBtnEl) muteBtnEl.textContent = isMuted ? '🔇' : '🔊';
  if (safeStorageGet('serpentRun_lbCollapsed') === '1' && lbEl) {
    leaderboardCollapsed = true;
    lbEl.classList.add('collapsed');
    const lbBtn = document.getElementById('lb-toggle-btn');
    if (lbBtn) lbBtn.setAttribute('aria-expanded', 'false');
  }

  onResize();
  initializeGraphicsSettings();
  initRenderCaches();
  initPlankton();
  initSnake();
  initBots();
  initFood();
  initInput();
  updateMenuRecordsDisplay();
  renderSkinMenu();
  refreshMenuHeaderUI();
  startMenuPreviewTicker();
  AdManager.init().then(() => {
    CrazyGamesBridge.loadingStop();
  });
});

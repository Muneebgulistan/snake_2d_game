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

let currentArenaLevel = 1;
let matchFruitScore = 0;
const fruitSpriteCache = new Map();
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

function drawCachedGlow(color, x, y, radius, opacity = 1) {
  const size = radius * 4;
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * opacity;
  ctx.drawImage(getGlowSprite(color), x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = previousAlpha;
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
  if (envEl) {
    envEl.textContent = (typeof AdManager !== 'undefined' && typeof AdManager.getEnvironment === 'function')
      ? AdManager.getEnvironment()
      : (GAME_CONFIG.ADMOB ? GAME_CONFIG.ADMOB.environment : 'development');
  }
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
    palette: {
      head: '#10b981', bodyStart: '#059669', bodyEnd: '#047857',
      scale: 'rgba(167, 243, 208, 0.35)', glow: 'rgba(16, 185, 129, 0.45)',
      eyeIris: '#047857', eyePupil: '#022c22', tongue: '#f87171'
    }
  },
  {
    name: 'Hydra',
    palette: {
      head: '#c084fc', bodyStart: '#9333ea', bodyEnd: '#6b21a8',
      scale: 'rgba(233, 213, 255, 0.35)', glow: 'rgba(192, 132, 252, 0.45)',
      eyeIris: '#6b21a8', eyePupil: '#2e1065', tongue: '#fb7185'
    }
  },
  {
    name: 'Cobra',
    palette: {
      head: '#f59e0b', bodyStart: '#d97706', bodyEnd: '#b45309',
      scale: 'rgba(254, 240, 138, 0.35)', glow: 'rgba(245, 158, 11, 0.45)',
      eyeIris: '#b45309', eyePupil: '#451a03', tongue: '#f43f5e'
    }
  },
  {
    name: 'Abyss',
    palette: {
      head: '#f43f5e', bodyStart: '#e11d48', bodyEnd: '#9f1239',
      scale: 'rgba(254, 205, 211, 0.35)', glow: 'rgba(244, 63, 94, 0.45)',
      eyeIris: '#9f1239', eyePupil: '#4c0519', tongue: '#fda4af'
    }
  },
  {
    name: 'Phantom',
    palette: {
      head: '#f472b6', bodyStart: '#db2777', bodyEnd: '#9d174d',
      scale: 'rgba(251, 207, 232, 0.35)', glow: 'rgba(244, 114, 182, 0.45)',
      eyeIris: '#9d174d', eyePupil: '#500724', tongue: '#a78bfa'
    }
  },
  {
    name: 'Apex',
    palette: {
      head: '#a3e635', bodyStart: '#65a30d', bodyEnd: '#3f6212',
      scale: 'rgba(217, 249, 157, 0.35)', glow: 'rgba(163, 230, 53, 0.45)',
      eyeIris: '#3f6212', eyePupil: '#1a2e05', tongue: '#f43f5e'
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
  { id: 'survive_180', tier: 'daily', difficulty: 'Normal', rarity: 'uncommon', title: 'Deep Survivor', desc: 'Survive 3 minutes (180s) total in the arena today', type: 'survive', target: 180, rewardCoins: 160, rewardXp: 110 },
  { id: 'kill_5', tier: 'daily', difficulty: 'Normal', rarity: 'rare', title: 'Coil Trapper', desc: 'Eliminate 5 rival snakes today', type: 'kills', target: 5, rewardCoins: 175, rewardXp: 120 },
  { id: 'len_120', tier: 'daily', difficulty: 'Normal', rarity: 'rare', title: 'Colossus', desc: 'Reach a snake length of 120 in a single run', type: 'max_length', target: 120, rewardCoins: 190, rewardXp: 130 },
  { id: 'powerup_3', tier: 'daily', difficulty: 'Easy', rarity: 'uncommon', title: 'Power Collector', desc: 'Pick up 3 map power-ups today', type: 'powerups', target: 3, rewardCoins: 150, rewardXp: 100 },
  { id: 'dash_10', tier: 'daily', difficulty: 'Easy', rarity: 'common', title: 'High Voltage', desc: 'Activate the Dash ability 10 times today', type: 'dash', target: 10, rewardCoins: 135, rewardXp: 90 },
  { id: 'nodie_90', tier: 'daily', difficulty: 'Normal', rarity: 'uncommon', title: 'Untouchable', desc: 'Survive at least 90 seconds in one match', type: 'single_survive', target: 90, rewardCoins: 165, rewardXp: 110 },
  { id: 'king_1', tier: 'daily', difficulty: 'Hard', rarity: 'epic', title: 'Regicide', desc: 'Eliminate 1 crowned King Snake today', type: 'king_kills', target: 1, rewardCoins: 240, rewardXp: 160 },
  { id: 'matches_3', tier: 'daily', difficulty: 'Easy', rarity: 'common', title: 'Arena Regular', desc: 'Play 3 matches in any difficulty mode', type: 'matches', target: 3, rewardCoins: 140, rewardXp: 95 },
  { id: 'coins_200', tier: 'daily', difficulty: 'Normal', rarity: 'uncommon', title: 'Treasure Hunter', desc: 'Earn 200 coins from matches or rewards today', type: 'coins_earned', target: 200, rewardCoins: 170, rewardXp: 115 }
];

// B. WEEKLY MISSIONS POOL (7 Definitions — 5 Rotate Weekly by ISO Week)
const WEEKLY_MISSION_POOL = [
  { id: 'wk_kill_50', tier: 'weekly', difficulty: 'Hard', rarity: 'epic', title: 'Swarm Decimator', desc: 'Eliminate 50 enemy snakes this week', type: 'kills', target: 50, rewardCoins: 650, rewardXp: 450 },
  { id: 'wk_survive_20m', tier: 'weekly', difficulty: 'Normal', rarity: 'rare', title: 'Abyssal Endurance', desc: 'Survive 20 minutes (1,200s) total across matches', type: 'survive', target: 1200, rewardCoins: 600, rewardXp: 420 },
  { id: 'wk_len300_3x', tier: 'weekly', difficulty: 'Hard', rarity: 'epic', title: 'Triple Titan', desc: 'Reach length 150+ in 3 separate matches this week', type: 'matches_len150', target: 3, rewardCoins: 700, rewardXp: 500 },
  { id: 'wk_top3_10', tier: 'weekly', difficulty: 'Normal', rarity: 'rare', title: 'Podium Dominator', desc: 'Finish in the Top 3 arena rank in 10 matches', type: 'top3_matches', target: 10, rewardCoins: 680, rewardXp: 480 },
  { id: 'wk_powerups_30', tier: 'weekly', difficulty: 'Normal', rarity: 'rare', title: 'Relic Overcharge', desc: 'Collect 30 map power-ups this week', type: 'powerups', target: 30, rewardCoins: 580, rewardXp: 400 },
  { id: 'wk_kings_5', tier: 'weekly', difficulty: 'Hard', rarity: 'legendary', title: 'Crown Breaker', desc: 'Defeat 5 crowned King Snakes this week', type: 'king_kills', target: 5, rewardCoins: 850, rewardXp: 600 },
  { id: 'wk_dailies_12', tier: 'weekly', difficulty: 'Normal', rarity: 'epic', title: 'Dedicated Striker', desc: 'Claim 12 daily missions this week', type: 'dailies_claimed', target: 12, rewardCoins: 750, rewardXp: 520 }
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
  { id: 'first_match', category: 'survival', rarity: 'bronze', icon: '🌊', title: 'First Dive', desc: 'Complete your first match in Serpent Run', stat: 'totalMatches', target: 1, rewardCoins: 80, rewardXp: 50 },
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
  { id: 'hard_2m', category: 'hardmode', rarity: 'silver', icon: '🔥', title: 'Trial by Fire', desc: 'Survive 2 minutes (120s) in Hard Mode (50 bots)', stat: 'hardSurvivalTime', target: 120, rewardCoins: 320, rewardXp: 220 },
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
    if (isProd && this.isValidAdUnitId(prodCandidate)) {
      return prodCandidate;
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
      if (removed) {
        slot.style.display = 'none';
      } else if (isNative) {
        slot.style.display = 'flex';
        slot.style.opacity = '0.01';
        slot.style.pointerEvents = 'none';
      } else {
        slot.style.display = 'flex';
        slot.style.opacity = '1';
        slot.style.pointerEvents = 'auto';
      }
    });
  },
  async showRewardedAd({ placement, onReward, onDismiss }) {
    // Rule 10: Never show or interrupt during active unpaused gameplay
    if (isGameRunning && !isPaused && !isGameOver) return;
    if (this.adInProgress) return;
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
    if (!profileData || profileData.removeForcedAds) return;
    // Never show during active gameplay or if another ad is active
    if ((isGameRunning && !isPaused && !isGameOver) || this.adInProgress) return;
    const cfg = this.getConfig();
    profileData.ads.matchesSinceInterstitial = (profileData.ads.matchesSinceInterstitial || 0) + 1;
    const now = Date.now();
    const cooldownOk = (now - (profileData.ads.lastInterstitialAt || 0)) >= (cfg.interstitialCooldownMs || 90000);
    const freqOk = profileData.ads.matchesSinceInterstitial >= (cfg.interstitialEveryMatches || 3);
    saveProfileData();

    if (!freqOk || !cooldownOk || !navigator.onLine || !this.canRequestAds) return;

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

function renderSkinMenu() {
  if (!skinListEl) return;
  const shopCoinsEl = document.getElementById('shop-coins-val');
  if (shopCoinsEl && profileData) shopCoinsEl.textContent = profileData.coins.toLocaleString();
  const counterEl = document.getElementById('skin-collection-counter');
  if (counterEl) counterEl.textContent = `${unlockedSkinIds.size} / ${SKINS.length} Unlocked • Purely cosmetic, identical hitboxes`;
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

  skinListEl.innerHTML = filtered.map(skin => {
    const unlocked = unlockedSkinIds.has(skin.id);
    const isTrial = !unlocked && trialSkinId === skin.id;
    const selected = selectedSkinId === skin.id;
    const isPreviewing = previewSkinId === skin.id;
    const rarity = skin.rarity || 'common';
    const price = skin.price || 250;
    const prog = getSkinUnlockProgress(skin);
    const state = selected ? 'Equipped' : unlocked ? 'Owned' : isTrial ? '1-Match Trial' : `${price}c`;

    let actionsHtml = '';
    if (unlocked || isTrial) {
      actionsHtml = `<div class="skin-actions-row">
        <button type="button" class="skin-act-btn equip" data-action="select-skin" data-arg="${skin.id}">${selected ? '✓ Equipped' : 'Equip'}</button>
      </div>`;
    } else {
      actionsHtml = `<div class="skin-actions-row">
        <button type="button" class="skin-act-btn buy" data-action="buy-skin" data-arg="${skin.id}">Buy (${price}c)</button>
        <button type="button" class="skin-act-btn trial" data-action="trial-skin" data-arg="${skin.id}">▶ Try Free</button>
      </div>`;
    }

    return `<div class="skin-card ${selected ? 'selected' : ''} ${isPreviewing ? 'previewing' : ''} ${(unlocked || isTrial) ? '' : 'locked'}" data-skin-id="${skin.id}" data-action="preview-skin" data-arg="${skin.id}" style="--skin-light:${skin.palette.head};--skin-dark:${skin.palette.bodyEnd};">
      <div class="skin-name-row">
        <span>${skin.name}</span>
        <span class="rarity-badge rarity-${rarity}">${rarity}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span class="skin-preview" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <span class="skin-state">${state}</span>
      </div>
      <span class="skin-progress">${unlocked ? (skin.desc || 'Ready to equip') : prog.text}</span>
      <div class="skin-mini-bar"><div class="skin-mini-bar-fill" style="width:${unlocked ? 100 : prog.pct}%"></div></div>
      ${actionsHtml}
    </div>`;
  }).join('');
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
  }
  if (pauseOverlayEl) pauseOverlayEl.style.display = 'none';
  document.querySelectorAll('.subscreen').forEach(el => { el.style.display = 'none'; });
  activeSubscreenId = 'settings-screen';
  const target = document.getElementById(activeSubscreenId);
  if (target) {
    target.style.display = 'flex';
    const backBtn = target.querySelector('.back-pill');
    if (backBtn) backBtn.textContent = '← Resume Game';
  }
  updateSettingsUI();
}

function openScreen(name) {
  settingsOpenedFromGame = false;
  if (menuScreenEl) menuScreenEl.style.display = 'none';
  document.querySelectorAll('.subscreen').forEach(el => { el.style.display = 'none'; });
  activeSubscreenId = `${name}-screen`;
  const target = document.getElementById(activeSubscreenId);
  if (target) {
    target.style.display = 'flex';
    if (name === 'settings') {
      const backBtn = target.querySelector('.back-pill');
      if (backBtn) backBtn.textContent = '← Menu';
    }
  }
  AdManager.refreshBannerVisibility();
  AdManager.syncNativeBannerForScreen(name);
  if (name === 'skins') {
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
      shiftActiveTimersByPauseDuration(performance.now() - pauseStartTime);
      lastLoopFrameTime = performance.now();
      fixedStepAccumulator = 0;
      if (pauseOverlayEl) pauseOverlayEl.style.display = 'none';
      ensureGameLoop();
    }
    return;
  }
  settingsOpenedFromGame = false;
  if (menuScreenEl) menuScreenEl.style.display = 'flex';
  refreshMenuHeaderUI();
}

function selectSkin(skinId) {
  if (!unlockedSkinIds.has(skinId) && trialSkinId !== skinId) return;
  selectedSkinId = skinId;
  previewSkinId = skinId;
  if (unlockedSkinIds.has(skinId)) safeStorageSet(SELECTED_SKIN_KEY, selectedSkinId);
  player.palette = getSkin().palette;
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
      return `<div class="mission-card tier-elite ${(done && !claimed) ? 'ready-claim' : ''}">
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

  listEl.innerHTML = items.map(item => {
    const def = pool.find(m => m.id === item.id);
    if (!def) return '';
    const prog = Math.min(def.target, item.progress || 0);
    const pct = Math.min(100, Math.round((prog / def.target) * 100));
    const done = prog >= def.target;
    const btnLabel = item.claimed ? '✓ Claimed' : done ? 'Claim Reward' : 'In Progress';
    return `<div class="mission-card ${tierClass} ${(done && !item.claimed) ? 'ready-claim' : ''}">
      <div class="mission-info">
        <div class="mission-head-row">
          <span class="mission-title">${def.title}</span>
          <span class="rarity-badge rarity-${def.rarity || 'common'}">${def.difficulty || 'Normal'}</span>
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

    return `<div class="mission-card ${(done && !claimed) ? 'ready-claim' : ''}">
      <div class="ach-badge-icon">${isHiddenSecret ? '❓' : (a.icon || '🏆')}</div>
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
  const gridEl = document.getElementById('career-stats-grid');
  if (!gridEl) return;
  const s = profileData.stats;
  const items = [
    { label: 'Player Level', val: `Level ${profileData.level}` },
    { label: 'Best Match Score', val: (s.bestScore || 0).toLocaleString() },
    { label: 'Best Survival Time', val: formatTime(s.bestSurvivalTime || 0) },
    { label: 'Highest Snake Length', val: (s.highestLength || INITIAL_SEGMENTS).toLocaleString() },
    { label: 'Total Matches Played', val: (s.totalMatches || 0).toLocaleString() },
    { label: 'Total Enemy Kills', val: (s.totalKills || 0).toLocaleString() },
    { label: 'Best Single-Match Kills', val: (s.singleMatchKills || 0).toLocaleString() },
    { label: 'King Snakes Slain', val: (s.kingKills || 0).toLocaleString() },
    { label: 'Total Food Eaten', val: (s.totalFoodEaten || 0).toLocaleString() },
    { label: 'Rare Glowing Orbs', val: (s.rareOrbsCollected || 0).toLocaleString() },
    { label: 'Skins Unlocked', val: `${unlockedSkinIds.size} / ${SKINS.length}` },
    { label: 'Lifetime Coins Earned', val: (s.totalCoinsEarned || 0).toLocaleString() },
    { label: 'Best Time (Easy)', val: formatTime(getBestTime('easy')) },
    { label: 'Best Time (Medium)', val: formatTime(getBestTime('medium')) },
    { label: 'Best Time (Hard)', val: formatTime(getBestTime('hard')) }
  ];
  gridEl.innerHTML = items.map(it => `
    <div class="score-row">
      <span class="label">${it.label}</span>
      <span class="val" style="font-size:20px;">${it.val}</span>
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
  drawMenuSnakePreview();
}

let menuPreviewAnimId = 0;
let menuPreviewPhase = 0;

function drawSnakePreviewOnCanvas(pCanvas, skin, phase) {
  if (!pCanvas || !skin) return;
  const pCtx = pCanvas.getContext('2d');
  const w = pCanvas.width;
  const h = pCanvas.height;
  pCtx.clearRect(0, 0, w, h);

  const pal = skin.palette;
  const segCount = 18;
  const startX = 34;
  const endX = w - 48;

  // Ambient aura trail particles for Epic/Legendary/Mythic skins
  if (pal.trailEffect) {
    for (let k = 0; k < 7; k++) {
      const px = startX + ((k * 43 + phase * 18) % (endX - startX));
      const py = h / 2 + Math.sin(phase * 1.3 + k * 1.7) * (h * 0.28);
      pCtx.save();
      pCtx.globalAlpha = 0.45;
      pCtx.fillStyle = pal.trailEffect === 'rainbow' ? `hsl(${(phase * 60 + k * 50) % 360}, 90%, 60%)` : (pal.scale || pal.head);
      pCtx.beginPath();
      pCtx.arc(px, py, 2.5 + (k % 3), 0, Math.PI * 2);
      pCtx.fill();
      pCtx.restore();
    }
  }

  for (let i = segCount - 1; i >= 0; i--) {
    const t = i / segCount;
    const x = endX - t * (endX - startX);
    const y = h / 2 + Math.sin(phase - i * 0.44) * (h * 0.14);
    let r = Math.max(5, (h * 0.125) * (1 - t * 0.52));
    if (pal.headShape === 'cobra' && i < 5) {
      r *= 1 + Math.sin((i / 5) * Math.PI) * 0.55;
    }

    pCtx.beginPath();
    if (pal.pattern === 'rainbow_cycle') {
      pCtx.fillStyle = `hsl(${(i * 22 - phase * 40) % 360}, 90%, 58%)`;
    } else if (pal.pattern === 'bee_stripes') {
      pCtx.fillStyle = i % 2 === 0 ? '#FACC15' : '#18181B';
    } else if (pal.pattern === 'candy_stripes') {
      pCtx.fillStyle = i % 2 === 0 ? '#F43F5E' : '#FFFFFF';
    } else if (pal.pattern === 'coral_tricolor') {
      pCtx.fillStyle = i % 3 === 0 ? '#111827' : i % 3 === 1 ? '#FACC15' : '#DC2626';
    } else {
      pCtx.fillStyle = interpolateColor(pal.bodyStart, pal.bodyEnd, t);
    }

    if (pal.headShape === 'pixel') {
      pCtx.fillRect(x - r, y - r, r * 2, r * 2);
    } else {
      pCtx.arc(x, y, r, 0, Math.PI * 2);
      pCtx.fill();
    }

    // Procedural body markings on preview segments
    if (pal.pattern === 'hotdog_mustard' && i > 0) {
      pCtx.fillStyle = '#FACC15';
      pCtx.beginPath();
      pCtx.arc(x, y + Math.sin(i * 0.9 + phase) * 3, r * 0.35, 0, Math.PI * 2);
      pCtx.fill();
    } else if (pal.pattern === 'pizza_pepperoni' && i % 2 === 1) {
      pCtx.fillStyle = '#DC2626';
      pCtx.beginPath();
      pCtx.arc(x, y, r * 0.45, 0, Math.PI * 2);
      pCtx.fill();
    } else if (pal.pattern === 'donut_sprinkles' && i % 2 === 0) {
      pCtx.fillStyle = ['#38BDF8', '#FDE047', '#00F5A0', '#FFFFFF'][i % 4];
      pCtx.fillRect(x - 2, y - 2, 5, 2.5);
    } else if (pal.pattern === 'banana_spots' && i % 3 === 1) {
      pCtx.fillStyle = '#713F12';
      pCtx.beginPath();
      pCtx.arc(x, y, r * 0.32, 0, Math.PI * 2);
      pCtx.fill();
    } else if (pal.pattern === 'disco_tiles' || pal.pattern === 'glitch_blocks' || pal.pattern === 'matrix_code') {
      pCtx.fillStyle = pal.pattern === 'matrix_code' ? '#00F5A0' : `hsl(${(i * 47 + phase * 60) % 360}, 90%, 65%)`;
      pCtx.fillRect(x - r * 0.4, y - r * 0.4, r * 0.8, r * 0.8);
    } else if (i % 2 === 0 && pal.scale) {
      pCtx.fillStyle = pal.scale;
      pCtx.beginPath();
      pCtx.arc(x, y, r * 0.34, 0, Math.PI * 2);
      pCtx.fill();
    }

    // Bee translucent wings on segment 3
    if (pal.headShape === 'bee' && i === 3) {
      pCtx.save();
      pCtx.fillStyle = 'rgba(224, 242, 254, 0.65)';
      pCtx.beginPath();
      pCtx.ellipse(x, y - r * 1.35, r * 0.9, r * 0.55, -0.3, 0, Math.PI * 2);
      pCtx.ellipse(x, y + r * 1.35, r * 0.9, r * 0.55, 0.3, 0, Math.PI * 2);
      pCtx.fill();
      pCtx.restore();
    }
  }

  // Head & specialty anatomy
  const headY = h / 2 + Math.sin(phase) * (h * 0.14);
  const headX = endX + 2;
  const hr = Math.max(12, h * 0.135);

  if (pal.headShape === 'duck') {
    pCtx.fillStyle = '#FB923C';
    pCtx.beginPath();
    pCtx.ellipse(headX + hr * 0.95, headY, hr * 0.65, hr * 0.45, 0, 0, Math.PI * 2);
    pCtx.fill();
  } else if (pal.headShape === 'chicken') {
    pCtx.fillStyle = '#EF4444';
    pCtx.beginPath();
    pCtx.arc(headX - 2, headY - hr * 0.85, hr * 0.38, 0, Math.PI * 2);
    pCtx.arc(headX + 4, headY - hr * 0.85, hr * 0.35, 0, Math.PI * 2);
    pCtx.fill();
    pCtx.fillStyle = '#F59E0B';
    pCtx.beginPath();
    pCtx.moveTo(headX + hr, headY - 4);
    pCtx.lineTo(headX + hr * 1.65, headY);
    pCtx.lineTo(headX + hr, headY + 4);
    pCtx.closePath();
    pCtx.fill();
  } else if (pal.headShape === 'dragon' || pal.headShape === 'samurai' || pal.headShape === 'phoenix' || pal.headShape === 'leviathan') {
    pCtx.strokeStyle = pal.scale || '#FACC15';
    pCtx.lineWidth = 3;
    pCtx.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) {
      pCtx.beginPath();
      pCtx.moveTo(headX - 3, headY + s * hr * 0.55);
      pCtx.lineTo(headX - hr * 1.25, headY + s * hr * 1.25);
      pCtx.stroke();
    }
  }

  pCtx.beginPath();
  pCtx.fillStyle = pal.head;
  if (pal.headShape === 'pixel') {
    pCtx.fillRect(headX - hr, headY - hr * 0.85, hr * 2, hr * 1.7);
  } else if (pal.headShape === 'crystal' || pal.headShape === 'arrow') {
    pCtx.moveTo(headX + hr * 1.25, headY);
    pCtx.lineTo(headX - hr * 0.4, headY - hr * 0.95);
    pCtx.lineTo(headX - hr, headY);
    pCtx.lineTo(headX - hr * 0.4, headY + hr * 0.95);
    pCtx.closePath();
    pCtx.fill();
  } else {
    pCtx.ellipse(headX, headY, hr * 1.15, hr * 0.9, 0, 0, Math.PI * 2);
    pCtx.fill();
  }

  // Specialty Eyes
  if (pal.eyeStyle === 'sunglasses') {
    pCtx.fillStyle = '#090D16';
    pCtx.fillRect(headX + 1, headY - hr * 0.72, hr * 0.55, hr * 0.55);
    pCtx.fillRect(headX + 1, headY + hr * 0.17, hr * 0.55, hr * 0.55);
    pCtx.strokeStyle = '#FFFFFF';
    pCtx.lineWidth = 1.5;
    pCtx.strokeRect(headX + 1, headY - hr * 0.72, hr * 0.55, hr * 0.55);
    pCtx.strokeRect(headX + 1, headY + hr * 0.17, hr * 0.55, hr * 0.55);
  } else if (pal.eyeStyle === 'visor') {
    pCtx.fillStyle = pal.eyeIris || '#00D9FF';
    pCtx.fillRect(headX + 2, headY - hr * 0.65, hr * 0.45, hr * 1.3);
  } else {
    for (let s = -1; s <= 1; s += 2) {
      const ey = headY + s * (pal.headShape === 'frog' ? hr * 0.78 : hr * 0.48);
      const er = pal.eyeStyle === 'googly' || pal.eyeStyle === 'cute' ? hr * 0.36 : hr * 0.28;
      pCtx.beginPath();
      pCtx.fillStyle = pal.eyeStyle === 'glowing' ? (pal.eyeIris || '#00D9FF') : '#FFFFFF';
      pCtx.arc(headX + 4, ey, er, 0, Math.PI * 2);
      pCtx.fill();
      pCtx.beginPath();
      pCtx.fillStyle = pal.eyePupil || '#000000';
      const offY = pal.eyeStyle === 'derp' ? s * 1.6 : (pal.eyeStyle === 'googly' ? Math.sin(phase * 2 + s) * 1.4 : 0);
      if (pal.eyeStyle === 'slit') {
        pCtx.ellipse(headX + 5, ey, er * 0.75, er * 0.28, 0, 0, Math.PI * 2);
      } else {
        pCtx.arc(headX + 5, ey + offY, er * 0.5, 0, Math.PI * 2);
      }
      pCtx.fill();
    }
  }
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
    if (!isGameRunning) {
      if (menuScreenEl && menuScreenEl.style.display !== 'none') {
        drawMenuSnakePreview();
      } else if (activeSubscreenId === 'skins-screen') {
        menuPreviewPhase += 0.085;
        drawShowcaseSnakePreview();
      }
    }
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
  const outerRing = Math.min(WORLD_WIDTH * 0.46, Math.max(innerRing + 550, viewHalfDiag + 900));
  const minHeadSq = minClearDist * minClearDist;
  const bodyClearSq = 155 * 155;
  const tailSpan = Math.min(360, bodyLen * SEGMENT_SPACING);
  const cosA = Math.cos(spawnAngle);
  const sinA = Math.sin(spawnAngle);

  let bestX = wrap(player.x + innerRing, WORLD_WIDTH);
  let bestY = wrap(player.y + innerRing, WORLD_HEIGHT);
  let maxMinDistSq = -1;

  for (let attempt = 0; attempt < 56; attempt++) {
    const theta = Math.random() * Math.PI * 2;
    const dist = innerRing + Math.random() * (outerRing - innerRing);
    const cx = wrap(player.x + Math.cos(theta) * dist, WORLD_WIDTH);
    const cy = wrap(player.y + Math.sin(theta) * dist, WORLD_HEIGHT);

    // Must be outside the current camera view rectangle
    const inViewX = Math.abs(toroidDelta(cameraX, cx, WORLD_WIDTH)) < viewHalfW + 80;
    const inViewY = Math.abs(toroidDelta(cameraY, cy, WORLD_HEIGHT)) < viewHalfH + 80;
    if (inViewX && inViewY) continue;

    let closestDistSq = Infinity;
    let rejected = false;

    for (let sIdx = 0; sIdx < snakeRoster.length; sIdx++) {
      const s = snakeRoster[sIdx];
      if (!s || !s.alive) continue;
      const dHeadSq = toroidDistSq(cx, cy, s.x, s.y);
      if (dHeadSq < closestDistSq) closestDistSq = dHeadSq;
      if (dHeadSq < minHeadSq) {
        rejected = true;
        break;
      }
      const segs = s.segments;
      const stride = segs.length > 80 ? 5 : 3;
      for (let i = 0; i < segs.length; i += stride) {
        const dSegSq = toroidDistSq(cx, cy, segs[i].x, segs[i].y);
        if (dSegSq < closestDistSq) closestDistSq = dSegSq;
        if (dSegSq < bodyClearSq) {
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
      if (!isFarFromAllSnakes(midX, midY, 110) || !isFarFromAllSnakes(endX, endY, 110)) {
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
  activeBotMax = isMob ? BOT_MAX_MOBILE : BOT_MAX_DESKTOP;
  activeTargetBotCount = Math.min(activeBotMax, BOT_START_COUNT);
  totalBotsCreatedInMatch = 0;
  const now = performance.now();
  nextBotWaveAt = now + BOT_WAVE_INTERVAL_MS;
  nextWaveBotSpawnAt = now + 500;
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
  if (now >= nextBotWaveAt) {
    nextBotWaveAt = now + BOT_WAVE_INTERVAL_MS;
    activeTargetBotCount = Math.min(activeBotMax, activeTargetBotCount + BOT_WAVE_ADD);
  }
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
      // Smooth angular blending prevents sharp-turn kinks while keeping exact SEGMENT_SPACING distance
      const segAngle = dist > SEGMENT_SPACING ? (seg.angle + angleDiff * 0.72) : targetSegAngle;
      seg.angle = segAngle;
      if (dist > SEGMENT_SPACING) {
        seg.x = wrap(prevX - Math.cos(targetSegAngle) * SEGMENT_SPACING, WORLD_WIDTH);
        seg.y = wrap(prevY - Math.sin(targetSegAngle) * SEGMENT_SPACING, WORLD_HEIGHT);
      }
    } else {
      seg.angle = prevAngle;
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
}

function dissolveSnakeIntoFood(snake, rewardMultiplier = 1) {
  const orbValue = snake.length > 50 ? 4 : 2;
  let totalReward = 0;
  let existingDeathDrops = 0;
  for (const orb of foodOrbs) if (orb.isDeathDrop) existingDeathDrops++;
  let dropsRemaining = Math.max(0, MAX_DEATH_DROP_ORBS - existingDeathDrops);
  const maxSnakeOrbs = Math.max(4, Math.min(dropsRemaining, Math.ceil(snake.length / (orbValue * 1.4))));
  const segStep = Math.max(2, Math.ceil(snake.segments.length / maxSnakeOrbs));
  let dropIdx = 0;
  for (let i = 0; i < snake.segments.length && dropsRemaining > 0; i += segStep, dropsRemaining--, dropIdx++) {
    const seg = snake.segments[i];
    const foodScheme = {
      core: snake.palette.head,
      glow: snake.palette.glow,
      value: orbValue * rewardMultiplier,
      isDeathDrop: true
    };
    const orb = spawnFoodOrb(seg.x, seg.y, foodScheme);
    orb.burstAt = performance.now();
    orb.burstDelay = Math.min(700, dropIdx * 16);
    foodOrbs.push(orb);
    totalReward += orbValue;
    if (dropIdx % 4 === 0) spawnFoodBurst(seg.x, seg.y, snake.palette.head, 1);
  }
  spawnFoodBurst(snake.x, snake.y, snake.palette.head, 6);
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
  bot.respawnTimer = RESPAWN_DELAY_FRAMES;
  const reward = dissolveSnakeIntoFood(bot, bounty ? 2 : 1);
  bot.segments.length = 0;
  bot.growQueue = 0;
  if (killer === player) showKillMessage(bot, reward, bounty);
  sfxBotDeath();
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
      player.alive = true;
      isGameOver = false;
      player.protectedUntil = performance.now() + 3200;
      lastLoopFrameTime = performance.now();
      fixedStepAccumulator = 0;
      sfxReward();
      showGlobalToast('Snake Revived! 3s Spawn Shield Active');
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
          spawnFoodBurst(orb.x, orb.y, orb.color, orb.isFruit ? 7 : 3);
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
              const maxLvl = FRUITS_CONFIG.maxLevel || 10;
              while (currentArenaLevel < maxLvl && matchFruitScore >= computeLevelTargetScore(currentArenaLevel)) {
                currentArenaLevel++;
                showPowerupIndicator(`🎯 STAGE ${currentArenaLevel} REACHED!`);
              }
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
      spawnFoodBurst(eatenOrb.x, eatenOrb.y, '#fff1b8', 4);
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

function startGame() {
  initAudio();
  AdManager.hideNativeBanner();
  menuScreenEl.style.display = 'none';
  document.querySelectorAll('.subscreen').forEach(el => { el.style.display = 'none'; });
  activeSubscreenId = null;
  hudEl.style.display = 'flex';
  lbEl.style.display = 'block';
  isGameRunning = true;
  isPaused = false;
  totalPausedDuration = 0;
  revivePauseStartAt = 0;
  if (fpsCounterEl) fpsCounterEl.style.display = fpsCounterEnabled ? 'block' : 'none';

  for (let i = 0; i < particles.length; i++) {
    if (particlePool.length < maxParticles) particlePool.push(particles[i]);
  }
  particles.length = 0;
  initSnake();
  initBots();
  initFood();
  scheduleNextRareOrb();
  scheduleNextPowerup();
  powerups.length = 0;
  applyDifficultySpeeds();
  ensureGameLoop();
}

function goHome() {
  flushDeferredProfileSave(true);
  isGameRunning = false;
  isPaused = false;
  isGameOver = false;
  rareOrb = null;
  powerups.length = 0;
  AdManager.hideNativeBanner();
  if (fpsCounterEl) fpsCounterEl.style.display = 'none';
  if (powerupIndicatorEl) powerupIndicatorEl.style.display = 'none';
  if (rareIndicatorEl) rareIndicatorEl.style.display = 'none';
  const reviveModal = document.getElementById('revive-modal');
  if (reviveModal) reviveModal.style.display = 'none';
  keys.left = false;
  keys.right = false;
  mouse.active = false;
  joystick.active = false;
  joystick.pointerId = null;
  joystick.hasDirection = false;
  if (joystickEl) joystickEl.style.display = 'none';
  pauseOverlayEl.style.display = 'none';
  overlayEl.style.display = 'none';
  hudEl.style.display = 'none';
  lbEl.style.display = 'none';
  document.querySelectorAll('.subscreen').forEach(el => { el.style.display = 'none'; });
  activeSubscreenId = null;
  settingsOpenedFromGame = false;
  menuScreenEl.style.display = 'flex';
  updateMenuRecordsDisplay();
  refreshMenuHeaderUI();
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
    flushDeferredProfileSave(true);
    pauseOverlayEl.style.display = 'flex';
  } else {
    shiftActiveTimersByPauseDuration(performance.now() - pauseStartTime);
    lastLoopFrameTime = performance.now();
    fixedStepAccumulator = 0;
    pauseOverlayEl.style.display = 'none';
    ensureGameLoop();
  }
}

function resetActiveControls() {
  keys.left = false;
  keys.right = false;
  mouse.active = false;
  joystick.active = false;
  joystick.pointerId = null;
  joystick.dx = 0;
  joystick.dy = 0;
  joystick.hasDirection = false;
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
    applyAmbientAudioGain();
    lastLoopFrameTime = performance.now();
    fixedStepAccumulator = 0;
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
    initAudio();
    if (e.key === 'p' || e.key === 'P' || e.key === ' ') {
      if (isGameRunning && !isGameOver) {
        e.preventDefault();
        togglePause();
        return;
      }
    }

    if (isGameOver) {
      if (e.key === 'Enter') restartGame();
      return;
    }

    if (e.key === '1') activateAbility('ghost');
    if (e.key === '2') activateAbility('magnet');
    if (e.key === '3') activateAbility('dash');

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (isTouchDevice) return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  });

  canvas.addEventListener('pointerdown', (e) => {
    if ((e.pointerType !== 'touch' && e.pointerType !== 'pen') || !isGameRunning || isPaused || isGameOver || joystick.active) return;
    e.preventDefault();
    initAudio();
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
  updateCamera();
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
  overlayEl.style.display = 'none';
  pauseOverlayEl.style.display = 'none';
  isPaused = false;
  for (let i = 0; i < particles.length; i++) {
    if (particlePool.length < maxParticles) particlePool.push(particles[i]);
  }
  particles.length = 0;
  initSnake();
  initBots();
  initFood();
  scheduleNextRareOrb();
  scheduleNextPowerup();
  powerups.length = 0;
  applyDifficultySpeeds();
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

function drawDiamondScale(cx, cy, radius, angle, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.7);
  ctx.lineTo(radius * 0.6, 0);
  ctx.lineTo(0, radius * 0.7);
  ctx.lineTo(-radius * 0.6, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawSkinPattern(cx, cy, radius, angle, palette, index) {
  const pattern = palette.pattern || 'scales';
  if ((pattern === 'scales' || pattern === 'dragon' || pattern === 'ancient_runes' || pattern === 'crystal_facets') && index % 2 === 0 && radius > 4) {
    drawDiamondScale(cx, cy, radius * 0.74, angle, palette.scale);
    return;
  }
  if ((pattern === 'chevron' || pattern === 'assassin_blades' || pattern === 'samurai_armor' || pattern === 'phoenix_plumes') && index % 2 === 0 && radius > 3.5) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = palette.scale;
    ctx.lineWidth = Math.max(1.2, radius * 0.35);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-radius * 0.6, -radius * 0.75);
    ctx.lineTo(radius * 0.48, 0);
    ctx.lineTo(-radius * 0.6, radius * 0.75);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if ((pattern === 'reticulated' || pattern === 'circuit_board') && index % 3 === 0 && radius > 3.5) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = palette.scale;
    ctx.lineWidth = Math.max(1, radius * 0.22);
    ctx.strokeRect(-radius * 0.55, -radius * 0.55, radius * 1.1, radius * 1.1);
    ctx.fillStyle = pattern === 'circuit_board' ? palette.head : '#0f0c08';
    ctx.fillRect(-radius * 0.22, -radius * 0.22, radius * 0.44, radius * 0.44);
    ctx.restore();
    return;
  }
  if ((pattern === 'lightning' || pattern === 'storm_bolts' || pattern === 'plasma_pulse') && index % 2 === 0 && radius > 3.5) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.PI / 2);
    ctx.strokeStyle = palette.scale;
    ctx.lineWidth = Math.max(1.5, radius * 0.32);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-radius * 0.8, -radius * 0.3);
    ctx.lineTo(-radius * 0.2, radius * 0.3);
    ctx.lineTo(radius * 0.2, -radius * 0.3);
    ctx.lineTo(radius * 0.8, radius * 0.3);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (pattern === 'coral_tricolor' || pattern === 'bee_stripes' || pattern === 'candy_stripes' || pattern === 'meme_stripes' || pattern === 'noob_blocks') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.PI / 2);
    let ringColor = palette.scale || '#facc15';
    if (pattern === 'coral_tricolor') ringColor = (index % 4 === 0) ? '#facc15' : (index % 2 === 0) ? '#111827' : '#dc2626';
    else if (pattern === 'bee_stripes') ringColor = (index % 2 === 0) ? '#18181b' : '#facc15';
    else if (pattern === 'candy_stripes') ringColor = (index % 2 === 0) ? '#ffffff' : '#f43f5e';
    else if (pattern === 'noob_blocks') ringColor = (index % 3 === 0) ? '#facc15' : (index % 3 === 1) ? '#3b82f6' : '#22c55e';
    ctx.fillStyle = ringColor;
    ctx.fillRect(-radius * 0.92, -Math.max(1.2, radius * 0.45), radius * 1.84, Math.max(2.4, radius * 0.9));
    ctx.restore();
    return;
  }
  if (pattern === 'rainbow_cycle' || pattern === 'disco_tiles' || pattern === 'glitch_blocks' || pattern === 'matrix_code') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    if (pattern === 'matrix_code') {
      ctx.fillStyle = '#00F5A0';
      ctx.fillRect(-radius * 0.5, -radius * 0.2, radius, radius * 0.4);
    } else {
      ctx.fillStyle = `hsl(${(index * 28 + animFrame * 3) % 360}, 90%, 60%)`;
      if (pattern === 'disco_tiles' || pattern === 'glitch_blocks') {
        ctx.fillRect(-radius * 0.65, -radius * 0.65, radius * 1.3, radius * 1.3);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    return;
  }
  if (pattern === 'hotdog_mustard' && radius > 3.5) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = '#FACC15';
    ctx.beginPath();
    ctx.arc(0, Math.sin(index * 0.8) * radius * 0.42, Math.max(1.4, radius * 0.36), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if ((pattern === 'pizza_pepperoni' || pattern === 'banana_spots' || pattern === 'frog_spots' || pattern === 'bubbles' || pattern === 'venom_drip') && index % 2 === 0 && radius > 3.5) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = palette.scale;
    ctx.beginPath();
    ctx.arc(0, (index % 4 === 0 ? 1 : -1) * radius * 0.28, radius * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (pattern === 'donut_sprinkles' && radius > 3.5) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + index);
    ctx.fillStyle = ['#38BDF8', '#FDE047', '#00F5A0', '#FFFFFF'][index % 4];
    ctx.fillRect(-radius * 0.45, -1.4, radius * 0.9, 2.8);
    ctx.restore();
    return;
  }
  if ((pattern === 'diamonds' || pattern === 'lava_cracks' || pattern === 'ice_shards') && index % 2 === 0 && radius > 3.5) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = palette.scale;
    ctx.lineWidth = Math.max(1.2, radius * 0.28);
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.85);
    ctx.lineTo(radius * 0.75, 0);
    ctx.lineTo(0, radius * 0.85);
    ctx.lineTo(-radius * 0.75, 0);
    ctx.closePath();
    ctx.stroke();
    if (pattern === 'diamonds') {
      ctx.fillStyle = '#1c1917';
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  if ((pattern === 'ocelli' || pattern === 'blood_moon' || pattern === 'celestial_halos' || pattern === 'hologram_rings' || pattern === 'quantum_rings' || pattern === 'swirl_flush') && index % 3 === 0 && radius > 3.5) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = pattern === 'ocelli' ? '#18181b' : 'rgba(8, 13, 24, 0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.scale || '#ca8a04';
    ctx.lineWidth = Math.max(1.2, radius * 0.24);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if ((pattern === 'krait_rings' || pattern === 'penguin_tux' || pattern === 'feathers') && index % 3 === 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = palette.scale || '#0f172a';
    ctx.fillRect(-radius * 0.85, -Math.max(1, radius * 0.35), radius * 1.7, Math.max(2, radius * 0.7));
    ctx.restore();
    return;
  }
  if (pattern === 'leviathan_fins' && index % 4 === 0 && radius > 4) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = palette.scale;
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(-radius * 0.9, -radius * 1.55);
    ctx.lineTo(-radius * 0.5, -radius * 0.6);
    ctx.moveTo(0, radius);
    ctx.lineTo(-radius * 0.9, radius * 1.55);
    ctx.lineTo(-radius * 0.5, radius * 0.6);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (pattern === 'clouded' && index % 3 === 0 && radius > 3.5) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(254, 240, 138, 0.75)';
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.7, radius * 0.45, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (pattern === 'neon_grid' && index % 2 === 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.PI / 2);
    ctx.strokeStyle = palette.scale;
    ctx.lineWidth = Math.max(1.5, radius * 0.3);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.7, 0);
    ctx.lineTo(radius * 0.7, 0);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (pattern === 'ribbons' && index % 3 === 0 && radius > 4) {
    drawDiamondScale(cx, cy, radius * 0.62, angle + Math.PI / 2, palette.scale);
    return;
  }
  if (pattern === 'bands' && index % 3 === 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = palette.scale;
    ctx.fillRect(-radius * 0.68, -Math.max(0.8, radius * 0.18), radius * 1.36, Math.max(1.6, radius * 0.36));
    ctx.restore();
    return;
  }
  if ((pattern === 'embers' || pattern === 'void_stars' || pattern === 'cosmic_stars') && index % 3 === 1) {
    ctx.fillStyle = palette.scale;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.2, radius * 0.32), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (pattern === 'spots' && index % 3 === 0 && radius > 4) {
    const side = angle + Math.PI / 2;
    ctx.fillStyle = palette.scale;
    for (let direction = -1; direction <= 1; direction += 2) {
      ctx.beginPath();
      ctx.arc(cx + Math.cos(side) * radius * 0.35 * direction, cy + Math.sin(side) * radius * 0.35 * direction, Math.max(0.8, radius * 0.15), 0, Math.PI * 2);
      ctx.fill();
    }
  }
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
  const tagY = y - Math.round(26 * headVisualScale);

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
  const crownY = snake.y - Math.round(32 * headVisualScale);
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
  // Gentle non-linear tail taper keeps the body full and tapers smoothly at the tail end
  const bodyTaper = isMobViewport ? 0.46 : 0.56;
  const minSegRadius = (isMobViewport ? 5.6 : 4.2) * Math.min(1.45, 0.85 + (bodyGrowthMul - 1) * 0.7);
  const getSegRadius = (progress) => {
    const taperCurve = Math.pow(progress, 1.42);
    return Math.max(minSegRadius, HEAD_RADIUS * bodyVisualScale * (1 - taperCurve * bodyTaper));
  };

  ctx.save();
  ctx.translate(offsetX, offsetY);
  const nowRender = performance.now();
  if (snake.isPlayer && nowRender < snake.ghostUntil) ctx.globalAlpha = 0.38;
  if (!snake.isPlayer && snake.spawnFadeStartAt && nowRender - snake.spawnFadeStartAt < (snake.spawnFadeDuration || BOT_SPAWN_FADE_MS)) {
    const fadeProgress = Math.max(0.06, Math.min(1, (nowRender - snake.spawnFadeStartAt) / (snake.spawnFadeDuration || BOT_SPAWN_FADE_MS)));
    ctx.globalAlpha *= fadeProgress;
  }

  const pal = snake.palette;

  // Tongue
  if (snake.tongueProgress > 0) {
    const tLen = snake.tongueProgress * 16 * headVisualScale;
    const hx = snake.x + Math.cos(snake.angle) * (HEAD_RADIUS * headVisualScale);
    const hy = snake.y + Math.sin(snake.angle) * (HEAD_RADIUS * headVisualScale);
    const tx = hx + Math.cos(snake.angle) * tLen;
    const ty = hy + Math.sin(snake.angle) * tLen;

    const forkAngle = 0.45;
    const forkLen = 5 * snake.tongueProgress * headVisualScale;
    const f1x = tx + Math.cos(snake.angle + forkAngle) * forkLen;
    const f1y = ty + Math.sin(snake.angle + forkAngle) * forkLen;
    const f2x = tx + Math.cos(snake.angle - forkAngle) * forkLen;
    const f2y = ty + Math.sin(snake.angle - forkAngle) * forkLen;

    ctx.strokeStyle = pal.tongue;
    ctx.lineWidth = 1.8 * headVisualScale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.lineTo(f1x, f1y);
    ctx.moveTo(tx, ty);
    ctx.lineTo(f2x, f2y);
    ctx.stroke();
  }

  // Body segments
  const protectedNow = performance.now() < snake.protectedUntil;
  const protectionAlpha = 0.42 + Math.sin(performance.now() * 0.035) * 0.34;
  const far = !snake.isPlayer && toroidDistSq(player.x, player.y, snake.x, snake.y) > (Math.min(width, height) / cameraZoom * 0.46) ** 2;
  // Never skip segments on the player snake or near snakes where stride * 6px > radius * 1.15, preventing bead gaps & tail termination
  const baseStride = snake.isPlayer ? 1 : (graphicsQuality === 'low' ? (far ? 3 : 1) : (far ? 2 : 1));
  const maxSafeStride = Math.max(1, Math.floor((minSegRadius * 1.15) / SEGMENT_SPACING));
  const segmentStride = Math.min(baseStride, maxSafeStride);
  const bandCount = graphicsQuality === 'low' ? (far ? 1 : 2) : (far ? 2 : 3);
  const nightGlow = currentCycle.nightFactor * (graphicsQuality === 'low' ? 0.25 : (graphicsQuality === 'medium' ? 0.62 : 1));
  const hasAmbientAura = Boolean(pal.trailEffect) && graphicsQuality !== 'low';
  const mobileBaseGlow = isMobViewport ? (snake.isPlayer ? 0.34 : 0.20) : (snake.isPlayer ? 0.18 : 0);
  if (!far && (nightGlow > 0.08 || hasAmbientAura || mobileBaseGlow > 0)) {
    const auraStride = hasAmbientAura ? 14 : 18;
    const auraAlpha = Math.max(nightGlow * 0.48, hasAmbientAura ? 0.28 : 0, mobileBaseGlow);
    for (let i = 0; i < segs.length; i += auraStride) {
      const seg = segs[i];
      const x = seg.relX !== undefined ? snake.x + seg.relX : snake.x + toroidDelta(snake.x, seg.x, WORLD_WIDTH);
      const y = seg.relY !== undefined ? snake.y + seg.relY : snake.y + toroidDelta(snake.y, seg.y, WORLD_HEIGHT);
      drawCachedGlow(pal.glow, x, y, getSegRadius(i / segs.length) * 1.08, auraAlpha);
    }
  }

  // Player-distinctive outer rim pass on mobile & desktop so the player snake stands out unmistakably in dense swarms
  if (snake.isPlayer && !far) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    const rimStride = graphicsQuality === 'low' ? 2 : 1;
    for (let i = segs.length - 1; i >= 0; i -= rimStride) {
      const seg = segs[i];
      const radius = getSegRadius(i / segs.length) + (isMobViewport ? 1.35 : 1.0);
      const x = seg.relX !== undefined ? snake.x + seg.relX : snake.x + toroidDelta(snake.x, seg.x, WORLD_WIDTH);
      const y = seg.relY !== undefined ? snake.y + seg.relY : snake.y + toroidDelta(snake.y, seg.y, WORLD_HEIGHT);
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  for (let band = 0; band < bandCount; band++) {
    ctx.beginPath();
    ctx.fillStyle = interpolateColor(pal.bodyStart, pal.bodyEnd, (band + 0.5) / bandCount);
    if (protectedNow) {
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = protectionAlpha;
    }
    for (let i = segs.length - 1; i >= 0; i -= segmentStride) {
      const progress = i / segs.length;
      if (Math.min(bandCount - 1, Math.floor(progress * bandCount)) !== band) continue;
      const seg = segs[i];
      const radius = getSegRadius(progress);
      const x = seg.relX !== undefined ? snake.x + seg.relX : snake.x + toroidDelta(snake.x, seg.x, WORLD_WIDTH);
      const y = seg.relY !== undefined ? snake.y + seg.relY : snake.y + toroidDelta(snake.y, seg.y, WORLD_HEIGHT);
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    // Always draw the exact tail tip segment on the final band so the tail never terminates early when segmentStride > 1
    if (band === bandCount - 1 && segs.length > 1 && (segs.length - 1) % segmentStride !== 0) {
      const tailSeg = segs[segs.length - 1];
      const tailR = getSegRadius(1);
      const tx = tailSeg.relX !== undefined ? snake.x + tailSeg.relX : snake.x + toroidDelta(snake.x, tailSeg.x, WORLD_WIDTH);
      const ty = tailSeg.relY !== undefined ? snake.y + tailSeg.relY : snake.y + toroidDelta(snake.y, tailSeg.y, WORLD_HEIGHT);
      ctx.moveTo(tx + tailR, ty);
      ctx.arc(tx, ty, tailR, 0, Math.PI * 2);
    }
    ctx.fill();
    if (protectedNow) { ctx.stroke(); ctx.globalAlpha = 1; }
  }
  // Subtle dorsal luminance highlight for high readability against dark arena
  if ((isMobViewport || snake.isPlayer) && !far) {
    ctx.beginPath();
    ctx.fillStyle = snake.isPlayer ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.12)';
    const spineStride = graphicsQuality === 'low' ? 3 : 2;
    for (let i = segs.length - 1; i >= 0; i -= spineStride) {
      const progress = i / segs.length;
      const seg = segs[i];
      const radius = getSegRadius(progress) * 0.44;
      const x = seg.relX !== undefined ? snake.x + seg.relX : snake.x + toroidDelta(snake.x, seg.x, WORLD_WIDTH);
      const y = seg.relY !== undefined ? snake.y + seg.relY : snake.y + toroidDelta(snake.y, seg.y, WORLD_HEIGHT);
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  if (!far) {
    const detailStride = graphicsQuality === 'low' ? (snake.isPlayer ? 5 : 9) : 3;
    for (let i = 0; i < segs.length; i += detailStride) {
      const seg = segs[i];
      const progress = i / segs.length;
      const radius = getSegRadius(progress);
      const x = seg.relX !== undefined ? snake.x + seg.relX : snake.x + toroidDelta(snake.x, seg.x, WORLD_WIDTH);
      const y = seg.relY !== undefined ? snake.y + seg.relY : snake.y + toroidDelta(snake.y, seg.y, WORLD_HEIGHT);
      drawSkinPattern(x, y, radius, seg.angle, pal, i);
    }
    // Bee translucent wings behind head
    if (pal.headShape === 'bee' && segs.length > 3) {
      const wSeg = segs[3];
      const wx = snake.x + toroidDelta(snake.x, wSeg.x, WORLD_WIDTH);
      const wy = snake.y + toroidDelta(snake.y, wSeg.y, WORLD_HEIGHT);
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(wSeg.angle);
      ctx.scale(bodyVisualScale, bodyVisualScale);
      ctx.fillStyle = 'rgba(224, 242, 254, 0.55)';
      const flap = Math.sin(animFrame * 0.45) * 0.22;
      ctx.beginPath();
      ctx.ellipse(0, -HEAD_RADIUS * 1.25, HEAD_RADIUS * 0.95, HEAD_RADIUS * 0.52, -0.35 + flap, 0, Math.PI * 2);
      ctx.ellipse(0, HEAD_RADIUS * 1.25, HEAD_RADIUS * 0.95, HEAD_RADIUS * 0.52, 0.35 - flap, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Head
  const headGlowAlpha = Math.max(nightGlow * 0.75, hasAmbientAura ? 0.45 : 0, isMobViewport ? (snake.isPlayer ? 0.48 : 0.34) : 0.22);
  drawCachedGlow(pal.glow, snake.x, snake.y, HEAD_RADIUS * headVisualScale * (1.65 + Math.max(nightGlow, hasAmbientAura ? 0.45 : 0)), headGlowAlpha);
  ctx.save();
  ctx.translate(snake.x, snake.y);
  ctx.rotate(snake.angle);
  if (headVisualScale !== 1) ctx.scale(headVisualScale, headVisualScale);

  const headShape = pal.headShape || 'round';

  if (headShape === 'cobra') {
    const hoodSpread = HEAD_RADIUS * (pal.hoodWidth || 1.85);
    ctx.beginPath();
    ctx.moveTo(HEAD_RADIUS * 0.7, 0);
    ctx.quadraticCurveTo(HEAD_RADIUS * 0.1, hoodSpread, -HEAD_RADIUS * 1.5, hoodSpread * 0.75);
    ctx.quadraticCurveTo(-HEAD_RADIUS * 2.1, hoodSpread * 0.3, -HEAD_RADIUS * 2.2, 0);
    ctx.quadraticCurveTo(-HEAD_RADIUS * 2.1, -hoodSpread * 0.3, -HEAD_RADIUS * 1.5, -hoodSpread * 0.75);
    ctx.quadraticCurveTo(HEAD_RADIUS * 0.1, -hoodSpread, HEAD_RADIUS * 0.7, 0);
    ctx.closePath();
    ctx.fillStyle = pal.head;
    ctx.fill();
    ctx.strokeStyle = pal.scale;
    ctx.lineWidth = 1.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-HEAD_RADIUS * 1.1, -hoodSpread * 0.35, HEAD_RADIUS * 0.38, 0, Math.PI * 2);
    ctx.arc(-HEAD_RADIUS * 1.1, hoodSpread * 0.35, HEAD_RADIUS * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = '#fef08a';
    ctx.fill();
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(-HEAD_RADIUS * 1.1, -hoodSpread * 0.35, HEAD_RADIUS * 0.18, 0, Math.PI * 2);
    ctx.arc(-HEAD_RADIUS * 1.1, hoodSpread * 0.35, HEAD_RADIUS * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(3, 0, HEAD_RADIUS * 1.15, HEAD_RADIUS * 0.85, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.head;
    ctx.fill();
  } else if (headShape === 'viper' || headShape === 'arrow' || headShape === 'crystal') {
    ctx.beginPath();
    ctx.moveTo(HEAD_RADIUS * 1.6, 0);
    ctx.lineTo(-HEAD_RADIUS * 0.7, HEAD_RADIUS * 1.42);
    ctx.quadraticCurveTo(-HEAD_RADIUS * 1.4, HEAD_RADIUS * 0.5, -HEAD_RADIUS * 1.1, 0);
    ctx.quadraticCurveTo(-HEAD_RADIUS * 1.4, -HEAD_RADIUS * 0.5, -HEAD_RADIUS * 0.7, -HEAD_RADIUS * 1.42);
    ctx.closePath();
    ctx.fillStyle = pal.head;
    ctx.fill();
    ctx.strokeStyle = headShape === 'crystal' ? '#FFFFFF' : 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
  } else if (headShape === 'python') {
    ctx.beginPath();
    ctx.moveTo(HEAD_RADIUS * 1.4, -HEAD_RADIUS * 0.4);
    ctx.quadraticCurveTo(HEAD_RADIUS * 1.6, 0, HEAD_RADIUS * 1.4, HEAD_RADIUS * 0.4);
    ctx.lineTo(HEAD_RADIUS * 0.2, HEAD_RADIUS * 1.15);
    ctx.quadraticCurveTo(-HEAD_RADIUS * 1.2, HEAD_RADIUS * 1.1, -HEAD_RADIUS * 1.3, 0);
    ctx.quadraticCurveTo(-HEAD_RADIUS * 1.2, -HEAD_RADIUS * 1.1, HEAD_RADIUS * 0.2, -HEAD_RADIUS * 1.15);
    ctx.closePath();
    ctx.fillStyle = pal.head;
    ctx.fill();
  } else if (headShape === 'coffin') {
    ctx.beginPath();
    ctx.moveTo(HEAD_RADIUS * 1.6, -HEAD_RADIUS * 0.35);
    ctx.lineTo(HEAD_RADIUS * 1.6, HEAD_RADIUS * 0.35);
    ctx.lineTo(HEAD_RADIUS * 0.3, HEAD_RADIUS * 0.95);
    ctx.lineTo(-HEAD_RADIUS * 1.3, HEAD_RADIUS * 0.85);
    ctx.lineTo(-HEAD_RADIUS * 1.3, -HEAD_RADIUS * 0.85);
    ctx.lineTo(HEAD_RADIUS * 0.3, -HEAD_RADIUS * 0.95);
    ctx.closePath();
    ctx.fillStyle = pal.head;
    ctx.fill();
  } else if (headShape === 'paddle') {
    ctx.beginPath();
    ctx.ellipse(3, 0, HEAD_RADIUS * 1.45, HEAD_RADIUS * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.head;
    ctx.fill();
  } else if (headShape === 'pixel') {
    ctx.fillStyle = pal.head;
    ctx.fillRect(-HEAD_RADIUS, -HEAD_RADIUS * 0.9, HEAD_RADIUS * 2.1, HEAD_RADIUS * 1.8);
  } else if (headShape === 'duck') {
    ctx.fillStyle = '#FB923C';
    ctx.beginPath();
    ctx.ellipse(HEAD_RADIUS * 1.05, 0, HEAD_RADIUS * 0.68, HEAD_RADIUS * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(1, 0, HEAD_RADIUS * 1.05, HEAD_RADIUS * 0.92, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.head;
    ctx.fill();
  } else if (headShape === 'chicken') {
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.moveTo(HEAD_RADIUS * 0.9, -3.5);
    ctx.lineTo(HEAD_RADIUS * 1.75, 0);
    ctx.lineTo(HEAD_RADIUS * 0.9, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(1, 0, HEAD_RADIUS * 1.05, HEAD_RADIUS * 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.head;
    ctx.fill();
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.ellipse(0, 0, HEAD_RADIUS * 0.55, HEAD_RADIUS * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (headShape === 'dragon' || headShape === 'samurai' || headShape === 'phoenix' || headShape === 'leviathan') {
    ctx.beginPath();
    ctx.moveTo(HEAD_RADIUS * 1.5, 0);
    ctx.lineTo(HEAD_RADIUS * 0.4, HEAD_RADIUS * 1.1);
    ctx.lineTo(-HEAD_RADIUS * 1.35, HEAD_RADIUS * 1.42);
    ctx.lineTo(-HEAD_RADIUS * 0.8, HEAD_RADIUS * 0.35);
    ctx.lineTo(-HEAD_RADIUS * 1.5, 0);
    ctx.lineTo(-HEAD_RADIUS * 0.8, -HEAD_RADIUS * 0.35);
    ctx.lineTo(-HEAD_RADIUS * 1.35, -HEAD_RADIUS * 1.42);
    ctx.lineTo(HEAD_RADIUS * 0.4, -HEAD_RADIUS * 1.1);
    ctx.closePath();
    ctx.fillStyle = pal.head;
    ctx.fill();
    if (headShape === 'samurai') {
      ctx.strokeStyle = '#FFB020';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(HEAD_RADIUS * 0.5, -HEAD_RADIUS * 0.8);
      ctx.lineTo(HEAD_RADIUS * 1.2, 0);
      ctx.lineTo(HEAD_RADIUS * 0.5, HEAD_RADIUS * 0.8);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.ellipse(2, 0, HEAD_RADIUS + 1, HEAD_RADIUS - 1.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.head;
    ctx.fill();
  }
  if (protectedNow) {
    ctx.globalAlpha = protectionAlpha;
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(2, 0, HEAD_RADIUS + 4, HEAD_RADIUS + 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.ellipse(5, 0, HEAD_RADIUS * 0.45, HEAD_RADIUS * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fill();

  // Eyes (supports normal, slit, googly, derp, sunglasses, visor, glowing, cute, angry)
  const eyeStyle = pal.eyeStyle || 'normal';
  const eyeX = 3;
  const eyeY = headShape === 'frog' ? 8.2 : 6.2;
  const eyeRadius = (eyeStyle === 'googly' || eyeStyle === 'cute' || headShape === 'frog') ? 4.3 : 3.6;
  const pupilRadius = 1.6;

  if (eyeStyle === 'sunglasses') {
    ctx.fillStyle = '#090D16';
    ctx.fillRect(1, -7.2, 4.8, 5.2);
    ctx.fillRect(1, 2.0, 4.8, 5.2);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.1;
    ctx.strokeRect(1, -7.2, 4.8, 5.2);
    ctx.strokeRect(1, 2.0, 4.8, 5.2);
  } else if (eyeStyle === 'visor') {
    ctx.fillStyle = pal.eyeIris || '#00D9FF';
    ctx.beginPath();
    ctx.roundRect(1.5, -6.5, 4.2, 13, 2);
    ctx.fill();
  } else {
    for (let eyeSide = -1; eyeSide <= 1; eyeSide += 2) {
      const ey = eyeY * eyeSide;
      ctx.beginPath();
      ctx.arc(eyeX, ey, eyeRadius, 0, Math.PI * 2);
      ctx.fillStyle = eyeStyle === 'glowing' ? (pal.eyeIris || '#00D9FF') : '#ffffff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(eyeX + 0.8, ey, eyeRadius * 0.65, 0, Math.PI * 2);
      ctx.fillStyle = pal.eyeIris;
      ctx.fill();

      const wobble = eyeStyle === 'googly' ? Math.sin(animFrame * 0.22 + eyeSide) * 1.1 : (eyeStyle === 'derp' ? eyeSide * 1.4 : 0);
      ctx.beginPath();
      if (eyeStyle === 'slit') {
        ctx.ellipse(eyeX + 1.2, ey, pupilRadius * 1.25, pupilRadius * 0.45, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(eyeX + 1.2, ey + wobble, pupilRadius, 0, Math.PI * 2);
      }
      ctx.fillStyle = pal.eyePupil;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(eyeX + 0.5, ey - 1, eyeStyle === 'cute' ? 1.3 : 0.8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }

  ctx.restore();

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
    ? 78
    : isMobViewport
      ? Math.min(98, Math.max(80, Math.min(width, height) * 0.21))
      : Math.min(126, Math.max(92, Math.min(width, height) * 0.23));
  const radius = size / 2;
  const cx = width - radius - (isMobViewport ? 10 : 12);
  const cy = height - radius - (isMobViewport ? 14 : 14);
  const mapRadius = radius - 6;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(2, 12, 25, 0.78)';
  ctx.fill();
  ctx.clip();
  const zoneDx = toroidDelta(player.x, WORLD_WIDTH / 2, WORLD_WIDTH) / WORLD_WIDTH * (mapRadius * 2);
  const zoneDy = toroidDelta(player.y, WORLD_HEIGHT / 2, WORLD_HEIGHT) / WORLD_HEIGHT * (mapRadius * 2);
  const zoneMapRadius = DANGER_ZONE_RADIUS / WORLD_WIDTH * (mapRadius * 2);
  ctx.fillStyle = 'rgba(250,204,21,.10)';
  ctx.strokeStyle = 'rgba(250,204,21,.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx + zoneDx, cy + zoneDy, zoneMapRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(148, 210, 225, 0.13)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - mapRadius, cy);
  ctx.lineTo(cx + mapRadius, cy);
  ctx.moveTo(cx, cy - mapRadius);
  ctx.lineTo(cx, cy + mapRadius);
  ctx.stroke();

  const nearbyBotLimitSq = 1800 * 1800;
  for (const bot of bots) {
    if (bot.alive && toroidDistSq(player.x, player.y, bot.x, bot.y) <= nearbyBotLimitSq) {
      drawMinimapDot(bot.x, bot.y, bot.palette.head, 2.5, cx, cy, mapRadius);
    }
  }
  const king = getKingSnake();
  if (king && !king.isPlayer) drawMinimapDot(king.x, king.y, '#facc15', 5, cx, cy, mapRadius);
  if (rareOrb) drawMinimapDot(rareOrb.x, rareOrb.y, '#ffe6a5', 3, cx, cy, mapRadius);
  ctx.fillStyle = '#c7f9df';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  if (king === player) {
    ctx.fillStyle = '#facc15';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👑', cx, cy - 8);
  }
  ctx.strokeStyle = 'rgba(224, 242, 254, 0.65)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
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
// §10  LOOP & STARTUP
// ============================================================
function gameLoop() {
  if (!isGameRunning || isPaused || isGameOver) {
    loopActive = false;
    return;
  }
  const now = performance.now();
  const elapsed = Math.min(100, Math.max(0, now - lastLoopFrameTime));
  lastLoopFrameTime = now;
  updateFrameMetrics(now, elapsed);
  fixedStepAccumulator = Math.min(fixedStepAccumulator + elapsed, FIXED_STEP_MS * 5);
  let updateSteps = 0;
  while (fixedStepAccumulator >= FIXED_STEP_MS && updateSteps < 5) {
    update(FIXED_STEP_MS);
    fixedStepAccumulator -= FIXED_STEP_MS;
    updateSteps++;
  }
  render();
  requestAnimationFrame(gameLoop);
}

function ensureGameLoop() {
  if (loopActive) return;
  loopActive = true;
  lastLoopFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
}

window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
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
  AdManager.init();
});

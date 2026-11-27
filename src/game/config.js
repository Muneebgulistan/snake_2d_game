// Shared tuning values for the browser, Android WebView, and Expo Go build.
const DETECTED_ADMOB_ENVIRONMENT = (() => {
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
  return 'development';
})();

const IS_MOBILE_RUNTIME = (() => {
  try {
    if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) return true;
    if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth <= 768) return true;
  } catch (_) {}
  return false;
})();

window.GAME_CONFIG = Object.freeze({
  WORLD_WIDTH: 8000,
  WORLD_HEIGHT: 8000,
  REFERENCE_VIEW_WIDTH: 1600,
  REFERENCE_VIEW_HEIGHT: 900,
  CAMERA_LERP: 0.12,
  CAMERA_ZOOM_OUT_MAX: 0.25,
  FOOD_DENSITY: 0.375,
  FOOD_VALUE: 0.3,
  GRAPHICS_QUALITY: 'auto',
  FPS_COUNTER_DEFAULT: false,
  // Disable simulated/AdMob ad prompts when running in a web browser (e.g. itch.io).
  // Native Android builds via Capacitor still use ADMOB below.
  WEB_DISABLE_ADS: true,
  BOT_START_COUNT: 50,
  BOT_WAVE_ADD: 5,
  BOT_WAVE_INTERVAL_MS: 10000,
  BOT_MAX: IS_MOBILE_RUNTIME ? 80 : 120,
  BOT_MAX_DESKTOP: 120,
  BOT_MAX_MOBILE: 80,
  BOT_MIN_CAP: 40,
  BOT_RING_MIN_DIST: 600,
  BOT_SPAWN_FADE_MS: 1500,
  BOT_LOD_NEAR_DIST: 1200,

  // ============================================================
  // NEON PIXEL FRUITS & LEVEL TARGET SCORE CONFIGURATION
  // ============================================================
  FRUITS: Object.freeze({
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
    types: Object.freeze({
      apple: Object.freeze({
        id: 'apple',
        name: 'Apple',
        points: 20,
        growth: 1,
        baseOdds: 0.60,
        oddsShiftPerLevel: -0.035,
        color: '#ff3b5c',
        outline: '#ff9ebb',
        stem: '#4ade80',
        highlight: '#ffe4e9',
        glow: 'rgba(255, 59, 92, 0.78)'
      }),
      cherry: Object.freeze({
        id: 'cherry',
        name: 'Cherry',
        points: 35,
        growth: 1,
        baseOdds: 0.30,
        oddsShiftPerLevel: 0.015,
        color: '#e11d48',
        outline: '#fda4af',
        stem: '#22c55e',
        highlight: '#ffe4e6',
        glow: 'rgba(225, 29, 72, 0.82)'
      }),
      grapes: Object.freeze({
        id: 'grapes',
        name: 'Grapes',
        points: 50,
        growth: 2,
        baseOdds: 0.10,
        oddsShiftPerLevel: 0.020,
        color: '#a855f7',
        outline: '#e9d5ff',
        stem: '#4ade80',
        highlight: '#f3e8ff',
        glow: 'rgba(168, 85, 247, 0.86)'
      })
    })
  }),

  // ============================================================
  // GOOGLE ADMOB MONETIZATION CONFIGURATION
  // ============================================================
  // Environment is selected automatically by the Android build type via MainActivity.NativeBuildBridge:
  // - Debug builds (FLAG_DEBUGGABLE) & local web previews -> 'development' (official Google test IDs)
  // - Signed Release builds (!FLAG_DEBUGGABLE) -> 'production' (production Ad Unit IDs below)
  // Before publishing to Google Play:
  // 1. Replace the placeholder IDs in `productionIds` below with your real AdMob Ad Unit IDs.
  // 2. Replace the test App ID in `android/app/src/main/res/values/strings.xml` (`admob_app_id`).
  ADMOB: Object.freeze({
    environment: DETECTED_ADMOB_ENVIRONMENT,
    interstitialEveryMatches: 3, // Show at most 1 interstitial every N completed matches
    interstitialCooldownMs: 90000, // Minimum 90s cooldown between interstitials
    rewardedBonusCoins: 75,
    testIds: Object.freeze({
      appId: 'ca-app-pub-3940256099942544~3347511713',
      banner: 'ca-app-pub-3940256099942544/6300978111',
      interstitial: 'ca-app-pub-3940256099942544/1033173712',
      rewarded: 'ca-app-pub-3940256099942544/5224354917',
      appOpen: 'ca-app-pub-3940256099942544/9257395921'
    }),
    productionIds: Object.freeze({
      appId: 'ca-app-pub-2429367755608627~9936865964',
      banner: 'ca-app-pub-2429367755608627/5343014834',
      interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/IIIIIIIIII',
      rewarded: 'ca-app-pub-2429367755608627/1640281386',
      appOpen: 'ca-app-pub-XXXXXXXXXXXXXXXX/OOOOOOOOOO'
    })
  })
});

// ============================================================
// SEPARATE LEVELS MODE CONFIGURATION (FIXED-SCREEN WALLED)
// Completely independent of Arena's 8000x8000 world, wrap-around,
// camera follow/zoom, 50-bot waves, danger zone, and minimap.
// ============================================================
const LEVELS_WORLDS = Object.freeze([
  Object.freeze({ id: 'neon_maze',     name: 'Neon Maze',     subtitle: 'Pure Walled Precision',  accent: '#00D9FF', mechanic: 'Solid glowing walls & tight turns' }),
  Object.freeze({ id: 'coral_reef',    name: 'Coral Reef',    subtitle: 'Drifting Jellyfish',     accent: '#FF477E', mechanic: 'Avoid pulsing neon jellyfish' }),
  Object.freeze({ id: 'kelp_forest',   name: 'Kelp Forest',   subtitle: 'Abyssal Currents',       accent: '#00F5A0', mechanic: 'Ride or resist directional currents' }),
  Object.freeze({ id: 'volcano_vents', name: 'Volcano Vents', subtitle: 'Thermal Plasma Mines',   accent: '#FF7A18', mechanic: 'Dodge armed thermal mines' }),
  Object.freeze({ id: 'abyss',         name: 'Abyss',         subtitle: 'All Hazards Combined',   accent: '#A855F7', mechanic: 'Jellyfish, currents & mines united' })
]);

const LEVELS_TABLE = Object.freeze(Array.from({ length: 50 }, (_, idx) => {
  const level = idx + 1;
  const worldIndex = Math.floor(idx / 10);
  const stageInWorld = (idx % 10) + 1;
  const world = LEVELS_WORLDS[worldIndex];
  const isBoss = stageInWorld === 10;
  const t = idx / 49; // 0.0 at L1 -> 1.0 at L50

  // Weighted average fruit points per spawn (24 spawns/min) + gold/blue orb bonus
  const appleOdds = Math.max(0.25, 0.60 - 0.30 * t);
  const cherryOdds = 0.30 + 0.12 * t;
  const grapesOdds = Math.max(0.10, 1 - appleOdds - cherryOdds);
  const avgFruitPts = appleOdds * 20 + cherryOdds * 35 + grapesOdds * 50;
  const realisticMax = 24 * avgFruitPts + (120 + 20 * t);
  const targetRatio = 0.55 + (0.85 - 0.55) * t;
  const bossMult = isBoss ? 1.03 : 1.0;
  const targetScore = Math.round((realisticMax * Math.min(0.85, targetRatio * bossMult)) / 10) * 10;

  const fruitLifetimeMs = Math.max(4500, Math.round(9000 - t * 4300 - (isBoss ? 250 : 0)));
  const botCount = level <= 2 ? 0 : (level < 15 ? 1 : 2);
  const botTypes = botCount === 0
    ? Object.freeze([])
    : (botCount === 1
      ? Object.freeze([level % 2 === 1 ? 'hunter' : 'encircler'])
      : Object.freeze(['hunter', 'encircler']));

  const snakeSpeed = Math.round(235 + t * 75 + (isBoss ? 10 : 0));

  let jellyfish = 0;
  let currents = 0;
  let mines = 0;
  if (world.id === 'coral_reef') {
    jellyfish = Math.min(6, 2 + Math.floor(stageInWorld / 2) + (isBoss ? 1 : 0));
  } else if (world.id === 'kelp_forest') {
    currents = Math.min(5, 2 + Math.floor(stageInWorld / 3) + (isBoss ? 1 : 0));
  } else if (world.id === 'volcano_vents') {
    mines = Math.min(8, 3 + Math.floor(stageInWorld / 2) + (isBoss ? 1 : 0));
  } else if (world.id === 'abyss') {
    jellyfish = Math.min(4, 2 + Math.floor(stageInWorld / 4));
    currents = Math.min(3, 1 + Math.floor(stageInWorld / 4));
    mines = Math.min(6, 2 + Math.floor(stageInWorld / 2));
  }

  return Object.freeze({
    level,
    worldIndex,
    worldId: world.id,
    worldName: world.name,
    stageInWorld,
    isBoss,
    targetScore,
    fruitLifetimeMs,
    botCount,
    botTypes,
    snakeSpeed,
    hazards: Object.freeze({ jellyfish, currents, mines }),
    rewardCoins: 40 + level * 4 + (isBoss ? 50 : 0),
    rewardXp: 60 + level * 6 + (isBoss ? 80 : 0),
    threeStarBonusCoins: 30 + level * 2 + (isBoss ? 40 : 0)
  });
}));

window.LEVELS_CONFIG = Object.freeze({
  MODE_ID: 'levels',
  WRAP_AROUND: false,
  USE_CAMERA_FOLLOW: false,
  USE_MINIMAP: false,
  USE_DANGER_ZONE: false,
  GRID_LANDSCAPE: Object.freeze({ cols: 32, rows: 18 }),
  GRID_PORTRAIT: Object.freeze({ cols: 18, rows: 32 }),
  CELL_SIZE: 40,
  ROUND_DURATION_SEC: 60,
  FRUIT_SPAWN_INTERVAL_MS: 2500,
  SPAWN_MIN_HEAD_CLEAR_CELLS: 3,
  START_LIVES: 3,
  RESPAWN_SHIELD_MS: 2000,
  START_LENGTH: 10,
  BOT_MAX: 2,
  BOT_RESPAWN_MS: 3000,
  STAR_THRESHOLDS: Object.freeze({ one: 1.0, two: 1.15, three: 1.35 }),
  SPEED_DIFFICULTY_MULTIPLIERS: Object.freeze({ easy: 0.85, medium: 1.0, hard: 1.2 }),
  WORLDS: LEVELS_WORLDS,
  LEVELS: LEVELS_TABLE
});

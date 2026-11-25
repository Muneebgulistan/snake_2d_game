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
  BOT_START_COUNT: 50,
  BOT_WAVE_ADD: 5,
  BOT_WAVE_INTERVAL_MS: 10000,
  BOT_MAX: 120,
  BOT_MAX_DESKTOP: 120,
  BOT_MAX_MOBILE: 80,
  BOT_MIN_CAP: 40,
  BOT_RING_MIN_DIST: 600,
  BOT_SPAWN_FADE_MS: 1500,
  BOT_LOD_NEAR_DIST: 1200,

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
      appId: 'ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY',
      banner: 'ca-app-pub-XXXXXXXXXXXXXXXX/BBBBBBBBBB',
      interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/IIIIIIIIII',
      rewarded: 'ca-app-pub-XXXXXXXXXXXXXXXX/RRRRRRRRRR',
      appOpen: 'ca-app-pub-XXXXXXXXXXXXXXXX/OOOOOOOOOO'
    })
  })
});

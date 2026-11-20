// Shared tuning values for the browser, Android WebView, and Expo Go build.
window.GAME_CONFIG = Object.freeze({
  WORLD_WIDTH: 8000,
  WORLD_HEIGHT: 8000,
  REFERENCE_VIEW_WIDTH: 1600,
  REFERENCE_VIEW_HEIGHT: 900,
  CAMERA_LERP: 0.12,
  CAMERA_ZOOM_OUT_MAX: 0.25,
  FOOD_DENSITY: 0.3,
  FOOD_VALUE: 0.3,
  GRAPHICS_QUALITY: 'auto',
  FPS_COUNTER_DEFAULT: false,

  // ============================================================
  // GOOGLE ADMOB MONETIZATION CONFIGURATION
  // ============================================================
  // IMPORTANT: Keep environment set to 'development' while testing!
  // Google policy prohibits clicking or loading live production ads during development.
  // Before building your final signed release AAB for Google Play:
  // 1. Replace the placeholder IDs in `production` below with your real AdMob Ad Unit IDs.
  // 2. Replace the test App ID in `android/app/src/main/res/values/strings.xml` (`admob_app_id`).
  // 3. Switch `environment` below from 'development' to 'production'.
  ADMOB: Object.freeze({
    environment: 'development', // 'development' (official Google test IDs) | 'production'
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

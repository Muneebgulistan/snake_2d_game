# Serpent Run: Neon Abyss Edition (v3.0.0)

A high-performance 2D arcade snake survival game built for **Android (Capacitor 8)**, **Web Browsers**, and **Expo Go** using vanilla HTML5 Canvas, procedural Web Audio synthesis, and an $O(1)$ spatial hash engine—with zero external runtime libraries.

![Version](https://img.shields.io/badge/Version-3.0.0-00F5A0)
![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20Web%20%7C%20Expo-00D9FF)
![HTML5](https://img.shields.io/badge/HTML5-Canvas%202D-E34F26?logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Capacitor](https://img.shields.io/badge/Capacitor-8.5.3-119EFF?logo=capacitor&logoColor=white)

---

## 🎮 Core Gameplay & Arena Mechanics

- **8400 × 8400 Toroidal Wraparound World:** Seamless borderless arena where crossing any boundary wraps smoothly to the opposite edge with full camera lerp, dynamic zoom-out as your snake grows, and a live bottom-right circular radar minimap showing nearby rivals, the King Snake, and Rare Orbs.
- **Dynamic Snake Thickness & Continuous Tail Rendering:** Serpents dynamically thicken in body and head radius as their length grows (`getSnakeBodyGrowthScale`, `getSnakeHeadGrowthScale`) with subtle agility scaling and continuous tapered tail rendering.
- **3-Minute Underwater Day & Night Cycle:** Smoothly interpolates across **Dawn (`☼`)**, **Midday (`☀`)**, **Dusk (`◒`)**, and **Night (`☾`)** using smoothstep blending. Purely visual—intensifies neon bioluminescence and plankton glow at night without altering physics or hitboxes.
- **Speed-Only Difficulty Modes & Dynamic Scaling Bot Waves:**
  - **Easy (*Calm currents: a slower pace to learn the abyss*):** `2.8 px/frame`
  - **Medium (*Open water: balanced and fast*):** `3.6 px/frame`
  - **Hard (*Deep abyss: relentless speed*):** `4.4 px/frame`
  - Difficulty changes **only** movement speed, applied equally to the player and every rival serpent. Bot waves, AI tactics, respawn bonuses, food density, abilities, and score multipliers are identical across all three modes.
  - **Dynamic Wave Spawning:** Each match begins with an initial rival wave and adds a fresh wave every `10 seconds` of active match time (paused during menus and ads) up to `BOT_MAX` in `src/game/config.js`. New bots spawn in a ring outside the player's camera view (at least `600 units` from the player and other serpents) with a `1.5-second` fade-in, and dead bots respawn so the arena population never drops below the active wave target.
  - **Aggressive Pack-Coordinated AI (~70% Aggressive / ~30% Scavenger):** **Hunter (`⚔`)** (predictive route-cutting & tactical Dash interception), **Encircler (`◉`)** (shrinking orbital coil traps), **Opportunist (`✦`)** (close-range cutoffs & flanking), and **Scavenger (`◈`)** (high-value loot harvesting). When multiple aggressive bots converge near the player, pack coordination distributes their approach angles to flank and encircle rather than stacking on a single line.
  - **Level-of-Detail (LOD) AI & 40 FPS Auto-Governor:** Nearby bots (`<= 1200 units`) run full multi-angle tactical probes every 2–3 frames, while distant bots use lightweight steering every 6–8 frames. If average FPS drops below 40 for 3 seconds, the engine automatically steps down graphics quality and trims the maximum bot cap in steps of 10 (down to a floor of 40).
- **3 Active Tactical Abilities:**
  - **👻 Ghost (`1`):** Phase safely through rival snake bodies for `3.0s` (`14s` cooldown).
  - **🧲 Resource Magnet (`2`):** Pull nearby fruits and energy orbs toward your head for `5.0s` (`12s` cooldown).
  - **⚡ Dash (`3`):** Surge at `1.85×` speed for `1.0s` (`8s` cooldown) and emit a radial shockwave that pushes nearby rivals back.
- **Neon Pixel Fruits, Gold Energy Orbs & Blue Plasma 2X Multipliers:**
  - **Procedural Offscreen Pixel-Art Fruits (`FRUITS` in `src/game/config.js`):**
    - **🍎 Apple:** `+20 points`, grows snake by `+1` (`60%` base spawn odds at Stage 1, apple-red neon outline & glow).
    - **🍒 Cherry:** `+35 points`, grows snake by `+1` (`30%` base spawn odds at Stage 1, crimson with green stem).
    - **🍇 Grapes:** `+50 points`, grows snake by `+2` (`10%` base spawn odds at Stage 1, purple grape cluster; treated as high-priority targets by aggressive bots).
    - **Dynamic Spawn & Expiration Lifecycle:** Each stage shifts spawn odds slightly toward higher-value fruits. A new fruit spawns every `2.5s` on a random free grid cell (never on snakes, bots, other food, or within 3 cells of the player's head) with a quick scale-in animation and expanding glow ring. Fruits expire after a stage-scaled lifetime (`9s` at Stage 1 down to `5s` at higher stages), blinking and shrinking in the final `2s` before popping away with a particle puff.
    - **CRT Neon Look & Feel:** Pre-rendered onto `48 × 48` offscreen canvases with zero image files, featuring gentle bobbing, occasional pixel sparkles, floating **boxed score popups** (`+20`, `+35`, `+50`), fruit-colored particle bursts, distinct Web Audio chimes for each fruit, and light mobile haptic feedback.
    - **Dynamic Stage Target Scores:** Recomputed automatically from the fruit spawn schedule (`24 spawns/min × stage-weighted avg fruit value + avg gold orbs`), scaling from `55%` of realistic maximum at Stage 1 up to `85%` at Stage 10.
  - **Central Danger Zone & Gold Energy Orbs:** An `850 px`-radius high-gravity maelstrom at the center of the map (`(4000, 4000)`) that slows movement to `0.78×` and houses **53 Gold Energy Orbs**.
  - **Rare Gold Glow Orbs:** Spawn every `40–60s` (lasting `25s` with a live circular countdown ring and edge direction pointer), granting **+3 length** and a **6-second cosmetic comet ribbon trail**.
  - **Collectible Map Power-Ups:** Random **Blue Plasma Orbs (`💠`, 8s, 2X Score Multiplier)**, **Magnet (`🧲`, 6s, 700px radius)**, and **Speed Boost (`⚡`, 5s, 1.6× speed)** items spawn across the arena (up to 3 active simultaneously). Fruit points stack with both the rapid-eat combo multiplier and the Blue Plasma `2X` multiplier.
  - **Big-Snake Food Shedding:** Snakes above length `40` periodically shed bonus fruits behind their tails every `3s` (capped to prevent late-game lag).
  - **Crowned #1 King Snake (`👑`):** The longest active snake wears a glowing crown, is tracked on the minimap, and drops **2× double-value loot** when eliminated.

---

## 🏆 Commercial Mobile Hub & Progression System (Save Schema v3)

- **Player XP, Levels & 14 Rank Titles:** Earn XP and Coins from survival time, food, kills, missions, achievements, and daily rewards. Progress through 14 titles from *Starter Serpent* to *Quantum Immortal*, with automatic milestone skin & coin unlocks at **Levels 5, 10, 12, 15, and 20**.
- **62 Procedural Custom-Anatomy Skins across 4 Categories & 5 Rarities:**
  - **Categories:** *Creature (19)*, *Funny & Meme (16)*, *Fantasy (16)*, and *Cyber & Neon (11)*.
  - **Rarities:** *Common*, *Uncommon*, *Rare*, *Epic*, *Legendary*, and *Mythic*.
  - **14 Procedural Head Shapes:** `round`, `cobra` (flared hood), `python` (heat pits), `viper`, `coffin`, `paddle`, `dragon` (horns), `arrow`, `pixel`, `duck`, `frog`, `bee` (translucent wings), `chicken` (rooster comb & beak), `crystal`, `samurai`, `phoenix`, `leviathan`.
  - **8 Eye Styles & 35+ Procedural Patterns/Trails:** `slit`, `googly`, `cute`, `derp`, `sunglasses`, `visor`, `angry`, `glowing` eyes; animated live canvas previews; unlockable via gameplay milestones, Coins, or a **1-Match Free Rewarded Ad Trial**. All skins remain 100% cosmetic with identical hitboxes.
- **3-Tier Mission System:**
  - **Daily Missions:** 4 missions drawn from a 10-mission pool, resetting automatically at local midnight.
  - **Weekly Missions:** 5 high-reward missions drawn from a 7-mission pool, resetting every ISO week.
  - **Elite Challenges:** 8 permanent high-skill mastery challenges awarding Mythic/Legendary skins (*Phoenix Serpent*, *Cyber Samurai*, *Quantum Serpent*, *Celestial Dragon*, *Ancient Guardian*, *Cosmic Serpent*, *Void Snake*) and exclusive player titles.
- **42 Career Achievements across 8 Categories:**
  - *Survival (6)*, *Combat (6)*, *Growth (6)*, *Abilities (5)*, *Collection (5)*, *King Slayer (4)*, *Hard Mode (4)*, and *Secret Achievements (6 hidden challenges)*.
  - Ranked across *Bronze*, *Silver*, *Gold*, *Diamond*, and *Mythic* tiers with an animated particle-burst **Reward Reveal Modal** and non-intrusive in-match quest completion toasts.
- **7-Day Daily Login Reward Calendar:** Persistent streak calendar awarding escalating Coin pouches, +350 XP boosts, and guaranteed *Green Anaconda* (Day 6) and *Cyber Neon* (Day 7) skins (or coin fallbacks).
- **Modular Google AdMob & Privacy-First Consent (`@capacitor-community/admob`):**
  - Integrated with Google **User Messaging Platform (UMP)** GDPR/privacy consent and Android lifecycle audio suspension.
  - **Non-Intrusive Placements:** Optional Rewarded Videos (*1× Safe Revive with 3.2s Spawn Shield*, *2× Match Coins*, *+75 Coin Bonus Chest*, *1-Match Skin Trial*), frequency-capped Interstitials between matches (every 3 matches with a 90s cooldown), and adaptive bottom banners on select menu subscreens only—never during active gameplay.
  - Configurable via `src/game/config.js` (`development` test IDs vs. `production` unit IDs) with a *Remove Forced Ads* option.

---

## ⚡ Engine & Mobile Performance Architecture

- **Fixed 60 Hz Physics Timestep:** Decouples simulation physics (`FIXED_STEP_MS = 16.67ms`) from variable display refresh rates.
- **$O(1)$ TypedArray Spatial Hash Grid:** Divides the `8000 × 8000` arena into `40 × 40` cells (`200 × 200 px` each) using pre-allocated `Int32Array` and `Float32Array` buffers (`spatialHeads`, `spatialNext`, `spatialX`, `spatialY`, `spatialRadius`) for zero-allocation neighbor lookups across collisions, food pickup, and AI whisker probes.
- **Zero-GC Object Pooling & Sprite Caching:** Recycles food orbs, burst particles, and floating combat text through pre-warmed pools; pre-renders radial neon glows (`64 × 64` offscreen canvas cache) and low-resolution background sky layers (`320 × 180`).
- **Auto-Adaptive Graphics Quality:** Monitors rolling frame time (`averageFrameMs`) and automatically steps down from `High` → `Medium` → `Low` if frame time exceeds `25ms`, capping particle budgets (`400` / `260` / `150`) and off-screen simulation rates.
- **Deferred Save Batching:** Throttles `localStorage` profile serialization during active matches (`flushDeferredProfileSave` every `3000ms` or on pause/game-over) to prevent JSON serialization frame spikes.

---

## 🕹️ Controls & Mobile Ergonomics

| Action | Desktop (Keyboard / Mouse) | Mobile / Touch (Portrait & Landscape) |
|---|---|---|
| **Steer** | Mouse Cursor or **A / D** / **ArrowLeft / ArrowRight** | **Virtual Joystick** or **Direct Drag / Swipe** |
| **Ghost Ability** | Key **1** or click HUD button | Tap **👻 Ghost** multi-touch ability button |
| **Magnet Ability** | Key **2** or click HUD button | Tap **🧲 Magnet** multi-touch ability button |
| **Dash Ability** | Key **3** or click HUD button | Tap **⚡ Dash** multi-touch ability button |
| **Leaderboard** | Top-right live scorecard | Collapsible top-right pill (`👑 Top`) |
| **Pause / Resume** | **P** or **Spacebar** | Tap **II** pause button or Android **Back** |
| **Restart Match** | **Enter** on Game Over screen | Tap **Play Again** |

**Mobile Customization (Settings Screen):**
- Switch between **Virtual Joystick** and **Direct Drag / Swipe** steering.
- Adjust **Joystick Sensitivity** (`50%–160%`) and **Joystick Size** (*Small*, *Medium*, *Large*).
- Toggle **Left-Handed Mode** (mirrors the ability dock and joystick ergonomics).
- Independent **SFX**, **Ambient Music**, **Master Volume (`0%–100%`)**, and **Haptic Vibration** controls.

---

## 🚀 Getting Started

### 1. Run Directly in a Browser
Open [`src/game/index.html`](src/game/index.html) (or [`www/index.html`](www/index.html)) in any modern desktop or mobile browser. No local server or build step is required for browser play.

### 2. Preview on Mobile with Expo Go
An Expo Go wrapper is provided in [`expo-preview/`](expo-preview/) for instant LAN testing on physical devices:

```sh
cd expo-preview
npm install
npm run preview
```

Scan the terminal QR code with **Expo Go** on the same Wi-Fi network.

### 3. Build & Run the Native Android App (Capacitor)
Requires **Node.js 22+**, **JDK 21**, **Android Studio**, and **Android SDK Platform 36**:

```sh
# Install dependencies
npm install

# Sync src/game/ to www/ and generate Android launcher/splash assets
npm run cap:sync

# Open the Android project in Android Studio
npm run android:open

# Build a debug APK from the command line
npm run android:debug

# Build a release Android App Bundle (.aab) for Google Play
npm run android:bundle
```

- **Debug APK Output:** `android/app/build/outputs/apk/debug/app-debug.apk`
- **Release AAB Output:** `android/app/build/outputs/bundle/release/app-release.aab`
- **Release Signing:** Copy `android/keystore.properties.example` to `android/keystore.properties` (git-ignored) or set `SERPENT_KEYSTORE_FILE`, `SERPENT_KEYSTORE_PASSWORD`, `SERPENT_KEY_ALIAS`, and `SERPENT_KEY_PASSWORD` environment variables.

---

## 📂 Project Structure

```text
├── src/game/
│   ├── index.html            # Strict-CSP HTML5 shell & responsive neon UI layout
│   ├── game.js               # Core game engine, AI, Web Audio synthesizer, progression & renderer
│   ├── config.js             # Shared world, camera, bot wave, food density & AdMob configuration
│   ├── privacy-policy.html   # Hosted GDPR/UMP & Google Play Data Safety privacy policy
│   └── icon.svg              # Vector source icon
├── www/                      # Generated web bundle consumed by Capacitor (synced via npm run web:sync)
├── android/                  # Native Capacitor Android Studio project (com.muneeb.neonserpents v3.0.0)
├── expo-preview/             # Expo Go React Native WebView wrapper for instant mobile LAN testing
├── scripts/
│   ├── sync-web-assets.mjs     # Copies src/game/* into www/
│   └── sync-android-assets.mjs # Generates Android adaptive icons, splash screens & Play Store artwork
├── assets/                   # Generated 512×512 & 1024×1024 Play Store icons
├── play-store-listing.md     # Google Play Console store copy, Data Safety & release checklist
└── package.json              # Build scripts and Capacitor / AdMob dependencies
```

---

## 🔒 Privacy & Google Play Release Readiness

- All player progression, skins, mission counters, achievements, and settings are stored locally on the device via `localStorage` (`serpentRun_save_v2`, Schema v3).
- Review [`src/game/privacy-policy.html`](src/game/privacy-policy.html) and [`play-store-listing.md`](play-store-listing.md) before publishing to Google Play.
- Before building a production release `.aab`, replace the placeholder AdMob production IDs in [`src/game/config.js`](src/game/config.js) and [`android/app/src/main/res/values/strings.xml`](android/app/src/main/res/values/strings.xml), then switch `ADMOB.environment` to `'production'`.

---

## 📄 License

MIT License — see [LICENSE](LICENSE).

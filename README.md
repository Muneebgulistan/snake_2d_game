# Serpent Run

A lightweight snake survival game for Android and the browser. Steer through a wraparound arena, collect food, grow, and avoid the other snakes. Best runs, skin unlocks and selection, and sound preferences are saved on the device.

## Game features

- A smoothly changing three-minute underwater day and night cycle. It changes the scenery only, so game rules stay consistent.
- An 8000 × 8000 wraparound world with a smooth following camera, a view scaled by screen area, and a circular minimap.
- Sparse, evenly spaced, stationary normal food with a slow respawn rate; food density and growth value are adjustable in `src/game/config.js`.
- **Dynamic Food Production by Big Snakes:** Snakes over length 40 periodically shed extra food orbs behind their tails—the longer the snake, the more food it produces.
- **Random Map Power-Ups:** Collectible Magnet (`🧲`) and Speed Boost (`⚡`) power-ups spawn randomly across the map with glowing animations and HUD alerts.
- 30, 40, or 50 rival snakes in Easy, Normal, or Hard, with Hunter, Encircler, Opportunist, and Scavenger behaviors. Difficulty also changes movement speed.
- Rare glow orbs that grant a short cosmetic trail and three extra segments, plus scattered food rewards when a snake is defeated.
- **Commercial Mobile Hub & Progression System:**
  - **Player XP, Levels & Coin Economy:** Earn XP and Coins from matches, food, kills, missions, achievements, and daily login rewards. Level up through 12 rank titles with milestone skin unlocks (Levels 5, 10, 15, 20) and coin bonuses.
  - **Skin Collection Shop:** Filter all 16 custom-anatomy skins by rarity (*Common*, *Rare*, *Epic*, *Legendary*) or ownership, purchase locked skins with earned Coins, or preview any skin for 1 match via an optional rewarded ad trial.
  - **Rotating Daily Missions:** 4 daily missions that automatically track in-game progress and reset cleanly at local midnight.
  - **7-Day Daily Login Rewards:** Persistent 7-day reward calendar awarding Coins, XP boosts, and rare/epic skins.
  - **12 Career Achievements & Lifetime Stats:** Track and claim rewards for First Dive, First Blood, Arena Survivor, Food Collector, Giant Serpent, King Slayer, Speed Demon, Master Survivor, Centurion, and more.
  - **Modular Google AdMob & Remove Ads Architecture:** Non-intrusive `AdManager` using official Google test Ad Unit IDs in development (`src/game/config.js`), supporting optional Rewarded Ads (1x Safe Revive, 2x Match Coins, Bonus Chest, 1-Match Skin Trial), frequency-capped Interstitials between matches, non-gameplay menu Banners, and a Google Play Billing–ready *Remove Forced Ads* screen.
- **Customizable Mobile Controls & Settings:** Virtual Joystick or Direct Drag/Swipe steering, adjustable joystick sensitivity (50%–160%) and size (Small/Medium/Large), Left-Handed ability dock layout, haptic vibration toggle, separate SFX and ambient music controls with master volume slider, and safe Reset Progress confirmation.
- **Crowned King Snake & Layout:** The #1 longest snake wears a large, screen-responsive glowing crown (`👑`) above its head and appears highlighted on the bottom-right minimap, while a compact live scorecard sits cleanly in the top-right corner; defeating the leader drops double loot. The center danger zone slows snakes and holds a cluster of high-value food.
- **16 Collectible Player Skins with Custom Anatomy:** Species-inspired and fantasy skins featuring unique head shapes (`cobra` flared hood with spectacle mark, `python` muscular jaw with labial heat pits, `viper` triangular head, `coffin` Black Mamba head, `paddle` sea krait head, `dragon` horned head, and `round`) and scale patterns (`chevron`, `reticulated`, `lightning`, `coral_tricolor`, `diamonds`, `ocelli`, `krait_rings`, `clouded`, `neon_grid`, etc.). Skin progress and selection are saved locally; bot colors stay independent.
- Wrapped arena movement, touch drag steering, keyboard and mouse controls, pause, and a home button.
- Adjustable Auto, High, Medium, and Low graphics settings with an optional FPS counter. Auto lowers detail when frame timing stays slow.
- Mobile-focused rendering with a fixed 60 Hz update step, cached glow/background layers, visible-area culling, and a spatial index for nearby collisions, food, and bot sensors.

## Run in a browser

Open `src/game/index.html` in a modern browser for a quick local play. The same page is copied into `www/` for Android packaging.

## Play on Android

### Preview with Expo Go

The Expo project is in `expo-preview/`. Install its dependencies, then start the LAN preview:

```sh
cd expo-preview
npm install
npm run preview
```

Scan the QR code with Expo Go while your phone and computer are on the same Wi-Fi. Keep the development server open while playing. Expo Go is for previews; use the Android app project below for a store release.

### Run or build the Android app

Install Node.js 22 or newer, Android Studio, Android SDK Platform 36, and the matching build tools. Then:

```sh
npm install
npm run cap:sync
npm run android:open
```

Run on a connected device from Android Studio. `npm run android:debug` creates a local debug build. For Google Play, generate a signed Android App Bundle (`.aab`) in Android Studio and protect the upload key and passwords. The application ID is `com.muneeb.neonserpents`; keep it unchanged after creating the Play Console app.

## Controls

- **Touch:** drag in the direction you want the snake to turn.
- **Pause:** tap the pause control.
- **Home:** tap the home icon or use Android Back during a game.
- **Keyboard:** mouse, A/D or arrow keys to steer; P or Space to pause; Enter to restart after a game ends.
- **Abilities:** press 1 for Ghost, 2 for Resource Magnet, and 3 for Dash, or tap the HUD buttons.

Choose Easy, Normal, or Hard from the home screen. The game works offline after installation.

Open **Settings** from the home screen to select graphics quality or enable the FPS counter. Auto quality starts Android at Low for smoother gameplay, starts desktop at High, and reduces detail when performance stays below its target.

## Project layout

```text
src/game/       Canonical game page, world configuration, privacy policy, and game icon
assets/         Store artwork and Android launcher icon sources
scripts/        Web sync and Android icon helpers
www/            Generated web files consumed by Capacitor
android/        Capacitor Android Studio project
expo-preview/   Expo Go wrapper for device previews
```

Edit the game in `src/game/`. Regenerate the Capacitor web bundle with `npm run web:sync`; update the Android project's assets with `npm run cap:sync`. The Expo preview copies the same source when `npm run preview` starts.

## Privacy and Play Store preparation

The game has no accounts, ads, analytics, or external game service. Best times, lengths, and sound preference are stored locally on the device. Review `src/game/privacy-policy.html` and publish it at a stable HTTPS address before submitting it to Google Play. A store copy draft and release checklist are in `play-store-listing.md`.

Before release, build and test a signed `.aab` on real Android devices, create store screenshots and a feature graphic, enter the hosted privacy policy URL, complete Play Console declarations, and use Play App Signing. Store artwork is in `assets/`.

## License

MIT. See [LICENSE](LICENSE).

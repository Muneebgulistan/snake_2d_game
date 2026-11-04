# Serpent Run

A lightweight snake survival game for Android and the browser. Steer through a wraparound arena, collect food, grow, and avoid the other snakes. Best runs, skin unlocks and selection, and sound preferences are saved on the device.

## Game features

- A smoothly changing three-minute underwater day and night cycle. It changes the scenery only, so game rules stay consistent.
- An 8000 × 8000 wraparound world with a smooth following camera, a view scaled by screen area, and a circular minimap.
- Six rival snakes with Hunter, Encircler, Opportunist, and Scavenger behaviors. Easy, Normal, and Hard change movement speed.
- Rare glow orbs that grant a short cosmetic trail and three extra segments, plus scattered food rewards when a snake is defeated.
- Six collectible player skins with survival-time and length unlocks. Skin progress and selection are saved locally; bot colors stay independent.
- Wrapped arena movement, touch drag steering, keyboard and mouse controls, pause, and a home button.

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

Choose Easy, Normal, or Hard from the home screen. The game works offline after installation.

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

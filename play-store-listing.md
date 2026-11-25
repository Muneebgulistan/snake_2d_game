# Google Play listing & release checklist — Serpent Run

## App name

Serpent Run

## Short description

Steer, grow, unlock 62 custom snake skins, and outsmart waves of AI serpents!

## Full description

Dive into **Serpent Run**, a fast-paced 2D arcade snake survival game built for smooth mobile play. Steer through a massive wraparound underwater arena, collect neon fruits and power-ups, trigger tactical abilities, and trap rival AI serpents to claim the crown!

**Key Features**

- **Speed-Only Difficulty & Scaling AI Waves:** Outmaneuver Hunter, Encircler, Opportunist, and Scavenger snakes across Easy (*Calm currents*), Medium (*Open water*), and Hard (*Deep abyss*) pace modes.
- **3 Active Abilities & Map Power-Ups:** Phase through danger with **Ghost**, pull in nearby orbs with **Magnet**, or blast rivals back with **Dash**, plus collect random Speed & Magnet map drops.
- **16 Custom-Anatomy Snake Skins:** Collect Common, Rare, Epic, and Legendary skins—including King Cobra (flared hood), Reticulated Python (labial heat pits), Emerald Tree Boa, Coral Snake, Diamondback, Black Mamba, Sea Krait, Cyber Neon, and Golden Dragon. All skins are 100% cosmetic with identical hitboxes.
- **Full Progression & Coin Economy:** Earn XP, level up, complete rotating Daily Missions, claim 7-Day Login Rewards, and unlock 12 Career Achievements.
- **Dynamic Arena Events:** Battle for the high-reward center Danger Zone, hunt Rare Glow Orbs, and dethrone the crowned #1 King Snake for double loot.
- **Customizable Mobile Controls:** Choose between Virtual Joystick or Direct Drag/Swipe steering, adjust sensitivity and joystick size, enable Left-Handed mode, and toggle haptic vibration.
- **Play Offline Anytime:** Core gameplay and local save progression work completely offline with no account required.

## Declarations to complete in Google Play Console

- **Ads Declaration:** Select **"Yes, my app contains ads"** when publishing with Google AdMob enabled. Ads only appear outside active gameplay (optional rewarded videos for Revive / 2x Coins / Bonus Chest / Skin Trial, frequency-capped interstitials between matches, and menu banners).
- **Data Safety Form:**
  - *Local Game Data:* Stored solely in on-device `localStorage` (not transmitted off device).
  - *Google Mobile Ads (AdMob) SDK:* When `@capacitor-community/admob` is enabled in production, declare collection/sharing of **Device or other IDs** (Advertising ID), **Approximate Location** (from IP address), **App interactions**, and **Diagnostics** for Advertising/Marketing, Analytics, and Fraud Prevention per Google's official [AdMob Data Safety guide](https://developers.google.com/admob/android/privacy/play-data-disclosure).
- **App Access:** All core features are accessible without sign-in.
- **Privacy Policy:** Publish `src/game/privacy-policy.html` at a public HTTPS URL and enter that URL in Play Console → App Content → Privacy Policy.
- **In-App Purchases (Optional Remove Ads):** Create managed product ID `com.muneeb.neonserpents.remove_ads` in Play Console when enabling live Google Play Billing.

## Store artwork checklist

- 512 × 512 high-res icon: `assets/play-store-icon.png` (and 1024 × 1024 source in `assets/play-store-icon-1024.png`).
- Capture 4–8 genuine 16:9 or 9:16 screenshots showing the Main Menu, Skin Collection, Active Arena Gameplay (King Crown + Abilities), and Game Over summary.
- Upload a 1024 × 500 Feature Graphic in Play Console.

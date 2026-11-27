# Google Play listing & release checklist — Slythox

## App name

Slythox

## Short description

Steer, grow, unlock 62 custom snake skins, and outsmart waves of AI serpents!

## Full description

Dive into **Slythox**, a fast-paced 2D arcade snake survival game built for smooth mobile play. Steer through a massive wraparound underwater arena, collect neon fruits and power-ups, trigger tactical abilities, and trap rival AI serpents to claim the crown!

**Key Features**

- **2 Complete Game Modes — Endless Arena & 50-Level Campaign:**
  - **Arena Survival:** Battle up to 80+ scaling AI serpents across an 8000×8000 wraparound neon ocean with dynamic Danger Zones, Rare Glow Orbs, and the #1 King Crown.
  - **50-Level Walled Campaign:** Conquer 50 handcrafted 60-second stages across 5 themed worlds (*Neon Maze*, *Coral Reef*, *Kelp Forest*, *Volcano Vents*, and *Abyss*) featuring pulsing jellyfish, directional currents, thermal plasma mines, and 3-star mastery rewards.
- **Speed-Only Difficulty & Smart AI Archetypes:** Outmaneuver Hunter, Encircler, Opportunist, and Scavenger snakes across Easy (*Calm currents*), Medium (*Open water*), and Hard (*Deep abyss*) pace modes.
- **3 Active Abilities & Map Power-Ups:** Phase through danger with **Ghost**, pull in nearby orbs and fruits with **Magnet**, or surge ahead with **Dash**, plus collect random Speed & Magnet map drops.
- **62 Custom-Anatomy Snake Skins:** Collect Common, Rare, Epic, and Legendary skins—including King Cobra (flared hood), Reticulated Python, Emerald Tree Boa, Coral Snake, Diamondback, Black Mamba, Sea Krait, Cyber Neon, and Golden Dragon. All skins are 100% cosmetic with identical hitboxes.
- **Full Progression & Coin Economy:** Earn XP, level up across 100 ranks, complete rotating Daily/Weekly/Elite Missions, claim 7-Day Login Rewards, and unlock 42 Career Achievements across 8 categories.
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

- **512 × 512 high-res icon:** `assets/play-store-icon.png` (and 1024 × 1024 source in `assets/play-store-icon-1024.png`).
- **1024 × 500 Feature Graphic:** `assets/play-store-feature-graphic.png` (ready to upload).
- **Screenshots:** Capture 4–8 genuine 16:9 or 9:16 screenshots showing the Main Menu, 50-Level Campaign Map, 62-Skin Vault, Active Arena Gameplay (King Crown + Abilities), and Game Over summary.

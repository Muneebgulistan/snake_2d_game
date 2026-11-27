# Google Play Store Compliance & Release Checklist — Slythox (`com.muneeb.neonserpents`)

Use this checklist when completing your **App Content** declarations in Google Play Console before submitting your production Android App Bundle (`.aab`).

---

## ⚠️ CRITICAL QUESTION BEFORE YOU SUBMIT: Does the Game Target Children?

> **Action Required — Please confirm whether Slythox targets children (under age 13 / Families program) or only General / 13+ audiences:**
>
> - **Option A: General Audience / 13+ Only (Recommended for standard AdMob monetization)**
>   - In **Google Play Console → App content → Target audience and content**, select age groups **13–15, 16–17, and 18 and over** only. Do **NOT** select under-13 age groups, and ensure your store listing does not use "designed for kids" claims.
>   - Current code configuration (`tagForChildDirectedTreatment: false`, `tagForUnderAgeOfConsent: false`, `maxAdContentRating: 'General'`) matches Option A.
> - **Option B: Children (Under 13) or Mixed Audience (Google Play Families Policy)**
>   - If you select any age group under 13 in Google Play Console, you **must**:
>     1. Enable `tagForChildDirectedTreatment: true` and `tagForUnderAgeOfConsent: true`, and set `maxAdContentRating: 'G'` in `AdManager.init()` inside `src/game/game.js`.
>     2. Serve **only** Google Play certified ad networks (AdMob with child-directed treatment enabled) and disable interest-based/personalized advertising and remarketing entirely.
>     3. Comply with Google Play Families Policy requirements regarding `com.google.android.gms.permission.AD_ID` (if targeting *solely* children under 13, Google Play requires removing `AD_ID` via `<uses-permission android:name="com.google.android.gms.permission.AD_ID" tools:node="remove"/>`).

---

## 1. Google Play Data Safety Form — Exact Answers

The game itself stores progress only locally on the device (`localStorage` with `android:allowBackup="false"`). However, because the app bundles the **Google Mobile Ads (AdMob) SDK**, Google Play requires declaring the data automatically collected and shared by the AdMob SDK.

### Step 1: Data Collection & Security Overview
| Question | Exact Answer |
| :--- | :--- |
| **Does your app collect or share any of the required user data types?** | **Yes** (via Google Mobile Ads / AdMob SDK) |
| **Is all of the user data collected by your app encrypted in transit?** | **Yes** (`android:usesCleartextTraffic="false"` enforces HTTPS/TLS) |
| **Do you provide a way for users to request that their data is deleted?** | **No — app does not create user accounts** (Local data can be deleted anytime via **Settings → Delete My Data** or clearing app storage; Advertising ID can be reset/deleted in Android Settings → Google → Ads) |

### Step 2: Data Types to Select
Select **ONLY** the following 4 data types (required for Google Mobile Ads / AdMob SDK):

1. **Location → Approximate location**
   - *Derived from IP address by the AdMob SDK for coarse regional ad serving, consent detection, and fraud prevention.*
2. **App activity → App interactions**
   - *Ad views, ad taps/clicks, and rewarded video completion events collected by the AdMob SDK.*
3. **App info and performance → Crash logs & Diagnostics**
   - *SDK stability, ad loading latency, and ad rendering diagnostics collected by the AdMob SDK.*
4. **Device or other IDs → Device or other IDs**
   - *Android Advertising ID (`AD_ID`) and App Set ID used by the AdMob SDK.*

*(Leave Personal info, Financial info, Health, Messages, Photos/Videos, Audio, Files, Calendar, Contacts, and Web browsing **unchecked**).*

### Step 3: Data Usage & Handling Details (For Each of the 4 Selected Types Above)
Use the answers below for all 4 selected data types:

| Question | Answer |
| :--- | :--- |
| **Is this data collected, shared, or both?** | **Collected and Shared** (transmitted to Google AdMob & ad partners) |
| **Is this data processed ephemerally?** | **No** |
| **Is this data required for your app, or can users choose whether it's collected?** | **Data collection is required** (users cannot use online ad features without the SDK communicating with Google, though they can opt out of personalized ads via UMP / Android Settings or play offline) |
| **Why is this user data collected and shared? (Purposes)** | Check: **Advertising or marketing**, **Analytics**, and **Fraud prevention, security, and compliance** |

---

## 2. Ads Declaration (`App content → Ads`)

- **Question:** *Does your app contain ads?*
- **Answer:** **Yes, my app contains ads.**
- **Placement Compliance Notes:**
  - **Banner Ads:** Displayed only at the bottom of secondary menu screens (`Skin Vault`, `Mission Command`, `Daily Rewards`). Automatically hidden/removed during active gameplay and on the main menu.
  - **Interstitial Ads:** Displayed only after a match ends (Game Over screen), frequency-capped to at most 1 every 3 completed matches with a 90-second minimum cooldown. Never shown during active gameplay.
  - **Rewarded Ads:** Displayed only when explicitly initiated by the player (`Revive Snake`, `2x Match Coins`, `Bonus Chest`, `1-Match Skin Trial`).

---

## 3. Content Rating Questionnaire (IARC) Notes

When filling out the **Content Rating (IARC)** questionnaire in Google Play Console:
- **Category:** **Game**
- **Violence:** **No realistic violence.** Players control stylized neon/creature snakes in a top-down 2D arena; when a snake hits another snake's body, it dissolves into glowing light orbs (abstract/arcade elimination, no blood or gore).
- **Fear / Horror:** **No.**
- **Sexuality / Nudity:** **No.**
- **Profanity / Crude Humor:** **No** (contains lighthearted novelty skins such as "Banana Serpent", "Rubber Duck Snake", and "Toilet Snake" with cartoon water swirls, no bodily fluids or offensive content).
- **Controlled Substances / Gambling:** **No** (no simulated gambling, no loot boxes, no randomized paid gacha—all skins have deterministic coin prices or skill unlock milestones).
- **User Interaction / Sharing:** **No** (offline single-player against AI bots; no chat, no user-generated content, no location sharing).
- **In-App Purchases:** Select **Yes** only if you enable the live Google Play Billing `Remove Forced Ads` product (`com.muneeb.neonserpents.remove_ads`); otherwise select **No**.

---

## 4. Advertising ID Declaration (`App content → Advertising ID`)

- **Does your app use the Advertising ID?** → **Yes**
- **Why does your app need to use the Advertising ID?** → Check **Advertising or marketing** and **Analytics** (used by Google Mobile Ads SDK for frequency capping, attribution, and fraud prevention).

---

## 5. Manual Pre-Release Steps You Must Complete Before Uploading to Google Play

1. **Set Your Contact Email in the Privacy Policy (Done — `muneebgulistan@gmail.com`):**
   - `src/game/privacy-policy.html` (Section 7) is configured with `muneebgulistan@gmail.com` and synced to `www/privacy-policy.html`.
   - Host `www/privacy-policy.html` at a public HTTPS URL (e.g., GitHub Pages) and paste that URL into **Google Play Console → App content → Privacy policy**.
2. **AdMob Production Ad Unit IDs (`src/game/config.js` & `strings.xml`):**
   - **Already Configured:**
     - App ID (`strings.xml` & `config.js`): `ca-app-pub-2429367755608627~9936865964`
     - Banner Ad Unit ID: `ca-app-pub-2429367755608627/5343014834`
     - Rewarded Ad Unit ID: `ca-app-pub-2429367755608627/1640281386`
   - **Optional:** If you also want Interstitial ads between matches in production, replace `ADMOB.productionIds.interstitial` (`ca-app-pub-XXXXXXXXXXXXXXXX/IIIIIIIIII`) in `src/game/config.js` with your real Interstitial Ad Unit ID and run `npm run cap:sync`. (If left as a placeholder, `AdManager` safely skips interstitial requests in production without crashing or showing test ads).
   - *(Note: `ADMOB.environment` switches automatically between `'development'` in debug builds and `'production'` in release builds via `MainActivity.NativeBuildBridge`—no manual environment toggle is needed).*
3. **Release Signing Keystore (`android/serpent-run-release.jks` & `android/keystore.properties` — Ready):**
   - Pre-generated and configured in `android/serpent-run-release.jks` and `android/keystore.properties` (both git-ignored so credentials are never committed):
     - **Keystore File:** `android/serpent-run-release.jks` (PKCS#12, 2048-bit RSA, 10,000-day validity)
     - **Key Alias:** `serpent-run`
     - **Store / Key Password:** See `android/keystore.properties` (Back up `android/serpent-run-release.jks` and `android/keystore.properties` in a safe place!)
4. **Configure UMP GDPR Consent Message in AdMob Console:**
   - In your Google AdMob Console, open **Privacy & messaging → European regulations (GDPR)** and publish a consent message for `com.muneeb.neonserpents` so the native UMP SDK presents your consent form automatically to EEA/UK users.
5. **Build the Signed Release Bundle (`.aab`):**
   - Ensure Android Studio (or JDK 17/21 + Android SDK) is installed, then either:
     - Open the `android/` folder in **Android Studio → Build → Generate Signed App Bundle / APK** (or run Gradle task `bundleRelease`), OR
     - From terminal with `JAVA_HOME` and `ANDROID_HOME` set, run `npm run cap:sync && npm run android:bundle`.
   - Upload `android/app/build/outputs/bundle/release/app-release.aab` to Google Play Console.

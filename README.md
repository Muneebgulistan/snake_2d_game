# 🐍 Snake Arena

A competitive Snake game where you battle against AI opponents for food — built entirely in a **single HTML file** with vanilla JavaScript, HTML5 Canvas, and zero dependencies.

![HTML5](https://img.shields.io/badge/HTML5-Canvas-E34F26?logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?logo=javascript&logoColor=black)
![No Dependencies](https://img.shields.io/badge/Dependencies-None-brightgreen)

## 🎮 Play

Just open `index.html` in any modern browser — no build step, no server, no installs.

## ✨ Features

### Core Gameplay
- **30×30 grid** on a 600×600 canvas with a dark theme and subtle grid lines
- Smooth snake movement on a fixed tick timer (~120ms)
- Arrow keys and WASD controls with reverse-direction blocking
- Food spawns at random empty cells — 3 to 5 items always on the board
- Snake grows on eating, +10 points per food

### AI Opponents
- Up to **5 AI snakes**, each with a unique color
- AI chases the nearest food while avoiding walls and all snake bodies
- **Blocking behavior** — AIs try to cut off your path to food
- Randomness ensures AIs don't act identically
- AIs respawn after death at a random safe spot

### Collision Rules
| Scenario | Result |
|----------|--------|
| Player hits wall or self | Player dies (Game Over) |
| Player head → AI body | Player dies |
| AI head → Player body | AI dies, player gets +20 points |
| Head-on collision | Both snakes die |

### Difficulty Modes

| Setting | AI Count | Blocking | AI Respawn |
|---------|----------|----------|------------|
| **Easy** | 1 | Minimal | 4 seconds |
| **Normal** | 3 | Moderate | 3 seconds |
| **Hard** | 5 | Aggressive | 1.8 seconds |

### Polish & Effects
- 🔊 **Sound effects** via Web Audio API (eat, die, AI eliminated) — no audio files needed
- 🔇 Mute toggle
- 💥 Particle bursts when food is eaten
- 📳 Screen shake on death
- ⚡ Speed increases every 5 food eaten
- 🏆 Live leaderboard ranking all snakes by length
- 💾 High score persists via `localStorage`
- ⏸️ Pause with **P** or **Space**

### Mobile Support
- Touch **swipe controls** work anywhere on the canvas
- Page scrolling is blocked during play
- Canvas scales responsively to fit smaller screens

## 🕹️ Controls

| Action | Input |
|--------|-------|
| Move | Arrow Keys / WASD |
| Pause / Resume | P or Space |
| Restart (on Game Over) | Enter or Tap |
| Swipe (mobile) | Any direction on canvas |

## 🏗️ Code Structure

The JavaScript is organized into clearly labeled sections:

```
§1   Constants          — grid size, colors, difficulty presets
§2   DOM References     — canvas, HUD, overlay elements
§3   Audio              — Web Audio API synthesized sound effects
§4   Game State          — player, AI, food, score variables
§5   Utilities          — bounds check, occupied cells, random spawn
§6   Snake Factory      — creates snake objects with body, direction, color
§7   Initialization     — resets board, spawns player/AI/food
§8   Input Handling     — keyboard, touch/swipe, click events
§9   Game Loop & Update — tick, move, food check, speed scaling
§10  AI Decision Making — food targeting, blocking, trap avoidance
§11  Particles & Shake  — visual effects engine
§12  Render             — canvas drawing (grid, food, snakes, particles)
§13  HUD Update         — score, speed, leaderboard
§14  Difficulty Selector— menu button handlers
§15  Startup            — load high score, start render loop
```

## 📄 License

MIT — do whatever you want with it.

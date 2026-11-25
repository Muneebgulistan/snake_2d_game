import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const configSrc = await readFile(new URL('../src/game/config.js', import.meta.url), 'utf8');
const gameSrc = await readFile(new URL('../src/game/game.js', import.meta.url), 'utf8');
const htmlSrc = await readFile(new URL('../src/game/index.html', import.meta.url), 'utf8');

// Evaluate config.js in a clean browser-like VM context
const sandbox = { window: {}, navigator: { userAgent: 'Desktop' } };
vm.createContext(sandbox);
vm.runInContext(configSrc, sandbox);

const arena = JSON.parse(JSON.stringify(sandbox.window.GAME_CONFIG));
const levels = JSON.parse(JSON.stringify(sandbox.window.LEVELS_CONFIG));

// 1. Arena config intact
assert.ok(arena, 'GAME_CONFIG must exist');
assert.equal(arena.WORLD_WIDTH, 8000, 'Arena WORLD_WIDTH must remain 8000');
assert.equal(arena.WORLD_HEIGHT, 8000, 'Arena WORLD_HEIGHT must remain 8000');
assert.equal(arena.BOT_START_COUNT, 50, 'Arena BOT_START_COUNT must remain 50');
assert.equal(arena.BOT_WAVE_ADD, 5, 'Arena BOT_WAVE_ADD must remain 5');
assert.equal(arena.BOT_WAVE_INTERVAL_MS, 10000, 'Arena BOT_WAVE_INTERVAL_MS must remain 10000');
assert.equal(arena.BOT_MAX_DESKTOP, 120, 'Arena BOT_MAX_DESKTOP must remain 120');
assert.equal(arena.BOT_MAX_MOBILE, 80, 'Arena BOT_MAX_MOBILE must remain 80');

// 2. Levels config completely separated & compliant
assert.ok(levels, 'LEVELS_CONFIG must exist');
assert.equal(levels.MODE_ID, 'levels');
assert.equal(levels.WRAP_AROUND, false, 'Levels must NOT wrap around');
assert.equal(levels.USE_CAMERA_FOLLOW, false, 'Levels must NOT use camera follow');
assert.equal(levels.USE_MINIMAP, false, 'Levels must NOT use minimap');
assert.equal(levels.USE_DANGER_ZONE, false, 'Levels must NOT use danger zone');

assert.deepEqual(levels.GRID_LANDSCAPE, { cols: 32, rows: 18 }, 'Landscape fixed grid must be 32x18');
assert.deepEqual(levels.GRID_PORTRAIT, { cols: 18, rows: 32 }, 'Portrait fixed grid must be 18x32');
assert.equal(levels.ROUND_DURATION_SEC, 60, 'Each level round must be 60 seconds');
assert.equal(levels.FRUIT_SPAWN_INTERVAL_MS, 2500, 'Fruit spawn interval must be 2500ms');
assert.equal(levels.SPAWN_MIN_HEAD_CLEAR_CELLS, 3, 'Minimum spawn clearance from head must be 3 cells');
assert.equal(levels.START_LIVES, 3, 'Player must start with 3 hearts');
assert.equal(levels.RESPAWN_SHIELD_MS, 2000, 'Respawn shield must be 2000ms');
assert.equal(levels.BOT_MAX, 2, 'Levels must never exceed 2 bots');
assert.equal(levels.BOT_RESPAWN_MS, 3000, 'Bot respawn must be 3000ms');
assert.deepEqual(levels.STAR_THRESHOLDS, { one: 1.0, two: 1.15, three: 1.35 }, 'Star thresholds must be 100%/115%/135%');

// 3. 5 Worlds x 10 Levels = 50 Levels
assert.equal(levels.WORLDS.length, 5, 'Must have 5 worlds');
assert.deepEqual(
  levels.WORLDS.map(w => w.name),
  ['Neon Maze', 'Coral Reef', 'Kelp Forest', 'Volcano Vents', 'Abyss'],
  'World names must match specification'
);
assert.equal(levels.LEVELS.length, 50, 'Must have 50 levels');

const bossLevels = levels.LEVELS.filter(l => l.isBoss).map(l => l.level);
assert.deepEqual(bossLevels, [10, 20, 30, 40, 50], 'Boss levels must be 10, 20, 30, 40, 50');

for (const l of levels.LEVELS) {
  assert.ok(l.targetScore >= 350 && l.targetScore <= 1000, `Level ${l.level} targetScore out of range: ${l.targetScore}`);
  assert.ok(l.botCount <= 2, `Level ${l.level} exceeds max 2 bots: ${l.botCount}`);
  if (l.level <= 2) assert.equal(l.botCount, 0, `Level ${l.level} must have 0 bots`);
  else if (l.level < 15) assert.equal(l.botCount, 1, `Level ${l.level} must have 1 bot`);
  else assert.equal(l.botCount, 2, `Level ${l.level} must have 2 bots`);

  // World-specific hazard rules
  if (l.worldId === 'neon_maze') {
    assert.deepEqual(l.hazards, { jellyfish: 0, currents: 0, mines: 0 }, `Neon Maze L${l.level} must be plain walled`);
  } else if (l.worldId === 'coral_reef') {
    assert.ok(l.hazards.jellyfish > 0 && l.hazards.currents === 0 && l.hazards.mines === 0);
  } else if (l.worldId === 'kelp_forest') {
    assert.ok(l.hazards.currents > 0 && l.hazards.jellyfish === 0 && l.hazards.mines === 0);
  } else if (l.worldId === 'volcano_vents') {
    assert.ok(l.hazards.mines > 0 && l.hazards.jellyfish === 0 && l.hazards.currents === 0);
  } else if (l.worldId === 'abyss') {
    assert.ok(l.hazards.jellyfish > 0 && l.hazards.currents > 0 && l.hazards.mines > 0);
  }
}

assert.ok(levels.LEVELS[0].fruitLifetimeMs > levels.LEVELS[49].fruitLifetimeMs, 'Fruit lifetime must decrease as levels go up');

// 4. Code & HTML isolation checks
assert.ok(gameSrc.includes("let gameMode = 'arena';"), 'Explicit gameMode switch must exist in game.js');
assert.ok(gameSrc.includes('const LevelsMode = {'), 'Isolated LevelsMode module must exist in game.js');
assert.ok(htmlSrc.includes('id="levels-hud"'), 'Dedicated #levels-hud must exist in index.html');
assert.ok(htmlSrc.includes('id="levels-screen"'), 'Level select #levels-screen must exist in index.html');
assert.ok(htmlSrc.includes('id="level-result-overlay"'), 'Level result overlay must exist in index.html');

// Ensure LevelsMode block does not reference Arena wrap() or WORLD_WIDTH or drawMinimap
const levelsBlockStart = gameSrc.indexOf('const LevelsMode = {');
const levelsBlockEnd = gameSrc.indexOf('// §10  LOOP & STARTUP');
assert.ok(levelsBlockStart > 0 && levelsBlockEnd > levelsBlockStart, 'LevelsMode section markers must exist');
const levelsBlock = gameSrc.slice(levelsBlockStart, levelsBlockEnd);
assert.ok(!levelsBlock.includes('WORLD_WIDTH'), 'LevelsMode must not use Arena WORLD_WIDTH');
assert.ok(!levelsBlock.includes('WORLD_HEIGHT'), 'LevelsMode must not use Arena WORLD_HEIGHT');
assert.ok(!levelsBlock.includes('drawMinimap'), 'LevelsMode must not draw Arena minimap');
assert.ok(!/\bwrap\s*\(/.test(levelsBlock), 'LevelsMode must not call Arena wrap()');

console.log('ALL ARENA & LEVELS MODE VERIFICATION CHECKS PASSED (50 levels, 5 worlds, 0 wrap-around, max 2 bots, 3 hearts, 60s timer).');

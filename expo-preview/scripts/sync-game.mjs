import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '../..');
const outDir = resolve(here, '../src');
await mkdir(outDir, { recursive: true });

const config = await readFile(resolve(projectRoot, 'src/game/config.js'), 'utf8');
const game = (await readFile(resolve(projectRoot, 'src/game/index.html'), 'utf8'))
  .replace(/<link rel="icon"[^>]*>/, '')
  .replace('<script src="config.js"></script>', `<script>${config}</script>`);
const privacy = await readFile(resolve(projectRoot, 'src/game/privacy-policy.html'), 'utf8');
const source = `// Generated from the project-root HTML files by npm run sync:game.\n` +
  `export const GAME_HTML = ${JSON.stringify(game)};\n` +
  `export const PRIVACY_HTML = ${JSON.stringify(privacy)};\n`;

await writeFile(resolve(outDir, 'game-content.ts'), source, 'utf8');
console.log('Copied the current game and privacy policy into the Expo Go preview.');

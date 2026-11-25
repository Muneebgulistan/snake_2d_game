import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const indexUrl = new URL('../src/game/index.html', import.meta.url);
const gameJsUrl = new URL('../src/game/game.js', import.meta.url);
const html = await readFile(indexUrl, 'utf8');
const inlineMatch = html.match(/<script>\r?\n([\s\S]*?)\r?\n<\/script>/);
if (inlineMatch) {
  await writeFile(gameJsUrl, inlineMatch[1] + '\n', 'utf8');
  const cleanedHtml = html.replace(/<script>\r?\n[\s\S]*?\r?\n<\/script>/, '<script src="game.js"></script>');
  await writeFile(indexUrl, cleanedHtml, 'utf8');
}

await mkdir(new URL('../www/', import.meta.url), { recursive: true });
await mkdir(new URL('../www/assets/', import.meta.url), { recursive: true });
await copyFile(indexUrl, new URL('../www/index.html', import.meta.url));
await copyFile(new URL('../src/game/config.js', import.meta.url), new URL('../www/config.js', import.meta.url));
await copyFile(gameJsUrl, new URL('../www/game.js', import.meta.url));
await copyFile(new URL('../src/game/privacy-policy.html', import.meta.url), new URL('../www/privacy-policy.html', import.meta.url));
await copyFile(new URL('../src/game/assets/icon.svg', import.meta.url), new URL('../www/assets/icon.svg', import.meta.url));

console.log('Synced the game and privacy policy into www/.');

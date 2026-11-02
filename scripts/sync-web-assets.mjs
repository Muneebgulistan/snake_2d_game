import { copyFile, mkdir } from 'node:fs/promises';

await mkdir(new URL('../www/', import.meta.url), { recursive: true });
await mkdir(new URL('../www/assets/', import.meta.url), { recursive: true });
await copyFile(new URL('../src/game/index.html', import.meta.url), new URL('../www/index.html', import.meta.url));
await copyFile(new URL('../src/game/privacy-policy.html', import.meta.url), new URL('../www/privacy-policy.html', import.meta.url));
await copyFile(new URL('../src/game/assets/icon.svg', import.meta.url), new URL('../www/assets/icon.svg', import.meta.url));

console.log('Synced the game and privacy policy into www/.');

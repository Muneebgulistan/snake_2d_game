import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const webDir = join(projectDir, 'www');
const androidAssets = join(projectDir, 'android', 'app', 'src', 'main', 'assets');
const publicDir = join(androidAssets, 'public');

async function copyTree(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);
    if (entry.isDirectory()) await copyTree(sourcePath, targetPath);
    else if (entry.isFile()) await copyFile(sourcePath, targetPath);
  }
}

await copyTree(webDir, publicDir);
await copyFile(join(projectDir, 'capacitor.config.json'), join(androidAssets, 'capacitor.config.json'));

// Ensure Capacitor native plugins registry is always up to date for Android WebView bridge
const pluginsJson = [
  {
    pkg: '@capacitor-community/admob',
    classpath: 'com.getcapacitor.community.admob.AdMob'
  }
];
await writeFile(join(androidAssets, 'capacitor.plugins.json'), JSON.stringify(pluginsJson, null, 2) + '\n', 'utf8');

console.log(`Copied ${relative(projectDir, webDir)} and capacitor.plugins.json into the Android WebView assets.`);

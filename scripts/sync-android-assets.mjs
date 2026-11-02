import { copyFile, mkdir, readdir } from 'node:fs/promises';
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
console.log(`Copied ${relative(projectDir, webDir)} into the Android WebView assets.`);

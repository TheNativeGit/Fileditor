const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

/**
 * Loads simple KEY=VALUE pairs from .env.local without external dependencies.
 */
function loadLocalEnv() {
  const envPath = path.join(rootDir, '.env.local');
  const result = {};
  if (!fs.existsSync(envPath)) return result;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) result[key] = val;
  }
  return result;
}

const localEnv = loadLocalEnv();
const DEST_DIR = process.env.FILEDITOR_SHIP_DIR || localEnv.FILEDITOR_SHIP_DIR || '';

// Read version dynamically from package.json
const packageJsonPath = path.join(rootDir, 'package.json');

if (!fs.existsSync(packageJsonPath)) {
  console.error(`[ship] Error: package.json not found at: ${packageJsonPath}`);
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

console.log(`\n========================================`);
console.log(`  Fileditor Release Shipper (v${version})`);
console.log(`========================================\n`);

if (!DEST_DIR) {
  const standalonePath = path.join(rootDir, 'src-tauri', 'target', 'release', 'Fileditor.exe');
  const nsisDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
  console.log(`[ship] Note: FILEDITOR_SHIP_DIR is not set in .env.local or environment.`);
  console.log(`[ship] Build artifacts remain in their default output directories:`);
  console.log(`       Standalone EXE: ${standalonePath}`);
  console.log(`       NSIS Installer: ${nsisDir}\n`);
  process.exit(0);
}

function ensureDestDir() {
  if (!fs.existsSync(DEST_DIR)) {
    try {
      fs.mkdirSync(DEST_DIR, { recursive: true });
      console.log(`[ship] Created target directory: ${DEST_DIR}`);
    } catch (e) {
      console.error(`[ship] Failed to create target directory ${DEST_DIR}:`, e.message);
      process.exit(1);
    }
  }
}

function copyFileSafe(srcPath, destPath, label) {
  if (!fs.existsSync(srcPath)) {
    console.error(`[ship] [MISSING] ${label} not found:`);
    console.error(`       -> ${srcPath}`);
    console.error(`       Please ensure the Tauri release build completed successfully.\n`);
    return false;
  }

  ensureDestDir();

  try {
    fs.copyFileSync(srcPath, destPath);
    const stats = fs.statSync(destPath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`[ship] [OK] ${label} copied successfully!`);
    console.log(`       From: ${srcPath}`);
    console.log(`       To:   ${destPath} (${sizeMb} MB)\n`);
    return true;
  } catch (err) {
    console.error(`[ship] [ERROR] Copying ${label} failed:`, err.message);
    return false;
  }
}

function shipStandalone() {
  const src = path.join(rootDir, 'src-tauri', 'target', 'release', 'Fileditor.exe');
  const dest = path.join(DEST_DIR, 'Fileditor.exe');
  return copyFileSafe(src, dest, 'Standalone EXE');
}

function shipInstaller() {
  const nsisDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
  let expectedName = `Fileditor_${version}_x64-setup.exe`;
  let src = path.join(nsisDir, expectedName);

  if (!fs.existsSync(src) && fs.existsSync(nsisDir)) {
    const candidates = fs.readdirSync(nsisDir).filter(f => f.endsWith('.exe'));
    if (candidates.length > 0) {
      const matched = candidates.find(f => f.includes(version)) || candidates[0];
      src = path.join(nsisDir, matched);
      expectedName = matched;
      console.log(`[ship] Using detected installer: ${expectedName}`);
    }
  }

  const dest = path.join(DEST_DIR, expectedName);
  return copyFileSafe(src, dest, `NSIS Installer (${expectedName})`);
}

const args = process.argv.slice(2);
const target = (args[0] || 'windows').toLowerCase().replace(/^--/, '');

let success = true;

switch (target) {
  case 'standalone':
    success = shipStandalone();
    break;
  case 'installer':
    success = shipInstaller();
    break;
  case 'all':
  case 'windows':
  default:
    const s1 = shipStandalone();
    const s2 = shipInstaller();
    success = s1 && s2;
    break;
}

if (!success) {
  console.log(`[ship] Some artifacts could not be copied. Check messages above.\n`);
  process.exit(1);
} else {
  console.log(`[ship] All requested artifacts shipped successfully to "${DEST_DIR}"!\n`);
}

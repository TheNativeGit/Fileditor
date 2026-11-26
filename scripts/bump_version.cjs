/**
 * Synchronously updates the SemVer version across:
 * - package.json
 * - src-tauri/Cargo.toml
 * - src-tauri/tauri.conf.json
 *
 * Usage: node scripts/bump_version.cjs 0.17.0
 */
const fs = require('fs');
const path = require('path');

const nextVersion = (process.argv[2] || '').trim().replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  console.error('Usage: node scripts/bump_version.cjs <X.Y.Z>');
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');

// 1. package.json
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const prevVersion = pkg.version;
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// 2. src-tauri/tauri.conf.json
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = nextVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');

// 3. src-tauri/Cargo.toml (only inside [package] header)
const cargoPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
let cargoToml = fs.readFileSync(cargoPath, 'utf8');
cargoToml = cargoToml.replace(
  /^(\[package\][\s\S]*?\r?\nversion\s*=\s*)"[^"]+"/m,
  `$1"${nextVersion}"`
);
fs.writeFileSync(cargoPath, cargoToml, 'utf8');

console.log(`[bump] Version updated: ${prevVersion} -> ${nextVersion}`);

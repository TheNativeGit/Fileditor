const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { buildMsvcEnv } = require('./msvc_env.cjs');

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
}

function resolveSigningEnv() {
  loadEnvLocal();
  const env = buildMsvcEnv(process.env, '[build:tauri]');
  let hasUpdaterKey = Boolean(env.TAURI_SIGNING_PRIVATE_KEY);

  if (!hasUpdaterKey) {
    const candidateKeyPath =
      env.FILEDITOR_UPDATER_KEY_PATH ||
      path.join(os.homedir(), '.tauri', 'fileditor-updater.key');

    if (fs.existsSync(candidateKeyPath)) {
      env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(candidateKeyPath, 'utf8').trim();
      if (env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
        env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '';
      }
      hasUpdaterKey = true;
      console.log(`[build:tauri] Using Tauri updater signing key from: ${candidateKeyPath}`);
    }
  }

  return { env, hasUpdaterKey };
}

const { env, hasUpdaterKey } = resolveSigningEnv();
const rawArgs = process.argv.slice(2);
const extraArgs = [...rawArgs];

if (hasUpdaterKey && !rawArgs.includes('-c') && !rawArgs.includes('--config')) {
  extraArgs.push('-c', '{"bundle":{"createUpdaterArtifacts":true}}');
}

const tauriBin = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri'
);

const result = spawnSync(`"${tauriBin}"`, ['build', ...extraArgs.map((a) => (a.includes('{') || a.includes(' ') ? `"${a.replace(/"/g, '\\"')}"` : a))], {
  stdio: 'inherit',
  shell: true,
  env
});

process.exit(result.status || 0);

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GIT_USER_NAME = 'TheNativeGit';
const GIT_USER_EMAIL = '118630672+TheNativeGit@users.noreply.github.com';
const DEV_REMOTE_URL = 'https://github.com/TheNativeGit/Fileditor-dev.git';
const PUBLIC_REMOTE_URL = 'https://github.com/TheNativeGit/Fileditor.git';

function run(cmd) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' }).trim();
}

console.log('=== Fileditor Developer Setup ===');

try {
  execSync(`git config user.name "${GIT_USER_NAME}"`, { stdio: 'inherit' });
  execSync(`git config user.email "${GIT_USER_EMAIL}"`, { stdio: 'inherit' });
  console.log(`[OK] Local Git identity set to: ${GIT_USER_NAME} <${GIT_USER_EMAIL}>`);

  const remotes = run('git remote').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (remotes.includes('origin')) {
    execSync(`git remote set-url origin "${DEV_REMOTE_URL}"`, { stdio: 'inherit' });
  } else {
    execSync(`git remote add origin "${DEV_REMOTE_URL}"`, { stdio: 'inherit' });
  }
  console.log(`[OK] Remote 'origin' (private dev) -> ${DEV_REMOTE_URL}`);

  if (remotes.includes('public')) {
    execSync(`git remote set-url public "${PUBLIC_REMOTE_URL}"`, { stdio: 'inherit' });
  } else {
    execSync(`git remote add public "${PUBLIC_REMOTE_URL}"`, { stdio: 'inherit' });
  }
  console.log(`[OK] Remote 'public' (public release) -> ${PUBLIC_REMOTE_URL}`);

  const envLocalPath = path.resolve(__dirname, '..', '.env.local');
  if (!fs.existsSync(envLocalPath)) {
    console.log('\n[HINT] .env.local not found yet. Create .env.local with:');
    console.log('       FILEDITOR_SHIP_DIR=<path-to-your-local-release-folder>');
  } else {
    console.log('[OK] .env.local detected.');
  }
} catch (err) {
  console.error('[ERROR] Setup failed:', err.message);
  process.exit(1);
}

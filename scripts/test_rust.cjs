const { spawnSync } = require('child_process');
const path = require('path');
const { buildMsvcEnv } = require('./msvc_env.cjs');

const rustDir = path.resolve(__dirname, '..', 'src-tauri');
const env = buildMsvcEnv(process.env, '[test:rust]');

const res = spawnSync('cargo', ['test'], {
  cwd: rustDir,
  stdio: 'inherit',
  shell: true,
  env
});

process.exit(res.status || 0);

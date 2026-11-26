const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function isLinkerAvailable(env) {
  try {
    execSync('where link.exe', { stdio: 'ignore', env });
    return true;
  } catch {
    return false;
  }
}

function getVcvarsPath() {
  const vswherePath = path.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe'
  );
  if (!fs.existsSync(vswherePath)) return null;
  try {
    const installPath = execSync(`"${vswherePath}" -latest -property installationPath`, { encoding: 'utf8' }).trim();
    if (!installPath) return null;
    const vcvars64 = path.join(installPath, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
    if (fs.existsSync(vcvars64)) return `"${vcvars64}"`;
    const vcvarsall = path.join(installPath, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
    if (fs.existsSync(vcvarsall)) return `"${vcvarsall}" x64`;
  } catch {
    return null;
  }
  return null;
}

/**
 * Builds a complete MSVC + Windows SDK environment in Node.js without cmd.exe %VAR% expansion issues.
 */
function buildMsvcEnv(baseEnv = process.env, logPrefix = '[msvc]') {
  const env = { ...baseEnv };

  if (!isLinkerAvailable(env)) {
    const vcvars = getVcvarsPath();
    if (vcvars) {
      console.log(`${logPrefix} Loading MSVC environment via: ${vcvars}`);
      const dump = execSync(`call ${vcvars} >nul && set`, {
        encoding: 'utf8',
        shell: 'cmd.exe',
        env,
        maxBuffer: 10 * 1024 * 1024
      });
      for (const line of dump.split(/\r?\n/)) {
        const eq = line.indexOf('=');
        if (eq > 0) {
          const key = line.slice(0, eq);
          const val = line.slice(eq + 1);
          // Remove existing case-insensitive duplicate keys on Windows
          for (const existing of Object.keys(env)) {
            if (existing.toLowerCase() === key.toLowerCase() && existing !== key) {
              delete env[existing];
            }
          }
          env[key] = val;
        }
      }
    }
  }

  const findKey = (target) =>
    Object.keys(env).find((k) => k.toLowerCase() === target.toLowerCase()) || target;

  const libKey = findKey('LIB');
  const hasSystemSdk = (env[libKey] || '')
    .split(';')
    .some((dir) => dir && fs.existsSync(path.join(dir, 'kernel32.lib')));

  if (!hasSystemSdk) {
    const sdkC = path.join(os.homedir(), '.windows-sdk', 'c');
    const umLib = path.join(sdkC, 'um', 'x64');
    const ucrtLib = path.join(sdkC, 'ucrt', 'x64');

    if (fs.existsSync(path.join(umLib, 'kernel32.lib'))) {
      let sdkVer = '10.0.22621.0';
      const incBase = path.join(sdkC, 'Include');
      if (fs.existsSync(incBase)) {
        const dirs = fs.readdirSync(incBase).filter((d) => d.startsWith('10.')).sort();
        if (dirs.length > 0) sdkVer = dirs[dirs.length - 1];
      }

      const incDirs = ['um', 'ucrt', 'shared', 'winrt', 'cppwinrt']
        .map((sub) => path.join(incBase, sdkVer, sub))
        .filter((p) => fs.existsSync(p));
      const binDir = path.join(sdkC, 'bin', sdkVer, 'x64');

      env[libKey] = [env[libKey], umLib, ucrtLib].filter(Boolean).join(';');

      const incKey = findKey('INCLUDE');
      env[incKey] = [env[incKey], ...incDirs].filter(Boolean).join(';');

      const pathKey = findKey('PATH');
      if (fs.existsSync(binDir)) {
        env[pathKey] = [binDir, env[pathKey]].filter(Boolean).join(';');
      }
      if (fs.existsSync(path.join(binDir, 'rc.exe'))) {
        env.RC = path.join(binDir, 'rc.exe');
      }
      console.log(`${logPrefix} Attached user-space Windows SDK (${sdkVer})`);
    }
  }

  return env;
}

module.exports = { buildMsvcEnv };

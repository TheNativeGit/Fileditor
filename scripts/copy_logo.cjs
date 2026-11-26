const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const src = process.env.FILEDITOR_LOGO_SRC || path.join(__dirname, '../Logo.png');
const destPublic = path.join(__dirname, '../public/Logo.png');

try {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, destPublic);
    console.log('Logo successfully copied to public/Logo.png!');
    console.log('Generating Windows (.ico), macOS (.icns) and png icon assets via tauri icon...');
    execSync(`npx.cmd tauri icon "${src}"`, { stdio: 'inherit' });
    console.log('All Tauri app icon assets (including icon.ico) updated successfully!');
  } else {
    console.error(`Error: Source logo file not found at ${src}`);
  }
} catch (err) {
  console.error('Error during copy/icon generation:', err);
}

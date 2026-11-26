/**
 * Generates custom dark-themed 24-bit uncompressed Windows BMP images for the NSIS installer:
 * - src-tauri/icons/nsis-sidebar.bmp (164 x 314)
 * - src-tauri/icons/nsis-header.bmp  (150 x 57)
 *
 * Uses built-in Node.js zlib to composite src-tauri/icons/128x128.png onto Fileditor's dark UI palette.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodeRgbaPng(pngPath) {
  const buf = fs.readFileSync(pngPath);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('Invalid PNG signature');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(width * height * 4);
  const prevRow = Buffer.alloc(stride);
  const currRow = Buffer.alloc(stride);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = inflated[rowStart];
    for (let i = 0; i < stride; i++) {
      const raw = inflated[rowStart + 1 + i];
      const a = i >= bpp ? currRow[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;
      let val = raw;
      if (filter === 1) val = (raw + a) & 0xff;
      else if (filter === 2) val = (raw + b) & 0xff;
      else if (filter === 3) val = (raw + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) val = (raw + paeth(a, b, c)) & 0xff;
      currRow[i] = val;
    }
    currRow.copy(prevRow);

    for (let x = 0; x < width; x++) {
      const dst = (y * width + x) * 4;
      const src = x * bpp;
      rgba[dst] = currRow[src];
      rgba[dst + 1] = currRow[src + 1];
      rgba[dst + 2] = currRow[src + 2];
      rgba[dst + 3] = bpp === 4 ? currRow[src + 3] : 255;
    }
  }

  return { width, height, rgba };
}

function write24BitBmp(outPath, width, height, getPixelRgb) {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowStride * height;
  const fileSize = 54 + pixelDataSize;
  const bmp = Buffer.alloc(fileSize);

  // BITMAPFILEHEADER (14 bytes)
  bmp.write('BM', 0, 2, 'ascii');
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(0, 6);
  bmp.writeUInt32LE(54, 10);

  // BITMAPINFOHEADER (40 bytes)
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(height, 22); // bottom-up
  bmp.writeUInt16LE(1, 26); // planes
  bmp.writeUInt16LE(24, 28); // 24-bit RGB
  bmp.writeUInt32LE(0, 30); // BI_RGB uncompressed
  bmp.writeUInt32LE(pixelDataSize, 34);
  bmp.writeInt32LE(2835, 38); // 72 DPI
  bmp.writeInt32LE(2835, 42);
  bmp.writeUInt32LE(0, 46);
  bmp.writeUInt32LE(0, 50);

  for (let y = 0; y < height; y++) {
    const bmpRow = height - 1 - y;
    const rowOffset = 54 + bmpRow * rowStride;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = getPixelRgb(x, y);
      const px = rowOffset + x * 3;
      bmp[px] = Math.max(0, Math.min(255, Math.round(b)));
      bmp[px + 1] = Math.max(0, Math.min(255, Math.round(g)));
      bmp[px + 2] = Math.max(0, Math.min(255, Math.round(r)));
    }
  }

  fs.writeFileSync(outPath, bmp);
}

function sampleLogoBilinear(logo, u, v) {
  const fx = u * (logo.width - 1);
  const fy = v * (logo.height - 1);
  const x0 = Math.max(0, Math.min(logo.width - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(logo.height - 1, Math.floor(fy)));
  const x1 = Math.min(logo.width - 1, x0 + 1);
  const y1 = Math.min(logo.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const px = (x, y) => {
    const idx = (y * logo.width + x) * 4;
    return [logo.rgba[idx], logo.rgba[idx + 1], logo.rgba[idx + 2], logo.rgba[idx + 3] / 255];
  };

  const p00 = px(x0, y0);
  const p10 = px(x1, y0);
  const p01 = px(x0, y1);
  const p11 = px(x1, y1);

  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = p00[c] * (1 - tx) + p10[c] * tx;
    const bot = p01[c] * (1 - tx) + p11[c] * tx;
    out[c] = top * (1 - ty) + bot * ty;
  }
  return out;
}

const iconsDir = path.resolve(__dirname, '..', 'src-tauri', 'icons');
let logo = null;
try {
  logo = decodeRgbaPng(path.join(iconsDir, '128x128.png'));
} catch (err) {
  console.warn('[nsis-images] Could not decode 128x128.png, using gradient only:', err.message);
}

// 1. Sidebar image: 164 x 314
const sidebarPath = path.join(iconsDir, 'nsis-sidebar.bmp');
write24BitBmp(sidebarPath, 164, 314, (x, y) => {
  const t = y / 313;
  // Base dark slate gradient (#090d16 -> #131c31)
  let r = 9 + t * 10;
  let g = 13 + t * 15;
  let b = 22 + t * 27;

  // Soft purple/sky ambient glow around logo center (82, 112)
  const dx = (x - 82) / 72;
  const dy = (y - 112) / 72;
  const dist2 = dx * dx + dy * dy;
  if (dist2 < 1.3) {
    const glow = Math.pow(1 - Math.min(1, dist2 / 1.3), 2) * 0.28;
    r += 155 * glow;
    g += 75 * glow;
    b += 240 * glow;
  }

  // Subtle right accent border (2px)
  if (x >= 162) {
    const edgeMix = 0.55;
    r = r * (1 - edgeMix) + 168 * edgeMix;
    g = g * (1 - edgeMix) + 85 * edgeMix;
    b = b * (1 - edgeMix) + 247 * edgeMix;
  }

  // Subtle decorative horizontal accent bar below logo
  if (y >= 186 && y <= 187 && x >= 44 && x <= 120) {
    const barAlpha = 1 - Math.abs(x - 82) / 42;
    r = r * (1 - barAlpha) + 168 * barAlpha;
    g = g * (1 - barAlpha) + 85 * barAlpha;
    b = b * (1 - barAlpha) + 247 * barAlpha;
  }

  // Composite 84x84 Fileditor logo at (40, 70)
  if (logo && x >= 40 && x < 124 && y >= 70 && y < 154) {
    const [lr, lg, lb, la] = sampleLogoBilinear(logo, (x - 40) / 84, (y - 70) / 84);
    r = r * (1 - la) + lr * la;
    g = g * (1 - la) + lg * la;
    b = b * (1 - la) + lb * la;
  }

  return [r, g, b];
});

// 2. Header image: 150 x 57
const headerPath = path.join(iconsDir, 'nsis-header.bmp');
write24BitBmp(headerPath, 150, 57, (x, y) => {
  const tx = x / 149;
  let r = 11 + tx * 9;
  let g = 16 + tx * 12;
  let b = 27 + tx * 20;

  // Bottom 2px purple accent bar
  if (y >= 55) {
    r = 168;
    g = 85;
    b = 247;
  }

  // Composite 38x38 Fileditor logo on right side (98, 9)
  if (logo && x >= 98 && x < 136 && y >= 9 && y < 47) {
    const [lr, lg, lb, la] = sampleLogoBilinear(logo, (x - 98) / 38, (y - 9) / 38);
    r = r * (1 - la) + lr * la;
    g = g * (1 - la) + lg * la;
    b = b * (1 - la) + lb * la;
  }

  return [r, g, b];
});

console.log('[nsis-images] Generated:', sidebarPath, 'and', headerPath);

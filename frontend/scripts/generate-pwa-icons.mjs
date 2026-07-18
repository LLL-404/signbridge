/**
 * 生成 PWA 图标 PNG 文件（192x192 与 512x512）
 *
 * 实现思路：使用 Node.js 内置 zlib + 手写 PNG 编码，生成纯色背景 + 居中"手"emoji 风格的简化图案。
 * 不依赖任何第三方库，输出合法 PNG（IHDR + IDAT + IEND 三段式）。
 *
 * 用法：node scripts/generate-pwa-icons.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '../public');

/** PNG CRC32 表（预计算，性能优化：避免每次调用重新生成） */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

/** 计算 CRC32 */
function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

/** 构造 PNG chunk：长度 + 类型 + 数据 + CRC */
function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcInput = Buffer.concat([typeBytes, data]);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lengthBuf, typeBytes, data, crcBuf]);
}

/**
 * 生成 RGBA 像素数据并打包为 PNG
 * @param {number} size - 图标尺寸（正方形）
 * @returns {Buffer} PNG 二进制数据
 */
function generateIconPng(size) {
  // 像素数据：每行以 filter byte (0) 开头，随后是 RGBA 四字节
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);

  // 配色：深色背景 #0a0a0f + 居中圆角矩形 + 蓝色手形简化图案
  const bgR = 0x0a, bgG = 0x0a, bgB = 0x0f, bgA = 0xff;
  const accentR = 0x3b, accentG = 0x82, accentB = 0xf6, accentA = 0xff;

  // 简化图案：在中心绘制一个圆角矩形边框 + 中央填充圆
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32; // 中央圆半径
  const margin = size * 0.12; // 边框留白
  const borderThickness = size * 0.04;

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const offset = rowStart + 1 + x * 4;

      // 计算到中心的距离
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r, g, b, a;

      if (dist < radius * 0.55) {
        // 中央圆：蓝色填充
        r = accentR; g = accentG; b = accentB; a = accentA;
      } else if (
        // 外边框区域
        x < margin ||
        x > size - margin ||
        y < margin ||
        y > size - margin
      ) {
        // 边框：深色背景
        r = bgR; g = bgG; b = bgB; a = bgA;
      } else if (
        // 内边框线
        (x >= margin && x < margin + borderThickness) ||
        (x <= size - margin && x > size - margin - borderThickness) ||
        (y >= margin && y < margin + borderThickness) ||
        (y <= size - margin && y > size - margin - borderThickness)
      ) {
        r = accentR; g = accentG; b = accentB; a = accentA;
      } else {
        // 默认：深色背景
        r = bgR; g = bgG; b = bgB; a = bgA;
      }

      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  // 压缩像素数据
  const compressed = zlib.deflateSync(raw);

  // PNG 文件签名
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk：宽、高、位深、颜色类型、压缩、滤波、隔行
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;                  // bit depth
  ihdr[9] = 6;                  // color type: RGBA
  ihdr[10] = 0;                 // compression: deflate
  ihdr[11] = 0;                 // filter method: standard
  ihdr[12] = 0;                 // interlace: none

  // 拼装 PNG
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 生成 192 和 512 两种尺寸
mkdirSync(PUBLIC_DIR, { recursive: true });

const sizes = [192, 512];
for (const size of sizes) {
  const png = generateIconPng(size);
  const filePath = resolve(PUBLIC_DIR, `pwa-${size}x${size}.png`);
  writeFileSync(filePath, png);
  console.log(`已生成 ${filePath} (${png.length} 字节)`);
}

console.log('PWA 图标生成完成');

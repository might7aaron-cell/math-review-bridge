'use strict';
const JSZip = require('../vendor/jszip.min.js');
const MAX_FILE = 32 * 1024 * 1024;
const MAX_EXPANDED = 80 * 1024 * 1024;
const MAX_ENTRY = 16 * 1024 * 1024;
const SUPPORTED = new Set(['math-review', 'gaodai-handoff', 'gaodai-feedback']);

function safeArchivePath(name) {
  return typeof name === 'string' && name.length > 0 && !name.startsWith('/') &&
    !name.includes('\\') && !name.includes(':') && !name.includes('\0') &&
    !name.split('/').some(p => p === '..' || p === '.');
}

// Inspect the central directory before any ZIP member is inflated.
function inspectZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) throw new Error('ZIP 目录不完整，请重新导出。');
  if (v.getUint16(end + 4, true) || v.getUint16(end + 6, true)) throw new Error('暂不支持分卷 ZIP。');
  const count = v.getUint16(end + 10, true), size = v.getUint32(end + 12, true);
  let pos = v.getUint32(end + 16, true), total = 0;
  if (count > 2000 || pos === 0xffffffff || size === 0xffffffff || pos + size > end) throw new Error('ZIP 过大或使用 ZIP64，请按章导出。');
  const start = pos, names = new Set();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || v.getUint32(pos, true) !== 0x02014b50) throw new Error('ZIP 目录损坏。');
    const flags = v.getUint16(pos + 8, true), method = v.getUint16(pos + 10, true);
    const length = v.getUint32(pos + 24, true), n = v.getUint16(pos + 28, true);
    const extra = v.getUint16(pos + 30, true), comment = v.getUint16(pos + 32, true);
    if (pos + 46 + n + extra + comment > end) throw new Error('ZIP 条目损坏。');
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + n));
    if (!safeArchivePath(name) || names.has(name)) throw new Error('ZIP 含不安全或重复的文件路径。');
    names.add(name);
    if (flags & 1 || ![0, 8].includes(method)) throw new Error('暂不支持加密或特殊压缩的 ZIP。');
    total += length;
    if (length > MAX_ENTRY || total > MAX_EXPANDED) throw new Error('ZIP 展开后过大，请拆成章节或压缩手写图片。');
    pos += 46 + n + extra + comment;
  }
  if (pos !== start + size) throw new Error('ZIP 目录长度不一致。');
}

function parseJson(text, name) {
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error(`${name} 不是有效 JSON。请直接使用导出的文件。`); }
}
function recognized(data) {
  return data && typeof data === 'object' && !Array.isArray(data) && SUPPORTED.has(data.format) && !data._formatGuide;
}
async function readInputs(inputs) {
  const documents = [], warnings = [];
  let batchBytes = 0;
  for (const input of inputs) {
    const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
    batchBytes += bytes.length;
    if (bytes.length > MAX_FILE || batchBytes > 64 * 1024 * 1024) throw new Error('单文件限 32 MB，一次导入限 64 MB。请按章导出。');
    if (/\.zip$/i.test(input.name)) {
      inspectZip(bytes);
      const zip = await JSZip.loadAsync(bytes);
      let found = 0, skipped = 0;
      for (const name of Object.keys(zip.files).sort()) {
        const entry = zip.files[name];
        if (entry.dir || !/\.json$/i.test(name) || /(^|\/)__MACOSX\//.test(name)) continue;
        const raw = await entry.async('uint8array');
        if (raw.length > MAX_ENTRY) throw new Error('JSON 过大，请按章导出。');
        const data = parseJson(new TextDecoder().decode(raw), name);
        if (!recognized(data)) { skipped++; continue; }
        const media = {};
        const base = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
        for (const item of Array.isArray(data.media) ? data.media : []) {
          if (!item || typeof item.photoId !== 'string' || !safeArchivePath(item.path)) continue;
          const path = base + item.path;
          const image = zip.file(path);
          if (image && /\.(png|jpe?g|gif|webp)$/i.test(path)) {
            const content = await image.async('uint8array');
            if (content.length > MAX_ENTRY) throw new Error('图片过大。');
            media[item.photoId] = { name: path.split('/').pop(), bytes: content };
          } else warnings.push(`未找到附件：${item.path}。题目和文字仍会导入。`);
        }
        documents.push({ data, name: input.name + '/' + name, media }); found++;
      }
      if (!found) throw new Error(`${input.name} 中没有受支持的资料。支持 math-review、gaodai-handoff、gaodai-feedback。`);
      if (skipped) warnings.push(`${input.name}：跳过 ${skipped} 个模板或其他格式 JSON；不会把格式说明当作学习反馈。`);
    } else if (/\.json$/i.test(input.name)) {
      const data = parseJson(new TextDecoder().decode(bytes), input.name);
      if (!recognized(data)) throw new Error(`${input.name} 格式不支持或只是格式模板。请导出实际资料包。`);
      documents.push({ data, name: input.name, media: {} });
    } else throw new Error('请选择 .json 或 .zip 文件。');
  }
  if (!documents.length) throw new Error('尚未选择资料。');
  return { documents, warnings };
}
module.exports = { readInputs, inspectZip, safeArchivePath };

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import imageSizePackage from 'image-size';
import { makeSlug, normalizeTags } from './security.js';

const imageSize = imageSizePackage.imageSize || imageSizePackage.default || imageSizePackage;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 250 * 1024 * 1024;
const MAX_FILES = 2000;
const MAX_RATIO = 300;
const now = () => new Date().toISOString();

export class GameArchiveError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function ensureSafeArchivePath(rawName) {
  if (typeof rawName !== 'string' || !rawName || rawName.includes('\0')) throw new GameArchiveError('The ZIP contains an invalid file name.');
  const name = rawName.replace(/\\/g, '/');
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) throw new GameArchiveError('Absolute paths are not allowed in game archives.');
  const segments = name.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) throw new GameArchiveError('The ZIP contains an unsafe path.');
  const normalized = path.posix.normalize(name);
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || normalized.length > 240) throw new GameArchiveError('The ZIP contains an unsafe path.');
  return normalized;
}

async function extractZipBuffer(buffer, destination) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new GameArchiveError('Choose a non-empty ZIP archive.');
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new GameArchiveError('ZIP archives must be 100 MB or smaller.', 413);
  await fsp.mkdir(destination, { recursive: true });

  return new Promise((resolve, reject) => {
    let zipFile;
    let settled = false;
    let entryCount = 0;
    let totalBytes = 0;
    const finishError = (error) => {
      if (settled) return;
      settled = true;
      try { zipFile?.close(); } catch {}
      reject(error instanceof GameArchiveError ? error : new GameArchiveError(error?.message || 'Could not read the ZIP archive.'));
    };
    try {
      yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (openError, opened) => {
        if (openError) return finishError(new GameArchiveError('The uploaded file is not a valid ZIP archive.'));
        zipFile = opened;
        zipFile.on('error', finishError);
        zipFile.on('end', () => {
          if (settled) return;
          settled = true;
          resolve({ files: entryCount, bytes: totalBytes });
        });
        zipFile.on('entry', (entry) => {
          if (settled) return;
          let relative;
          try {
            relative = ensureSafeArchivePath(entry.fileName);
            entryCount += 1;
            if (entryCount > MAX_FILES) throw new GameArchiveError(`Archives may contain at most ${MAX_FILES} files.`);
            const size = Number(entry.uncompressedSize || 0);
            const compressed = Number(entry.compressedSize || 0);
            totalBytes += size;
            if (!Number.isSafeInteger(size) || size < 0 || totalBytes > MAX_UNPACKED_BYTES) throw new GameArchiveError('The unpacked archive exceeds 250 MB.');
            if (size > 1024 * 1024 && compressed > 0 && size / compressed > MAX_RATIO) throw new GameArchiveError('This archive has an unsafe compression ratio.');
            const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
            if ((unixMode & 0xf000) === 0xa000) throw new GameArchiveError('Symbolic links are not allowed in game archives.');
          } catch (error) { return finishError(error); }
          const target = path.resolve(destination, ...relative.split('/'));
          const root = path.resolve(destination) + path.sep;
          if (!target.startsWith(root)) return finishError(new GameArchiveError('The ZIP contains an unsafe path.'));
          const isDirectory = entry.fileName.endsWith('/');
          if (isDirectory) {
            fsp.mkdir(target, { recursive: true }).then(() => zipFile.readEntry()).catch(finishError);
            return;
          }
          fsp.mkdir(path.dirname(target), { recursive: true }).then(() => {
            zipFile.openReadStream(entry, (streamError, readStream) => {
              if (streamError) return finishError(streamError);
              let bytes = 0;
              const guard = new Transform({
                transform(chunk, encoding, callback) {
                  bytes += chunk.length;
                  if (bytes > Number(entry.uncompressedSize || 0) || bytes > MAX_UNPACKED_BYTES) return callback(new GameArchiveError('An archive entry expands beyond its declared size.'));
                  callback(null, chunk);
                }
              });
              const writeStream = fs.createWriteStream(target, { flags: 'wx', mode: 0o640 });
              pipeline(readStream, guard, writeStream).then(() => {
                if (bytes !== Number(entry.uncompressedSize || 0)) return finishError(new GameArchiveError('The ZIP contains a truncated or invalid entry.'));
                zipFile.readEntry();
              }).catch(finishError);
            });
          }).catch(finishError);
        });
        zipFile.readEntry();
      });
    } catch (error) { finishError(error); }
  });
}

async function existsFile(filePath) {
  try { return (await fsp.stat(filePath)).isFile(); } catch { return false; }
}

async function firstExisting(root, names) {
  for (const name of names) {
    const fullPath = path.join(root, ...name.split('/'));
    if (await existsFile(fullPath)) return { name, fullPath };
  }
  return null;
}

async function resolveArchiveRoot(extractionDir) {
  let root = extractionDir;
  const hasMetadata = async (directory) => {
    try {
      const names = await fsp.readdir(directory);
      if (!names.includes('index.html') || !names.includes('media')) return false;
      const title = await firstExisting(directory, ['media/title.txt', 'title.txt']);
      const description = await firstExisting(directory, ['media/description.ru.txt', 'description.ru.txt', 'media/description.txt', 'description.txt']);
      const tags = await firstExisting(directory, ['media/tags.en.txt', 'tags.en.txt', 'media/tags.txt', 'tags.txt']);
      return Boolean(title && description && tags);
    } catch { return false; }
  };
  if (await hasMetadata(root)) return root;
  const children = await fsp.readdir(root, { withFileTypes: true });
  if (children.length === 1 && children[0].isDirectory()) {
    root = path.join(root, children[0].name);
    if (await hasMetadata(root)) return root;
  }
  throw new GameArchiveError('ZIP must include index.html, media/title.txt, both RU/EN description and tags files, and media/capsule.jpg or capsule.gif (or use one shared top-level folder).');
}

async function findValidCapsule(root) {
  const mediaDir = path.join(root, 'media');
  let names;
  try { names = await fsp.readdir(mediaDir, { withFileTypes: true }); }
  catch { throw new GameArchiveError('The archive is missing its media/ folder.'); }
  const candidates = names.filter((item) => item.isFile() && /\.(jpe?g|gif)$/i.test(item.name));
  candidates.sort((a, b) => {
    const score = (name) => /^capsule\.(jpg|jpeg|gif)$/i.test(name) ? 0 : 1;
    return score(a.name) - score(b.name) || a.name.localeCompare(b.name);
  });
  for (const item of candidates) {
    const fullPath = path.join(mediaDir, item.name);
    const buffer = await fsp.readFile(fullPath);
    let dimensions;
    try { dimensions = imageSize(buffer); } catch { continue; }
    if (dimensions.width === 630 && dimensions.height === 500 && ['jpg', 'jpeg', 'gif'].includes(String(dimensions.type).toLowerCase())) {
      return { relativePath: path.posix.join('media', item.name), format: String(dimensions.type).toLowerCase() };
    }
  }
  throw new GameArchiveError('The media/ folder must contain a valid JPG/JPEG or GIF capsule exactly 630 × 500 pixels.');
}

async function findValidFavicon(root) {
  const candidates = ['favicon.ico', 'media/favicon.ico', 'favicon.png', 'media/favicon.png', 'favicon.svg', 'media/favicon.svg'];
  const found = await firstExisting(root, candidates);
  if (!found) return null;
  const buffer = await fsp.readFile(found.fullPath);
  if (buffer.length > 1024 * 1024) throw new GameArchiveError('The game favicon must be 1 MB or smaller.');
  const extension = path.extname(found.name).toLowerCase();

  if (extension === '.ico') {
    if (buffer.length < 22 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
      throw new GameArchiveError('The game favicon.ico is not a valid Windows icon file.');
    }
    const images = buffer.readUInt16LE(4);
    if (images < 1 || buffer.length < 6 + images * 16) throw new GameArchiveError('The game favicon.ico contains an incomplete image directory.');
  } else if (extension === '.png') {
    let dimensions;
    try { dimensions = imageSize(buffer); } catch { throw new GameArchiveError('The game favicon.png is not a valid PNG image.'); }
    if (String(dimensions.type).toLowerCase() !== 'png' || !dimensions.width || !dimensions.height || dimensions.width > 512 || dimensions.height > 512) {
      throw new GameArchiveError('The game favicon.png must be a valid image no larger than 512 × 512 pixels.');
    }
  } else {
    const svg = buffer.toString('utf8');
    if (!/<svg\b/i.test(svg) || !/<\/svg\s*>/i.test(svg) || /<!DOCTYPE|<script\b|<foreignObject\b|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|javascript:|data:)/i.test(svg)) {
      throw new GameArchiveError('The game favicon.svg is invalid or contains unsupported active content.');
    }
  }
  return found.name.split('/').join('/');
}

async function readTextFile(root, name, maxLength) {
  const file = path.join(root, name);
  let value;
  try { value = await fsp.readFile(file, 'utf8'); }
  catch { throw new GameArchiveError(`The archive is missing ${name}.`); }
  value = value.replace(/^\uFEFF/, '').trim();
  if (!value) throw new GameArchiveError(`${name} cannot be empty.`);
  if (value.length > maxLength) throw new GameArchiveError(`${name} must be no longer than ${maxLength} characters.`);
  return value;
}

async function readTextFromCandidates(root, names, maxLength) {
  const found = await firstExisting(root, names);
  if (!found) throw new GameArchiveError(`The archive is missing ${names[0]}.`);
  let value = await fsp.readFile(found.fullPath, 'utf8');
  value = value.replace(/^\uFEFF/, '').trim();
  if (!value) throw new GameArchiveError(`${found.name} cannot be empty.`);
  if (value.length > maxLength) throw new GameArchiveError(`${found.name} must be no longer than ${maxLength} characters.`);
  return value;
}

async function hasAnyCandidate(root, names) {
  return Boolean(await firstExisting(root, names));
}

async function readLocalizedText(root, localizedName, legacyName, fallback, maxLength) {
  for (const name of [localizedName, legacyName].filter(Boolean)) {
    try { return await readTextFile(root, name, maxLength); } catch (error) {
      if (!(error instanceof GameArchiveError) || !String(error.message).includes('missing')) throw error;
    }
  }
  if (fallback) return fallback;
  throw new GameArchiveError(`The archive is missing ${localizedName}.`);
}

async function findUniqueSlug(db, title) {
  const base = makeSlug(title);
  let slug = base;
  let suffix = 2;
  while (await db.prepare('SELECT 1 FROM games WHERE slug=?').get(slug)) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

export async function createDraftFromZip({ db, zipBuffer, storageDir }) {
  if (zipBuffer.length > MAX_ARCHIVE_BYTES) throw new GameArchiveError('ZIP archives must be 100 MB or smaller.', 413);
  const tempParent = path.join(storageDir, 'tmp');
  await fsp.mkdir(tempParent, { recursive: true });
  const tempDir = await fsp.mkdtemp(path.join(tempParent, 'upload-'));
  let finalDir = '';
  try {
    await extractZipBuffer(zipBuffer, path.join(tempDir, 'unpacked'));
    const root = await resolveArchiveRoot(path.join(tempDir, 'unpacked'));
    const title = await readTextFromCandidates(root, ['media/title.txt', 'title.txt'], 120); // Game titles are intentionally English-only.
    if (/[А-Яа-яЁё]/.test(title)) throw new GameArchiveError('media/title.txt must contain the English game title.');
    const descriptionRuCandidates = ['media/description.ru.txt', 'description.ru.txt'];
    const descriptionEnCandidates = ['media/description.en.txt', 'description.en.txt'];
    const tagsRuCandidates = ['media/tags.ru.txt', 'tags.ru.txt'];
    const tagsEnCandidates = ['media/tags.en.txt', 'tags.en.txt'];
    const legacyDescription = ['media/description.txt', 'description.txt'];
    const legacyTags = ['media/tags.txt', 'tags.txt'];
    const hasDescriptionRu = await hasAnyCandidate(root, descriptionRuCandidates);
    const hasDescriptionEn = await hasAnyCandidate(root, descriptionEnCandidates);
    const hasTagsRu = await hasAnyCandidate(root, tagsRuCandidates);
    const hasTagsEn = await hasAnyCandidate(root, tagsEnCandidates);
    const anyLocalized = hasDescriptionRu || hasDescriptionEn || hasTagsRu || hasTagsEn;
    if (anyLocalized && !(hasDescriptionRu && hasDescriptionEn && hasTagsRu && hasTagsEn)) {
      throw new GameArchiveError('Provide all four localized files in media/: description.ru.txt, description.en.txt, tags.ru.txt and tags.en.txt.');
    }
    if (!anyLocalized && !(await hasAnyCandidate(root, legacyDescription) && await hasAnyCandidate(root, legacyTags))) {
      throw new GameArchiveError('Provide media/description.ru.txt, media/description.en.txt, media/tags.ru.txt and media/tags.en.txt. Legacy description.txt and tags.txt are accepted for older archives.');
    }
    const descriptionRu = hasDescriptionRu
      ? await readTextFromCandidates(root, descriptionRuCandidates, 1600)
      : await readTextFromCandidates(root, legacyDescription, 1600);
    const descriptionEn = hasDescriptionEn
      ? await readTextFromCandidates(root, descriptionEnCandidates, 1600)
      : await readTextFromCandidates(root, legacyDescription, 1600).catch(() => descriptionRu);
    const tagsRu = normalizeTags(hasTagsRu
      ? await readTextFromCandidates(root, tagsRuCandidates, 1000)
      : await readTextFromCandidates(root, legacyTags, 1000));
    const tagsEn = normalizeTags(hasTagsEn
      ? await readTextFromCandidates(root, tagsEnCandidates, 1000)
      : await readTextFromCandidates(root, legacyTags, 1000));
    const description = descriptionEn || descriptionRu;
    const tags = tagsEn;
    const runtimeCandidates = await firstExisting(root, ['runtime.txt', 'media/runtime.txt']);
    let runtimeType = 'browser';
    if (runtimeCandidates) runtimeType = (await fsp.readFile(runtimeCandidates.fullPath, 'utf8')).trim().toLowerCase();
    if (!['browser', 'server'].includes(runtimeType)) throw new GameArchiveError('runtime.txt must contain browser or server.');
    if (runtimeType === 'server') {
      const serverEntry = path.join(root, 'server', 'index.js');
      const serverStat = await fsp.stat(serverEntry).catch(() => null);
      if (!serverStat?.isFile() || serverStat.size > 2 * 1024 * 1024) throw new GameArchiveError('Server games must include server/index.js (up to 2 MB).');
    }
    const capsule = await findValidCapsule(root);
    const faviconPath = await findValidFavicon(root);
    const indexPath = path.join(root, 'index.html');
    const stat = await fsp.stat(indexPath);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new GameArchiveError('index.html must be a file smaller than 2 MB.');
    const slug = await findUniqueSlug(db, title);
    finalDir = path.join(storageDir, 'games', slug);
    await fsp.mkdir(path.dirname(finalDir), { recursive: true });
    await fsp.cp(root, finalDir, { recursive: true, errorOnExist: true, force: false });
    const timestamp = now();
    const result = await db.prepare(`INSERT INTO games(slug,title,description,tags_json,capsule_path,entry_path,min_players,max_players,status,created_at,updated_at,
      description_ru,description_en,tags_ru_json,tags_en_json,runtime_type,archive_bytes,favicon_path)
      VALUES(?,?,?,?,?,'index.html',1,1,'draft',?,?,?,?,?,?,?,?,?)`)
      .run(slug, title, description, JSON.stringify(tags), capsule.relativePath, timestamp, timestamp,
        descriptionRu, descriptionEn, JSON.stringify(tagsRu), JSON.stringify(tagsEn), runtimeType, zipBuffer.length, faviconPath);
    return await db.prepare('SELECT * FROM games WHERE id=?').get(Number(result.lastInsertRowid));
  } catch (error) {
    if (finalDir) await fsp.rm(finalDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function replaceCapsule({ game, imageBuffer, storageDir }) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length > 12 * 1024 * 1024) throw new GameArchiveError('Capsule must be 12 MB or smaller.', 413);
  let dimensions;
  try { dimensions = imageSize(imageBuffer); } catch { throw new GameArchiveError('The capsule file is not a valid image.'); }
  const type = String(dimensions.type || '').toLowerCase();
  if (dimensions.width !== 630 || dimensions.height !== 500 || !['jpg','jpeg','gif'].includes(type)) {
    throw new GameArchiveError('Capsule must be JPG/JPEG or GIF and exactly 630 × 500 pixels.');
  }
  const extension = type === 'gif' ? 'gif' : 'jpg';
  const relativePath = path.posix.join('media', `capsule-${Date.now()}.${extension}`);
  const destination = path.join(storageDir, 'games', game.slug, ...relativePath.split('/'));
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.writeFile(destination, imageBuffer, { flag: 'wx', mode: 0o640 });
  return relativePath;
}

export async function getGameBySlug(db, slug) {
  return await db.prepare('SELECT * FROM games WHERE slug=?').get(slug);
}

export function parseGame(game) {
  if (!game) return null;
  return { ...game, tags: JSON.parse(game.tags_json || '[]') };
}

export function gamePublicShape(game, metrics = {}) {
  const parsed = parseGame(game);
  return {
    id: parsed.id,
    slug: parsed.slug,
    title: parsed.title,
    description: parsed.description,
    descriptionRu: parsed.description_ru || parsed.description,
    descriptionEn: parsed.description_en || parsed.description,
    tags: parsed.tags,
    capsule: `/game-files/${encodeURIComponent(parsed.slug)}/${parsed.capsule_path.split('/').map(encodeURIComponent).join('/')}`,
    minPlayers: parsed.min_players,
    maxPlayers: parsed.max_players,
    status: parsed.status,
    createdAt: parsed.created_at,
    publishedAt: parsed.published_at,
    ...metrics
  };
}

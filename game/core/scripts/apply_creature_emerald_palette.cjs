const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const WORKSPACE = '/Users/pro/Workplace';
const ASSETS_ROOT = path.join(WORKSPACE, 'heroesofcrypto-assets');
const CLIENT_ROOT = path.join(WORKSPACE, 'heroes-of-crypto-client');
const BACKUP_ROOT = path.join(ASSETS_ROOT, 'backups', 'pre-emerald-base-2026-08-16');

const ROOTS = [
  { id: 'images', path: path.join(ASSETS_ROOT, 'images') },
  { id: 'animations-output', path: path.join(ASSETS_ROOT, 'animations', 'output') },
  { id: 'project-creatures', path: path.join(CLIENT_ROOT, 'game', 'core', 'src', 'assets', 'creatures') },
];

const CREATURE_SLUGS = [
  'orc', 'scavenger', 'thief', 'troglodyte', 'troll', 'medusa', 'beholder', 'goblin_knight',
  'efreet', 'black_dragon', 'hydra', 'centaur', 'berserker', 'wolf_rider', 'harpy', 'nomad',
  'hyena', 'cyclops', 'ogre_mage', 'thunderbird', 'behemoth', 'wolf', 'fairy', 'leprechaun',
  'elf', 'white_tiger', 'satyr', 'mantis', 'unicorn', 'gargantuan', 'pegasus', 'peasant',
  'squire', 'arbalester', 'valkyrie', 'pikeman', 'healer', 'griffin', 'crusader', 'tsar_cannon',
  'angel', 'abomination', 'champion', 'frenzied_boar', 'arachna_queen', 'arachna_spider',
  'mermaid', 'dryad', 'blacksmith', 'ash_moth', 'wandering_mage', 'zena', 'wyvern', 'trent',
  'manticore', 'monk', 'battle_mage', 'nightmare', 'magic_dragon',
].sort((a, b) => b.length - a.length);

const EMERALD = {
  chroma: 1.16,
  neutralHue: 155,
  neutralChroma: 0.005,
  anchors: [
    [0, 8], [30, 28], [60, 48], [90, 96], [120, 138], [150, 162],
    [180, 184], [210, 196], [240, 210], [270, 255], [300, 314], [330, 344], [360, 368],
  ],
};

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, output);
    else output.push(absolute);
  }
  return output;
}

function isCreatureAsset(file) {
  if (!file.endsWith('.webp')) return false;
  const basename = path.basename(file);
  const slug = CREATURE_SLUGS.find((candidate) => basename.startsWith(`${candidate}_`));
  if (!slug) return false;
  return /(?:_(?:128|256|512)|_board_128|_(?:portrait|model)_full|_atlas(?:_half|_quarter)?)\.webp$/.test(basename);
}

function needsDehalo(file) {
  return /(?:_(?:128|256|512)|_board_128|_(?:portrait|model)_full)\.webp$/.test(path.basename(file));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function srgbToLinear(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  const c = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, c)) * 255);
}

function rgbToOklch(r8, g8, b8) {
  const r = srgbToLinear(r8);
  const g = srgbToLinear(g8);
  const b = srgbToLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), (Math.atan2(bb, a) * 180 / Math.PI + 360) % 360];
}

function oklchToLinearRgb(L, C, hue) {
  const radians = hue * Math.PI / 180;
  const a = C * Math.cos(radians);
  const b = C * Math.sin(radians);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function mapHue(hue) {
  for (let index = 0; index < EMERALD.anchors.length - 1; index += 1) {
    const [x1, y1] = EMERALD.anchors[index];
    const [x2, y2] = EMERALD.anchors[index + 1];
    if (hue < x1 || hue > x2) continue;
    const t = (hue - x1) / (x2 - x1);
    const delta = ((y2 - y1 + 540) % 360) - 180;
    return (y1 + delta * t + 360) % 360;
  }
  return hue;
}

function emeraldPixel(r, g, b) {
  const [L, originalC, originalHue] = rgbToOklch(r, g, b);
  const chromatic = originalC >= 0.09;
  const mappedHue = chromatic ? mapHue(originalHue) : originalHue;
  const mappedC = originalC * (chromatic ? EMERALD.chroma : 1);
  const tintWeight = Math.max(0, 1 - originalC / 0.10);
  const mappedRadians = mappedHue * Math.PI / 180;
  const tintRadians = EMERALD.neutralHue * Math.PI / 180;
  const chromaA = mappedC * Math.cos(mappedRadians) + EMERALD.neutralChroma * tintWeight * Math.cos(tintRadians);
  const chromaB = mappedC * Math.sin(mappedRadians) + EMERALD.neutralChroma * tintWeight * Math.sin(tintRadians);
  let C = Math.hypot(chromaA, chromaB);
  const targetHue = (Math.atan2(chromaB, chromaA) * 180 / Math.PI + 360) % 360;
  const targetL = Math.max(0, Math.min(1, 0.52 + (L - 0.52) * 1.08));
  const minimumC = C * 0.90;
  let linear = oklchToLinearRgb(targetL, C, targetHue);
  while (C > minimumC && linear.some((channel) => channel < 0 || channel > 1)) {
    C *= 0.992;
    linear = oklchToLinearRgb(targetL, C, targetHue);
  }
  return linear.map(linearToSrgb);
}

function buildLut() {
  const levels = 64;
  const lut = new Uint8Array(levels * levels * levels * 3);
  for (let r = 0; r < levels; r += 1) {
    for (let g = 0; g < levels; g += 1) {
      for (let b = 0; b < levels; b += 1) {
        const [rr, gg, bb] = emeraldPixel(Math.round(r * 255 / 63), Math.round(g * 255 / 63), Math.round(b * 255 / 63));
        const index = ((r * levels + g) * levels + b) * 3;
        lut[index] = rr;
        lut[index + 1] = gg;
        lut[index + 2] = bb;
      }
    }
  }
  return lut;
}

function applyDehalo(data, width, height) {
  const source = Buffer.from(data);
  const alphaAt = (x, y) => source[(y * width + x) * 4 + 3];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = source[index + 3];
      if (alpha === 0) continue;
      let boundary = alpha < 250;
      for (let oy = -1; !boundary && oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || alphaAt(nx, ny) < 12) {
            boundary = true;
            break;
          }
        }
      }
      if (!boundary) continue;
      const [edgeL] = rgbToOklch(source[index], source[index + 1], source[index + 2]);
      if (edgeL <= 0.68) continue;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let radius = 1; radius <= 4 && count < 3; radius += 1) {
        for (let oy = -radius; oy <= radius; oy += 1) {
          for (let ox = -radius; ox <= radius; ox += 1) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const neighbour = (ny * width + nx) * 4;
            if (source[neighbour + 3] < 250) continue;
            const [candidateL] = rgbToOklch(source[neighbour], source[neighbour + 1], source[neighbour + 2]);
            if (candidateL >= edgeL - 0.025) continue;
            sumR += source[neighbour];
            sumG += source[neighbour + 1];
            sumB += source[neighbour + 2];
            count += 1;
          }
        }
      }
      if (!count) continue;
      const mix = alpha < 250 ? 0.78 : 0.68;
      data[index] = Math.round((source[index] * (1 - mix) + sumR / count * mix) * 0.78);
      data[index + 1] = Math.round((source[index + 1] * (1 - mix) + sumG / count * mix) * 0.78);
      data[index + 2] = Math.round((source[index + 2] * (1 - mix) + sumB / count * mix) * 0.78);
    }
  }
}

async function processImage(file, lut) {
  const { data, info } = await sharp(file, { animated: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (needsDehalo(file)) applyDehalo(data, info.width, info.height);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const lutIndex = ((((data[index] >> 2) * 64 + (data[index + 1] >> 2)) * 64 + (data[index + 2] >> 2)) * 3);
    data[index] = lut[lutIndex];
    data[index + 1] = lut[lutIndex + 1];
    data[index + 2] = lut[lutIndex + 2];
  }
  const temporary = `${file}.emerald-tmp`;
  await sharp(data, { raw: info })
    .webp({ quality: 96, alphaQuality: 100, smartSubsample: true, effort: 3 })
    .toFile(temporary);
  fs.renameSync(temporary, file);
}

async function main() {
  if (fs.existsSync(BACKUP_ROOT)) {
    throw new Error(`Backup already exists; refusing a second in-place pass: ${BACKUP_ROOT}`);
  }
  const targets = ROOTS.flatMap((root) => walk(root.path).filter(isCreatureAsset).map((file) => ({ root, file })));
  const totalBytes = targets.reduce((sum, target) => sum + fs.statSync(target.file).size, 0);
  console.log(`Selected ${targets.length} creature assets (${(totalBytes / 1024 / 1024).toFixed(1)} MiB).`);
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  const manifest = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const relative = path.relative(target.root.path, target.file);
    const backup = path.join(BACKUP_ROOT, target.root.id, relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(target.file, backup);
    manifest.push({ root: target.root.id, relative, bytes: fs.statSync(target.file).size, sha256: sha256(target.file) });
    if ((index + 1) % 100 === 0 || index + 1 === targets.length) console.log(`Backup ${index + 1}/${targets.length}`);
  }
  fs.writeFileSync(path.join(BACKUP_ROOT, 'manifest.json'), JSON.stringify({ palette: 'dark-emerald-v3', createdAt: new Date().toISOString(), files: manifest }, null, 2));

  const lut = buildLut();
  for (let index = 0; index < targets.length; index += 1) {
    await processImage(targets[index].file, lut);
    if ((index + 1) % 20 === 0 || index + 1 === targets.length) console.log(`Emerald ${index + 1}/${targets.length}: ${path.basename(targets[index].file)}`);
  }
  console.log(`Backup: ${BACKUP_ROOT}`);
  console.log('Emerald palette applied successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

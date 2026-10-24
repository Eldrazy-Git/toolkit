// Génère l'icône de Toolkit (assets/icone.png et assets/icone.ico) sans dépendance.
// Usage : npm run icones
// Pour changer l'icône, modifier la fonction « dessinerIcone » puis relancer.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// --- Encodage PNG minimal -------------------------------------------------

const TABLE_CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(tampon) {
  let c = 0xffffffff;
  for (const octet of tampon) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const typeEtDonnees = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeEtDonnees));
  return Buffer.concat([longueur, typeEtDonnees, crc]);
}

// pixels : tableau RGBA (largeur * hauteur * 4 octets)
function encoderPng(largeur, hauteur, pixels) {
  const brut = Buffer.alloc((largeur * 4 + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    brut[y * (largeur * 4 + 1)] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * largeur * 4, largeur * 4)
      .copy(brut, y * (largeur * 4 + 1) + 1);
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', entete),
    bloc('IDAT', zlib.deflateSync(brut, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

// Fichier .ico contenant plusieurs PNG (format accepté par Windows Vista et plus).
function encoderIco(pngsParTaille) {
  const tailles = Object.keys(pngsParTaille).map(Number);
  const entete = Buffer.alloc(6 + 16 * tailles.length);
  entete.writeUInt16LE(0, 0);
  entete.writeUInt16LE(1, 2);
  entete.writeUInt16LE(tailles.length, 4);
  let decalage = entete.length;
  tailles.forEach((taille, i) => {
    const png = pngsParTaille[taille];
    const e = 6 + 16 * i;
    entete[e] = taille >= 256 ? 0 : taille;
    entete[e + 1] = taille >= 256 ? 0 : taille;
    entete.writeUInt16LE(1, e + 4);
    entete.writeUInt16LE(32, e + 6);
    entete.writeUInt32LE(png.length, e + 8);
    entete.writeUInt32LE(decalage, e + 12);
    decalage += png.length;
  });
  return Buffer.concat([entete, ...tailles.map((t) => pngsParTaille[t])]);
}

// Dessine une image en appelant couleur(u, v) pour chaque point (u, v entre 0 et 1),
// avec suréchantillonnage 4x4 pour des bords lisses.
function rendre(taille, couleur) {
  const pixels = new Uint8Array(taille * taille * 4);
  const N = 4;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const c = couleur((x + (sx + 0.5) / N) / taille, (y + (sy + 0.5) / N) / taille);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const i = (y * taille + x) * 4;
      if (a > 0) {
        pixels[i] = Math.round(r / a);
        pixels[i + 1] = Math.round(g / a);
        pixels[i + 2] = Math.round(b / a);
      }
      pixels[i + 3] = Math.round((a / (N * N)) * 255);
    }
  }
  return pixels;
}

// --- Dessin de l'icône Toolkit ---------------------------------------------

function dansCarreArrondi(u, v, marge, rayon) {
  const min = marge, max = 1 - marge;
  if (u < min || u > max || v < min || v > max) return false;
  const cx = Math.min(Math.max(u, min + rayon), max - rayon);
  const cy = Math.min(Math.max(v, min + rayon), max - rayon);
  return (u - cx) ** 2 + (v - cy) ** 2 <= rayon ** 2;
}

function dessinerIcone(u, v) {
  if (!dansCarreArrondi(u, v, 0.04, 0.2)) return [0, 0, 0, 0];
  // Lettre « T » blanche
  const barre = u >= 0.24 && u <= 0.76 && v >= 0.24 && v <= 0.38;
  const pied = u >= 0.42 && u <= 0.58 && v >= 0.24 && v <= 0.78;
  if (barre || pied) return [255, 255, 255, 1];
  // Fond bleu en dégradé vertical
  return [Math.round(47 - 16 * v), Math.round(129 - 34 * v), Math.round(247 - 56 * v), 1];
}

function generer() {
  const dossier = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(dossier, { recursive: true });
  const pngs = {};
  for (const taille of [16, 24, 32, 48, 64, 256]) {
    pngs[taille] = encoderPng(taille, taille, rendre(taille, dessinerIcone));
  }
  fs.writeFileSync(path.join(dossier, 'icone.png'), pngs[256]);
  fs.writeFileSync(path.join(dossier, 'icone.ico'), encoderIco(pngs));
  console.log('Icônes générées dans assets/');
}

if (require.main === module) generer();

module.exports = { encoderPng, rendre };

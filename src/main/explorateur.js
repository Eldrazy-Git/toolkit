// Explorateur de fichiers et éditeur de code : lister, lire, enregistrer, créer, renommer,
// mettre à la Corbeille les fichiers d'un dossier (projet ou Toolkit), et surveiller ses
// changements tant que l'onglet « Code » est ouvert.
// Tous les chemins échangés avec l'interface sont RELATIFS au dossier, avec des « / ».
// Une suppression passe toujours par la Corbeille Windows (jamais d'effacement définitif).
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { shell } = require('electron');
const journal = require('./journal');

// Jamais montré : l'historique Git se gère depuis le panneau Git.
const CACHES = new Set(['.git']);
// Dossiers régénérables : montrés grisés, ignorés par la recherche de fichiers.
const GENERES = new Set(['node_modules', 'build', 'dist', 'out', '.gradle', '.idea', '.vscode', '__pycache__', '.venv', 'venv', '.cxx', '.kotlin', 'run']);
const TAILLE_MAX = 5 * 1024 * 1024;
const IMAGES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon' };
// (.svg est du texte : il s'ouvre dans l'éditeur, avec son aperçu à côté.)
const NOM_INTERDIT = /[<>:"/\\|?*\u0000-\u001f]|^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$|[. ]$/i;

// Chemin absolu d'un chemin relatif, refusé s'il sort du dossier ou touche à .git.
function absolu(dossier, relatif, { racineAutorisee = false } = {}) {
  const racine = path.resolve(dossier);
  const chemin = path.resolve(racine, String(relatif || ''));
  if (chemin.toLowerCase() === racine.toLowerCase()) {
    if (racineAutorisee) return racine;
    throw new Error('Chemin de fichier invalide.');
  }
  if (!chemin.toLowerCase().startsWith(racine.toLowerCase() + path.sep)) throw new Error('Chemin de fichier invalide.');
  const morceaux = path.relative(racine, chemin).split(path.sep);
  if (morceaux.some((m) => CACHES.has(m.toLowerCase()))) throw new Error('Le dossier .git est géré par Git : utilise le panneau « Git et GitHub ».');
  return chemin;
}

function relatifDe(dossier, chemin) {
  return path.relative(dossier, chemin).split(path.sep).join('/');
}

function verifierNom(nom) {
  const propre = String(nom || '').trim();
  if (!propre || propre === '.' || propre === '..' || NOM_INTERDIT.test(propre)) {
    throw new Error(`Nom invalide : « ${propre} ». Évite les caractères < > : " / \\ | ? * et les noms réservés de Windows.`);
  }
  return propre;
}

async function existe(chemin) {
  try {
    await fsp.lstat(chemin);
    return true;
  } catch {
    return false;
  }
}

const comparer = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' }).compare;

// Contenu d'un dossier (un seul niveau) : dossiers d'abord, puis fichiers, par nom.
async function lister(dossier, relatif = '') {
  const chemin = absolu(dossier, relatif, { racineAutorisee: true });
  const entrees = await fsp.readdir(chemin, { withFileTypes: true });
  return entrees
    .filter((e) => !CACHES.has(e.name.toLowerCase()))
    .map((e) => ({
      nom: e.name,
      chemin: relatifDe(dossier, path.join(chemin, e.name)),
      dossier: e.isDirectory(),
      genere: e.isDirectory() && GENERES.has(e.name.toLowerCase()),
    }))
    .sort((a, b) => (b.dossier - a.dossier) || comparer(a.nom, b.nom));
}

// Tous les fichiers (pour « Aller au fichier », Ctrl+P), dossiers régénérables exclus.
async function listerTout(dossier, maximum = 20000) {
  const resultat = [];
  const parcourir = async (chemin) => {
    let entrees;
    try {
      entrees = await fsp.readdir(chemin, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      if (resultat.length >= maximum) return;
      const nom = e.name.toLowerCase();
      if (CACHES.has(nom)) continue;
      if (e.isDirectory()) {
        if (!GENERES.has(nom)) await parcourir(path.join(chemin, e.name));
      } else {
        resultat.push(relatifDe(dossier, path.join(chemin, e.name)));
      }
    }
  };
  await parcourir(path.resolve(dossier));
  return { fichiers: resultat, tronque: resultat.length >= maximum };
}

// --- Encodages -----------------------------------------------------------------------------
// UTF-8 (avec ou sans BOM) ; sinon Windows-1252 (anciens fichiers .bat, .txt…).

const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

function decoder(octets) {
  if (octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf) {
    return { texte: new TextDecoder('utf-8').decode(octets.subarray(3)), encodage: 'utf8bom' };
  }
  try {
    return { texte: new TextDecoder('utf-8', { fatal: true }).decode(octets), encodage: 'utf8' };
  } catch {
    return { texte: new TextDecoder('windows-1252').decode(octets), encodage: 'windows-1252' };
  }
}

function encoder(texte, encodage) {
  if (encodage === 'utf8bom') return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(texte, 'utf8')]);
  if (encodage !== 'windows-1252') return Buffer.from(texte, 'utf8');
  const octets = Buffer.alloc(texte.length);
  let n = 0;
  for (const caractere of texte) {
    const code = caractere.codePointAt(0);
    const index = CP1252.indexOf(caractere);
    if (index >= 0) octets[n++] = 0x80 + index;
    else if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) octets[n++] = code;
    else throw new Error(`Le caractère « ${caractere} » ne peut pas être enregistré dans ce fichier (encodage Windows-1252). Retire-le, ou demande à Claude de convertir le fichier en UTF-8.`);
  }
  return octets.subarray(0, n);
}

// Renvoie { chemin, texte, encodage, finLigne, mtime } ; ou { binaire: true } ; ou
// { image: 'data:…' } pour une image.
async function lire(dossier, relatif) {
  const chemin = absolu(dossier, relatif);
  const infos = await fsp.stat(chemin);
  if (infos.isDirectory()) throw new Error('C\'est un dossier.');
  const extension = path.extname(chemin).toLowerCase();
  if (IMAGES[extension] && infos.size <= TAILLE_MAX) {
    const octets = await fsp.readFile(chemin);
    return { chemin: relatif, image: `data:${IMAGES[extension]};base64,${octets.toString('base64')}`, taille: infos.size, mtime: infos.mtimeMs };
  }
  if (infos.size > TAILLE_MAX) {
    return { chemin: relatif, binaire: true, raison: `Fichier trop gros pour l'éditeur (${(infos.size / 1048576).toFixed(1)} Mo, 5 Mo au plus).` };
  }
  const octets = await fsp.readFile(chemin);
  if (octets.subarray(0, 8000).includes(0)) {
    return { chemin: relatif, binaire: true, raison: 'Fichier binaire (programme, archive, son…) : il ne peut pas être affiché comme du texte.' };
  }
  const { texte, encodage } = decoder(octets);
  return { chemin: relatif, texte, encodage, finLigne: texte.includes('\r\n') ? 'CRLF' : 'LF', mtime: infos.mtimeMs };
}

// Enregistre ; refuse (sans rien écrire) si le fichier a changé sur le disque depuis
// mtimeAttendu, sauf si forcer : renvoie alors { modifieAilleurs: true }.
async function ecrire(dossier, relatif, texte, { encodage = 'utf8', mtimeAttendu = null, forcer = false } = {}) {
  const chemin = absolu(dossier, relatif);
  if (!forcer && mtimeAttendu) {
    try {
      const infos = await fsp.stat(chemin);
      if (Math.abs(infos.mtimeMs - mtimeAttendu) > 1) return { modifieAilleurs: true };
    } catch (erreur) {
      if (erreur.code !== 'ENOENT') throw erreur;
    }
  }
  await fsp.writeFile(chemin, encoder(texte, encodage));
  const infos = await fsp.stat(chemin);
  return { mtime: infos.mtimeMs };
}

// type : 'fichier' | 'dossier'. Renvoie le chemin relatif créé.
async function creer(dossier, parent, nom, type) {
  const base = absolu(dossier, parent, { racineAutorisee: true });
  const chemin = path.join(base, verifierNom(nom));
  absolu(dossier, relatifDe(dossier, chemin));
  if (await existe(chemin)) throw new Error(`« ${nom} » existe déjà ici.`);
  if (type === 'dossier') await fsp.mkdir(chemin);
  else await fsp.writeFile(chemin, '', { flag: 'wx' });
  return relatifDe(dossier, chemin);
}

// Renomme dans le même dossier. Renvoie le nouveau chemin relatif.
async function renommer(dossier, relatif, nouveauNom) {
  const ancien = absolu(dossier, relatif);
  const nouveau = path.join(path.dirname(ancien), verifierNom(nouveauNom));
  absolu(dossier, relatifDe(dossier, nouveau));
  // Changer seulement les majuscules est permis (même fichier pour Windows).
  if (nouveau.toLowerCase() !== ancien.toLowerCase() && await existe(nouveau)) {
    throw new Error(`« ${nouveauNom} » existe déjà dans ce dossier.`);
  }
  try {
    await fsp.rename(ancien, nouveau);
  } catch (erreur) {
    if (['EBUSY', 'EPERM', 'EACCES'].includes(erreur.code)) {
      throw new Error('Windows refuse de renommer : le fichier ou dossier est ouvert dans un autre programme. Ferme-le puis réessaie.');
    }
    throw erreur;
  }
  return relatifDe(dossier, nouveau);
}

async function mettreALaCorbeille(dossier, relatif) {
  const chemin = absolu(dossier, relatif);
  try {
    await shell.trashItem(chemin);
  } catch (erreur) {
    journal.erreur('Corbeille :', erreur);
    throw new Error('Impossible de mettre à la Corbeille : le fichier est peut-être ouvert dans un autre programme.');
  }
}

// --- Surveillance --------------------------------------------------------------------------
// Une surveillance par onglet « Code » ouvert ; les changements sont regroupés (300 ms).

const surveillances = new Map(); // cle -> { observateur, chemins: Set, minuterie }

function surveiller(cle, dossier, rappel) {
  arreterSurveillance(cle);
  let observateur;
  try {
    observateur = fs.watch(dossier, { recursive: true });
  } catch (erreur) {
    journal.erreur('Surveillance du code :', erreur);
    return;
  }
  const entree = { observateur, chemins: new Set(), minuterie: null };
  // Windows signale aussi les simples LECTURES (date de dernier accès) : une page affichée
  // dans l'aperçu qui lit ses images ou ses JSON déclencherait un rechargement en boucle.
  // On ne garde que les vrais changements : contenu (date de modification, taille),
  // création, suppression.
  const debut = Date.now();
  const signatures = new Map(); // chemin relatif -> 'date:taille' | 'dossier' | 'absent'
  const vraimentChange = async (relatif) => {
    let signature;
    let recent = false;
    try {
      const infos = await fsp.stat(path.join(dossier, relatif));
      signature = infos.isDirectory() ? 'dossier' : `${infos.mtimeMs}:${infos.size}`;
      recent = Math.max(infos.mtimeMs, infos.birthtimeMs) >= debut - 2000;
    } catch {
      signature = 'absent';
    }
    const avant = signatures.get(relatif);
    signatures.set(relatif, signature);
    if (avant !== undefined) return avant !== signature && !(avant === 'dossier' && signature === 'dossier');
    // Jamais vu : changé seulement s'il a été créé ou modifié depuis le début de la surveillance
    // (ou s'il a disparu). Un dossier existant qui « change » = un de ses fichiers a changé,
    // ce fichier est signalé de son côté.
    return signature === 'absent' || (recent && signature !== 'dossier');
  };
  observateur.on('change', (_type, nom) => {
    if (!nom) return;
    const relatif = String(nom).split(path.sep).join('/');
    // Compilation (build/, node_modules/…) : des milliers de changements inutiles à suivre.
    if (relatif.split('/').some((m) => CACHES.has(m.toLowerCase()) || GENERES.has(m.toLowerCase()))) return;
    entree.chemins.add(relatif);
    clearTimeout(entree.minuterie);
    entree.minuterie = setTimeout(async () => {
      const candidats = [...entree.chemins];
      entree.chemins.clear();
      const chemins = [];
      for (const c of candidats) if (await vraimentChange(c)) chemins.push(c);
      if (chemins.length && surveillances.get(cle) === entree) rappel(chemins);
    }, 300);
  });
  observateur.on('error', (erreur) => journal.info(`Surveillance du code arrêtée : ${erreur.message}`));
  surveillances.set(cle, entree);
}

function arreterSurveillance(cle) {
  const entree = surveillances.get(cle);
  if (!entree) return;
  clearTimeout(entree.minuterie);
  entree.observateur.close();
  surveillances.delete(cle);
}

function arreterToutesSurveillances() {
  [...surveillances.keys()].forEach(arreterSurveillance);
}

// --- Rechercher / remplacer dans tous les fichiers -------------------------------------------

const MAX_RESULTATS = 2000;
const TAILLE_MAX_RECHERCHE = 2 * 1024 * 1024;

// options : { texte, casse, motEntier, regex }. Lance une erreur claire si l'expression est invalide.
function expression({ texte, casse = false, motEntier = false, regex = false }) {
  if (!texte) throw new Error('Tape le texte à chercher.');
  let source = regex ? texte : texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (motEntier) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  try {
    const exp = new RegExp(source, `gu${casse ? '' : 'i'}`);
    if (exp.test('')) throw new Error('vide');
    return exp;
  } catch {
    throw new Error('Expression de recherche invalide (ou qui correspond à un texte vide).');
  }
}

// Fichiers texte du dossier (dossiers de compilation exclus) : { chemin, texte, encodage }.
async function* fichiersTexte(dossier, chemins = null) {
  const liste = chemins || (await listerTout(dossier)).fichiers;
  for (const relatif of liste) {
    let chemin;
    try {
      chemin = absolu(dossier, relatif);
      const infos = await fsp.stat(chemin);
      if (!infos.isFile() || infos.size > TAILLE_MAX_RECHERCHE) continue;
      const octets = await fsp.readFile(chemin);
      if (octets.subarray(0, 8000).includes(0)) continue;
      yield { chemin: relatif, absolu: chemin, ...decoder(octets) };
    } catch {
      // fichier disparu ou illisible : ignoré
    }
  }
}

// Renvoie { fichiers: [{ chemin, resultats: [{ ligne, debut, fin, avant, trouve, apres }] }], total, tronque }.
// debut / fin : colonnes (à partir de 0) dans la ligne complète.
async function rechercher(dossier, options) {
  const exp = expression(options);
  const fichiers = [];
  let total = 0;
  for await (const f of fichiersTexte(dossier)) {
    const resultats = [];
    const lignes = f.texte.split('\n');
    for (let i = 0; i < lignes.length && total < MAX_RESULTATS; i += 1) {
      const ligne = lignes[i].replace(/\r$/, '');
      exp.lastIndex = 0;
      for (const m of ligne.matchAll(exp)) {
        const debut = m.index;
        const fin = debut + m[0].length;
        const depart = Math.max(0, debut - 50);
        resultats.push({
          ligne: i + 1,
          debut,
          fin,
          avant: (depart > 0 ? '…' : '') + ligne.slice(depart, debut).trimStart(),
          trouve: m[0].slice(0, 200),
          apres: ligne.slice(fin, fin + 120),
        });
        total += 1;
        if (total >= MAX_RESULTATS) break;
      }
    }
    if (resultats.length) fichiers.push({ chemin: f.chemin, resultats });
    if (total >= MAX_RESULTATS) return { fichiers, total, tronque: true };
  }
  return { fichiers, total, tronque: false };
}

// Remplace dans les fichiers indiqués (chemins relatifs). Encodage et fins de ligne conservés.
// Renvoie { fichiers, remplacements }.
async function remplacer(dossier, options, remplacement, chemins) {
  const exp = expression(options);
  let fichiers = 0;
  let remplacements = 0;
  for await (const f of fichiersTexte(dossier, chemins)) {
    let nombre = 0;
    const texte = f.texte.split('\n').map((ligne) => {
      const fin = ligne.endsWith('\r') ? '\r' : '';
      const corps = fin ? ligne.slice(0, -1) : ligne;
      return corps.replace(exp, (...args) => {
        nombre += 1;
        // Avec une expression régulière, $1, $2… reprennent les groupes ; sinon texte tel quel.
        if (!options.regex) return remplacement;
        const groupes = args.slice(1, args.findIndex((a) => typeof a === 'number'));
        return remplacement.replace(/\$(\d)/g, (_, n) => groupes[Number(n) - 1] ?? '');
      }) + fin;
    }).join('\n');
    if (!nombre) continue;
    await fsp.writeFile(f.absolu, encoder(texte, f.encodage));
    fichiers += 1;
    remplacements += nombre;
  }
  return { fichiers, remplacements };
}

module.exports = {
  lister, listerTout, lire, ecrire, creer, renommer, mettreALaCorbeille,
  surveiller, arreterSurveillance, arreterToutesSurveillances, rechercher, remplacer,
};

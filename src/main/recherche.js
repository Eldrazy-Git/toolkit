// Recherche « façon Obsidian » : index plein texte (MiniSearch) des fiches projet.json et de
// tous les fichiers .md de projets/ et app/, liens [[…]] entre notes et projets, rétroliens.
//
// Indexation paresseuse : rien n'est fait avant la première recherche ; ensuite, chaque mise
// à jour ne relit que les fichiers dont la date de modification a changé (au plus une fois
// toutes les 2 secondes). Aucune tâche de fond.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const MiniSearch = require('minisearch');
const chemins = require('./chemins');
const projets = require('./projets');
const journal = require('./journal');

const DOSSIERS_IGNORES = new Set(['node_modules', '.git', 'build', 'dist', 'out', 'target', '.gradle', '.idea',
  '__pycache__', '.venv', 'venv', '.cxx', '.next', '.parcel-cache', 'run', '.mise-a-jour']);
const TAILLE_MAX_NOTE = 1024 * 1024;
const NOTES_MAX = 5000;
const INTERVALLE_MAJ = 2000;
const LIEN_WIKI = /\[\[([^\]\n[]+)\]\]/g;

const LIBELLES_TYPES = { html: 'Outil HTML', script: 'Script', java: 'Java (Gradle)', android: 'Android', autre: 'Autre' };

function normaliser(texte) {
  return String(texte).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function slug(texte) {
  return normaliser(texte).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function creerIndex() {
  return new MiniSearch({
    fields: ['titre', 'contenu', 'etiquettes'],
    storeFields: ['type', 'titre', 'chemin', 'projetId'],
    processTerm: (terme) => normaliser(terme),
    searchOptions: { boost: { titre: 3, etiquettes: 2 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
  });
}

const index = creerIndex();
// chemin (relatif à la racine, avec « / ») -> { mtime, titre, contenu, projetId, liens: [textes bruts] }
const notes = new Map();
// id de projet -> { nom, contenu }
const projetsConnus = new Map();
// Pour résoudre les liens : clé normalisée -> id de projet / nom de fichier -> [chemins]
let projetsParCle = new Map();
let notesParNom = new Map();
let notesParCheminMinuscule = new Map();
// 'projet:<id>' ou 'note:<chemin>' -> Set(chemins des notes qui y renvoient)
let retroliensIndex = new Map();

let derniereMaj = 0;
let majEnCours = null;

// --- Parcours des fichiers .md ----------------------------------------------------------------

async function listerFichiersMd() {
  const trouves = [];
  const pile = [chemins.projets(), chemins.app];
  while (pile.length && trouves.length < NOTES_MAX) {
    const dossier = pile.pop();
    let entrees;
    try {
      entrees = await fs.readdir(dossier, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entrees) {
      const absolu = path.join(dossier, e.name);
      if (e.isDirectory()) {
        if (!DOSSIERS_IGNORES.has(e.name)) pile.push(absolu);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        trouves.push(absolu);
      }
    }
  }
  return trouves;
}

function projetDuChemin(chemin) {
  const relatifProjets = chemins.versRelatif(chemins.projets());
  if (!chemin.startsWith(`${relatifProjets}/`)) return null;
  return chemin.slice(relatifProjets.length + 1).split('/')[0] || null;
}

function titreDe(contenu, chemin) {
  const titre = /^#\s+(.+)$/m.exec(contenu)?.[1]?.trim();
  return titre || path.posix.basename(chemin, path.posix.extname(chemin));
}

// --- Mise à jour de l'index -------------------------------------------------------------------

function ajouterOuRemplacer(document) {
  if (index.has(document.id)) index.replace(document);
  else index.add(document);
}

async function mettreAJourNotes() {
  const vus = new Set();
  for (const absolu of await listerFichiersMd()) {
    const chemin = chemins.versRelatif(absolu);
    vus.add(chemin);
    let infos;
    try {
      infos = await fs.stat(absolu);
    } catch {
      continue;
    }
    const connue = notes.get(chemin);
    if (connue && connue.mtime === infos.mtimeMs) continue;
    if (infos.size > TAILLE_MAX_NOTE) continue;
    let contenu;
    try {
      contenu = (await fs.readFile(absolu, 'utf8')).replace(/^﻿/, '');
    } catch {
      continue;
    }
    const note = {
      mtime: infos.mtimeMs,
      titre: titreDe(contenu, chemin),
      contenu,
      projetId: projetDuChemin(chemin),
      liens: [...contenu.matchAll(LIEN_WIKI)].map((m) => m[1]),
    };
    notes.set(chemin, note);
    ajouterOuRemplacer({ id: `note:${chemin}`, type: 'note', titre: note.titre, contenu, chemin, projetId: note.projetId, etiquettes: path.posix.basename(chemin) });
  }
  for (const chemin of [...notes.keys()]) {
    if (!vus.has(chemin)) {
      notes.delete(chemin);
      if (index.has(`note:${chemin}`)) index.discard(`note:${chemin}`);
    }
  }
}

async function mettreAJourProjets() {
  const liste = await projets.listerProjets();
  const presents = new Set();
  for (const p of liste) {
    presents.add(p.id);
    const f = p.fiche;
    const contenu = [
      f.description,
      LIBELLES_TYPES[f.type],
      ...f.actions.map((a) => `${a.nom} ${a.description}`),
      ...f.outils_lies.map((o) => o.nom),
    ].filter(Boolean).join('\n');
    projetsConnus.set(p.id, { nom: f.nom, contenu });
    ajouterOuRemplacer({
      id: `projet:${p.id}`, type: 'projet', titre: f.nom, contenu, chemin: p.dossier, projetId: p.id,
      etiquettes: [f.categorie, ...f.tags, p.id].join(' '),
    });
  }
  for (const id of [...projetsConnus.keys()]) {
    if (!presents.has(id)) {
      projetsConnus.delete(id);
      if (index.has(`projet:${id}`)) index.discard(`projet:${id}`);
    }
  }
}

// Tables de résolution des liens et rétroliens (recalculées à chaque mise à jour : peu coûteux).
function reconstruireLiens() {
  projetsParCle = new Map();
  for (const [id, p] of projetsConnus) {
    for (const cle of [normaliser(id), normaliser(p.nom), slug(p.nom)]) {
      if (cle && !projetsParCle.has(cle)) projetsParCle.set(cle, id);
    }
  }
  notesParNom = new Map();
  notesParCheminMinuscule = new Map();
  for (const chemin of notes.keys()) {
    const nom = normaliser(path.posix.basename(chemin, '.md'));
    if (!notesParNom.has(nom)) notesParNom.set(nom, []);
    notesParNom.get(nom).push(chemin);
    notesParCheminMinuscule.set(chemin.toLowerCase(), chemin);
  }
  retroliensIndex = new Map();
  for (const [source, note] of notes) {
    for (const brut of note.liens) {
      const cible = resoudreLien(brut, source);
      if (!cible) continue;
      const cle = cible.type === 'projet' ? `projet:${cible.id}` : `note:${cible.chemin}`;
      if (cle === `note:${source}`) continue;
      if (!retroliensIndex.has(cle)) retroliensIndex.set(cle, new Set());
      retroliensIndex.get(cle).add(source);
    }
  }
}

async function mettreAJour({ forcer = false } = {}) {
  if (majEnCours) return majEnCours;
  if (!forcer && Date.now() - derniereMaj < INTERVALLE_MAJ) return undefined;
  majEnCours = (async () => {
    try {
      await mettreAJourProjets();
      await mettreAJourNotes();
      reconstruireLiens();
    } catch (erreur) {
      journal.erreur('Mise à jour de l\'index de recherche :', erreur);
    }
  })().finally(() => {
    majEnCours = null;
    derniereMaj = Date.now();
  });
  return majEnCours;
}

// --- Liens [[…]] -----------------------------------------------------------------------------

// [[cible]], [[cible|libellé]] ou [[cible#section]] -> { type: 'projet', id } | { type: 'note', chemin } | null
// cible : identifiant ou nom d'un projet, nom d'une note (sans .md) ou chemin d'une note.
function resoudreLien(brut, depuisChemin = '') {
  const cible = String(brut).split('|')[0].split('#')[0].trim();
  if (!cible) return null;
  const id = projetsParCle.get(normaliser(cible)) || projetsParCle.get(slug(cible));
  if (id) return { type: 'projet', id };

  let candidat = cible.replace(/\\/g, '/');
  if (!/\.md$/i.test(candidat)) candidat += '.md';
  if (candidat.includes('/')) {
    const dossier = path.posix.dirname(depuisChemin || '.');
    for (const essai of [path.posix.normalize(path.posix.join(dossier, candidat)), path.posix.normalize(candidat)]) {
      const trouve = notesParCheminMinuscule.get(essai.toLowerCase());
      if (trouve) return { type: 'note', chemin: trouve };
    }
  }
  const liste = notesParNom.get(normaliser(path.posix.basename(candidat, '.md')));
  if (liste?.length) {
    // Même nom dans plusieurs projets : on préfère la note du même projet.
    const dossierProjet = (depuisChemin || '').split('/').slice(0, 2).join('/');
    return { type: 'note', chemin: liste.find((c) => c.startsWith(`${dossierProjet}/`)) || liste[0] };
  }
  return null;
}

// Notes qui renvoient vers une cible (cle : 'projet:<id>' ou 'note:<chemin>').
function retroliens(cle) {
  return [...(retroliensIndex.get(cle) || [])]
    .map((chemin) => ({ chemin, titre: notes.get(chemin)?.titre || chemin, projetId: notes.get(chemin)?.projetId || null }))
    .sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
}

function noteConnue(chemin) {
  return notesParCheminMinuscule.get(String(chemin).toLowerCase()) || null;
}

// Notes d'un projet (projetId null = notes de Toolkit, dans app/).
function notesDe(projetId) {
  const prefixe = projetId ? `${chemins.versRelatif(chemins.projets())}/${projetId}/` : `${chemins.versRelatif(chemins.app)}/`;
  const ordre = (c) => (/\/readme\.md$/i.test(c) ? 0 : /\/claude\.md$/i.test(c) ? 1 : 2);
  return [...notes.keys()]
    .filter((c) => c.startsWith(prefixe))
    .sort((a, b) => ordre(a) - ordre(b) || a.localeCompare(b, 'fr'))
    .map((chemin) => ({ chemin, titre: notes.get(chemin).titre, relatif: chemin.slice(prefixe.length) }));
}

// --- Recherche et extraits --------------------------------------------------------------------

// Texte normalisé + position d'origine de chaque caractère (les accents n'empêchent pas de
// retrouver « ete » dans « été »).
function correspondance(texte) {
  let norme = '';
  const positions = [];
  for (let i = 0; i < texte.length; i++) {
    for (const c of normaliser(texte[i])) {
      norme += c;
      positions.push(i);
    }
  }
  return { norme, positions };
}

// Découpe un texte en segments { t, m } (m = mis en évidence) autour des termes trouvés.
function segments(texte, termes, longueur = 0) {
  const { norme, positions } = correspondance(texte);
  const plages = [];
  for (const terme of termes.filter((t) => t.length >= 2)) {
    for (let i = norme.indexOf(terme); i !== -1; i = norme.indexOf(terme, i + 1)) {
      // Seulement en début de mot (« et » ne doit pas surligner le milieu de « carnet »).
      if (i > 0 && /[\p{L}\p{N}]/u.test(norme[i - 1])) continue;
      plages.push([positions[i], positions[i + terme.length - 1] + 1]);
    }
  }
  plages.sort((a, b) => a[0] - b[0]);
  // Plages qui se chevauchent ou se touchent : fusionnées (un mot = un seul surlignage).
  for (let i = plages.length - 1; i > 0; i--) {
    if (plages[i][0] <= plages[i - 1][1]) {
      plages[i - 1][1] = Math.max(plages[i - 1][1], plages[i][1]);
      plages.splice(i, 1);
    }
  }
  let debut = 0;
  let fin = texte.length;
  if (longueur) {
    const premier = plages[0]?.[0] ?? 0;
    debut = Math.max(0, premier - 60);
    if (debut > 0) {
      const espace = texte.indexOf(' ', debut);
      if (espace !== -1 && espace < premier) debut = espace + 1;
    }
    fin = Math.min(texte.length, debut + longueur);
  }
  const resultat = [];
  let curseur = debut;
  for (const [a, b] of plages) {
    if (b <= curseur || a >= fin) continue;
    const de = Math.max(a, curseur);
    const a2 = Math.min(b, fin);
    if (de > curseur) resultat.push({ t: texte.slice(curseur, de), m: false });
    resultat.push({ t: texte.slice(de, a2), m: true });
    curseur = a2;
  }
  if (curseur < fin) resultat.push({ t: texte.slice(curseur, fin), m: false });
  if (debut > 0) resultat.unshift({ t: '…', m: false });
  if (fin < texte.length) resultat.push({ t: '…', m: false });
  return resultat;
}

// Texte lisible pour l'extrait : sans la syntaxe Markdown la plus visible.
function texteBrut(contenu) {
  return contenu
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(LIEN_WIKI, (_t, lien) => lien.split('|').pop())
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*`>_~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function chercher(texte, { limite = 40 } = {}) {
  await mettreAJour();
  const requete = String(texte || '').trim();
  if (!requete) return [];
  return index.search(requete).slice(0, limite).map((r) => {
    const contenu = r.type === 'note' ? notes.get(r.chemin)?.contenu : projetsConnus.get(r.projetId)?.contenu;
    return {
      type: r.type,
      titre: r.titre,
      chemin: r.chemin,
      projetId: r.projetId,
      nomProjet: r.projetId ? projetsConnus.get(r.projetId)?.nom || r.projetId : 'Toolkit',
      titreSegments: segments(r.titre, r.terms),
      extrait: segments(texteBrut(contenu || ''), r.terms, 180),
    };
  });
}

module.exports = { mettreAJour, chercher, resoudreLien, retroliens, noteConnue, notesDe, normaliser, slug };

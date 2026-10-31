// Bibliothèque personnelle de kits et de skills : Toolkit/kits/ (format et règles : docs/kits.md).
// Toolkit ne fournit que l'utilitaire : aucun kit n'est livré avec l'application.
// N'utilise pas Electron, pour servir aussi à la commande scripts/kit.js.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const chemins = require('./chemins');
const projets = require('./projets');
const git = require('./git');
const journal = require('./journal');
const { lireJson, existe, ecrireSection, messageErreurJson } = require('./fichiers');

const LANGAGES = ['python', 'node', 'java', 'kotlin'];
const ID_KIT = /^[a-z0-9][a-z0-9-]*$/;
const ID_VARIABLE = /^[a-z][a-z0-9_]*$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const PACKAGE = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
const VARIABLE_DANS_TEXTE = /\{\{(\w+)\}\}/g;
const VARIABLES_AUTOMATIQUES = ['nom_projet', 'id_projet'];
// Dossiers de kits/ qui ne sont pas des kits. Une proposition n'est jamais utilisable : elle
// n'est ni listée ni ajoutable tant qu'elle n'a pas été acceptée.
const NOMS_RESERVES = new Set(['propositions']);
const FICHIERS_INTERDITS = new Set(['projet.json', 'claude.md']);
// Parcours des projets pour reconnaître leur langage (dossiers générés ignorés).
const DOSSIERS_IGNORES = new Set(['node_modules', 'build', 'bin', 'out', 'dist', 'run', 'target', '__pycache__', 'venv']);
const ELEMENTS_MAX_PARCOURS = 8000;
const SOURCES_MAX_PACKAGE = 200;

const GITIGNORE_KITS = [
  '# Propositions de Claude : jamais versionnées avant d\'être acceptées',
  'propositions/',
  '',
  '# Généré par Toolkit à partir des kit.json',
  'CATALOGUE.md',
  '',
  '# Secrets : ne jamais versionner',
  '.env',
  '.env.*',
  '*.jks',
  '*.keystore',
  'local.properties',
  '',
  '# Fichiers générés et fichiers système',
  'node_modules/',
  '__pycache__/',
  'Thumbs.db',
  'desktop.ini',
  '.DS_Store',
  '',
].join('\n');
const LIGNES_GITIGNORE_REQUISES = ['propositions/', 'CATALOGUE.md'];

const fichierCatalogue = () => path.join(chemins.kits, 'CATALOGUE.md');

function comparerVersions(a, b) {
  const x = VERSION.exec(a);
  const y = VERSION.exec(b);
  if (!x || !y) return 0;
  for (let i = 1; i <= 3; i += 1) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  return 0;
}

// Chemin relatif sans sortie possible du dossier de départ (ni « .. », ni lecteur, ni absolu).
function cheminRelatifSur(chemin) {
  if (typeof chemin !== 'string' || !chemin.trim()) return false;
  if (/^[\\/]/.test(chemin) || chemin.includes(':')) return false;
  return !chemin.split(/[\\/]/).includes('..');
}

const variablesUtilisees = (texte) => [...String(texte).matchAll(VARIABLE_DANS_TEXTE)].map((m) => m[1]);

// --- Lecture et vérification d'un kit ---------------------------------------------------------

// Destination d'un groupe de fichiers pour un type de projet (null si ce type n'en a pas).
function destinationPour(vers, type) {
  if (typeof vers === 'string') return vers;
  return vers?.[type] ?? vers?.['*'] ?? null;
}

// Renvoie la liste des problèmes d'un kit (vide si tout va bien).
async function problemesDuKit(k, dossier) {
  const problemes = [];
  const fichierExiste = async (champ, relatif) => {
    if (!cheminRelatifSur(relatif)) problemes.push(`« ${champ} » doit être un chemin à l'intérieur du kit.`);
    else if (!(await existe(path.join(dossier, relatif)))) problemes.push(`« ${champ} » : « ${relatif} » est introuvable dans le kit.`);
  };
  if (k.schema !== 1) problemes.push('« schema » doit valoir 1.');
  for (const champ of ['nom', 'description']) {
    if (typeof k[champ] !== 'string' || !k[champ].trim()) problemes.push(`Le champ « ${champ} » est obligatoire.`);
  }
  if (!VERSION.test(k.version || '')) problemes.push('« version » doit être de la forme 1.0.0.');
  if (!['code', 'regles'].includes(k.genre)) problemes.push('« genre » doit valoir « code » ou « regles ».');

  const tous = k.types === 'tous';
  if (!tous && !(Array.isArray(k.types) && k.types.length && k.types.every((t) => projets.TYPES.includes(t)))) {
    problemes.push(`« types » doit valoir « tous » ou une liste parmi : ${projets.TYPES.join(', ')}.`);
  }
  if (k.langages !== undefined && !(Array.isArray(k.langages) && k.langages.length && k.langages.every((l) => LANGAGES.includes(l)))) {
    problemes.push(`« langages » doit être une liste parmi : ${LANGAGES.join(', ')}.`);
  }

  await fichierExiste('guide', k.guide);
  if (k.regles !== undefined) await fichierExiste('regles', k.regles);
  else if (k.genre === 'regles') problemes.push('Un kit de règles doit avoir un fichier « regles ».');

  const ids = new Set(VARIABLES_AUTOMATIQUES);
  const variables = k.variables === undefined ? [] : k.variables;
  if (!Array.isArray(variables)) problemes.push('« variables » doit être une liste.');
  else {
    for (const v of variables) {
      if (!ID_VARIABLE.test(v?.id || '')) { problemes.push('Chaque variable doit avoir un « id » (minuscules, chiffres, _).'); continue; }
      if (ids.has(v.id)) problemes.push(`La variable « ${v.id} » est déclarée deux fois ou porte un nom réservé.`);
      ids.add(v.id);
      if (v.genre === 'package') ids.add(`${v.id}_chemin`);
      else if (v.genre !== undefined && v.genre !== 'texte') problemes.push(`Variable « ${v.id} » : « genre » doit valoir « texte » ou « package ».`);
      if (v.defaut !== undefined && typeof v.defaut !== 'string') problemes.push(`Variable « ${v.id} » : « defaut » doit être un texte.`);
    }
  }

  if (k.genre === 'regles' && k.fichiers !== undefined) problemes.push('Un kit de règles ne copie aucun fichier : retire « fichiers ».');
  if (k.genre === 'code') {
    if (!Array.isArray(k.fichiers) || !k.fichiers.length) problemes.push('Un kit de code doit avoir une liste « fichiers ».');
    else {
      for (const groupe of k.fichiers) {
        await fichierExiste('fichiers.source', groupe?.source);
        const vers = groupe?.vers;
        const destinations = typeof vers === 'string' ? [vers] : Object.values(vers && typeof vers === 'object' ? vers : {});
        if (!destinations.length || !destinations.every((d) => typeof d === 'string' && cheminRelatifSur(d))) {
          problemes.push('« fichiers.vers » doit donner des dossiers à l\'intérieur du projet.');
          continue;
        }
        for (const inconnue of destinations.flatMap(variablesUtilisees).filter((id) => !ids.has(id))) {
          problemes.push(`La destination utilise la variable « ${inconnue} », qui n'est pas déclarée.`);
        }
        if (vers && typeof vers === 'object') {
          const inconnus = Object.keys(vers).filter((t) => t !== '*' && !projets.TYPES.includes(t));
          if (inconnus.length) problemes.push(`« fichiers.vers » : type inconnu (${inconnus.join(', ')}).`);
          if (tous && !vers['*']) problemes.push('Un kit pour tous les types doit donner une destination « * ».');
          for (const t of Array.isArray(k.types) ? k.types : []) {
            if (!destinationPour(vers, t)) problemes.push(`« fichiers.vers » : aucune destination pour le type « ${t} ».`);
          }
        }
      }
    }
  }

  const necessite = k.necessite === undefined ? [] : k.necessite;
  if (!Array.isArray(necessite)) problemes.push('« necessite » doit être une liste.');
  else {
    for (const n of necessite) {
      if (!ID_KIT.test(n?.kit || '')) problemes.push('Chaque entrée de « necessite » doit donner un « kit ».');
      if (n?.version_min !== undefined && !VERSION.test(n.version_min)) problemes.push(`« necessite » : version_min de « ${n.kit} » invalide.`);
    }
  }
  return problemes;
}

// Renvoie { id, dossier, kit, erreur } ; null si ce dossier n'est pas un kit.
async function lireKit(id) {
  if (!ID_KIT.test(id) || NOMS_RESERVES.has(id)) return null;
  const dossier = path.join(chemins.kits, id);
  let kit;
  try {
    kit = await lireJson(path.join(dossier, 'kit.json'));
  } catch (erreur) {
    if (erreur.code === 'ENOENT' || erreur.code === 'ENOTDIR') return null;
    const raison = erreur instanceof SyntaxError ? messageErreurJson(erreur) : erreur.message;
    return { id, dossier, kit: {}, erreur: `kit.json est illisible : ${raison}.` };
  }
  if (!kit || typeof kit !== 'object' || Array.isArray(kit)) return { id, dossier, kit: {}, erreur: 'kit.json doit contenir un objet.' };
  const problemes = await problemesDuKit(kit, dossier);
  return { id, dossier, kit, erreur: problemes.length ? problemes.join(' ') : null };
}

// Tous les kits (un kit invalide reste listé, avec son erreur). Bibliothèque absente = liste vide.
async function listerKits() {
  let entrees;
  try {
    entrees = await fs.readdir(chemins.kits, { withFileTypes: true });
  } catch (erreur) {
    if (erreur.code === 'ENOENT') return [];
    throw erreur;
  }
  const noms = entrees.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  const kits = (await Promise.all(noms.map(lireKit))).filter(Boolean);
  return kits.sort((a, b) => a.id.localeCompare(b.id, 'fr'));
}

// En-tête d'un SKILL.md : seulement « name » et « description » (sur une ou plusieurs lignes).
function lireEnTeteSkill(texte) {
  const bloc = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texte.replace(/^﻿/, ''));
  const valeurs = {};
  let cle = null;
  for (const ligne of bloc ? bloc[1].split(/\r?\n/) : []) {
    const m = /^([a-zA-Z_-]+):\s*(.*)$/.exec(ligne);
    if (m) {
      cle = m[1];
      valeurs[cle] = m[2].replace(/^[>|][-+]?\s*$/, '').replace(/^(['"])(.*)\1$/, '$2');
    } else if (cle && /^\s/.test(ligne)) {
      valeurs[cle] = `${valeurs[cle]} ${ligne.trim()}`.trim();
    }
  }
  return valeurs;
}

async function listerSkills() {
  const dossier = path.join(chemins.kits, '.claude', 'skills');
  const entrees = await fs.readdir(dossier, { withFileTypes: true }).catch(() => []);
  const skills = [];
  for (const e of entrees.filter((x) => x.isDirectory())) {
    let texte;
    try {
      texte = await fs.readFile(path.join(dossier, e.name, 'SKILL.md'), 'utf8');
    } catch {
      continue; // pas de SKILL.md : ce n'est pas un skill
    }
    const enTete = lireEnTeteSkill(texte);
    skills.push({ id: e.name, nom: enTete.name || e.name, description: enTete.description || '' });
  }
  return skills.sort((a, b) => a.id.localeCompare(b.id, 'fr'));
}

// --- Catalogue --------------------------------------------------------------------------------

const cellule = (texte) => String(texte || '').replace(/\s+/g, ' ').trim().replace(/\|/g, '/');

function texteCatalogue(kits, skills) {
  const lignes = ['# Catalogue des kits et des skills', '', '*Généré par Toolkit à partir des kit.json : ne pas le modifier à la main.*', ''];
  const valides = kits.filter((k) => !k.erreur);
  const invalides = kits.filter((k) => k.erreur);
  if (valides.length) {
    lignes.push('| Kit | Version | Genre | Types | Langages | Rôle | Nécessite |', '|---|---|---|---|---|---|---|');
    for (const { id, kit: k } of valides) {
      const types = k.types === 'tous' ? 'tous' : k.types.join(', ');
      const necessite = (k.necessite || []).map((n) => n.kit).join(', ') || '—';
      lignes.push(`| \`${id}\` | ${k.version} | ${k.genre === 'regles' ? 'règles' : 'code'} | ${types} | ${(k.langages || []).join(', ') || 'tous'} | ${cellule(k.description)} | ${necessite} |`);
    }
  } else {
    lignes.push('Aucun kit pour l\'instant.');
  }
  lignes.push('', '## Skills', '');
  if (skills.length) for (const s of skills) lignes.push(`- \`${s.id}\` : ${cellule(s.description) || '(sans description)'}`);
  else lignes.push('Aucun skill pour l\'instant.');
  if (invalides.length) {
    lignes.push('', '## Kits inutilisables (à corriger)', '');
    for (const k of invalides) lignes.push(`- \`${k.id}\` : ${cellule(k.erreur)}`);
  }
  lignes.push('');
  return lignes.join('\n');
}

// (Ré)écrit CATALOGUE.md si la bibliothèque existe et si son contenu a changé.
async function ecrireCatalogue() {
  if (!(await existe(chemins.kits))) return false;
  const texte = texteCatalogue(await listerKits(), await listerSkills());
  const actuel = await fs.readFile(fichierCatalogue(), 'utf8').catch(() => null);
  if (actuel === texte) return false;
  await fs.writeFile(fichierCatalogue(), texte, 'utf8');
  return true;
}

// --- Création de la bibliothèque (première utilisation) ---------------------------------------

async function completerGitignoreKits() {
  const fichier = path.join(chemins.kits, '.gitignore');
  const actuel = await fs.readFile(fichier, 'utf8').catch(() => null);
  if (actuel === null) {
    await fs.writeFile(fichier, GITIGNORE_KITS, 'utf8');
    return;
  }
  const presentes = new Set(actuel.split(/\r?\n/).map((l) => l.trim()));
  const manquantes = LIGNES_GITIGNORE_REQUISES.filter((l) => !presentes.has(l));
  if (manquantes.length) await fs.writeFile(fichier, `${actuel.replace(/\s*$/, '\n')}${manquantes.join('\n')}\n`, 'utf8');
}

// Crée kits/ et son dépôt Git local si besoin. Sans Git sur le PC, les kits restent utilisables.
async function assurerBibliotheque() {
  await fs.mkdir(path.join(chemins.kits, '.claude', 'skills'), { recursive: true });
  await fs.mkdir(path.join(chemins.kits, 'propositions'), { recursive: true });
  await completerGitignoreKits();
  try {
    if (!(await git.estDepot(chemins.kits))) {
      await git.initialiser(chemins.kits);
      await git.commiterTout(chemins.kits, 'Création de la bibliothèque de kits');
    }
  } catch (erreur) {
    journal.info(`Bibliothèque de kits sans historique Git : ${erreur.message}`);
  }
}

// Au lancement de Claude sur un projet. Renvoie le dossier à passer à « --add-dir ».
async function preparerPourClaude() {
  await assurerBibliotheque();
  await ecrireCatalogue();
  return chemins.kits;
}

// --- Conviennent-ils au projet ? --------------------------------------------------------------

// Parcours en largeur, arrêté dès qu'un fichier répond à la question ou à la limite.
async function parcourirProjet(dossier, surFichier) {
  const file = [dossier];
  let vus = 0;
  while (file.length && vus < ELEMENTS_MAX_PARCOURS) {
    const courant = file.shift();
    const entrees = await fs.readdir(courant, { withFileTypes: true }).catch(() => []);
    for (const e of entrees) {
      vus += 1;
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && !DOSSIERS_IGNORES.has(e.name)) file.push(path.join(courant, e.name));
      } else if (e.isFile() && (await surFichier(path.join(courant, e.name), e.name))) {
        return;
      }
    }
  }
}

function langageDuFichier(nom, type) {
  const n = nom.toLowerCase();
  if (n.endsWith('.py')) return 'python';
  if (n.endsWith('.java')) return 'java';
  if (n.endsWith('.kt')) return 'kotlin';
  if (n === 'package.json' || n.endsWith('.mjs') || n.endsWith('.cjs')) return 'node';
  // Dans un outil HTML ou une application Android, un .js est du code de page, pas du Node.
  if (n.endsWith('.js') && ['script', 'autre'].includes(type)) return 'node';
  return null;
}

async function projetALangage(dossier, type, langages) {
  let trouve = false;
  await parcourirProjet(dossier, (_chemin, nom) => {
    trouve = langages.includes(langageDuFichier(nom, type));
    return trouve;
  });
  return trouve;
}

// Le kit convient-il à ce type de projet ? (le langage demande de regarder les fichiers)
const convientAuType = (kit, type) => kit.types === 'tous' || kit.types.includes(type);

// Package du projet s'il n'y a pas de doute : namespace Gradle, sinon début commun à toutes les
// sources, sinon gradle.properties. null = à demander (--var).
async function detecterPackage(dossier, module) {
  const lire = (...morceaux) => fs.readFile(path.join(dossier, ...morceaux), 'utf8').catch(() => '');
  const modules = ['.', ...(module && cheminRelatifSur(module) ? [module] : [])];
  const namespaces = new Set();
  for (const m of modules) {
    for (const f of ['build.gradle', 'build.gradle.kts']) {
      const r = /^\s*namespace\s*=?\s*['"]([\w.]+)['"]/m.exec(await lire(m, f));
      if (r) namespaces.add(r[1]);
    }
  }
  if (namespaces.size === 1) return [...namespaces][0];

  let commun = null;
  let lus = 0;
  for (const m of modules) {
    const racine = path.join(dossier, m, 'src');
    await parcourirProjet(racine, async (chemin, nom) => {
      if (!/\.(java|kt)$/i.test(nom)) return false;
      const texte = await fs.readFile(chemin, 'utf8').catch(() => '');
      const r = /^\s*package\s+([\w.]+)/m.exec(texte);
      if (!r) return false;
      const morceaux = r[1].split('.');
      if (commun === null) commun = morceaux;
      else {
        let i = 0;
        while (i < commun.length && i < morceaux.length && commun[i] === morceaux[i]) i += 1;
        commun = commun.slice(0, i);
      }
      lus += 1;
      return lus >= SOURCES_MAX_PACKAGE;
    });
  }
  // Un seul segment (« fr », « com ») ne désigne pas le projet : mieux vaut demander.
  if (commun && commun.length >= 2) return commun.join('.');

  const r = /^\s*(?:maven_group|mod_group|group)\s*=\s*([\w.]+)\s*$/m.exec(await lire('gradle.properties'));
  return r ? r[1] : null;
}

// --- Plan d'ajout (rien n'est modifié) --------------------------------------------------------

async function fichiersDuDossier(dossier, relatif = '') {
  const liste = [];
  for (const e of await fs.readdir(path.join(dossier, relatif), { withFileTypes: true })) {
    const r = relatif ? `${relatif}/${e.name}` : e.name;
    if (e.isSymbolicLink()) throw new Error(`Le kit contient un lien symbolique (« ${r} ») : impossible de le copier sans risque.`);
    if (e.isDirectory()) liste.push(...(await fichiersDuDossier(dossier, r)));
    else if (e.isFile()) liste.push(r);
  }
  return liste;
}

const remplacer = (texte, valeurs) => String(texte).replace(VARIABLE_DANS_TEXTE, (tout, cle) => valeurs[cle] ?? tout);

// Le kit et les kits qu'il nécessite, dans l'ordre d'ajout (les nécessaires d'abord).
async function resoudreKits(idDepart, installes) {
  const ordre = [];
  const faits = new Set();
  const visite = async (id, pile) => {
    if (pile.includes(id)) throw new Error(`Les kits se nécessitent en boucle : ${[...pile, id].join(' -> ')}.`);
    if (faits.has(id)) return;
    const k = await lireKit(id);
    if (!k) throw new Error(`Le kit « ${id} » est introuvable dans la bibliothèque.`);
    if (k.erreur) throw new Error(`Le kit « ${id} » est inutilisable : ${k.erreur}`);
    for (const n of k.kit.necessite || []) {
      const present = installes.find((i) => i.id === n.kit);
      if (present) {
        if (n.version_min && comparerVersions(present.version, n.version_min) < 0) {
          throw new Error(`Le kit « ${id} » nécessite « ${n.kit} » ${n.version_min} ou plus, et ce projet a la version ${present.version}. Aucune mise à jour n'est automatique : mets d'abord ce kit à jour dans le projet.`);
        }
        continue;
      }
      await visite(n.kit, [...pile, id]);
      const dep = ordre.find((o) => o.id === n.kit);
      if (n.version_min && comparerVersions(dep.kit.version, n.version_min) < 0) {
        throw new Error(`Le kit « ${id} » nécessite « ${n.kit} » ${n.version_min} ou plus, mais la bibliothèque a la version ${dep.kit.version}.`);
      }
    }
    faits.add(id);
    ordre.push(k);
  };
  await visite(idDepart, []);
  return ordre;
}

// Valeurs des variables d'un kit : --var, sinon détection (package), sinon défaut.
// Remplit « manquantes » et « problemes » au lieu de s'arrêter, pour tout signaler d'un coup.
async function valeursDuKit(k, projet, dossierProjet, fournies, detections, manquantes, problemes) {
  const valeurs = { nom_projet: projet.fiche.nom, id_projet: projet.id };
  const declarees = {};
  for (const v of k.kit.variables || []) {
    let valeur = fournies[v.id];
    if (valeur === undefined && v.defaut !== undefined) valeur = v.defaut;
    valeurs[v.id] = valeur;
  }
  for (const v of k.kit.variables || []) {
    let valeur = valeurs[v.id];
    if (v.genre === 'package' && fournies[v.id] === undefined) {
      const detecte = await detecterPackage(dossierProjet, typeof valeurs.module === 'string' ? valeurs.module : null);
      if (detecte) {
        valeur = detecte;
        detections[v.id] = detecte;
      }
    }
    if (valeur === undefined || valeur === '') {
      manquantes.set(v.id, v.libelle || v.id);
      delete valeurs[v.id];
      continue;
    }
    if (v.genre === 'package') {
      if (!PACKAGE.test(valeur)) problemes.push(`« ${valeur} » n'est pas un nom de package valide (variable « ${v.id} »).`);
      valeurs[`${v.id}_chemin`] = valeur.split('.').join('/');
    }
    valeurs[v.id] = valeur;
    declarees[v.id] = valeur;
  }
  return { valeurs, declarees };
}

// Tout est vérifié ici, avant la moindre écriture. Lance une erreur s'il y a le moindre problème.
// variables : valeurs données par --var. Renvoie le plan pour executerAjout().
async function planifierAjout({ kit: idKit, projet: idProjet, variables = {} }) {
  if (typeof idKit !== 'string' || !ID_KIT.test(idKit) || NOMS_RESERVES.has(idKit)) throw new Error(`Nom de kit invalide : « ${idKit} ».`);
  const projet = await projets.chargerProjet(idProjet);
  if (!projet) throw new Error(`Le projet « ${idProjet} » est introuvable.`);
  if (projet.erreur) throw new Error(`Impossible d'ajouter un kit à « ${idProjet} » : ${projet.erreur}`);
  const dossierProjet = path.join(chemins.projets(), idProjet);
  const installes = projet.fiche.kits;
  if (installes.some((i) => i.id === idKit)) throw new Error(`Ce projet a déjà le kit « ${idKit} ». Aucune mise à jour n'est automatique.`);

  const kits = await resoudreKits(idKit, installes);
  const type = projet.fiche.type;
  const problemes = [];
  const manquantes = new Map();
  const detections = {};
  const elements = [];
  const cibles = new Map(); // destination en minuscules (Windows ignore la casse) -> kit

  for (const k of kits) {
    if (!convientAuType(k.kit, type)) {
      problemes.push(`Le kit « ${k.id} » ne convient pas à ce projet de type « ${type} » (il accepte : ${k.kit.types.join(', ')}).`);
      continue;
    }
    if (k.kit.langages && !(await projetALangage(dossierProjet, type, k.kit.langages))) {
      problemes.push(`Le kit « ${k.id} » demande un projet en ${k.kit.langages.join(' ou ')} : aucun fichier de ce langage dans ce projet.`);
      continue;
    }
    const { valeurs, declarees } = await valeursDuKit(k, projet, dossierProjet, variables, detections, manquantes, problemes);
    const copies = [];
    const destinations = [];
    for (const groupe of k.kit.fichiers || []) {
      const brute = destinationPour(groupe.vers, type);
      const destination = remplacer(brute, valeurs).replace(/\\/g, '/').replace(/\/+$/, '');
      if (variablesUtilisees(destination).length) continue; // variable manquante : déjà signalée
      if (!cheminRelatifSur(destination)) {
        problemes.push(`Kit « ${k.id} » : la destination « ${destination} » sort du projet.`);
        continue;
      }
      if (!destinations.includes(destination)) destinations.push(destination);
      const source = path.join(k.dossier, groupe.source);
      for (const relatif of await fichiersDuDossier(source)) {
        if (git.EXPRESSION_SECRETS.test(relatif)) {
          problemes.push(`Kit « ${k.id} » : « ${relatif} » ressemble à un fichier secret, il n'est pas copié dans un projet.`);
          continue;
        }
        const vers = path.posix.normalize(`${destination}/${remplacer(relatif, valeurs)}`);
        if (!cheminRelatifSur(vers) || variablesUtilisees(vers).length) {
          problemes.push(`Kit « ${k.id} » : le fichier « ${relatif} » ne peut pas être copié dans le projet.`);
          continue;
        }
        const minuscules = vers.toLowerCase();
        if (minuscules.split('/')[0] === '.git' || FICHIERS_INTERDITS.has(minuscules)) {
          problemes.push(`Kit « ${k.id} » : il ne peut pas écrire « ${vers} » (fichier géré par Toolkit ou Git).`);
          continue;
        }
        if (cibles.has(minuscules)) {
          problemes.push(`Le fichier « ${vers} » serait écrit deux fois (kits « ${cibles.get(minuscules)} » et « ${k.id} »).`);
          continue;
        }
        cibles.set(minuscules, k.id);
        if (await existe(path.join(dossierProjet, vers))) {
          problemes.push(`« ${vers} » existe déjà dans le projet : rien n'est écrasé.`);
          continue;
        }
        copies.push({ source: path.join(source, relatif), vers });
      }
    }
    elements.push({ id: k.id, kit: k.kit, dossier: k.dossier, valeurs, declarees, copies, destinations });
  }

  // Une faute de frappe dans --var ne doit pas passer inaperçue (une valeur détectée la remplacerait).
  const connues = new Set(kits.flatMap((k) => (k.kit.variables || []).map((v) => v.id)));
  const inconnues = Object.keys(variables).filter((id) => !connues.has(id));
  if (inconnues.length) problemes.push(`Variables inconnues de ces kits : ${inconnues.join(', ')}.`);
  if (manquantes.size) {
    const liste = [...manquantes].map(([id, libelle]) => `--var ${id}=… (${libelle})`).join(', ');
    problemes.push(`Valeurs à donner : ${liste}.`);
  }
  // Un fichier ignoré par Git disparaîtrait d'un clone du projet.
  const ecrits = elements.flatMap((e) => e.copies.map((c) => c.vers));
  if (ecrits.length && await git.estDepot(dossierProjet).catch(() => false)) {
    const r = await git.git(dossierProjet, ['check-ignore', '-z', '--stdin'], { entree: `${ecrits.join('\0')}\0` }).catch(() => null);
    const ignores = r && r.code === 0 ? r.sortie.split('\0').filter(Boolean) : [];
    if (ignores.length) problemes.push(`Ces destinations sont ignorées par Git (.gitignore du projet) et disparaîtraient d'un clone : ${ignores.join(', ')}.`);
  }
  if (problemes.length) throw new Error(problemes.join('\n'));

  return { projet: { id: idProjet, nom: projet.fiche.nom }, dossierProjet, kitsActuels: installes, elements, detections };
}

// Ce qu'un plan fera, pour l'affichage (--essai et compte rendu). Aucun chemin absolu.
function resumerPlan(plan) {
  return {
    projet: plan.projet,
    detections: plan.detections,
    kits: plan.elements.map((e) => ({
      id: e.id,
      nom: e.kit.nom,
      version: e.kit.version,
      adaptation: e.kit.adaptation === true,
      guide: `kits/${e.id}/${e.kit.guide}`,
      fichiers: e.copies.map((c) => c.vers),
    })),
  };
}

// --- Exécution --------------------------------------------------------------------------------

// Remplace les variables d'un fichier texte. Binaire ou encodage autre que UTF-8 : copie exacte.
function contenuFinal(tampon, valeurs) {
  if (tampon.includes(0)) return tampon;
  const texte = tampon.toString('utf8');
  if (!Buffer.from(texte, 'utf8').equals(tampon)) return tampon;
  const remplace = remplacer(texte, valeurs);
  return remplace === texte ? tampon : Buffer.from(remplace, 'utf8');
}

// Section du CLAUDE.md du projet, écrite une fois à l'ajout : les règles voyagent avec le projet
// (clone sur un autre PC) et ne changent pas tant que le kit n'est pas mis à jour dans le projet.
async function sectionKit(e) {
  const lignes = [
    `<!-- toolkit:kit=${e.id}= (section ajoutée par Toolkit avec ce kit : ne pas la modifier à la main) -->`,
    `## Kit « ${e.kit.nom} » (\`${e.id}\`, version ${e.kit.version})`,
    '',
    cellule(e.kit.description),
  ];
  if (e.destinations.length) {
    lignes.push('', `- Fichiers du kit : ${e.destinations.map((d) => `\`${d}/\``).join(', ')}. Utilise-les : ne recode pas ce qu'ils fournissent.`);
  }
  lignes.push(`${e.destinations.length ? '' : '\n'}- Guide : \`kits/${e.id}/${e.kit.guide}\`, à la racine de Toolkit.`);
  if (e.kit.regles) {
    const regles = (await fs.readFile(path.join(e.dossier, e.kit.regles), 'utf8')).replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
    lignes.push('', '### Règles de ce kit', '', remplacer(regles, e.valeurs));
  }
  lignes.push(`<!-- /toolkit:kit=${e.id}= -->`);
  return lignes.join('\n');
}

// Copie les fichiers et note les kits dans projet.json. Tout ou rien : au moindre échec, ce qui
// a été écrit est retiré et CLAUDE.md retrouve son contenu d'origine.
async function executerAjout(plan) {
  const { dossierProjet } = plan;
  const ecrits = [];
  const claudeMd = path.join(dossierProjet, 'CLAUDE.md');
  const claudeMdAvant = await fs.readFile(claudeMd).catch(() => null);
  let claudeMdModifie = false;
  try {
    for (const e of plan.elements) {
      for (const copie of e.copies) {
        const cible = path.join(dossierProjet, ...copie.vers.split('/'));
        await fs.mkdir(path.dirname(cible), { recursive: true });
        // « wx » : un fichier apparu depuis la vérification n'est jamais écrasé.
        await fs.writeFile(cible, contenuFinal(await fs.readFile(copie.source), e.valeurs), { flag: 'wx' });
        ecrits.push(cible);
      }
    }
    for (const e of plan.elements) {
      claudeMdModifie = true;
      await ecrireSection(claudeMd, `<!-- toolkit:kit=${e.id}= (`, `<!-- /toolkit:kit=${e.id}= -->`, await sectionKit(e), { creerSi: `# ${plan.projet.nom}\n\n` });
    }
    const ajoutes = plan.elements.map((e) => ({ id: e.id, version: e.kit.version, variables: e.declarees }));
    await projets.modifierFiche(plan.projet.id, { kits: [...plan.kitsActuels, ...ajoutes] });
  } catch (erreur) {
    await annulerAjout(dossierProjet, ecrits, claudeMdModifie ? { fichier: claudeMd, contenu: claudeMdAvant } : null);
    journal.erreur('Ajout d\'un kit annulé :', erreur);
    throw new Error(`L'ajout du kit a échoué et a été annulé : ${erreur.message}`);
  }
  return resumerPlan(plan);
}

async function annulerAjout(dossierProjet, ecrits, claudeMd) {
  for (const fichier of ecrits) {
    await fs.rm(fichier, { force: true }).catch(() => {});
    // Retire les dossiers devenus vides créés pour le kit (rmdir échoue s'ils contiennent autre chose).
    let dossier = path.dirname(fichier);
    while (dossier.startsWith(dossierProjet + path.sep)) {
      try {
        await fs.rmdir(dossier);
      } catch {
        break;
      }
      dossier = path.dirname(dossier);
    }
  }
  if (claudeMd) {
    if (claudeMd.contenu === null) await fs.rm(claudeMd.fichier, { force: true }).catch(() => {});
    else await fs.writeFile(claudeMd.fichier, claudeMd.contenu).catch(() => {});
  }
}

module.exports = {
  LANGAGES,
  comparerVersions,
  listerKits,
  listerSkills,
  lireKit,
  convientAuType,
  projetALangage,
  detecterPackage,
  texteCatalogue,
  ecrireCatalogue,
  assurerBibliotheque,
  preparerPourClaude,
  planifierAjout,
  resumerPlan,
  executerAjout,
};

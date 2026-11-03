// Bibliothèque personnelle de skills : Toolkit/skills/ (format et règles : docs/skills.md).
// Toolkit ne fournit que l'utilitaire : aucun skill n'est livré avec l'application.
// N'utilise pas Electron, pour servir aussi à la commande scripts/skills.js.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const chemins = require('./chemins');
const projets = require('./projets');
const git = require('./git');
const journal = require('./journal');
const { existe } = require('./fichiers');

const ID_SKILL = /^[a-z0-9][a-z0-9-]*$/;
const NOM_RESERVE_WINDOWS = /^(con|prn|aux|nul|com\d|lpt\d)$/;
const NOMS_RESERVES = new Set(['propositions']);

const GITIGNORE_SKILLS = [
  '# Propositions de Claude : jamais versionnées avant d\'être acceptées',
  'propositions/',
  '',
  '# Généré par Toolkit',
  '/CLAUDE.md',
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
const LIGNES_GITIGNORE_REQUISES = ['propositions/', '/CLAUDE.md'];
const NOM_DEPOT_GITHUB = 'toolkit-skills';

const dossierSkills = () => path.join(chemins.skills, '.claude', 'skills');
const cellule = (texte) => String(texte || '').replace(/\s+/g, ' ').trim();

// Windows garde parfois un dossier occupé pendant quelques instants.
async function renommerAvecEssais(de, vers) {
  for (let essai = 0; ; essai += 1) {
    try {
      await fs.rename(de, vers);
      return;
    } catch (erreur) {
      if (essai >= 19 || !['EBUSY', 'EPERM', 'EACCES'].includes(erreur.code)) throw erreur;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

// --- Ancien dossier « kits » (avant la version 1.18) ---------------------------------------------

// Renomme Toolkit/kits/ en Toolkit/skills/ (contenu, historique Git et remote gardés). Appelé au
// démarrage et avant toute création : sans cela, une bibliothèque vide serait créée à côté.
async function migrerAncienDossier() {
  if (!(await existe(chemins.ancienDossierKits)) || await existe(chemins.skills)) return false;
  try {
    await renommerAvecEssais(chemins.ancienDossierKits, chemins.skills);
  } catch (erreur) {
    journal.erreur('Renommage de kits/ en skills/ :', erreur);
    throw new Error('Le dossier « kits » de Toolkit doit être renommé en « skills », mais il est utilisé par un programme (Claude, un terminal, l\'Explorateur ?). Ferme-le puis redémarre Toolkit.');
  }
  // Fichier généré pour les kits, qui n'existent plus.
  await fs.rm(path.join(chemins.skills, 'CATALOGUE.md'), { force: true }).catch(() => {});
  journal.info('Bibliothèque renommée : kits/ -> skills/');
  return true;
}

// Les deux dossiers existent : Toolkit n'en fusionne aucun, il le signale.
const ancienDossierRestant = () => existe(chemins.ancienDossierKits);

// Dossiers d'anciens kits encore dans la bibliothèque (un kit.json à la racine du dossier).
// Toolkit ne s'en sert plus : l'onglet « Skills » propose de les transformer avec Claude.
async function listerAnciensKits() {
  const entrees = await fs.readdir(chemins.skills, { withFileTypes: true }).catch(() => []);
  const anciens = [];
  for (const e of entrees) {
    if (!e.isDirectory() || e.name.startsWith('.') || NOMS_RESERVES.has(e.name)) continue;
    if (await existe(path.join(chemins.skills, e.name, 'kit.json'))) anciens.push(e.name);
  }
  return anciens.sort((a, b) => a.localeCompare(b, 'fr'));
}

// --- Lecture des skills -------------------------------------------------------------------------

// En-tête d'un SKILL.md : seulement « name » et « description » (sur une ou plusieurs lignes).
function lireEnTeteSkill(texte) {
  const bloc = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texte.replace(/^﻿/, ''));
  const valeurs = {};
  let cle = null;
  for (const ligne of bloc ? bloc[1].split(/\r?\n/) : []) {
    const m = /^([a-zA-Z_-]+):\s*(.*)$/.exec(ligne);
    if (m) {
      cle = m[1];
      valeurs[cle] = m[2].replace(/^[>|][-+]?\s*$/, '');
      if (valeurs[cle].startsWith('"')) {
        try {
          valeurs[cle] = JSON.parse(valeurs[cle]);
        } catch {
          valeurs[cle] = valeurs[cle].replace(/^"|"$/g, '');
        }
      } else {
        valeurs[cle] = valeurs[cle].replace(/^'(.*)'$/, '$1');
      }
    } else if (cle && /^\s/.test(ligne)) {
      valeurs[cle] = `${valeurs[cle]} ${ligne.trim()}`.trim();
    }
  }
  return valeurs;
}

async function listerSkills() {
  const entrees = await fs.readdir(dossierSkills(), { withFileTypes: true }).catch(() => []);
  const skills = [];
  for (const e of entrees.filter((x) => x.isDirectory())) {
    let texte;
    try {
      texte = await fs.readFile(path.join(dossierSkills(), e.name, 'SKILL.md'), 'utf8');
    } catch {
      continue; // pas de SKILL.md : ce n'est pas un skill
    }
    const enTete = lireEnTeteSkill(texte);
    skills.push({ id: e.name, nom: enTete.name || e.name, description: enTete.description || '' });
  }
  return skills.sort((a, b) => a.id.localeCompare(b.id, 'fr'));
}

// --- Création de la bibliothèque (première utilisation) ---------------------------------------

async function completerGitignore() {
  const fichier = path.join(chemins.skills, '.gitignore');
  const actuel = await fs.readFile(fichier, 'utf8').catch(() => null);
  if (actuel === null) {
    await fs.writeFile(fichier, GITIGNORE_SKILLS, 'utf8');
    return;
  }
  const presentes = new Set(actuel.split(/\r?\n/).map((l) => l.trim()));
  const manquantes = LIGNES_GITIGNORE_REQUISES.filter((l) => !presentes.has(l));
  if (manquantes.length) await fs.writeFile(fichier, `${actuel.replace(/\s*$/, '\n')}${manquantes.join('\n')}\n`, 'utf8');
}

// Consignes de Claude quand il travaille DANS la bibliothèque (« Améliorer avec Claude »). Claude
// Code ne lit pas ce fichier depuis un --add-dir : sans effet pendant le travail sur un projet.
// Entièrement généré et ignoré par Git : il suit la documentation de la version de Toolkit.
async function ecrireConsignesBibliotheque() {
  const documentation = await fs.readFile(path.join(chemins.app, 'docs', 'skills.md'), 'utf8').catch(() => '');
  const texte = [
    '<!-- Fichier généré par Toolkit : ne pas le modifier, il est réécrit. -->',
    '# Bibliothèque de skills de l\'utilisateur',
    '',
    'Tu travailles dans la bibliothèque personnelle de l\'utilisateur, à sa demande.',
    '',
    '- Parle-lui en français, simplement.',
    '- Un skill suit le format standard de Claude Code : `.claude/skills/<nom>/SKILL.md`.',
    '- Un skill décrit une façon de faire (étapes, règles, pièges), pas du code figé à recopier :',
    '  pour une bibliothèque ou un outil qui existe déjà, renvoie vers sa documentation officielle.',
    '- Rien de propre à un projet, aucun secret.',
    '- Ne modifie aucun projet.',
    '- Ne modifie pas ce fichier : Toolkit le génère.',
    '- `propositions/` attend la décision de l\'utilisateur (Accepter / Refuser dans Toolkit) : n\'y déplace',
    '  rien toi-même vers la bibliothèque, et n\'y touche que s\'il te le demande.',
    '- Fais des commits locaux avec des messages clairs en français. **Ne fais jamais de push** :',
    '  l\'utilisateur envoie lui-même depuis l\'onglet « Git et GitHub » de Toolkit.',
    '',
    documentation.replace(/\r\n/g, '\n').replace(/^# /m, '## ').replace(/^## (?!Skills)/gm, '### '),
    '',
  ].join('\n');
  const fichier = path.join(chemins.skills, 'CLAUDE.md');
  if (await fs.readFile(fichier, 'utf8').catch(() => null) !== texte) await fs.writeFile(fichier, texte, 'utf8');
}

// Crée skills/ et son dépôt Git local si besoin. Sans Git sur le PC, les skills restent utilisables.
async function assurerBibliotheque() {
  await migrerAncienDossier();
  await fs.mkdir(dossierSkills(), { recursive: true });
  await fs.mkdir(path.join(chemins.skills, 'propositions'), { recursive: true });
  await completerGitignore();
  await ecrireConsignesBibliotheque();
  try {
    if (!(await git.estDepot(chemins.skills))) {
      await git.initialiser(chemins.skills);
      await git.commiterTout(chemins.skills, 'Création de la bibliothèque de skills');
    }
  } catch (erreur) {
    journal.info(`Bibliothèque de skills sans historique Git : ${erreur.message}`);
  }
}

// Au lancement de Claude sur un projet. Renvoie le dossier à passer à « --add-dir ».
async function preparerPourClaude() {
  await assurerBibliotheque();
  return chemins.skills;
}

// --- Propositions de Claude (skills/propositions/) ----------------------------------------------
// Dossier ignoré par Git : une proposition n'est utilisée qu'après avoir été acceptée. Le contrôle
// de « rien de propre à un projet » est une aide pour l'utilisateur (mots repérés), pas une
// garantie : c'est lui qui décide.

const dossierPropositions = () => path.join(chemins.skills, 'propositions');
const FICHIER_MOTIF = 'proposition.md'; // pourquoi Claude propose : retiré à l'acceptation
const FICHIER_REFUS = 'REFUS.md'; // ce qui a été refusé, pour ne pas le reproposer
const TAILLE_MAX_CONTROLE = 2 * 1024 * 1024;
const FICHIERS_MAX_CONTROLE = 300;
const TAILLE_MAX_MOTIF = 1500;

function verifierNomProposition(id) {
  if (typeof id !== 'string' || !id || id === '.' || id === '..' || /[\\/:*?"<>|]/.test(id)) {
    throw new Error('Cette proposition n\'existe plus.');
  }
  return path.join(dossierPropositions(), id);
}

// Tous les fichiers, et ce qui ne doit jamais entrer dans la bibliothèque.
async function contenuProposition(dossier, relatif = '') {
  const resultat = { fichiers: [], problemes: [] };
  for (const e of await fs.readdir(path.join(dossier, relatif), { withFileTypes: true })) {
    const r = relatif ? `${relatif}/${e.name}` : e.name;
    if (e.isSymbolicLink()) resultat.problemes.push(`« ${r} » est un lien symbolique.`);
    else if (e.isDirectory()) {
      // « .claude » surtout : Claude Code pourrait charger un skill qui n'a pas été accepté.
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') {
        resultat.problemes.push(`Le dossier « ${r} » n'a pas sa place dans une proposition.`);
        continue;
      }
      const dedans = await contenuProposition(dossier, r);
      resultat.fichiers.push(...dedans.fichiers);
      resultat.problemes.push(...dedans.problemes);
    } else if (e.isFile()) {
      if (git.EXPRESSION_SECRETS.test(r)) resultat.problemes.push(`« ${r} » ressemble à un fichier secret.`);
      resultat.fichiers.push(r);
    }
  }
  return resultat;
}

// Ce qui semble propre à un projet ou à ce PC : noms de projets et chemins absolus.
async function avertissementsProposition(dossier, fichiers) {
  const liste = (await projets.listerProjets()).filter((p) => !p.erreur);
  const echapper = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const termes = new Map();
  for (const p of liste) {
    for (const t of [p.id, p.fiche.nom]) {
      if (t.length >= 4) termes.set(t.toLowerCase(), new RegExp(`(?<![\\p{L}\\p{N}])${echapper(t)}(?![\\p{L}\\p{N}])`, 'iu'));
    }
  }
  const CHEMIN_ABSOLU = /(?<![A-Za-z])[A-Za-z]:[\\/](?!\/)|(?<![\w.])\/(?:Users|home)\/[\w.-]+/;
  const avertissements = new Set();
  for (const relatif of fichiers.filter((f) => f !== FICHIER_MOTIF).slice(0, FICHIERS_MAX_CONTROLE)) {
    for (const [terme, expression] of termes) {
      if (expression.test(relatif)) avertissements.add(`Le nom de fichier « ${relatif} » mentionne « ${terme} », l'un de tes projets.`);
    }
    const chemin = path.join(dossier, ...relatif.split('/'));
    const infos = await fs.stat(chemin).catch(() => null);
    if (!infos || infos.size > TAILLE_MAX_CONTROLE) continue;
    const tampon = await fs.readFile(chemin).catch(() => null);
    if (!tampon || tampon.includes(0)) continue;
    const texte = tampon.toString('utf8');
    for (const [terme, expression] of termes) {
      if (expression.test(texte)) avertissements.add(`« ${relatif} » mentionne « ${terme} », l'un de tes projets.`);
    }
    if (CHEMIN_ABSOLU.test(texte)) avertissements.add(`« ${relatif} » contient un chemin propre à ce PC.`);
  }
  return [...avertissements];
}

// Décrit une proposition. problemes : acceptation impossible ; avertissements : à vérifier.
async function inspecterProposition(id) {
  const dossier = verifierNomProposition(id);
  const infos = await fs.lstat(dossier).catch(() => null);
  if (!infos) throw new Error('Cette proposition n\'existe plus.');
  const base = { id, nom: id, description: '', motif: '', fichiers: [], problemes: [], avertissements: [] };
  if (!infos.isDirectory()) return { ...base, problemes: ['Une proposition doit être un dossier.'] };
  const contenu = await contenuProposition(dossier);
  const p = { ...base, fichiers: contenu.fichiers, problemes: contenu.problemes };
  const motif = await fs.readFile(path.join(dossier, FICHIER_MOTIF), 'utf8').catch(() => '');
  p.motif = motif.replace(/^﻿/, '').trim().slice(0, TAILLE_MAX_MOTIF);
  if (!ID_SKILL.test(id) || NOMS_RESERVES.has(id) || NOM_RESERVE_WINDOWS.test(id)) {
    p.problemes.push('Le nom du dossier doit être en minuscules, chiffres et tirets, et ne pas être réservé.');
  }
  if (contenu.fichiers.includes('SKILL.md')) {
    const enTete = lireEnTeteSkill(await fs.readFile(path.join(dossier, 'SKILL.md'), 'utf8').catch(() => ''));
    p.description = enTete.description || '';
    if (!p.description) p.problemes.push('SKILL.md doit donner une « description ».');
    if (ID_SKILL.test(id) && await existe(path.join(dossierSkills(), id))) p.problemes.push(`Un skill « ${id} » existe déjà dans ta bibliothèque.`);
  } else if (contenu.fichiers.includes('kit.json')) {
    p.problemes.push('Toolkit n\'utilise plus les kits : une proposition doit être un skill (SKILL.md).');
  } else {
    p.problemes.push('Il manque le fichier SKILL.md.');
  }
  p.avertissements = await avertissementsProposition(dossier, contenu.fichiers);
  return p;
}

// Toutes les propositions (une proposition invalide reste listée). Bibliothèque absente = liste vide.
async function listerPropositions() {
  const entrees = await fs.readdir(dossierPropositions(), { withFileTypes: true }).catch(() => []);
  const noms = entrees.filter((e) => e.isDirectory() || e.isSymbolicLink()).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'fr'));
  return Promise.all(noms.map(inspecterProposition));
}

// Enregistre seulement ces chemins : un travail en cours ailleurs dans skills/ n'est pas touché.
async function commiterCreation(chemin, message) {
  try {
    if (await git.estDepot(chemins.skills)) await git.commiterFichiers(chemins.skills, [chemin], message);
  } catch (erreur) {
    journal.info(`Création non enregistrée dans Git : ${erreur.message}`);
  }
}

// Tout est revérifié au moment d'accepter. La proposition devient un skill de la bibliothèque,
// enregistré dans son historique Git. Renvoie { id, nom }.
async function accepterProposition(id) {
  const p = await inspecterProposition(id);
  if (p.problemes.length) throw new Error(`Cette proposition ne peut pas être acceptée :\n${p.problemes.join('\n')}`);
  const dossier = verifierNomProposition(id);
  const destination = path.join(dossierSkills(), id);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await renommerAvecEssais(dossier, destination);
  } catch (erreur) {
    journal.erreur('Acceptation d\'une proposition :', erreur);
    throw new Error('Le dossier de cette proposition est utilisé par un programme (l\'onglet Code, un terminal ?). Ferme-le puis réessaie.');
  }
  await fs.rm(path.join(destination, FICHIER_MOTIF), { force: true });
  await commiterCreation(`.claude/skills/${id}`, `Proposition acceptée : skill « ${p.nom} »`);
  return { id, nom: p.nom };
}

// Corbeille, jamais d'effacement définitif. Noté dans REFUS.md pour que Claude ne repropose pas la
// même chose. corbeille(chemin) : fournie par l'appelant (Electron).
async function refuserProposition(id, corbeille) {
  const dossier = verifierNomProposition(id);
  if (!(await fs.lstat(dossier).catch(() => null))) throw new Error('Cette proposition n\'existe plus.');
  const p = await inspecterProposition(id).catch(() => ({ description: '' }));
  try {
    await corbeille(dossier);
  } catch (erreur) {
    journal.erreur('Refus d\'une proposition :', erreur);
    throw new Error('Le dossier de cette proposition est utilisé par un programme (l\'onglet Code, un terminal ?). Ferme-le puis réessaie.');
  }
  const fichier = path.join(dossierPropositions(), FICHIER_REFUS);
  const entete = (await existe(fichier)) ? '' : '# Propositions refusées par l\'utilisateur (ne pas les reproposer)\n\n';
  const ligne = `- \`${id}\` (${new Date().toISOString().slice(0, 10)})${p.description ? ` : ${cellule(p.description)}` : ''}\n`;
  await fs.appendFile(fichier, `${entete}${ligne}`, 'utf8').catch((erreur) => journal.erreur('REFUS.md :', erreur));
  return { id };
}

// --- Onglet « Skills » : ce que l'interface affiche ----------------------------------------------

// { existe, skills, propositions, anciensKits, ancienDossier } sans aucun chemin absolu.
async function instantane() {
  await migrerAncienDossier();
  const presente = await existe(chemins.skills);
  return {
    existe: presente,
    skills: await listerSkills(),
    propositions: await listerPropositions(),
    anciensKits: presente ? await listerAnciensKits() : [],
    ancienDossier: presente && await ancienDossierRestant(),
  };
}

// --- Créer un skill -------------------------------------------------------------------------------

// Identifiant lisible et sûr tiré d'un nom (mêmes règles que les dossiers de projets).
function idDepuisNom(nom) {
  const id = String(nom || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  if (!id) throw new Error('Choisis un nom avec au moins une lettre ou un chiffre.');
  if (NOMS_RESERVES.has(id) || NOM_RESERVE_WINDOWS.test(id)) throw new Error(`Le nom « ${id} » est réservé : choisis-en un autre.`);
  return id;
}

// valeurs : { nom, description }. Le dossier porte le nom utilisé par Claude Code. Renvoie { id }.
async function creerSkill({ nom, description }) {
  const descriptionPropre = String(description || '').replace(/\s+/g, ' ').trim();
  if (!descriptionPropre) throw new Error('Décris ce que fait le skill et quand l\'utiliser : Claude s\'en sert pour le choisir.');
  const id = idDepuisNom(nom);
  await assurerBibliotheque();
  const dossier = path.join(dossierSkills(), id);
  if (await existe(dossier)) throw new Error(`Un skill « ${id} » existe déjà : choisis un autre nom.`);
  await fs.mkdir(dossier);
  const contenu = `---\nname: ${id}\ndescription: ${JSON.stringify(descriptionPropre)}\n---\n\nÀ compléter : les instructions de ce skill.\n`;
  await fs.writeFile(path.join(dossier, 'SKILL.md'), contenu, 'utf8');
  await commiterCreation(`.claude/skills/${id}`, `Création du skill « ${id} »`);
  return { id };
}

// --- Récupérer la bibliothèque depuis GitHub (autre PC) -----------------------------------------

// Rien d'autre que ce que Toolkit crée lui-même : on ne perd rien en la remplaçant.
async function bibliothequeVide() {
  const entrees = await fs.readdir(chemins.skills, { withFileTypes: true }).catch(() => null);
  if (entrees === null) return true;
  const fichiersGeneres = new Set(['.gitignore', 'CLAUDE.md']);
  for (const e of entrees) {
    if (e.name === '.git') continue;
    if (e.isDirectory() ? !['.claude', 'propositions'].includes(e.name) : !fichiersGeneres.has(e.name)) return false;
  }
  const propositions = await fs.readdir(path.join(chemins.skills, 'propositions')).catch(() => []);
  if (propositions.some((n) => n !== FICHIER_REFUS)) return false;
  const claude = await fs.readdir(path.join(chemins.skills, '.claude')).catch(() => []);
  if (claude.some((n) => n !== 'skills')) return false;
  if ((await fs.readdir(dossierSkills()).catch(() => [])).length) return false;
  return !(await git.estDepot(chemins.skills) && await git.urlRemote(chemins.skills));
}

// Clone le dépôt puis le range dans Toolkit/skills/. corbeille(chemin) : envoie à la Corbeille une
// bibliothèque vide (celle que Toolkit a créée d'office). Une bibliothèque qui contient quelque
// chose n'est jamais remplacée. surProgression(texte) : messages de git.
async function recupererDepot(url, corbeille, surProgression) {
  await migrerAncienDossier();
  if (!(await bibliothequeVide())) {
    throw new Error('Ta bibliothèque de skills contient déjà quelque chose sur ce PC : Toolkit ne la remplace pas. Si tu veux vraiment la remplacer, mets d\'abord le dossier « skills » ailleurs, puis recommence.');
  }
  await fs.mkdir(chemins.donnees, { recursive: true });
  const temporaire = path.join(chemins.donnees, `skills-recuperation-${Date.now()}`);
  try {
    await git.cloner(url, temporaire, surProgression);
    const ignores = await fs.readFile(path.join(temporaire, '.gitignore'), 'utf8').catch(() => '');
    if (!ignores.split(/\r?\n/).some((l) => l.trim() === 'propositions/')) {
      throw new Error('Ce dépôt ne ressemble pas à une bibliothèque de skills créée par Toolkit : rien n\'a été changé.');
    }
    if (await existe(chemins.skills)) {
      try {
        await corbeille(chemins.skills);
      } catch (erreur) {
        journal.erreur('Bibliothèque vide non déplacée :', erreur);
        throw new Error('Le dossier « skills » actuel est utilisé par un programme (Claude, un terminal, l\'onglet Code ?). Ferme-le puis réessaie.');
      }
    }
    await renommerAvecEssais(temporaire, chemins.skills);
  } finally {
    await fs.rm(temporaire, { recursive: true, force: true }).catch(() => {});
  }
  await fs.rm(path.join(chemins.skills, 'CATALOGUE.md'), { force: true }).catch(() => {});
  await assurerBibliotheque();
  return instantane();
}

module.exports = {
  NOM_DEPOT_GITHUB,
  migrerAncienDossier,
  instantane,
  creerSkill,
  bibliothequeVide,
  recupererDepot,
  listerPropositions,
  accepterProposition,
  refuserProposition,
  listerSkills,
  listerAnciensKits,
  assurerBibliotheque,
  preparerPourClaude,
};

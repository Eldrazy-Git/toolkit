// Mises à jour de Toolkit : versions des bibliothèques (package.json), failles connues
// (npm audit) et programmes utilisés (Claude Code, Git, GitHub CLI, Node.js).
// - Vérification à la demande, et au démarrage si la dernière date de plus de 7 jours.
// - Une version publiée depuis moins de 7 jours n'est pas encore proposée (le temps que
//   ses éventuels défauts soient découverts et corrigés).
// - « Sûre » = même version majeure (0.x : même version mineure) ; une version majeure peut
//   demander d'adapter le code : elle est confiée à Claude.
// - L'installation se fait Toolkit FERMÉ (electron.exe et node-pty sont verrouillés quand
//   il tourne) : un script lance npm install puis relance Toolkit. Une sauvegarde Git du
//   dossier app est faite avant.
// - Les programmes (Git, Node…) s'installent sur tout le PC : Toolkit montre la commande,
//   l'utilisateur la lance lui-même.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { net } = require('electron');
const { execFile } = require('node:child_process');
const chemins = require('./chemins');
const journal = require('./journal');
const reglages = require('./reglages');
const git = require('./git');
const { environnementPropre, sortieDe, lancerDetache } = require('./processus');

const JOUR = 24 * 3600 * 1000;
const AGE_MINIMUM = 7 * JOUR;
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

// Remarques connues sur certaines alertes de sécurité (voir CLAUDE.md > Pièges connus).
const REMARQUES_AUDIT = {
  dompurify: 'Copie incluse dans Monaco (l\'éditeur), utilisée d\'une façon que ces failles ne concernent pas : risque quasi nul pour Toolkit. Sera corrigé par une prochaine version de Monaco.',
};

function morceaux(v) {
  const m = VERSION.exec(String(v || '').replace(/^[\^~v=]+/, ''));
  return m ? m.slice(1).map(Number) : null;
}

function comparer(a, b) {
  const x = morceaux(a);
  const y = morceaux(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// Même « famille » de versions (pas de changement cassant attendu, selon semver).
function compatible(actuelle, candidate) {
  const a = morceaux(actuelle);
  const c = morceaux(candidate);
  if (!a || !c) return false;
  return a[0] === 0 ? c[0] === 0 && c[1] === a[1] : c[0] === a[0];
}

async function lireJsonUrl(url, entetes = {}) {
  const reponse = await net.fetch(url, { headers: { 'user-agent': 'Toolkit', ...entetes } });
  if (!reponse.ok) throw new Error(`${url} : ${reponse.status}`);
  return reponse.json();
}

// Versions stables publiées d'un paquet npm : [{ version, date }], et la « latest ».
async function versionsNpm(nom) {
  const doc = await lireJsonUrl(`https://registry.npmjs.org/${nom.replace('/', '%2f')}`);
  const versions = Object.keys(doc.versions || {})
    .filter((v) => VERSION.test(v))
    .map((v) => ({ version: v, date: Date.parse(doc.time?.[v]) || 0 }))
    .sort((a, b) => comparer(a.version, b.version));
  return { versions, latest: doc['dist-tags']?.latest };
}

async function versionInstallee(nom) {
  try {
    return JSON.parse(await fs.readFile(path.join(chemins.app, 'node_modules', ...nom.split('/'), 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

async function etatPaquet(nom, plage) {
  const installee = await versionInstallee(nom);
  const demandee = plage.replace(/^[\^~=]+/, '');
  const resultat = { nom, installee, demandee, sure: null, attente: null, majeure: null };
  try {
    const { versions, latest } = await versionsNpm(nom);
    const maintenant = Date.now();
    const base = installee || demandee;
    const plusRecentes = versions.filter((v) => comparer(v.version, base) > 0 && comparer(v.version, latest) <= 0);
    const compatibles = plusRecentes.filter((v) => compatible(base, v.version));
    const muresCompatibles = compatibles.filter((v) => maintenant - v.date >= AGE_MINIMUM);
    resultat.sure = muresCompatibles.at(-1) || null;
    const derniereCompatible = compatibles.at(-1);
    if (derniereCompatible && derniereCompatible !== resultat.sure) {
      resultat.attente = { ...derniereCompatible, disponibleLe: derniereCompatible.date + AGE_MINIMUM };
    }
    const majeure = plusRecentes.filter((v) => !compatible(base, v.version)).at(-1);
    if (majeure) resultat.majeure = { ...majeure, mure: maintenant - majeure.date >= AGE_MINIMUM };
  } catch (erreur) {
    journal.info(`Mises à jour : ${nom} : ${erreur.message}`);
    resultat.erreur = 'Impossible de joindre le registre npm.';
  }
  // package.json demande une version plus récente que celle installée (ex. après Claude).
  resultat.aInstaller = Boolean(installee && morceaux(demandee) && comparer(demandee, installee) > 0);
  return resultat;
}

// --- Failles connues (npm audit) ---------------------------------------------------------------

function npm(args, delai = 120000) {
  return new Promise((resoudre) => {
    // npm est un script .cmd : passage par cmd.exe (arguments fixes, aucune saisie utilisateur).
    execFile('cmd.exe', ['/d', '/s', '/c', `npm ${args}`], {
      cwd: chemins.app, env: environnementPropre(), windowsHide: true, timeout: delai, maxBuffer: 20 * 1024 * 1024,
    }, (erreur, sortie) => resoudre(sortie || ''));
  });
}

async function failles() {
  let rapport;
  try {
    rapport = JSON.parse(await npm('audit --json'));
  } catch {
    return null;
  }
  return Object.values(rapport.vulnerabilities || {})
    // Une bibliothèque signalée seulement parce qu'elle en contient une autre : ligne en double.
    .filter((v) => v.via.some((x) => typeof x === 'object'))
    .map((v) => ({
      nom: v.name,
      gravite: v.severity,
      titres: [...new Set(v.via.filter((x) => typeof x === 'object').map((x) => x.title))],
      via: v.effects || [],
      remarque: REMARQUES_AUDIT[v.name] || null,
    }));
}

// --- Programmes installés sur le PC -------------------------------------------------------------

const premiereVersion = (texte) => /(\d+\.\d+\.\d+)/.exec(texte || '')?.[1] || null;

async function etatProgrammes() {
  const { trouverClaude } = require('./terminal');
  const programmes = [
    {
      nom: 'Claude Code',
      installee: async () => premiereVersion(await sortieDe(await trouverClaude() || 'claude', ['--version'])),
      derniere: async () => (await lireJsonUrl('https://registry.npmjs.org/@anthropic-ai/claude-code/latest')).version,
      commande: 'claude update',
    },
    {
      nom: 'Git',
      installee: async () => premiereVersion(await sortieDe('git', ['--version'])),
      derniere: async () => premiereVersion((await lireJsonUrl('https://api.github.com/repos/git-for-windows/git/releases/latest')).tag_name),
      commande: 'winget upgrade --id Git.Git',
    },
    {
      nom: 'GitHub CLI (gh)',
      installee: async () => premiereVersion(await sortieDe('gh', ['--version'])),
      derniere: async () => premiereVersion((await lireJsonUrl('https://api.github.com/repos/cli/cli/releases/latest')).tag_name),
      commande: 'winget upgrade --id GitHub.cli',
    },
    {
      nom: 'Node.js',
      installee: async () => premiereVersion(await sortieDe('node', ['--version'])),
      // Dernière version « LTS » (support long) : celle conseillée.
      derniere: async () => premiereVersion((await lireJsonUrl('https://nodejs.org/dist/index.json')).find((v) => v.lts)?.version),
      commande: 'winget upgrade --id OpenJS.NodeJS.LTS',
    },
  ];
  return Promise.all(programmes.map(async (p) => {
    const [installee, derniere] = await Promise.all([p.installee().catch(() => null), p.derniere().catch(() => null)]);
    return {
      nom: p.nom,
      installee,
      derniere,
      commande: p.commande,
      aJour: installee && derniere ? comparer(installee, derniere) >= 0 : null,
    };
  }));
}

// --- Vérification -----------------------------------------------------------------------------

let dernierResultat = null;

// Nouvelle version de Toolkit lui-même (voir mise-a-jour-toolkit.js), notes rendues en HTML sûr.
async function etatToolkit() {
  try {
    const infos = await require('./mise-a-jour-toolkit').verifier();
    if (infos.derniere?.notes) infos.derniere.notesHtml = require('./notes').rendre(infos.derniere.notes, 'notes-de-version.md');
    return infos;
  } catch (erreur) {
    return { erreur: erreur.message };
  }
}

async function verifier() {
  const paquet = JSON.parse(await fs.readFile(path.join(chemins.app, 'package.json'), 'utf8'));
  const [paquets, audit, programmes, toolkit] = await Promise.all([
    Promise.all(Object.entries(paquet.dependencies || {}).map(([nom, plage]) => etatPaquet(nom, plage))),
    failles(),
    etatProgrammes(),
    etatToolkit(),
  ]);
  dernierResultat = { date: Date.now(), toolkit, paquets, audit, programmes };
  await reglages.modifier({ misesAJour: { derniereVerification: dernierResultat.date } });
  return dernierResultat;
}

function dernier() {
  return dernierResultat;
}

// Au démarrage : vérifie si la dernière vérification date de plus de 7 jours (réglable).
// Renvoie le résultat seulement s'il y a quelque chose à signaler.
async function verifierSiBesoin() {
  const r = reglages.obtenir().misesAJour || {};
  if (r.automatique === false) return null;
  if (r.derniereVerification && Date.now() - r.derniereVerification < 7 * JOUR) return null;
  const resultat = await verifier();
  const aSignaler = resultat.toolkit?.disponible || resultat.paquets.some((p) => p.sure || p.aInstaller)
    || resultat.audit?.some((f) => ['high', 'critical'].includes(f.gravite) && !f.remarque);
  return aSignaler ? resultat : null;
}

// --- Installation -------------------------------------------------------------------------------

// paquets : [{ nom, version }] (version absente : ce que demande package.json).
// Sauvegarde Git de app/, écrit le script de mise à jour et le lance. Toolkit doit ensuite
// quitter (le script attend sa fermeture).
async function preparerInstallation(paquets) {
  const dependances = JSON.parse(await fs.readFile(path.join(chemins.app, 'package.json'), 'utf8')).dependencies || {};
  const liste = (Array.isArray(paquets) ? paquets : []).map((p) => {
    if (!dependances[p?.nom]) throw new Error(`Bibliothèque inconnue : ${p?.nom}`);
    if (p.version && !VERSION.test(p.version)) throw new Error(`Version invalide : ${p.version}`);
    return p.version ? `${p.nom}@${p.version}` : null;
  }).filter(Boolean);

  if (await git.estDepot(chemins.app)) {
    await git.commiterTout(chemins.app, `Sauvegarde automatique avant mise à jour des bibliothèques (${new Date().toLocaleString('fr-FR')})`);
  }
  // Chemins relatifs au script (donnees/) : rien d'absolu n'est écrit.
  const installation = liste.length ? `call npm install --save ${liste.join(' ')}` : 'call npm install';
  const script = [
    '@echo off',
    'chcp 65001 >nul',
    'title Mise à jour de Toolkit',
    'echo Mise à jour de Toolkit : attente de la fermeture de Toolkit...',
    // %1 = numéro du processus de Toolkit : on attend qu'il soit vraiment fermé.
    ':attendre',
    'tasklist /fi "PID eq %1" /nh | find "%1" >nul',
    'if not errorlevel 1 (',
    '  timeout /t 1 /nobreak >nul',
    '  goto attendre',
    ')',
    'timeout /t 2 /nobreak >nul',
    'cd /d "%~dp0..\\app"',
    'echo.',
    `echo ${installation.replace('call ', '')}`,
    installation,
    'if errorlevel 1 goto erreur',
    'call node node_modules\\electron\\install.js',
    'if errorlevel 1 goto erreur',
    'echo.',
    'echo Mise à jour terminée. Relance de Toolkit...',
    'start "" wscript.exe "%~dp0..\\Lancer Toolkit.vbs"',
    'timeout /t 3 /nobreak >nul',
    'exit /b 0',
    ':erreur',
    'echo.',
    'echo La mise à jour a échoué (voir les messages ci-dessus).',
    'echo Pour revenir à la version d\'avant : ouvre Toolkit, onglet Git, ligne Toolkit, menu ...',
    'echo puis Historique des versions et Remettre la version précédente, puis relance npm install.',
    'echo Ou demande de l\'aide à Claude en lui montrant ce message.',
    'pause',
    'start "" wscript.exe "%~dp0..\\Lancer Toolkit.vbs"',
    'exit /b 1',
    '',
  ].join('\r\n');
  const fichier = path.join(chemins.donnees, 'mise-a-jour-toolkit.cmd');
  await fs.mkdir(chemins.donnees, { recursive: true });
  await fs.writeFile(fichier, script, 'utf8');
  await lancerDetache('cmd.exe', ['/d', '/c', fichier, String(process.pid)], { cwd: chemins.donnees });
  journal.info(`Mise à jour lancée : ${installation}`);
}

module.exports = { verifier, dernier, verifierSiBesoin, preparerInstallation };

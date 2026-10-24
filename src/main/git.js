// Opérations Git locales (aucune opération distante ici : pas de push ni de pull).
// Utilise la commande « git » installée sur le PC et sa configuration (nom, e-mail).
'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { environnementPropre } = require('./processus');
const { existe } = require('./fichiers');

// Fichiers à ne jamais versionner (secrets, dépendances, fichiers générés).
const GITIGNORE_DEFAUT = [
  '# Secrets : ne jamais versionner',
  '.env',
  '.env.*',
  '*.jks',
  '*.keystore',
  'local.properties',
  '',
  '# Dépendances et fichiers générés',
  'node_modules/',
  '__pycache__/',
  '*.pyc',
  '.venv/',
  'build/',
  'dist/',
  'out/',
  '.gradle/',
  '.idea/',
  '*.log',
  '',
  '# Fichiers système',
  'Thumbs.db',
  'desktop.ini',
  '.DS_Store',
  '',
].join('\n');

// Lance « git <args> » dans un dossier. Renvoie { code, sortie, erreur }.
function git(dossier, args) {
  return new Promise((resoudre, rejeter) => {
    execFile('git', args, { cwd: dossier, env: environnementPropre(), windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (erreur, sortie, sortieErreur) => {
        if (erreur && erreur.code === 'ENOENT') {
          rejeter(new Error('Git est introuvable sur ce PC. Installe-le (dans PowerShell : winget install Git.Git), puis redémarre Toolkit.'));
          return;
        }
        resoudre({ code: erreur ? (typeof erreur.code === 'number' ? erreur.code : 1) : 0, sortie, erreur: sortieErreur });
      });
  });
}

// Traduit les erreurs Git les plus courantes.
function messageErreur(resultat, action) {
  const texte = `${resultat.erreur}\n${resultat.sortie}`;
  if (/Please tell me who you are|user\.email|user\.name/i.test(texte)) {
    return 'Git ne connaît pas encore ton nom et ton e-mail. Dans PowerShell, tape :\n'
      + 'git config --global user.name "Ton nom"\n'
      + 'git config --global user.email "ton-email@exemple.fr"';
  }
  if (/index\.lock/i.test(texte)) {
    return 'Une autre opération Git est en cours sur ce projet (fichier index.lock). Réessaie dans un instant.';
  }
  return `${action} a échoué : ${(resultat.erreur || resultat.sortie).trim().split('\n')[0]}`;
}

async function gitDisponible() {
  try {
    return (await git(process.cwd(), ['--version'])).code === 0;
  } catch {
    return false;
  }
}

// Le dossier est-il la racine d'un dépôt Git ?
function estDepot(dossier) {
  return existe(path.join(dossier, '.git'));
}

// Crée le dépôt et un .gitignore protégeant les secrets s'il n'en existe pas.
async function initialiser(dossier) {
  const resultat = await git(dossier, ['init', '-b', 'main']);
  if (resultat.code !== 0) throw new Error(messageErreur(resultat, 'L\'initialisation de Git'));
  const gitignore = path.join(dossier, '.gitignore');
  if (!(await existe(gitignore))) await fs.writeFile(gitignore, GITIGNORE_DEFAUT, 'utf8');
}

// Enregistre toutes les modifications dans un commit. Renvoie { commite: bool }.
async function commiterTout(dossier, message) {
  const statut = await git(dossier, ['status', '--porcelain']);
  if (statut.code !== 0) throw new Error(messageErreur(statut, 'La lecture de l\'état Git'));
  if (statut.sortie.trim() === '') return { commite: false };
  const ajout = await git(dossier, ['add', '-A']);
  if (ajout.code !== 0) throw new Error(messageErreur(ajout, 'L\'ajout des fichiers'));
  const commit = await git(dossier, ['commit', '-m', message]);
  if (commit.code !== 0) throw new Error(messageErreur(commit, 'Le commit'));
  return { commite: true };
}

// Commit de quelques fichiers seulement (les autres modifications en cours ne sont pas touchées).
async function commiterFichiers(dossier, fichiers, message) {
  const ajout = await git(dossier, ['add', '--', ...fichiers]);
  if (ajout.code !== 0) throw new Error(messageErreur(ajout, 'L\'ajout des fichiers'));
  const prets = await git(dossier, ['diff', '--cached', '--name-only']);
  if (prets.sortie.trim() === '') return { commite: false };
  const commit = await git(dossier, ['commit', '-m', message, '--', ...fichiers]);
  if (commit.code !== 0) throw new Error(messageErreur(commit, 'Le commit'));
  return { commite: true };
}

// Adresse du dépôt distant « origin », ou null.
async function urlRemote(dossier) {
  const r = await git(dossier, ['remote', 'get-url', 'origin']);
  return r.code === 0 ? r.sortie.trim() || null : null;
}

async function aDesModifications(dossier) {
  const r = await git(dossier, ['status', '--porcelain']);
  return r.code === 0 && r.sortie.trim() !== '';
}

// Fichiers versionnés dont le chemin correspond à l'expression donnée.
async function fichiersSuivis(dossier, expression) {
  const r = await git(dossier, ['ls-files', '-z']);
  if (r.code !== 0) return [];
  return r.sortie.split('\0').filter((f) => f && expression.test(f));
}

// Les lignes de .gitignore qui protègent les secrets.
const LIGNES_SENSIBLES = ['.env', '.env.*', '*.jks', '*.keystore', 'local.properties'];

// Crée le .gitignore (complet) ou y ajoute les lignes sensibles manquantes.
// Renvoie la liste des lignes ajoutées (vide si rien à faire).
async function completerGitignore(dossier) {
  const chemin = path.join(dossier, '.gitignore');
  let actuel = null;
  try {
    actuel = await fs.readFile(chemin, 'utf8');
  } catch {
    // Pas de .gitignore.
  }
  if (actuel === null) {
    await fs.writeFile(chemin, GITIGNORE_DEFAUT, 'utf8');
    return LIGNES_SENSIBLES;
  }
  const presentes = new Set(actuel.split(/\r?\n/).map((l) => l.trim()));
  const manquantes = LIGNES_SENSIBLES.filter((l) => !presentes.has(l));
  if (manquantes.length > 0) {
    const fin = actuel.endsWith('\n') || actuel === '' ? '' : '\n';
    await fs.writeFile(chemin, `${actuel}${fin}\n# Ajouté par Toolkit : fichiers sensibles à ne jamais versionner\n${manquantes.join('\n')}\n`, 'utf8');
  }
  return manquantes;
}

// Clone un dépôt ; surProgression(texte) reçoit les messages de git.
function cloner(url, destination, surProgression) {
  return new Promise((resoudre, rejeter) => {
    const { spawn } = require('node:child_process');
    const processus = spawn('git', ['clone', '--progress', url, destination], {
      env: { ...environnementPropre(), GIT_TERMINAL_PROMPT: '0' },
      windowsHide: true,
    });
    let erreurs = '';
    processus.stderr.on('data', (d) => {
      const texte = d.toString();
      erreurs += texte;
      surProgression?.(texte.split(/[\r\n]+/).filter(Boolean).pop() || '');
    });
    processus.on('error', (e) => rejeter(e.code === 'ENOENT'
      ? new Error('Git est introuvable sur ce PC. Installe-le (dans PowerShell : winget install Git.Git), puis redémarre Toolkit.')
      : e));
    processus.on('close', (code) => {
      if (code === 0) resoudre();
      else if (/not found|does not exist|Repository not found/i.test(erreurs)) {
        rejeter(new Error('Ce dépôt est introuvable. Vérifie l\'adresse ; s\'il est privé, connecte-toi avec « gh auth login ».'));
      } else if (/Authentication|could not read Username|Permission denied/i.test(erreurs)) {
        rejeter(new Error('Accès refusé à ce dépôt. S\'il est privé, connecte-toi à GitHub dans PowerShell : gh auth login'));
      } else {
        rejeter(new Error(`Le clonage a échoué : ${erreurs.trim().split('\n').pop()}`));
      }
    });
  });
}

module.exports = {
  GITIGNORE_DEFAUT,
  LIGNES_SENSIBLES,
  git,
  gitDisponible,
  estDepot,
  initialiser,
  commiterTout,
  commiterFichiers,
  urlRemote,
  aDesModifications,
  fichiersSuivis,
  completerGitignore,
  cloner,
};

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

module.exports = { GITIGNORE_DEFAUT, git, gitDisponible, estDepot, initialiser, commiterTout };

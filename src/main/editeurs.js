// « Ouvrir avec… » : détection des éditeurs installés et ouverture d'un dossier.
//
// Un chemin choisi dans les réglages (reglages.editeurs.<id>) est prioritaire ; sinon
// l'éditeur est détecté automatiquement (registre Windows, commande « where »,
// emplacements habituels). Rien n'est enregistré quand la détection réussit : si Toolkit
// est déplacé sur un autre PC, la détection s'y refait d'elle-même.
'use strict';

const { shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const reglages = require('./reglages');
const { lancerDetache, sortieDe } = require('./processus');

const env = (nom) => process.env[nom] || '';

// Lit une valeur texte du registre Windows (null si absente).
async function lireRegistre(cle, valeur) {
  const args = valeur ? ['query', cle, '/v', valeur] : ['query', cle, '/ve'];
  const sortie = await sortieDe('reg', args);
  const ligne = sortie?.split(/\r?\n/).find((l) => /REG_(EXPAND_)?SZ/.test(l));
  return ligne ? ligne.replace(/^.*REG_(EXPAND_)?SZ\s+/, '').trim() : null;
}

// Premier résultat de « where <commande> » (null si introuvable).
async function where(commande) {
  const sortie = await sortieDe('where', [commande]);
  return sortie?.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) || [];
}

// Définition des éditeurs. Pour en ajouter un : une entrée de plus (et son nom dans
// projets.js > EDITEURS pour qu'il soit accepté dans projet.json).
const EDITEURS = {
  vscode: {
    nom: 'VS Code',
    async candidats() {
      const depuisWhere = (await where('code'))
        .filter((p) => /\\bin\\code(\.cmd)?$/i.test(p))
        .map((p) => path.join(path.dirname(path.dirname(p)), 'Code.exe'));
      return [
        ...depuisWhere,
        path.join(env('LOCALAPPDATA'), 'Programs', 'Microsoft VS Code', 'Code.exe'),
        path.join(env('ProgramFiles'), 'Microsoft VS Code', 'Code.exe'),
        path.join(env('ProgramFiles(x86)'), 'Microsoft VS Code', 'Code.exe'),
      ];
    },
    // Ouvre le dossier, et le fichier principal s'il y en a un.
    arguments: (dossier, fichier) => (fichier ? [dossier, fichier] : [dossier]),
  },
  'android-studio': {
    nom: 'Android Studio',
    async candidats() {
      const depuisRegistre = await Promise.all([
        lireRegistre('HKLM\\SOFTWARE\\Android Studio', 'Path'),
        lireRegistre('HKLM\\SOFTWARE\\WOW6432Node\\Android Studio', 'Path'),
        lireRegistre('HKCU\\SOFTWARE\\Android Studio', 'Path'),
      ]);
      return [
        ...depuisRegistre.filter(Boolean).map((d) => path.join(d, 'bin', 'studio64.exe')),
        path.join(env('ProgramFiles'), 'Android', 'Android Studio', 'bin', 'studio64.exe'),
        path.join(env('LOCALAPPDATA'), 'Programs', 'Android Studio', 'bin', 'studio64.exe'),
        path.join(env('LOCALAPPDATA'), 'Google', 'AndroidStudio', 'bin', 'studio64.exe'),
      ];
    },
    arguments: (dossier) => [dossier],
  },
  'notepad++': {
    nom: 'Notepad++',
    async candidats() {
      const depuisRegistre = await Promise.all([
        lireRegistre('HKLM\\SOFTWARE\\Notepad++'),
        lireRegistre('HKLM\\SOFTWARE\\WOW6432Node\\Notepad++'),
      ]);
      return [
        ...depuisRegistre.filter(Boolean).map((d) => path.join(d, 'notepad++.exe')),
        ...(await where('notepad++')),
        path.join(env('ProgramFiles'), 'Notepad++', 'notepad++.exe'),
        path.join(env('ProgramFiles(x86)'), 'Notepad++', 'notepad++.exe'),
      ];
    },
    // Notepad++ ouvre des fichiers : le fichier principal, sinon le dossier en « espace de travail ».
    arguments: (dossier, fichier) => (fichier ? [fichier] : ['-openFoldersAsWorkspace', dossier]),
  },
  explorateur: {
    nom: 'Explorateur Windows',
    toujoursDisponible: true,
  },
};

// --- Détection --------------------------------------------------------------------------

let cacheDetection = null; // id -> chemin détecté ou null

async function fichierExiste(chemin) {
  try {
    return (await fs.stat(chemin)).isFile();
  } catch {
    return false;
  }
}

async function detecterTous() {
  if (cacheDetection) return cacheDetection;
  const resultat = {};
  await Promise.all(Object.entries(EDITEURS).map(async ([id, editeur]) => {
    resultat[id] = null;
    if (editeur.toujoursDisponible) return;
    for (const candidat of await editeur.candidats()) {
      if (candidat && await fichierExiste(candidat)) {
        resultat[id] = candidat;
        return;
      }
    }
  }));
  cacheDetection = resultat;
  return resultat;
}

function oublierDetection() {
  cacheDetection = null;
}

// État de chaque éditeur, pour l'interface :
// { id, nom, chemin, source: 'reglage' | 'auto' | 'systeme' | null, disponible }
async function etat() {
  const detection = await detecterTous();
  const personnalises = reglages.obtenir().editeurs || {};
  return Promise.all(Object.entries(EDITEURS).map(async ([id, editeur]) => {
    if (editeur.toujoursDisponible) {
      return { id, nom: editeur.nom, chemin: null, source: 'systeme', disponible: true };
    }
    const personnalise = personnalises[id];
    if (personnalise) {
      return { id, nom: editeur.nom, chemin: personnalise, source: 'reglage', disponible: await fichierExiste(personnalise) };
    }
    const chemin = detection[id];
    return { id, nom: editeur.nom, chemin, source: chemin ? 'auto' : null, disponible: Boolean(chemin) };
  }));
}

// chemin = null pour revenir à la détection automatique.
async function definirChemin(id, chemin) {
  if (!EDITEURS[id] || EDITEURS[id].toujoursDisponible) throw new Error('Éditeur inconnu.');
  if (chemin && !(await fichierExiste(chemin))) throw new Error('Ce fichier n\'existe pas.');
  await reglages.modifier({ editeurs: { [id]: chemin ? path.normalize(chemin) : null } });
  return etat();
}

// --- Ouverture ------------------------------------------------------------------------------

// Éditeur utilisé par « Ouvrir » : celui de la fiche, sinon un choix selon le type.
function editeurParDefaut(fiche) {
  if (fiche.ouvrir_avec) return fiche.ouvrir_avec;
  return fiche.type === 'android' ? 'android-studio' : 'vscode';
}

// Ouvre un dossier (et éventuellement un fichier de ce dossier) avec l'éditeur demandé.
async function ouvrir(id, dossier, fichier = null) {
  const editeur = EDITEURS[id];
  if (!editeur) throw new Error(`Éditeur « ${id} » inconnu.`);

  if (editeur.toujoursDisponible) {
    const erreur = await shell.openPath(dossier);
    if (erreur) throw new Error(`L'Explorateur n'a pas pu ouvrir le dossier : ${erreur}`);
    return;
  }

  const infos = (await etat()).find((e) => e.id === id);
  if (!infos.disponible) {
    throw new Error(infos.source === 'reglage'
      ? `${editeur.nom} est introuvable à l'emplacement indiqué dans les réglages (${infos.chemin}). Corrige-le dans Réglages > Éditeurs.`
      : `${editeur.nom} n'a pas été trouvé sur ce PC. S'il est installé, indique son emplacement dans Réglages > Éditeurs.`);
  }
  const fichierExistant = fichier && (await fichierExiste(fichier)) ? fichier : null;
  try {
    await lancerDetache(infos.chemin, editeur.arguments(dossier, fichierExistant), { cwd: dossier });
  } catch (erreur) {
    throw new Error(`Impossible de lancer ${editeur.nom} : ${erreur.message}`);
  }
}

module.exports = { EDITEURS, etat, definirChemin, oublierDetection, editeurParDefaut, ouvrir };

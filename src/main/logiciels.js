// Barre de raccourcis vers des logiciels du PC (au-dessus des onglets).
//
// Liste stockée dans reglages.logiciels = [{ id, nom, chemin }], dans l'ordre d'affichage.
// Un programme hors de Toolkit garde son chemin absolu (même exception que les éditeurs :
// ces logiciels ne se déplacent pas avec Toolkit) ; un programme DANS le dossier Toolkit est
// noté relatif à la racine, pour rester valable si Toolkit est déplacé.
// L'interface ne manipule que les identifiants : les chemins restent ici.
'use strict';

const { app, dialog, shell, BrowserWindow } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const chemins = require('./chemins');
const reglages = require('./reglages');
const journal = require('./journal');
const { lancerDetache } = require('./processus');

const FILTRES = [
  { name: 'Programmes et raccourcis', extensions: ['exe', 'lnk', 'url', 'bat', 'cmd', 'msc'] },
  { name: 'Tous les fichiers', extensions: ['*'] },
];

function liste() {
  const valeur = reglages.obtenir().logiciels;
  return Array.isArray(valeur) ? valeur.filter((l) => l && l.id && l.chemin) : [];
}

function enregistrer(nouvelle) {
  return reglages.modifier({ logiciels: nouvelle });
}

function trouver(id) {
  const logiciel = liste().find((l) => l.id === id);
  if (!logiciel) throw new Error('Ce raccourci n\'existe plus.');
  return logiciel;
}

// Chemin réel (les chemins relatifs le sont à la racine de Toolkit).
function cheminAbsolu(logiciel) {
  return path.isAbsolute(logiciel.chemin) ? logiciel.chemin : path.resolve(chemins.racine, logiciel.chemin);
}

// Chemin à enregistrer : relatif s'il est dans le dossier Toolkit.
function cheminAStocker(absolu) {
  const normal = path.normalize(absolu);
  const relatif = path.relative(chemins.racine, normal);
  return relatif && !relatif.startsWith('..') && !path.isAbsolute(relatif) ? relatif.split(path.sep).join('/') : normal;
}

async function existe(chemin) {
  try {
    await fs.access(chemin);
    return true;
  } catch {
    return false;
  }
}

// Icône Windows du programme (celle de la cible pour un raccourci .lnk), en data: URL.
const cacheIcones = new Map();
async function iconeDe(chemin) {
  if (cacheIcones.has(chemin)) return cacheIcones.get(chemin);
  let source = chemin;
  if (/\.lnk$/i.test(chemin)) {
    try {
      const lien = shell.readShortcutLink(chemin);
      const candidat = lien.icon || lien.target;
      if (candidat && await existe(candidat)) source = candidat;
    } catch {
      // raccourci illisible : icône du .lnk lui-même
    }
  }
  let icone = null;
  try {
    icone = (await app.getFileIcon(source, { size: 'normal' })).toDataURL();
  } catch (erreur) {
    journal.info(`Icône introuvable pour ${source} : ${erreur.message}`);
  }
  cacheIcones.set(chemin, icone);
  return icone;
}

// Pour l'interface : [{ id, nom, chemin (affichage), icone, existe }]
async function lister() {
  return Promise.all(liste().map(async (l) => {
    const absolu = cheminAbsolu(l);
    const present = await existe(absolu);
    return { id: l.id, nom: l.nom, chemin: absolu, icone: present ? await iconeDe(absolu) : null, existe: present };
  }));
}

async function choisirFichier(titre) {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || undefined, {
    title: titre,
    filters: FILTRES,
    properties: ['openFile'],
  });
  return canceled || filePaths.length === 0 ? null : filePaths[0];
}

// Nom proposé : celui du fichier sans extension (« Google Chrome.lnk » -> « Google Chrome »).
function nomPropose(chemin) {
  return path.basename(chemin, path.extname(chemin));
}

// Ajoute un logiciel choisi par l'utilisateur. Renvoie { id, nom } ou null si annulé.
async function ajouter() {
  const chemin = await choisirFichier('Choisis le logiciel à ajouter (programme .exe ou raccourci)');
  if (!chemin) return null;
  const nouveau = { id: crypto.randomUUID().slice(0, 8), nom: nomPropose(chemin), chemin: cheminAStocker(chemin) };
  await enregistrer([...liste(), nouveau]);
  return { id: nouveau.id, nom: nouveau.nom };
}

// Choisit un autre fichier pour un raccourci existant (programme déplacé ou réinstallé).
async function changer(id) {
  const ancien = trouver(id);
  const chemin = await choisirFichier(`Où se trouve « ${ancien.nom} » ?`);
  if (!chemin) return false;
  await enregistrer(liste().map((l) => (l.id === id ? { ...l, chemin: cheminAStocker(chemin) } : l)));
  return true;
}

async function renommer(id, nom) {
  trouver(id);
  const propre = String(nom || '').trim();
  if (!propre) throw new Error('Le nom ne peut pas être vide.');
  await enregistrer(liste().map((l) => (l.id === id ? { ...l, nom: propre.slice(0, 60) } : l)));
}

async function supprimer(id) {
  await enregistrer(liste().filter((l) => l.id !== id));
}

// Place le raccourci à la position « index » (0 = tout à gauche).
async function deplacer(id, index) {
  const actuelle = liste();
  const logiciel = actuelle.find((l) => l.id === id);
  if (!logiciel) throw new Error('Ce raccourci n\'existe plus.');
  const reste = actuelle.filter((l) => l.id !== id);
  const position = Math.max(0, Math.min(reste.length, Number(index) || 0));
  reste.splice(position, 0, logiciel);
  await enregistrer(reste);
}

// Lance le logiciel : un .exe directement (environnement nettoyé, dossier = celui du
// programme), le reste (.lnk, .url, .bat…) comme un double-clic dans l'Explorateur.
async function lancer(id) {
  const logiciel = trouver(id);
  const chemin = cheminAbsolu(logiciel);
  if (!(await existe(chemin))) {
    throw new Error(`« ${logiciel.nom} » est introuvable (${chemin}). Il a peut-être été déplacé ou désinstallé : clic droit sur le raccourci > « Choisir un autre emplacement… ».`);
  }
  if (/\.exe$/i.test(chemin)) {
    try {
      await lancerDetache(chemin, [], { cwd: path.dirname(chemin) });
    } catch (erreur) {
      throw new Error(`Impossible de lancer « ${logiciel.nom} » : ${erreur.message}`);
    }
    return;
  }
  const erreur = await shell.openPath(chemin);
  if (erreur) throw new Error(`Impossible de lancer « ${logiciel.nom} » : ${erreur}`);
}

async function afficher(id) {
  const chemin = cheminAbsolu(trouver(id));
  if (!(await existe(chemin))) throw new Error('Ce fichier n\'existe plus à cet emplacement.');
  shell.showItemInFolder(chemin);
}

module.exports = { lister, ajouter, changer, renommer, supprimer, deplacer, lancer, afficher };

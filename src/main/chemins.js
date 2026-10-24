// Calcule tous les chemins de Toolkit à partir de l'emplacement du code.
// C'est le SEUL module qui connaît la racine : rien n'est stocké en absolu, tout est
// recalculé à chaque lancement, ce qui permet de déplacer le dossier Toolkit.
// N'utilise pas Electron, pour pouvoir servir aussi aux scripts de app/scripts/.
'use strict';

const path = require('node:path');

// src/main/chemins.js -> remonter de 3 niveaux : main, src, app
const racine = path.resolve(__dirname, '..', '..', '..');
const app = path.join(racine, 'app');
const donnees = path.join(racine, 'donnees');

// Dossier des projets : relatif à la racine, modifiable dans les réglages.
let dossierProjetsRelatif = 'projets';

function definirDossierProjets(relatif) {
  if (typeof relatif === 'string' && relatif.trim() !== '' && !path.isAbsolute(relatif)) {
    dossierProjetsRelatif = relatif.trim();
  }
}

function projets() {
  return path.resolve(racine, dossierProjetsRelatif);
}

// Chemin lisible relatif à la racine, avec des « / » (pour l'affichage et les fichiers).
function versRelatif(absolu) {
  return path.relative(racine, absolu).split(path.sep).join('/');
}

module.exports = {
  racine,
  app,
  donnees,
  donneesElectron: path.join(donnees, 'electron'),
  reglages: path.join(donnees, 'reglages.json'),
  journal: path.join(donnees, 'journal.log'),
  templatesApp: path.join(app, 'templates'),
  templatesPerso: path.join(racine, 'templates'),
  lanceur: path.join(racine, 'Lancer Toolkit.vbs'),
  icone: path.join(app, 'assets', 'icone.ico'),
  interface: path.join(app, 'src', 'renderer', 'index.html'),
  preload: path.join(app, 'src', 'preload', 'preload.js'),
  projets,
  definirDossierProjets,
  versRelatif,
};

// Canaux IPC « application:* » et « reglages:* » : infos sur Toolkit, réglages, redémarrage.
'use strict';

const { app } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { gerer } = require('./gerer');
const chemins = require('../chemins');
const reglages = require('../reglages');

// Réglages modifiables depuis l'interface (les autres sont gérés par le processus principal).
const CLES_MODIFIABLES = ['interface'];

function enregistrer({ quitter }) {
  gerer('application:infos', () => {
    const paquet = require(path.join(chemins.app, 'package.json'));
    return {
      nom: paquet.productName,
      version: paquet.version,
      description: paquet.description,
      dossier: chemins.versRelatif(chemins.app),
      dossierProjets: chemins.versRelatif(chemins.projets()),
      icone: pathToFileURL(path.join(chemins.app, 'assets', 'icone.png')).href,
      electron: process.versions.electron,
    };
  });

  gerer('application:redemarrer', () => {
    app.relaunch();
    quitter();
  });

  gerer('reglages:lire', () => reglages.obtenir());

  gerer('reglages:modifier', (changements) => {
    const filtres = Object.fromEntries(
      Object.entries(changements || {}).filter(([cle]) => CLES_MODIFIABLES.includes(cle)),
    );
    return reglages.modifier(filtres);
  });
}

module.exports = { enregistrer };

// Canaux IPC « projets:* » : lister et modifier les projets, changer leur icône.
'use strict';

const { dialog, BrowserWindow } = require('electron');
const path = require('node:path');
const { gerer } = require('./gerer');
const projets = require('../projets');
const chemins = require('../chemins');

function enregistrer() {
  gerer('projets:lister', () => projets.listerProjets());
  gerer('projets:modifier', (id, changements) => projets.modifierFiche(id, changements || {}));
  gerer('projets:renommer-categorie', (ancienne, nouvelle) => projets.renommerCategorie(ancienne, nouvelle));
  gerer('projets:renommer-tag', (ancien, nouveau) => projets.renommerTag(ancien, nouveau));

  // Choix d'une image comme icône (la boîte s'ouvre dans le dossier du projet, pour pouvoir
  // reprendre une image qui s'y trouve déjà). Renvoie le projet mis à jour, ou null si annulé.
  gerer('projets:choisir-icone', async (contenu, id) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(contenu) || undefined, {
      title: 'Choisis l\'image de l\'icône du projet',
      defaultPath: path.join(chemins.projets(), id),
      filters: [{ name: 'Images', extensions: projets.EXTENSIONS_IMAGES }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;
    return projets.changerIcone(id, filePaths[0]);
  }, { avecEmetteur: true });
}

module.exports = { enregistrer };

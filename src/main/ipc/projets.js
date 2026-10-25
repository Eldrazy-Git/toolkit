// Canaux IPC « projets:* » : lister et modifier les projets, changer leur icône.
'use strict';

const { dialog, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const { gerer } = require('./gerer');
const projets = require('../projets');
const chemins = require('../chemins');

function enregistrer() {
  gerer('projets:lister', () => projets.listerProjets());
  gerer('projets:modifier', (id, changements) => projets.modifierFiche(id, changements || {}));
  gerer('projets:renommer-categorie', (ancienne, nouvelle) => projets.renommerCategorie(ancienne, nouvelle));
  gerer('projets:renommer-tag', (ancien, nouveau) => projets.renommerTag(ancien, nouveau));

  // Suppression d'un projet : son dossier part à la Corbeille de Windows (récupérable),
  // jamais d'effacement définitif. L'interface a demandé une confirmation explicite.
  gerer('projets:supprimer', async (id) => {
    const nom = String(id || '');
    if (!nom || nom !== path.basename(nom) || nom === '.' || nom === '..') throw new Error('Projet invalide.');
    if (!(await projets.chargerProjet(nom))) throw new Error('Ce projet n\'existe plus.');
    const dossier = path.join(chemins.projets(), nom);
    try {
      await shell.trashItem(dossier);
    } catch {
      throw new Error('Windows refuse de déplacer le dossier : un programme l\'utilise encore (VS Code, Android Studio, l\'Explorateur, un terminal…). Ferme-le puis réessaie.');
    }
  });

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

// Canaux IPC « editeurs:* » : état des éditeurs, réglages, « Ouvrir avec… ».
'use strict';

const { dialog, BrowserWindow } = require('electron');
const path = require('node:path');
const { gerer } = require('./gerer');
const editeurs = require('../editeurs');
const projets = require('../projets');
const chemins = require('../chemins');

function enregistrer() {
  gerer('editeurs:etat', () => editeurs.etat());

  gerer('editeurs:redetecter', () => {
    editeurs.oublierDetection();
    return editeurs.etat();
  });

  gerer('editeurs:definir', (id, chemin) => editeurs.definirChemin(id, chemin));

  // Laisse choisir l'exécutable de l'éditeur ; renvoie le nouvel état, ou null si annulé.
  gerer('editeurs:parcourir', async (id) => {
    const editeur = editeurs.EDITEURS[id];
    if (!editeur) throw new Error('Éditeur inconnu.');
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || undefined, {
      title: `Où se trouve ${editeur.nom} ?`,
      filters: [{ name: 'Programmes', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;
    return editeurs.definirChemin(id, filePaths[0]);
  });

  // editeurId absent = éditeur par défaut du projet. Renvoie le nom de l'éditeur utilisé.
  gerer('editeurs:ouvrir-projet', async (projetId, editeurId) => {
    const projet = await projets.chargerProjet(projetId);
    if (!projet) throw new Error('Ce projet n\'existe plus.');
    const dossier = path.join(chemins.projets(), projetId);
    const id = editeurId || editeurs.editeurParDefaut(projet.fiche);
    const entree = projet.fiche.point_entree ? path.resolve(dossier, projet.fiche.point_entree) : null;
    const fichier = entree && entree.startsWith(dossier + path.sep) ? entree : null;
    await editeurs.ouvrir(id, dossier, fichier);
    return editeurs.EDITEURS[id].nom;
  });

  gerer('editeurs:ouvrir-toolkit', async (editeurId) => {
    await editeurs.ouvrir(editeurId, chemins.app, path.join(chemins.app, 'CLAUDE.md'));
    return editeurs.EDITEURS[editeurId].nom;
  });
}

module.exports = { enregistrer };

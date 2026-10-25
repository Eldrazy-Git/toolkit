// Canaux IPC « executions:* » (actions des projets), choix de fichiers/dossiers,
// et « programmes:etat » (Python, Node… pour les Réglages).
'use strict';

const { dialog, shell, BrowserWindow } = require('electron');
const { gerer } = require('./gerer');
const executions = require('../executions');

function enregistrer() {
  gerer('executions:lancer', (contenu, id, projetId, indexAction, valeurs) =>
    executions.lancer(contenu, id, projetId, indexAction, valeurs), { avecEmetteur: true });
  gerer('executions:arreter', (id) => executions.arreter(id));
  gerer('executions:oublier', (id) => executions.oublier(id));
  // Ouvre le dossier de sortie dans l'Explorateur, en sélectionnant le fichier produit s'il y en a un.
  gerer('executions:ouvrir-dossier', async (id) => {
    const sortie = executions.dossierApres(id);
    if (!sortie) throw new Error('Aucun dossier à ouvrir.');
    if (sortie.fichier) {
      shell.showItemInFolder(sortie.fichier);
      return;
    }
    const erreur = await shell.openPath(sortie.dossier);
    if (erreur) throw new Error(`Impossible d'ouvrir le dossier : ${erreur}`);
  });

  // options : { type: 'fichier' | 'fichiers' | 'dossier', titre, extensions? }
  // Renvoie un chemin, une liste de chemins (fichiers), ou null si annulé.
  gerer('dialogues:choisir-chemin', async (contenu, { type, titre, extensions = [] }) => {
    const proprietes = type === 'dossier' ? ['openDirectory', 'createDirectory']
      : type === 'fichiers' ? ['openFile', 'multiSelections'] : ['openFile'];
    const filtres = extensions.length > 0
      ? [{ name: extensions.map((e) => e.toUpperCase()).join(', '), extensions }, { name: 'Tous les fichiers', extensions: ['*'] }]
      : [];
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(contenu) || undefined, {
      title: titre,
      properties: proprietes,
      filters: filtres,
    });
    if (canceled || filePaths.length === 0) return null;
    return type === 'fichiers' ? filePaths : filePaths[0];
  }, { avecEmetteur: true });

  gerer('programmes:etat', () => executions.detecterProgrammes());
}

module.exports = { enregistrer };

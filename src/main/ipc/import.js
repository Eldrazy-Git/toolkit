// Canaux IPC « import:* » (assistant d'import) et « github:etat ».
// La progression est envoyée à l'interface par l'événement « import:progression ».
'use strict';

const { dialog, BrowserWindow } = require('electron');
const { gerer } = require('./gerer');
const importation = require('../import');
const github = require('../github');

function progression(contenu) {
  return (texte, faits, total) => {
    if (!contenu.isDestroyed()) contenu.send('import:progression', { texte, faits, total });
  };
}

function enregistrer() {
  gerer('import:choisir-dossier', async (contenu) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(contenu) || undefined, {
      title: 'Choisis le dossier du projet à importer',
      properties: ['openDirectory'],
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  }, { avecEmetteur: true });

  gerer('import:analyser', (contenu, chemin) => importation.analyser(chemin, progression(contenu)), { avecEmetteur: true });
  gerer('import:cloner', (contenu, url) => importation.cloner(url, progression(contenu)), { avecEmetteur: true });
  gerer('import:executer', (contenu, idAnalyse, choix) => importation.executer(idAnalyse, choix, progression(contenu)), { avecEmetteur: true });
  gerer('import:abandonner', (idAnalyse) => importation.abandonner(idAnalyse));
  gerer('github:etat', () => github.etat());
}

module.exports = { enregistrer };

// Enregistre un canal IPC dont les erreurs arrivent proprement dans l'interface.
// Le gestionnaire renvoie { ok: true, resultat } ou { ok: false, erreur: 'message' } ;
// le preload transforme ce dernier cas en exception avec le message en français.
'use strict';

const { ipcMain } = require('electron');
const journal = require('../journal');

function gerer(canal, fonction) {
  ipcMain.handle(canal, async (_evenement, ...args) => {
    try {
      return { ok: true, resultat: await fonction(...args) };
    } catch (erreur) {
      journal.erreur(`[${canal}]`, erreur);
      return { ok: false, erreur: erreur.message || 'Erreur inconnue.' };
    }
  });
}

module.exports = { gerer };

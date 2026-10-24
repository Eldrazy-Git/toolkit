// Enregistre un canal IPC dont les erreurs arrivent proprement dans l'interface.
// Le gestionnaire renvoie { ok: true, resultat } ou { ok: false, erreur: 'message' } ;
// le preload transforme ce dernier cas en exception avec le message en français.
// Avec { avecEmetteur: true }, la fonction reçoit en premier le webContents qui appelle.
'use strict';

const { ipcMain } = require('electron');
const journal = require('../journal');

function gerer(canal, fonction, { avecEmetteur = false } = {}) {
  ipcMain.handle(canal, async (evenement, ...args) => {
    try {
      const resultat = avecEmetteur ? await fonction(evenement.sender, ...args) : await fonction(...args);
      return { ok: true, resultat };
    } catch (erreur) {
      journal.erreur(`[${canal}]`, erreur);
      return { ok: false, erreur: erreur.message || 'Erreur inconnue.' };
    }
  });
}

module.exports = { gerer };

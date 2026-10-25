// Enregistre un canal IPC dont les erreurs arrivent proprement dans l'interface.
// Le gestionnaire renvoie { ok: true, resultat } ou { ok: false, erreur: 'message' } ;
// le preload transforme ce dernier cas en exception avec le message en français.
// Avec { avecEmetteur: true }, la fonction reçoit en premier le webContents qui appelle.
'use strict';

const { ipcMain } = require('electron');
const journal = require('../journal');

// Les erreurs « prévues » (new Error('message en français')) sont notées en une ligne ;
// les bugs (TypeError, ReferenceError…) avec leur pile, pour pouvoir les corriger.
function noter(canal, erreur) {
  if (erreur?.constructor === Error) journal.info(`[${canal}] ${erreur.message}`);
  else journal.erreur(`[${canal}]`, erreur);
}

// Message affiché à l'utilisateur : jamais de jargon technique pour un bug imprévu.
function message(erreur) {
  if (erreur?.constructor === Error && erreur.message) return erreur.message;
  return `Une erreur inattendue s'est produite (${erreur?.message || 'inconnue'}). Les détails sont dans donnees/journal.log.`;
}

function gerer(canal, fonction, { avecEmetteur = false } = {}) {
  ipcMain.handle(canal, async (evenement, ...args) => {
    try {
      const resultat = avecEmetteur ? await fonction(evenement.sender, ...args) : await fonction(...args);
      return { ok: true, resultat };
    } catch (erreur) {
      noter(canal, erreur);
      return { ok: false, erreur: message(erreur) };
    }
  });
}

module.exports = { gerer };

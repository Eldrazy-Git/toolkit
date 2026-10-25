// Démarrage avec Windows : Toolkit s'ouvre réduit dans la zone de notification (« --cache »).
//
// Windows a besoin du chemin complet de l'exécutable : il est écrit dans le registre (clé
// « Run » de l'utilisateur, valeur « Toolkit »), jamais dans les fichiers de Toolkit.
// Comme Toolkit peut être déplacé, l'entrée est réécrite à chaque lancement avec les
// chemins actuels (mettreAJour).
'use strict';

const { app } = require('electron');
const chemins = require('./chemins');
const reglages = require('./reglages');
const journal = require('./journal');

function options() {
  return {
    name: 'Toolkit',
    path: process.execPath, // electron.exe de app/node_modules
    args: [chemins.app, '--cache'],
  };
}

function definir(actif) {
  app.setLoginItemSettings({ ...options(), openAtLogin: actif });
}

function estActif() {
  return app.getLoginItemSettings(options()).openAtLogin;
}

// Au lancement : applique le réglage avec les chemins actuels.
function mettreAJour() {
  try {
    definir(reglages.obtenir().demarrageWindows === true);
  } catch (erreur) {
    journal.erreur('Démarrage avec Windows :', erreur);
  }
}

async function changer(actif) {
  await reglages.modifier({ demarrageWindows: Boolean(actif) });
  definir(Boolean(actif));
  return estActif();
}

module.exports = { mettreAJour, changer, estActif };

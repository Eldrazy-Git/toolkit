// Outils communs pour lancer des programmes externes depuis Toolkit.
'use strict';

const { spawn, execFile } = require('node:child_process');

// Environnement transmis aux programmes lancés par Toolkit.
// ELECTRON_RUN_AS_NODE est retiré : s'il est présent (ex. Toolkit lancé depuis un
// terminal de VS Code), les programmes basés sur Electron, comme VS Code, ne démarrent pas.
function environnementPropre(supplement = {}) {
  const env = { ...process.env, ...supplement };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

// Lance un programme indépendant de Toolkit (il continue si Toolkit est fermé).
// La promesse est rejetée avec un message clair si le programme ne peut pas démarrer.
function lancerDetache(executable, args = [], options = {}) {
  return new Promise((resoudre, rejeter) => {
    let enfant;
    try {
      enfant = spawn(executable, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env: environnementPropre(),
        ...options,
      });
    } catch (erreur) {
      rejeter(erreur);
      return;
    }
    enfant.once('error', rejeter);
    enfant.once('spawn', () => {
      enfant.unref();
      resoudre();
    });
  });
}

// Exécute une commande courte et renvoie sa sortie (ou null en cas d'échec).
function sortieDe(executable, args, delai = 5000) {
  return new Promise((resoudre) => {
    execFile(executable, args, { timeout: delai, windowsHide: true, env: environnementPropre() }, (erreur, sortie) => {
      resoudre(erreur ? null : sortie);
    });
  });
}

module.exports = { environnementPropre, lancerDetache, sortieDe };

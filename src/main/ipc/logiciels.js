// Canaux IPC « logiciels:* » : barre de raccourcis vers des logiciels du PC.
'use strict';

const { gerer } = require('./gerer');
const logiciels = require('../logiciels');

function enregistrer() {
  gerer('logiciels:lister', () => logiciels.lister());
  gerer('logiciels:ajouter', () => logiciels.ajouter());
  gerer('logiciels:changer', (id) => logiciels.changer(id));
  gerer('logiciels:renommer', (id, nom) => logiciels.renommer(id, nom));
  gerer('logiciels:supprimer', (id) => logiciels.supprimer(id));
  gerer('logiciels:deplacer', (id, index) => logiciels.deplacer(id, index));
  gerer('logiciels:lancer', (id) => logiciels.lancer(id));
  gerer('logiciels:afficher', (id) => logiciels.afficher(id));
}

module.exports = { enregistrer };

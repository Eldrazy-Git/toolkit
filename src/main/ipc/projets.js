// Canaux IPC « projets:* » : lister et modifier les projets.
'use strict';

const { gerer } = require('./gerer');
const projets = require('../projets');

function enregistrer() {
  gerer('projets:lister', () => projets.listerProjets());
  gerer('projets:modifier', (id, changements) => projets.modifierFiche(id, changements || {}));
  gerer('projets:renommer-categorie', (ancienne, nouvelle) => projets.renommerCategorie(ancienne, nouvelle));
  gerer('projets:renommer-tag', (ancien, nouveau) => projets.renommerTag(ancien, nouveau));
}

module.exports = { enregistrer };

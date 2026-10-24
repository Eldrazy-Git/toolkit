// Canaux IPC « outils:* » : préparer l'ouverture d'un outil HTML, exporter/importer ses données.
'use strict';

const { gerer } = require('./gerer');
const outilsHtml = require('../outils-html');
const outilsDonnees = require('../outils-donnees');

function enregistrer() {
  gerer('outils:preparer', (projetId, outilLie) => outilsHtml.preparer(projetId, outilLie));
  gerer('outils:exporter', (idContenu, nom) => outilsDonnees.exporter(idContenu, nom));
  gerer('outils:importer', (idContenu, nom) => outilsDonnees.importer(idContenu, nom));
}

module.exports = { enregistrer };

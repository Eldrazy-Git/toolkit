// Canaux IPC « minecraft:* » : changement de version de Minecraft d'un mod.
'use strict';

const { gerer } = require('./gerer');
const minecraft = require('../minecraft');

function enregistrer() {
  gerer('minecraft:preparer', (id) => minecraft.preparerChangement(id));
  gerer('minecraft:dependances', (id, version) => minecraft.dependances(id, version));
}

module.exports = { enregistrer };

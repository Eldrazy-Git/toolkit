// Canaux IPC « kits:* » : onglet « Kits » (liste, création, récupération depuis GitHub).
'use strict';

const { shell } = require('electron');
const { gerer } = require('./gerer');
const kits = require('../kits');

function enregistrer() {
  gerer('kits:lister', () => kits.instantane());
  gerer('kits:preparer', async () => {
    await kits.preparerPourClaude();
    return kits.instantane();
  });
  gerer('kits:creer', (valeurs) => kits.creerKit(valeurs));
  gerer('kits:creer-skill', (valeurs) => kits.creerSkill(valeurs));
  gerer('kits:analyser-projet', (id) => kits.analyserProjet(id));
  gerer('kits:creer-depuis-projet', (valeurs) => kits.creerDepuisProjet(valeurs));
  gerer('kits:accepter-proposition', (id) => kits.accepterProposition(id));
  gerer('kits:refuser-proposition', (id) => kits.refuserProposition(id, (chemin) => shell.trashItem(chemin)));
  gerer('kits:recuperer-depot', (url) => {
    const adresse = String(url || '').trim();
    // Seulement une adresse GitHub ordinaire : jamais d'option ni de transport exotique pour git.
    if (!/^(https:\/\/|git@)[^\s]+$/i.test(adresse)) throw new Error('Indique l\'adresse du dépôt, par exemple https://github.com/moi/toolkit-kits');
    return kits.recupererDepot(adresse, (chemin) => shell.trashItem(chemin));
  });
}

module.exports = { enregistrer };

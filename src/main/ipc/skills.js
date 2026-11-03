// Canaux IPC « skills:* » : onglet « Skills » (liste, création, propositions, récupération depuis GitHub).
'use strict';

const { shell } = require('electron');
const { gerer } = require('./gerer');
const skills = require('../skills');

function enregistrer() {
  gerer('skills:lister', () => skills.instantane());
  gerer('skills:preparer', async () => {
    await skills.preparerPourClaude();
    return skills.instantane();
  });
  gerer('skills:creer', (valeurs) => skills.creerSkill(valeurs));
  gerer('skills:accepter-proposition', (id) => skills.accepterProposition(id));
  gerer('skills:refuser-proposition', (id) => skills.refuserProposition(id, (chemin) => shell.trashItem(chemin)));
  gerer('skills:recuperer-depot', (url) => {
    const adresse = String(url || '').trim();
    // Seulement une adresse GitHub ordinaire : jamais d'option ni de transport exotique pour git.
    if (!/^(https:\/\/|git@)[^\s]+$/i.test(adresse)) throw new Error('Indique l\'adresse du dépôt, par exemple https://github.com/moi/toolkit-skills');
    return skills.recupererDepot(adresse, (chemin) => shell.trashItem(chemin));
  });
}

module.exports = { enregistrer };

// Canaux IPC « recherche:* » et « notes:* » : recherche globale (Ctrl+K), notes Markdown.
'use strict';

const { shell } = require('electron');
const { gerer } = require('./gerer');
const recherche = require('../recherche');
const notes = require('../notes');

function enregistrer() {
  gerer('recherche:chercher', (texte) => recherche.chercher(texte));
  // Prépare l'index à l'ouverture de la recherche (pour que la première frappe soit rapide).
  gerer('recherche:preparer', () => recherche.mettreAJour());

  gerer('notes:lire', (chemin) => notes.lire(chemin));
  gerer('notes:enregistrer', async (chemin, contenu, mtimeAttendu, forcer) => {
    try {
      return await notes.enregistrer(chemin, contenu, mtimeAttendu, forcer);
    } catch (erreur) {
      if (erreur.message === 'MODIFIEE_AILLEURS') return { modifieeAilleurs: true };
      throw erreur;
    }
  });
  gerer('notes:creer', (projetId, nom) => notes.creer(projetId, nom));

  // Notes d'un projet (projetId null = Toolkit) et notes qui citent ce projet.
  gerer('notes:du-projet', async (projetId) => {
    await recherche.mettreAJour();
    return {
      notes: recherche.notesDe(projetId),
      retroliens: projetId ? recherche.retroliens(`projet:${projetId}`) : [],
    };
  });

  gerer('liens:ouvrir-externe', async (url) => {
    if (!/^(https?:|mailto:)/i.test(String(url))) throw new Error('Adresse non autorisée.');
    await shell.openExternal(url);
  });
}

module.exports = { enregistrer };

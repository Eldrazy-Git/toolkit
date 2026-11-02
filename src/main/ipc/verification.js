// Canaux IPC « verification:* » : vérification des projets par rapport aux kits et aux skills.
'use strict';

const { gerer } = require('./gerer');
const verification = require('../verification');

function enregistrer() {
  gerer('verification:lire', () => verification.lire());
  gerer('verification:fiches', () => verification.fichesAMettreAJour());
  gerer('verification:commencer', () => verification.oublierBibliotheque());
  gerer('verification:verifier-projet', (id) => verification.verifierProjet(id));
  gerer('verification:ignorer', (id, cle) => verification.ignorer(id, cle));
  gerer('verification:marquer-lance', (id, cle) => verification.marquerLance(id, cle));
  gerer('verification:ajouter-exception', (id, cle, raison) => verification.ajouterException(id, cle, raison));
  gerer('verification:retirer-exception', (id, cle) => verification.retirerException(id, cle));
}

module.exports = { enregistrer };

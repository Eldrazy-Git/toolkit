// Compte les tâches en cours (scripts, terminaux) : tant qu'il y en a, fermer la
// fenêtre la cache seulement au lieu de la détruire, pour ne rien interrompre.
'use strict';

let compteur = 0;

module.exports = {
  debut() {
    compteur += 1;
  },
  fin() {
    compteur = Math.max(0, compteur - 1);
  },
  estOccupe() {
    return compteur > 0;
  },
};

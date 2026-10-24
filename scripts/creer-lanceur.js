// Crée « Lancer Toolkit.vbs » à la racine de Toolkit (appelé automatiquement après npm install).
'use strict';

const { mettreAJour } = require('../src/main/lanceur');

mettreAJour()
  .then((cree) => console.log(cree ? 'Lanceur « Lancer Toolkit.vbs » créé.' : 'Lanceur déjà à jour.'))
  .catch((erreur) => {
    console.error('Impossible de créer « Lancer Toolkit.vbs » :', erreur.message);
    process.exitCode = 1;
  });

// Une « cible » désigne un dossier sans que l'interface transmette jamais de chemin :
// { type: 'projet', id } | { type: 'toolkit' } (dossier app/) | { type: 'racine' } (Toolkit/)
// | { type: 'skills' } (bibliothèque de skills, Toolkit/skills/).
'use strict';

const path = require('node:path');
const chemins = require('./chemins');
const projets = require('./projets');
const { existe } = require('./fichiers');

async function dossierCible(cible) {
  let dossier;
  if (cible?.type === 'projet') {
    if (!(await projets.chargerProjet(cible.id))) throw new Error('Ce projet n\'existe plus.');
    dossier = path.join(chemins.projets(), cible.id);
  } else if (cible?.type === 'toolkit') {
    dossier = chemins.app;
  } else if (cible?.type === 'racine') {
    dossier = chemins.racine;
  } else if (cible?.type === 'skills') {
    dossier = chemins.skills;
    if (!(await existe(dossier))) throw new Error('La bibliothèque de skills n\'existe pas encore : crée-la depuis l\'onglet « Skills ».');
  } else {
    throw new Error('Dossier cible inconnu.');
  }
  if (!(await existe(dossier))) throw new Error('Ce dossier n\'existe plus.');
  return dossier;
}

module.exports = { dossierCible };

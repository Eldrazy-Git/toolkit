// Réglages de Toolkit, stockés dans donnees/reglages.json.
// Ne jamais y mettre de chemin absolu vers un fichier de Toolkit.
'use strict';

const chemins = require('./chemins');
const { lireJson, ecrireJson } = require('./fichiers');
const journal = require('./journal');

const DEFAUTS = {
  dossierProjets: 'projets',
  interface: {
    vue: 'grille', // 'grille' ou 'liste'
  },
  fenetre: null, // { x, y, largeur, hauteur, maximisee }
  astuceZoneNotificationVue: false,
};

let reglages = structuredClone(DEFAUTS);

// Fusion récursive simple : les objets sont fusionnés, le reste est remplacé.
function fusionner(base, ajout) {
  const resultat = { ...base };
  for (const [cle, valeur] of Object.entries(ajout || {})) {
    const estObjet = valeur && typeof valeur === 'object' && !Array.isArray(valeur);
    resultat[cle] = estObjet && base[cle] && typeof base[cle] === 'object'
      ? fusionner(base[cle], valeur)
      : valeur;
  }
  return resultat;
}

async function charger() {
  try {
    reglages = fusionner(structuredClone(DEFAUTS), await lireJson(chemins.reglages));
  } catch (erreur) {
    if (erreur.code !== 'ENOENT') {
      journal.erreur('Réglages illisibles, valeurs par défaut utilisées :', erreur);
    }
    reglages = structuredClone(DEFAUTS);
  }
  return reglages;
}

function obtenir() {
  return reglages;
}

async function modifier(changements) {
  reglages = fusionner(reglages, changements);
  await ecrireJson(chemins.reglages, reglages);
  return reglages;
}

module.exports = { charger, obtenir, modifier };

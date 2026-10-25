// État partagé de l'interface. Toute modification passe par modifier(), qui
// prévient les abonnés (ils redessinent leur partie de l'écran).

// Identifiant spécial de l'entrée « Toolkit » (l'application elle-même).
export const ID_TOOLKIT = '__toolkit__';

const etat = {
  chargement: true,
  projets: [],
  infosApp: null,
  filtre: { type: 'tous' }, // tous | favoris | categorie (valeur) | tag (valeur)
  texteFiltre: '',
  vue: 'grille', // grille | liste
  selection: null, // id d'un projet, ID_TOOLKIT ou null
  onglets: [], // outils HTML ouverts : { id, nom, projetId, outilLie, url, partition, chemin }
  ongletActif: 'bibliotheque', // 'bibliotheque', 'reglages' ou l'id d'un outil ouvert
  reglagesOuverts: false, // onglet « Réglages » affiché
  demarrageWindows: null, // Toolkit démarre-t-il avec Windows ? (lu à l'ouverture des Réglages)
  importOuvert: false, // onglet « Importer un projet » affiché
  gitOuvert: false, // onglet « Git et GitHub » affiché
  git: {}, // état Git par cible (clé : 'toolkit:' ou 'projet:<id>'), voir actions-git.js
  gitOccupe: {}, // clé -> texte de l'opération en cours (ex. « Envoi… »)
  github: null, // { installe, connecte, compte }
  editeurs: [], // [{ id, nom, chemin, source, disponible }]
  programmes: null, // [{ nom, libelle, chemin, version, installation }] (chargé à l'ouverture des Réglages)
};

const abonnes = new Set();

export function obtenir() {
  return etat;
}

export function modifier(changements) {
  Object.assign(etat, changements);
  abonnes.forEach((rappel) => rappel(etat));
}

export function abonner(rappel) {
  abonnes.add(rappel);
}

export function projetSelectionne() {
  return etat.projets.find((p) => p.id === etat.selection) || null;
}

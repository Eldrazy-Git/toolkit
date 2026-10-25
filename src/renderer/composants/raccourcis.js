// Raccourcis clavier de Toolkit : liste, touches par défaut, touches choisies par
// l'utilisateur (Réglages > Raccourcis, rangées dans preferences.raccourcis).
// Les raccourcis internes de l'éditeur (Monaco : Ctrl+F, Ctrl+H, F12…) ne sont pas ici.
import * as preferences from './preferences.js';

// zone : 'partout' | 'editeur' (onglet « Code » seulement)
export const COMMANDES = [
  { id: 'palette', libelle: 'Palette de commandes', defaut: 'Ctrl+Shift+P', zone: 'partout' },
  { id: 'recherche', libelle: 'Rechercher dans les projets et les notes', defaut: 'Ctrl+K', zone: 'partout' },
  { id: 'filtrer', libelle: 'Filtrer les projets de la bibliothèque', defaut: 'Ctrl+F', zone: 'partout' },
  { id: 'fermerOnglet', libelle: 'Fermer l\'onglet (dans l\'éditeur : le fichier)', defaut: 'Ctrl+W', zone: 'partout' },
  { id: 'ongletSuivant', libelle: 'Onglet suivant', defaut: 'Ctrl+Tab', zone: 'partout' },
  { id: 'ongletPrecedent', libelle: 'Onglet précédent', defaut: 'Ctrl+Shift+Tab', zone: 'partout' },
  { id: 'bibliotheque', libelle: 'Aller à la bibliothèque', defaut: 'Ctrl+Shift+B', zone: 'partout' },
  { id: 'reglages', libelle: 'Ouvrir les réglages', defaut: 'Ctrl+,', zone: 'partout' },
  { id: 'git', libelle: 'Ouvrir Git et GitHub', defaut: 'Ctrl+Shift+G', zone: 'partout' },
  { id: 'nouvelOutil', libelle: 'Nouvel outil (avec Claude)', defaut: 'Ctrl+Shift+N', zone: 'partout' },
  { id: 'terminal', libelle: 'Terminal PowerShell', defaut: '', zone: 'partout' },
  { id: 'zoomPlus', libelle: 'Agrandir l\'interface', defaut: 'Ctrl+=', zone: 'partout' },
  { id: 'zoomMoins', libelle: 'Réduire l\'interface', defaut: 'Ctrl+-', zone: 'partout' },
  { id: 'zoomNormal', libelle: 'Taille normale de l\'interface', defaut: 'Ctrl+0', zone: 'partout' },
  { id: 'enregistrer', libelle: 'Enregistrer le fichier', defaut: 'Ctrl+S', zone: 'editeur' },
  { id: 'allerFichier', libelle: 'Aller à un fichier', defaut: 'Ctrl+P', zone: 'editeur' },
  { id: 'rechercherFichiers', libelle: 'Rechercher dans tous les fichiers', defaut: 'Ctrl+Shift+F', zone: 'editeur' },
  { id: 'apercu', libelle: 'Afficher / masquer l\'aperçu', defaut: 'Ctrl+Shift+V', zone: 'editeur' },
];

// Raccourcis de l'éditeur Monaco (non modifiables ici), pour information.
export const RACCOURCIS_EDITEUR = [
  ['Ctrl+F / Ctrl+H', 'Chercher / remplacer dans le fichier'],
  ['Ctrl+Espace', 'Suggestions'],
  ['F12 / Ctrl+clic', 'Aller à la définition'],
  ['Maj+F12', 'Toutes les utilisations'],
  ['Ctrl+/', 'Commenter / décommenter'],
  ['Alt+↑ / Alt+↓', 'Déplacer la ligne'],
  ['Ctrl+D', 'Sélectionner l\'occurrence suivante'],
  ['F1', 'Toutes les commandes de l\'éditeur'],
];

const NOMS_CODES = { Equal: '=', Minus: '-', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: '\'', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`', Space: 'Espace' };

// Combinaison d'un événement clavier : « Ctrl+Shift+P » (null pour une touche seule de modificateur).
export function combinaison(e) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  // Lettres et signes : d'après le caractère (clavier AZERTY comme QWERTY) ; chiffres de la
  // rangée du haut (« à » sur AZERTY) : d'après la position de la touche.
  let touche;
  if (/^[a-z]$/i.test(e.key)) touche = e.key.toUpperCase();
  else if (/^[0-9]$/.test(e.key)) touche = e.key;
  else if (e.key === ' ') touche = 'Espace';
  else if (/^[=\-+,.;:/\\'`[\]*!?]$/.test(e.key)) touche = e.key === '+' ? '=' : e.key;
  else if (/^(Digit|Numpad)\d$/.test(e.code)) touche = e.code.slice(-1);
  else if (e.code === 'NumpadAdd') touche = '=';
  else if (e.code === 'NumpadSubtract') touche = '-';
  else if (NOMS_CODES[e.code]) touche = NOMS_CODES[e.code];
  else touche = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', touche].filter(Boolean).join('+');
}

export function touche(id) {
  const choisies = preferences.lire('raccourcis');
  if (Object.prototype.hasOwnProperty.call(choisies, id)) return choisies[id] || '';
  return COMMANDES.find((c) => c.id === id)?.defaut || '';
}

export function correspond(e, id) {
  const t = touche(id);
  return Boolean(t) && combinaison(e) === t;
}

// Commande de la combinaison (dans une zone), ou null.
export function commandeDe(e, zone = 'partout') {
  const combi = combinaison(e);
  if (!combi) return null;
  return COMMANDES.find((c) => c.zone === zone && touche(c.id) === combi) || null;
}

// Affichage : « Ctrl+Maj+P ».
export function afficher(combi) {
  return (combi || '').replace(/\bShift\b/g, 'Maj');
}

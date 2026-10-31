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
  { id: 'discussion', libelle: 'Discuter avec Claude', defaut: '', zone: 'partout' },
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

// Disposition du clavier de l'utilisateur (AZERTY, QWERTY…) : position de la touche ->
// caractère écrit SANS Maj (ex. « Quote » -> « ù » en AZERTY). Transmise aussi au processus
// principal, qui capte les raccourcis pressés dans un outil HTML.
let disposition = null;
navigator.keyboard?.getLayoutMap?.().then((carte) => {
  disposition = carte;
  window.toolkit.application.disposition?.(Object.fromEntries(carte));
}).catch(() => { /* touches nommées d'après e.key */ });

// Nom d'une touche, tel qu'il est écrit sur le clavier de l'utilisateur (sans Maj).
// (Même règle dans src/main/outils-html.js > nomTouche.)
export function nomTouche(code, key) {
  // Lettres : la lettre tapée (toujours juste, quelle que soit la disposition).
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  const caractere = disposition?.get(code);
  // Rangée des chiffres : le chiffre (Ctrl+0 marche aussi en AZERTY, où la touche porte « à »),
  // sauf les signes utiles aux raccourcis par défaut (« - » de la touche 6 en AZERTY).
  if (/^Digit\d$/.test(code)) return caractere === '-' || caractere === '=' ? caractere : code.slice(-1);
  if (/^Numpad\d$/.test(code)) return code.slice(-1);
  if (code === 'NumpadAdd') return '=';
  if (code === 'NumpadSubtract') return '-';
  if (code === 'Space' || key === ' ') return 'Espace';
  const brut = caractere || (key.length === 1 ? key : null);
  if (brut) return /^[a-z]$/i.test(brut) ? brut.toUpperCase() : brut;
  return key; // Tab, F1, Entrée, flèches…
}

// Combinaison d'un événement clavier : « Ctrl+Shift+ù » (null pour une touche seule de modificateur).
export function combinaison(e) {
  // Choisir une suggestion de saisie automatique dans un champ envoie un « keydown » sans touche.
  if (typeof e.key !== 'string' || !e.key) return null;
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return null;
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', nomTouche(e.code, e.key)].filter(Boolean).join('+');
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

// Au démarrage : prévient (une fois par combinaison) si un raccourci de Toolkit est réservé
// par un autre programme du PC (il n'arriverait jamais jusqu'à Toolkit).
export async function verifierConflits(notifier) {
  const parCombinaison = new Map();
  for (const c of COMMANDES) {
    const t = touche(c.id);
    if (t) parCombinaison.set(t, [...(parCombinaison.get(t) || []), c.libelle]);
  }
  let pris = [];
  try {
    pris = await window.toolkit.application.raccourcisPris([...parCombinaison.keys()]);
  } catch {
    return;
  }
  let dejaSignales = [];
  try { dejaSignales = JSON.parse(localStorage.getItem('toolkit:raccourcis:signales') || '[]'); } catch { /* aucun */ }
  const nouveaux = pris.filter((p) => !dejaSignales.includes(p));
  if (!nouveaux.length) return;
  const proprietaires = await window.toolkit.application.proprietairesRaccourcis(nouveaux).catch(() => ({}));
  notifier(`Raccourci(s) pris par un autre programme du PC : ${nouveaux.map((p) => `${afficher(p)} (${parCombinaison.get(p).join(', ')}${proprietaires[p] ? ` — utilisé par ${proprietaires[p]}` : ''})`).join(' ; ')}. Ils ne marcheront pas dans Toolkit : change-les dans Réglages > Raccourcis.`);
  try { localStorage.setItem('toolkit:raccourcis:signales', JSON.stringify([...dejaSignales, ...nouveaux])); } catch { /* sans importance */ }
}

// Affichage : « Ctrl+Maj+P ».
export function afficher(combi) {
  return (combi || '').replace(/\bShift\b/g, 'Maj');
}

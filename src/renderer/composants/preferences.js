// Préférences de l'utilisateur (Réglages > Claude, Éditeur, Interface, Raccourcis).
// Rangées dans donnees/reglages.json > preferences ; toujours lues fusionnées avec les valeurs
// par défaut. Un changement est enregistré tout de suite et annoncé par l'événement
// « toolkit:preferences » (l'éditeur, la barre latérale… s'y adaptent sans redémarrage).
import * as etat from './etat.js';
import { notifier } from './notifications.js';

export const DEFAUTS = {
  claude: {
    consignes: '', // ajoutées pour tous les projets (CLAUDE.md à la racine de Toolkit)
    modele: '', // '' = celui de Claude Code ; 'fable' | 'opus' | 'sonnet' | 'haiku'
    autonomie: '', // '' = réglage de Claude Code ; 'manual' | 'acceptEdits' | 'auto' | 'plan'
    notifications: true, // prévenir quand Claude a fini / attend une réponse
  },
  editeur: {
    taillePolice: 14,
    police: 'Cascadia Code',
    retourLigne: false,
    enregistrementAuto: 'non', // 'non' | 'delai' | 'focus'
    miniCarte: true,
    tabulation: 'auto', // 'auto' | '2' | '4' | 'tab'
    apercuParDefaut: true,
  },
  interface: {
    zoom: 100,
    restaurerOnglets: true,
    sectionsMasquees: [], // 'recents' | 'epingles' | 'groupes' | 'categories' | 'tags'
  },
  raccourcis: {}, // id de commande -> combinaison (ex. 'Ctrl+Shift+P'), '' = désactivé
};

function fusionner(base, ajout) {
  const resultat = { ...base };
  for (const [cle, valeur] of Object.entries(ajout || {})) {
    const objet = valeur && typeof valeur === 'object' && !Array.isArray(valeur);
    resultat[cle] = objet && base[cle] && typeof base[cle] === 'object' && !Array.isArray(base[cle]) ? fusionner(base[cle], valeur) : valeur;
  }
  return resultat;
}

export function toutes() {
  return fusionner(DEFAUTS, etat.obtenir().preferences);
}

export function lire(groupe) {
  return toutes()[groupe];
}

// modifier('editeur', { taillePolice: 16 })
export async function modifier(groupe, changements) {
  const actuelles = etat.obtenir().preferences || {};
  const nouvelles = { ...actuelles, [groupe]: groupe === 'raccourcis' ? changements : { ...(actuelles[groupe] || {}), ...changements } };
  etat.modifier({ preferences: nouvelles });
  window.dispatchEvent(new CustomEvent('toolkit:preferences', { detail: { groupe } }));
  try {
    // Les raccourcis sont remplacés en entier (une touche remise par défaut doit disparaître).
    if (groupe === 'raccourcis') await window.toolkit.reglages.modifier({ preferences: { raccourcis: null } });
    await window.toolkit.reglages.modifier({ preferences: { [groupe]: nouvelles[groupe] } });
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  }
}

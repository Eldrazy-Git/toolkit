// « Récents » : ce qui a été ouvert dernièrement (outils, projets dans un éditeur, fichiers
// de l'onglet « Code », notes, sessions Claude), pour reprendre le travail en un clic.
// Rangés dans les réglages (donnees/reglages.json > interface.recents), 15 au plus.
// Entrée : { type: 'outil' | 'editeur' | 'fichier' | 'note' | 'claude', nom, date, ... }
import * as etat from './etat.js';

const MAXIMUM = 15;

function cleDe(e) {
  return [e.type, e.projetId || '', e.outilLie || '', e.chemin || '', e.cible ? `${e.cible.type}:${e.cible.id || ''}` : ''].join('|');
}

export function nettoyer(liste) {
  if (!Array.isArray(liste)) return [];
  return liste
    .filter((e) => e && ['outil', 'editeur', 'fichier', 'note', 'claude'].includes(e.type) && typeof e.nom === 'string')
    .slice(0, MAXIMUM);
}

function enregistrer(recents) {
  etat.modifier({ recents });
  window.toolkit.reglages.modifier({ interface: { recents } }).catch(() => {});
}

// Ajoute (ou remonte en tête) une entrée. Appelé après une ouverture réussie.
export function noter(entree) {
  const nouvelle = { ...entree, date: Date.now() };
  const cle = cleDe(nouvelle);
  enregistrer([nouvelle, ...etat.obtenir().recents.filter((e) => cleDe(e) !== cle)].slice(0, MAXIMUM));
}

export function retirer(entree) {
  const cle = cleDe(entree);
  enregistrer(etat.obtenir().recents.filter((e) => cleDe(e) !== cle));
}

export function vider() {
  enregistrer([]);
}

// Entrées encore valables (projet toujours présent).
export function liste() {
  const ids = new Set(etat.obtenir().projets.map((p) => p.id));
  return etat.obtenir().recents.filter((e) => {
    const projetId = e.projetId || (e.cible?.type === 'projet' ? e.cible.id : null);
    return !projetId || ids.has(projetId);
  });
}

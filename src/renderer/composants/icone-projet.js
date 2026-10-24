// Icône d'un projet : son image si elle existe, sinon ses initiales sur une
// couleur qui dépend de sa catégorie (même catégorie = même couleur).
import { el } from './dom.js';

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

export function couleurCategorie(categorie) {
  let somme = 0;
  for (const caractere of String(categorie)) somme = (somme * 31 + caractere.codePointAt(0)) >>> 0;
  return PALETTE[somme % PALETTE.length];
}

export function initiales(nom) {
  const mots = String(nom).split(/[\s\-_.]+/).filter((m) => /[\p{L}\p{N}]/u.test(m));
  if (mots.length === 0) return '?';
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

export function iconeProjet(projet, taille = 56) {
  const style = { '--taille': `${taille}px`, '--couleur': couleurCategorie(projet.fiche.categorie) };
  if (projet.icone) {
    const conteneur = el('div', { classe: 'icone-projet avec-image', style },
      el('img', { src: projet.icone, alt: '', draggable: 'false' }));
    // Image introuvable ou abîmée : on revient aux initiales.
    conteneur.firstChild.addEventListener('error', () => {
      conteneur.classList.remove('avec-image');
      conteneur.replaceChildren(initiales(projet.fiche.nom));
    });
    return conteneur;
  }
  return el('div', { classe: 'icone-projet', style }, initiales(projet.fiche.nom));
}

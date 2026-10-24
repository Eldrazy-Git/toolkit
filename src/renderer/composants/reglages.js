// Onglet « Réglages » : chemins des éditeurs (les autres réglages arrivent à l'étape 10).
import { el } from './dom.js';
import { icone } from './icones.js';
import * as etat from './etat.js';
import * as actions from './actions.js';

export const ID_REGLAGES = 'reglages';

const panneau = el('section', { id: 'reglages', classe: 'panneau panneau-reglages inactif' });
document.getElementById('zone-contenu').append(panneau);

export function element() {
  return panneau;
}

function statut(editeur) {
  if (editeur.source === 'reglage') {
    return editeur.disponible
      ? el('span', { classe: 'statut ok' }, icone('coche'), 'Choisi à la main')
      : el('span', { classe: 'statut erreur' }, icone('erreur'), 'Introuvable à cet emplacement');
  }
  return editeur.disponible
    ? el('span', { classe: 'statut ok' }, icone('coche'), 'Trouvé automatiquement')
    : el('span', { classe: 'statut erreur' }, icone('erreur'), 'Introuvable');
}

function ligneEditeur(editeur) {
  return el('div', { classe: 'reglage-editeur' },
    el('div', { classe: 'reglage-editeur-entete' },
      el('strong', {}, editeur.nom),
      statut(editeur)),
    el('code', { classe: 'reglage-chemin' }, editeur.chemin || 'Aucun programme trouvé'),
    el('div', { classe: 'details-boutons' },
      el('button', { classe: 'bouton petit', onClick: () => actions.parcourirEditeur(editeur.id) }, icone('dossier'), 'Choisir le programme…'),
      editeur.source === 'reglage'
        ? el('button', { classe: 'bouton petit', onClick: () => actions.definirCheminEditeur(editeur.id, null) }, icone('redemarrer'), 'Revenir à la détection automatique')
        : null));
}

export function rendre() {
  const { editeurs, reglagesOuverts } = etat.obtenir();
  if (!reglagesOuverts) return;
  const listes = editeurs.filter((e) => e.source !== 'systeme');
  panneau.replaceChildren(el('div', { classe: 'page-reglages' },
    el('h1', {}, 'Réglages'),

    el('section', { classe: 'section-reglages' },
      el('h2', {}, 'Éditeurs'),
      el('p', { classe: 'details-aide' },
        'Toolkit trouve tout seul les éditeurs installés. Si l\'un d\'eux n\'est pas trouvé, ',
        'clique sur « Choisir le programme… » et sélectionne son fichier .exe ',
        '(par exemple Code.exe, studio64.exe ou notepad++.exe).'),
      listes.length === 0 ? el('p', { classe: 'details-aide' }, 'Recherche des éditeurs…') : listes.map(ligneEditeur),
      el('p', { classe: 'details-aide' }, 'L\'Explorateur Windows est toujours disponible.'),
      el('button', { classe: 'bouton', onClick: actions.redetecterEditeurs }, icone('recherche'), 'Détecter à nouveau')),

    el('section', { classe: 'section-reglages' },
      el('h2', {}, 'Autres réglages'),
      el('p', { classe: 'details-aide' }, 'Démarrage avec Windows et dossier des projets : à l\'étape 10.'))));
}

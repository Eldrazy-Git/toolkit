// Palette de recherche globale (Ctrl+K) : projets (fiches projet.json) et notes (.md).
// ↑ ↓ pour choisir, Entrée pour ouvrir, Échap pour fermer.
import { el } from './dom.js';
import { icone } from './icones.js';
import { iconeProjet } from './icone-projet.js';
import * as etat from './etat.js';
import * as actions from './actions.js';

const api = window.toolkit.recherche;
const DELAI_FRAPPE = 120;

let palette = null; // { voile, champ, liste, resultats, choisi }

function fermer() {
  if (!palette) return;
  document.removeEventListener('keydown', surTouche, true);
  palette.voile.remove();
  palette = null;
}

function segments(liste) {
  return liste.map((s) => (s.m ? el('mark', {}, s.t) : s.t));
}

function ouvrirResultat(r) {
  fermer();
  if (r.type === 'projet') actions.allerAuProjet(r.projetId);
  else actions.ouvrirNote(r.chemin);
}

function visuel(r) {
  if (r.type === 'projet') {
    const projet = etat.obtenir().projets.find((p) => p.id === r.projetId);
    if (projet) return iconeProjet(projet, 28);
  }
  return el('span', { classe: 'icone-resultat' }, icone('note'));
}

function dessinerResultats() {
  const { liste, resultats, choisi, champ } = palette;
  if (!champ.value.trim()) {
    liste.replaceChildren(el('p', { classe: 'recherche-aide' },
      'Cherche dans les noms, descriptions, catégories et tags des projets, et dans toutes les notes .md (README, CLAUDE.md, notes…).'));
    return;
  }
  if (resultats.length === 0) {
    liste.replaceChildren(el('p', { classe: 'recherche-aide' }, 'Aucun résultat.'));
    return;
  }
  liste.replaceChildren(...resultats.map((r, i) => el('div', {
    classe: `resultat${i === choisi ? ' choisi' : ''}`,
    onMousemove: () => {
      if (palette.choisi !== i) {
        palette.choisi = i;
        dessinerResultats();
      }
    },
    onClick: () => ouvrirResultat(r),
  },
  visuel(r),
  el('div', { classe: 'resultat-texte' },
    el('div', { classe: 'resultat-titre' }, el('span', { classe: 'resultat-nom' }, segments(r.titreSegments)),
      el('span', { classe: 'resultat-lieu' }, r.type === 'projet' ? 'Projet' : `${r.nomProjet} · ${r.chemin.split('/').slice(r.projetId ? 2 : 1).join('/')}`)),
    el('div', { classe: 'resultat-extrait' }, segments(r.extrait))))));
  liste.querySelector('.choisi')?.scrollIntoView({ block: 'nearest' });
}

let minuteur = null;
let numeroRequete = 0;

function chercher() {
  clearTimeout(minuteur);
  minuteur = setTimeout(async () => {
    if (!palette) return;
    const numero = ++numeroRequete;
    try {
      const resultats = await api.chercher(palette.champ.value);
      // Une réponse plus ancienne qui arrive en retard est ignorée.
      if (!palette || numero !== numeroRequete) return;
      palette.resultats = resultats;
      palette.choisi = 0;
      dessinerResultats();
    } catch (erreur) {
      if (palette) palette.liste.replaceChildren(el('p', { classe: 'recherche-aide' }, erreur.message));
    }
  }, DELAI_FRAPPE);
}

function surTouche(e) {
  if (!palette) return;
  const { resultats } = palette;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    fermer();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (resultats.length === 0) return;
    palette.choisi = (palette.choisi + (e.key === 'ArrowDown' ? 1 : -1) + resultats.length) % resultats.length;
    dessinerResultats();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const r = resultats[palette.choisi];
    if (r) ouvrirResultat(r);
  }
}

export function ouvrirRecherche() {
  if (palette) {
    palette.champ.select();
    return;
  }
  const champ = el('input', { type: 'text', placeholder: 'Rechercher un projet ou une note…', spellcheck: 'false', onInput: chercher });
  const liste = el('div', { classe: 'recherche-resultats' });
  const voile = el('div', { classe: 'voile voile-recherche', onMousedown: (e) => { if (e.target === voile) fermer(); } },
    el('div', { classe: 'palette', role: 'dialog', 'aria-label': 'Recherche' },
      el('label', { classe: 'palette-champ' }, icone('recherche'), champ, el('kbd', {}, 'Échap')),
      liste));
  palette = { voile, champ, liste, resultats: [], choisi: 0 };
  document.body.append(voile);
  document.addEventListener('keydown', surTouche, true);
  champ.focus();
  dessinerResultats();
  api.preparer().catch(() => {});
}

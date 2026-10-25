// Palette de commandes (Ctrl+Maj+P) : on tape ce qu'on veut faire, ↑ ↓ pour choisir,
// Entrée pour lancer, Échap pour fermer. Commandes : voir commandes.js > listePalette().
import { el, normaliser } from './dom.js';
import { icone } from './icones.js';
import { listePalette } from './commandes.js';

const MAXIMUM = 60;
let palette = null; // { voile, champ, liste, commandes, trouvees, choisi }

function fermer() {
  if (!palette) return;
  document.removeEventListener('keydown', surTouche, true);
  palette.voile.remove();
  palette = null;
}

function lancer(c) {
  fermer();
  c.action();
}

// Tous les mots tapés doivent apparaître (accents et majuscules ignorés) ; les titres qui
// commencent par le texte passent en premier.
function filtrer() {
  const texte = normaliser(palette.champ.value.trim());
  const mots = texte.split(/\s+/).filter(Boolean);
  palette.trouvees = palette.commandes
    .map((c, ordre) => ({ c, ordre, cible: normaliser(`${c.titre} ${c.detail || ''} ${c.groupe}`), titre: normaliser(c.titre) }))
    .filter((x) => mots.every((m) => x.cible.includes(m)))
    .sort((a, b) => (texte ? (b.titre.startsWith(texte) - a.titre.startsWith(texte)) : 0) || a.ordre - b.ordre)
    .slice(0, MAXIMUM)
    .map((x) => x.c);
  palette.choisi = 0;
  dessiner();
}

function dessiner() {
  const { liste, trouvees, choisi } = palette;
  if (!trouvees.length) {
    liste.replaceChildren(el('p', { classe: 'recherche-aide' }, 'Aucune commande ne correspond.'));
    return;
  }
  liste.replaceChildren(...trouvees.map((c, i) => el('div', {
    classe: `resultat commande${i === choisi ? ' choisi' : ''}`,
    onMousemove: () => {
      if (palette.choisi !== i) {
        palette.choisi = i;
        dessiner();
      }
    },
    onClick: () => lancer(c),
  },
  el('span', { classe: 'icone-resultat' }, icone(c.icone || 'lecture')),
  el('div', { classe: 'resultat-texte' },
    el('div', { classe: 'resultat-titre' },
      el('span', { classe: 'resultat-nom' }, c.titre),
      c.detail ? el('span', { classe: 'details-aide' }, c.detail) : null,
      el('span', { classe: 'resultat-lieu' }, c.groupe))),
  c.raccourci ? el('kbd', {}, c.raccourci) : null)));
  liste.querySelector('.choisi')?.scrollIntoView({ block: 'nearest' });
}

function surTouche(e) {
  if (!palette) return;
  const { trouvees } = palette;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    fermer();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!trouvees.length) return;
    palette.choisi = (palette.choisi + (e.key === 'ArrowDown' ? 1 : -1) + trouvees.length) % trouvees.length;
    dessiner();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    if (trouvees[palette.choisi]) lancer(trouvees[palette.choisi]);
  }
}

export function ouvrirPalette() {
  if (palette) {
    palette.champ.select();
    return;
  }
  const champ = el('input', { type: 'text', placeholder: 'Que veux-tu faire ? (ex. « code catalogue », « réglages », « commit »…)', spellcheck: 'false', onInput: () => filtrer() });
  const liste = el('div', { classe: 'recherche-resultats' });
  const voile = el('div', { classe: 'voile voile-recherche', onMousedown: (e) => { if (e.target === voile) fermer(); } },
    el('div', { classe: 'palette', role: 'dialog', 'aria-label': 'Palette de commandes' },
      el('label', { classe: 'palette-champ' }, icone('points'), champ, el('kbd', {}, 'Échap')),
      liste));
  palette = { voile, champ, liste, commandes: listePalette(), trouvees: [], choisi: 0 };
  document.body.append(voile);
  document.addEventListener('keydown', surTouche, true);
  champ.focus();
  filtrer();
}

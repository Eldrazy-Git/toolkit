// Petit menu déroulant affiché sous un bouton (ex. « Ouvrir avec… »).
// elements : [{ libelle, icone?, detail?, desactive?, infobulle?, action }] ; 'separateur' pour un
// trait ; { titre } pour un intitulé de section (non cliquable).
import { el } from './dom.js';
import { icone } from './icones.js';

let menuOuvert = null;

export function fermerMenu() {
  menuOuvert?.remove();
  menuOuvert = null;
  document.removeEventListener('mousedown', clicExterieur, true);
  document.removeEventListener('keydown', surTouche, true);
}

function clicExterieur(e) {
  if (menuOuvert && !menuOuvert.contains(e.target)) fermerMenu();
}

function surTouche(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    fermerMenu();
  }
}

export function ouvrirMenu(ancre, elements) {
  fermerMenu();
  const menu = el('div', { classe: 'menu', role: 'menu' },
    ...elements.map((e) => {
      if (e === 'separateur') return el('div', { classe: 'menu-separateur' });
      if (e.titre) return el('div', { classe: 'menu-titre' }, e.titre);
      return el('button', {
        classe: 'menu-element',
        role: 'menuitem',
        disabled: Boolean(e.desactive),
        title: e.infobulle,
        onClick: () => {
          fermerMenu();
          e.action();
        },
      },
      e.icone ? icone(e.icone) : el('span', { classe: 'ico' }),
      el('span', { classe: 'menu-libelle' }, e.libelle),
      e.detail ? el('span', { classe: 'menu-detail' }, e.detail) : null);
    }));
  document.body.append(menu);

  // Positionné sous le bouton, sans dépasser de la fenêtre.
  // ancre : un élément (menu sous le bouton) ou un point { x, y } (clic droit).
  const r = ancre instanceof Element
    ? ancre.getBoundingClientRect()
    : { left: ancre.x, right: ancre.x, top: ancre.y, bottom: ancre.y };
  const largeur = menu.offsetWidth;
  const hauteur = menu.offsetHeight;
  const gauche = Math.min(r.left, window.innerWidth - largeur - 8);
  const haut = r.bottom + 4 + hauteur > window.innerHeight ? r.top - hauteur - 4 : r.bottom + 4;
  menu.style.setProperty('left', `${Math.max(8, gauche)}px`);
  menu.style.setProperty('top', `${Math.max(8, haut)}px`);
  menu.querySelector('button:not(:disabled)')?.focus();

  menuOuvert = menu;
  document.addEventListener('mousedown', clicExterieur, true);
  document.addEventListener('keydown', surTouche, true);
}

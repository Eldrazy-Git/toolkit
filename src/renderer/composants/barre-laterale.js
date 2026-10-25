// Barre latérale : tous les projets, favoris, projets épinglés, catégories, tags et l'entrée « Toolkit ».
import { el } from './dom.js';
import { icone } from './icones.js';
import { couleurCategorie, iconeProjet } from './icone-projet.js';
import { ouvrirMenu } from './menu.js';
import * as etat from './etat.js';
import * as actions from './actions.js';
import { ouvrirRecherche } from './recherche.js';

const conteneur = document.getElementById('barre-laterale');

function memeFiltre(a, b) {
  return a.type === b.type && a.valeur === b.valeur;
}

function elementNav({ libelle, visuel, compteur, actif, auClic, renommer }) {
  return el('div', {
    classe: `element-nav${actif ? ' actif' : ''}`,
    role: 'button',
    tabindex: '0',
    title: libelle,
    onClick: auClic,
    onKeydown: (e) => { if (e.key === 'Enter') auClic(); },
  },
    visuel,
    el('span', { classe: 'libelle' }, libelle),
    compteur !== undefined ? el('span', { classe: 'compteur' }, compteur) : null,
    renommer
      ? el('button', {
        classe: 'bouton-icone',
        title: 'Renommer',
        onClick: (e) => { e.stopPropagation(); renommer(); },
      }, icone('crayon'))
      : null,
  );
}

// Projets épinglés : accès direct sous « Favoris » (clic = afficher, double-clic = ouvrir,
// clic droit = menu, × = désépingler). Un projet supprimé disparaît simplement de la liste.
function projetsEpingles(projets, selection, ongletActif) {
  return etat.obtenir().epingles
    .map((id) => projets.find((p) => p.id === id))
    .filter(Boolean)
    .map((projet) => el('div', {
      classe: `element-nav element-epingle${selection === projet.id && ongletActif === 'bibliotheque' ? ' actif' : ''}`,
      role: 'button',
      tabindex: '0',
      title: projet.fiche.description || projet.fiche.nom,
      onClick: () => actions.allerAuProjet(projet.id),
      onDblclick: () => {
        if (projet.erreur) return;
        if (actions.estOuvrableCommeOutil(projet)) actions.ouvrirOutil(projet.id);
        else actions.ouvrirAvec(projet);
      },
      onKeydown: (e) => { if (e.key === 'Enter') actions.allerAuProjet(projet.id); },
      onContextmenu: (e) => {
        e.preventDefault();
        ouvrirMenu({ x: e.clientX, y: e.clientY }, actions.elementsMenuProjet(projet, { x: e.clientX, y: e.clientY }));
      },
    },
    iconeProjet(projet, 18),
    el('span', { classe: 'libelle' }, projet.fiche.nom),
    el('button', {
      classe: 'bouton-icone',
      title: 'Désépingler',
      onClick: (e) => { e.stopPropagation(); actions.basculerEpingle(projet); },
    }, icone('croix'))));
}

export function rendre() {
  const { projets, selection, infosApp, ongletActif } = etat.obtenir();
  const enBibliotheque = selection !== etat.ID_TOOLKIT;
  // Aucun filtre n'est surligné quand on regarde les Réglages ou un outil.
  const filtre = ongletActif === 'bibliotheque' ? etat.obtenir().filtre : { type: 'aucun' };
  const choisir = (f) => () => actions.choisirFiltre(f);

  const categories = actions.listeCategories();
  const tags = actions.listeTags();

  conteneur.replaceChildren(
    el('div', { classe: 'barre-entete' },
      infosApp ? el('img', { src: infosApp.icone, alt: '' }) : null,
      'Toolkit'),
    el('button', { classe: 'bouton-recherche', title: 'Rechercher dans les projets et les notes', onClick: ouvrirRecherche },
      icone('recherche'), el('span', {}, 'Rechercher…'), el('kbd', {}, 'Ctrl+K')),
    el('div', { classe: 'barre-defilante' },
      el('div', { classe: 'barre-section' }, 'Bibliothèque'),
      elementNav({
        libelle: 'Tous les projets',
        visuel: icone('grille'),
        compteur: projets.length,
        actif: filtre.type === 'tous',
        auClic: choisir({ type: 'tous' }),
      }),
      elementNav({
        libelle: 'Favoris',
        visuel: icone('etoile'),
        compteur: projets.filter((p) => p.fiche.favori).length,
        actif: filtre.type === 'favoris',
        auClic: choisir({ type: 'favoris' }),
      }),
      projetsEpingles(projets, selection, ongletActif),

      el('div', { classe: 'barre-section' }, 'Catégories'),
      categories.length === 0 ? el('div', { classe: 'barre-vide' }, 'Aucune') : null,
      categories.map(([nom, nombre]) => {
        const f = { type: 'categorie', valeur: nom };
        return elementNav({
          libelle: nom,
          visuel: el('span', { classe: 'pastille-couleur', style: { '--couleur': couleurCategorie(nom) } }),
          compteur: nombre,
          actif: memeFiltre(filtre, f),
          auClic: choisir(f),
          renommer: () => actions.renommerCategorie(nom),
        });
      }),

      el('div', { classe: 'barre-section' }, 'Tags'),
      tags.length === 0 ? el('div', { classe: 'barre-vide' }, 'Aucun') : null,
      tags.map(([nom, nombre]) => {
        const f = { type: 'tag', valeur: nom };
        return elementNav({
          libelle: nom,
          visuel: icone('tag'),
          compteur: nombre,
          actif: memeFiltre(filtre, f),
          auClic: choisir(f),
          renommer: () => actions.renommerTag(nom),
        });
      }),
    ),
    el('div', { classe: 'barre-pied' },
      elementNav({
        libelle: 'Git et GitHub',
        visuel: icone('git'),
        actif: ongletActif === 'git',
        auClic: actions.ouvrirGit,
      }),
      elementNav({
        libelle: 'Terminal PowerShell',
        visuel: icone('terminal'),
        auClic: () => actions.ouvrirPowerShell({ type: 'racine' }, 'Toolkit'),
      }),
      elementNav({
        libelle: 'Réglages',
        visuel: icone('reglages'),
        actif: etat.obtenir().ongletActif === 'reglages',
        auClic: actions.ouvrirReglages,
      }),
      elementNav({
        libelle: 'Toolkit (l\'application)',
        visuel: icone('outil'),
        actif: !enBibliotheque && ongletActif === 'bibliotheque',
        auClic: () => actions.selectionner(etat.ID_TOOLKIT),
      })),
  );
}

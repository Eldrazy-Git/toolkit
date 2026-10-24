// Zone centrale : barre d'outils (titre, filtre, choix de la vue) et projets en grille ou en liste.
import { el, normaliser } from './dom.js';
import { icone } from './icones.js';
import { iconeProjet } from './icone-projet.js';
import * as etat from './etat.js';
import * as actions from './actions.js';

export const LIBELLES_TYPES = {
  html: 'Outil HTML',
  script: 'Script',
  'mod-minecraft': 'Mod Minecraft',
  android: 'Android',
  autre: 'Autre',
};

const conteneur = document.getElementById('bibliotheque');

// La barre d'outils est créée une seule fois pour que le champ de filtre garde le focus.
const titre = el('h1');
const champFiltre = el('input', {
  type: 'text',
  placeholder: 'Filtrer les projets…',
  spellcheck: 'false',
  onInput: () => etat.modifier({ texteFiltre: champFiltre.value }),
  onKeydown: (e) => {
    if (e.key === 'Escape') {
      champFiltre.value = '';
      etat.modifier({ texteFiltre: '' });
    }
  },
});
const boutonGrille = el('button', { classe: 'bouton-icone', title: 'Vue en grille', onClick: () => actions.changerVue('grille') }, icone('grille'));
const boutonListe = el('button', { classe: 'bouton-icone', title: 'Vue en liste', onClick: () => actions.changerVue('liste') }, icone('liste'));
const contenu = el('div', { classe: 'contenu-bibliotheque' });

conteneur.append(
  el('header', { classe: 'barre-outils' },
    titre,
    el('label', { classe: 'champ-filtre' }, icone('recherche'), champFiltre),
    el('div', { classe: 'groupe-boutons' }, boutonGrille, boutonListe)),
  contenu,
);

export function focaliserFiltre() {
  champFiltre.focus();
  champFiltre.select();
}

function titreDuFiltre(filtre) {
  switch (filtre.type) {
    case 'favoris': return 'Favoris';
    case 'categorie': return filtre.valeur;
    case 'tag': return `Tag : ${filtre.valeur}`;
    default: return 'Tous les projets';
  }
}

function projetsVisibles({ projets, filtre, texteFiltre }) {
  const recherche = normaliser(texteFiltre.trim());
  return projets.filter((p) => {
    const f = p.fiche;
    if (filtre.type === 'favoris' && !f.favori) return false;
    if (filtre.type === 'categorie' && f.categorie !== filtre.valeur) return false;
    if (filtre.type === 'tag' && !f.tags.includes(filtre.valeur)) return false;
    if (!recherche) return true;
    return normaliser([f.nom, f.description, f.categorie, ...f.tags].join(' ')).includes(recherche);
  });
}

function marques(projet) {
  const aProbleme = projet.erreur || projet.problemes.length > 0;
  return [
    projet.fiche.favori ? el('span', { classe: 'marque-favori', title: 'Favori' }, icone('etoile')) : null,
    aProbleme ? el('span', { classe: 'marque-erreur', title: 'La fiche projet.json a un problème' }, icone('attention')) : null,
  ];
}

function carte(projet, selection) {
  return el('div', {
    classe: `carte${projet.id === selection ? ' selectionne' : ''}`,
    title: projet.fiche.description || projet.fiche.nom,
    onClick: () => actions.selectionner(projet.id),
  },
  el('div', { classe: 'carte-marques' }, marques(projet)),
  iconeProjet(projet, 56),
  el('div', { classe: 'carte-nom' }, projet.fiche.nom),
  el('div', { classe: 'carte-meta' }, LIBELLES_TYPES[projet.fiche.type]));
}

function ligne(projet, selection) {
  const f = projet.fiche;
  return el('div', {
    classe: `ligne${projet.id === selection ? ' selectionne' : ''}`,
    onClick: () => actions.selectionner(projet.id),
  },
  iconeProjet(projet, 32),
  el('div', { classe: 'ligne-texte' },
    el('div', { classe: 'ligne-nom' }, f.nom, marques(projet)),
    el('div', { classe: 'ligne-description' }, f.description || '—')),
  el('div', { classe: 'ligne-colonne' }, f.categorie),
  el('div', { classe: 'ligne-colonne' }, LIBELLES_TYPES[f.type]));
}

function messageVide(etatCourant) {
  if (etatCourant.chargement) return el('div', { classe: 'message-vide' }, 'Chargement…');
  if (etatCourant.projets.length === 0) {
    return el('div', { classe: 'message-vide' },
      el('strong', {}, 'Aucun projet pour l\'instant'),
      'Chaque projet est un dossier dans ',
      el('code', {}, etatCourant.infosApp?.dossierProjets || 'projets'),
      ' contenant une fiche ',
      el('code', {}, 'projet.json'),
      '.');
  }
  return el('div', { classe: 'message-vide' },
    el('strong', {}, 'Aucun projet ne correspond'),
    etatCourant.texteFiltre ? 'Essaie un autre mot dans le filtre.' : 'Cette sélection est vide.');
}

export function rendre() {
  const e = etat.obtenir();
  const visibles = projetsVisibles(e);

  titre.replaceChildren(titreDuFiltre(e.filtre),
    el('span', { classe: 'sous-titre' }, `${visibles.length} projet${visibles.length > 1 ? 's' : ''}`));
  boutonGrille.classList.toggle('actif', e.vue === 'grille');
  boutonListe.classList.toggle('actif', e.vue === 'liste');

  if (visibles.length === 0) {
    contenu.replaceChildren(messageVide(e));
  } else if (e.vue === 'liste') {
    contenu.replaceChildren(el('div', { classe: 'liste' }, visibles.map((p) => ligne(p, e.selection))));
  } else {
    contenu.replaceChildren(el('div', { classe: 'grille' }, visibles.map((p) => carte(p, e.selection))));
  }
}

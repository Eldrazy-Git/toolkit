// Zone centrale : barre d'outils (titre, filtre, tri, choix de la vue) et projets en grille ou
// en liste. Clic droit sur un projet : menu rapide (ouvrir, favori, épingler, icône…).
import { el, normaliser, ilYA } from './dom.js';
import { icone } from './icones.js';
import { iconeProjet } from './icone-projet.js';
import { ouvrirMenu } from './menu.js';
import * as etat from './etat.js';
import * as actions from './actions.js';
import * as groupes from './groupes.js';

export const LIBELLES_TYPES = {
  html: 'Outil HTML',
  script: 'Script',
  java: 'Java (Gradle)',
  android: 'Android',
  autre: 'Autre',
};

// Tris proposés. « type » et « categorie » regroupent les projets sous des titres.
export const TRIS = {
  nom: 'Nom (A → Z)',
  modification: 'Modifié récemment',
  ajout: 'Ajouté récemment',
  type: 'Type de projet',
  categorie: 'Catégorie',
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
const choixTri = el('select', {
  classe: 'choix-tri',
  title: 'Trier les projets',
  onChange: () => actions.changerTri(choixTri.value),
}, Object.entries(TRIS).map(([valeur, libelle]) => el('option', { value: valeur }, libelle)));
const boutonGrille = el('button', { classe: 'bouton-icone', title: 'Vue en grille', onClick: () => actions.changerVue('grille') }, icone('grille'));
const boutonListe = el('button', { classe: 'bouton-icone', title: 'Vue en liste', onClick: () => actions.changerVue('liste') }, icone('liste'));
const contenu = el('div', { classe: 'contenu-bibliotheque' });

conteneur.append(
  el('header', { classe: 'barre-outils' },
    titre,
    // Filtre + tri regroupés : dans une zone étroite, ils passent ensemble à la ligne.
    el('div', { classe: 'groupe-filtre-tri' },
      el('label', { classe: 'champ-filtre' }, icone('recherche'), champFiltre),
      el('label', { classe: 'champ-tri', title: 'Trier les projets' }, icone('tri'), choixTri)),
    el('div', { classe: 'groupe-boutons' }, boutonGrille, boutonListe),
    el('button', { classe: 'bouton', title: 'Importer un projet existant (dossier du PC ou dépôt GitHub)', onClick: actions.ouvrirImport }, icone('importer'), el('span', { classe: 'texte-bouton' }, 'Importer')),
    el('button', { classe: 'bouton principal', title: 'Créer un nouvel outil avec Claude Code', onClick: actions.nouvelOutil }, icone('plus'), el('span', { classe: 'texte-bouton' }, 'Nouvel outil'))),
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
    case 'groupe': return groupes.chemin(filtre.valeur) || 'Groupe';
    default: return 'Tous les projets';
  }
}

function projetsVisibles({ projets, filtre, texteFiltre }) {
  const recherche = normaliser(texteFiltre.trim());
  const duGroupe = filtre.type === 'groupe' ? groupes.projetsDe(filtre.valeur) : null;
  return projets.filter((p) => {
    const f = p.fiche;
    if (duGroupe && !duGroupe.has(p.id)) return false;
    if (filtre.type === 'favoris' && !f.favori) return false;
    if (filtre.type === 'categorie' && f.categorie !== filtre.valeur) return false;
    if (filtre.type === 'tag' && !f.tags.includes(filtre.valeur)) return false;
    if (!recherche) return true;
    return normaliser([f.nom, f.description, f.categorie, ...f.tags].join(' ')).includes(recherche);
  });
}

// --- Tri et groupes --------------------------------------------------------------------------

const parNom = (a, b) => a.fiche.nom.localeCompare(b.fiche.nom, 'fr', { sensitivity: 'base' });
const ORDRE_TYPES = Object.keys(LIBELLES_TYPES);

function trier(projets, tri) {
  const liste = [...projets];
  if (tri === 'modification') return liste.sort((a, b) => (b.dateModification || 0) - (a.dateModification || 0) || parNom(a, b));
  if (tri === 'ajout') return liste.sort((a, b) => (b.dateAjout || 0) - (a.dateAjout || 0) || parNom(a, b));
  return liste.sort(parNom);
}

// Renvoie [{ titre, projets }] ; un seul groupe sans titre si le tri ne regroupe pas.
function grouper(projets, tri) {
  const tries = trier(projets, tri);
  if (tri !== 'type' && tri !== 'categorie') return [{ titre: null, projets: tries }];
  const groupes = new Map();
  for (const p of tries) {
    const cle = tri === 'type' ? p.fiche.type : p.fiche.categorie;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(p);
  }
  const cles = [...groupes.keys()].sort((a, b) => (tri === 'type'
    ? ORDRE_TYPES.indexOf(a) - ORDRE_TYPES.indexOf(b)
    : a.localeCompare(b, 'fr', { sensitivity: 'base' })));
  return cles.map((cle) => ({ titre: tri === 'type' ? LIBELLES_TYPES[cle] : cle, projets: groupes.get(cle) }));
}

// --- Éléments ---------------------------------------------------------------------------------

function marques(projet) {
  const aProbleme = projet.erreur || projet.problemes.length > 0;
  return [
    actions.estEpingle(projet.id) ? el('span', { classe: 'marque-epingle', title: 'Épinglé dans la barre latérale' }, icone('epingle')) : null,
    projet.fiche.favori ? el('span', { classe: 'marque-favori', title: 'Favori' }, icone('etoile')) : null,
    aProbleme ? el('span', { classe: 'marque-erreur', title: 'La fiche projet.json a un problème' }, icone('attention')) : null,
  ];
}

function menuContextuel(projet) {
  return (e) => {
    e.preventDefault();
    actions.selectionner(projet.id);
    ouvrirMenu({ x: e.clientX, y: e.clientY }, actions.elementsMenuProjet(projet, { x: e.clientX, y: e.clientY }));
  };
}

function carte(projet, selection) {
  return el('div', {
    classe: `carte${projet.id === selection ? ' selectionne' : ''}`,
    title: projet.fiche.description || projet.fiche.nom,
    onClick: () => actions.selectionner(projet.id),
    onDblclick: () => actions.ouvrirProjet(projet),
    onContextmenu: menuContextuel(projet),
    // Glisser sur un groupe de la barre latérale pour l'y ajouter.
    ...groupes.glissable({ type: 'projet', id: projet.id }),
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
    onDblclick: () => actions.ouvrirProjet(projet),
    onContextmenu: menuContextuel(projet),
    ...groupes.glissable({ type: 'projet', id: projet.id }),
  },
  iconeProjet(projet, 32),
  el('div', { classe: 'ligne-texte' },
    el('div', { classe: 'ligne-nom' }, f.nom, marques(projet)),
    el('div', { classe: 'ligne-description' }, f.description || '—')),
  el('div', { classe: 'ligne-colonne' }, f.categorie),
  el('div', { classe: 'ligne-colonne' }, LIBELLES_TYPES[f.type]),
  el('div', {
    classe: 'ligne-colonne ligne-date',
    title: projet.dateModification ? `Modifié le ${new Date(projet.dateModification).toLocaleString('fr-FR')}` : '',
  }, projet.dateModification ? ilYA(projet.dateModification) : '—'));
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
  if (etatCourant.filtre.type === 'groupe' && !etatCourant.texteFiltre) {
    return el('div', { classe: 'message-vide' },
      el('strong', {}, 'Ce groupe est vide'),
      'Glisse des projets sur le groupe dans la barre latérale, ou clic droit sur le groupe > « Choisir les projets… ».');
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
  choixTri.value = TRIS[e.tri] ? e.tri : 'nom';

  if (visibles.length === 0) {
    contenu.replaceChildren(messageVide(e));
    return;
  }
  const groupes = grouper(visibles, e.tri);
  contenu.replaceChildren(...groupes.map((g) => el('section', { classe: 'groupe-projets' },
    g.titre ? el('h2', { classe: 'titre-groupe' }, g.titre, el('span', {}, g.projets.length)) : null,
    e.vue === 'liste'
      ? el('div', { classe: 'liste' }, g.projets.map((p) => ligne(p, e.selection)))
      : el('div', { classe: 'grille' }, g.projets.map((p) => carte(p, e.selection))))));
}

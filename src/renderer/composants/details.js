// Panneau de droite : détails du projet sélectionné (ou de Toolkit lui-même).
import { el } from './dom.js';
import { icone } from './icones.js';
import { iconeProjet } from './icone-projet.js';
import { LIBELLES_TYPES } from './bibliotheque.js';
import * as etat from './etat.js';
import * as actions from './actions.js';
import { ouvrirMenu } from './menu.js';

const conteneur = document.getElementById('details');

const EDITEURS_FICHE = ['vscode', 'android-studio', 'notepad++', 'explorateur'];

const NOUVELLE_CATEGORIE = '\u0000nouvelle';

// Bouton d'une fonction qui arrive dans une phase suivante.
function bientot(libelle, nomIcone, phase, principal = false) {
  return el('button', {
    classe: `bouton${principal ? ' principal' : ''}`,
    disabled: true,
    title: `Disponible à l'étape ${phase} de la construction`,
  }, icone(nomIcone), libelle);
}

// Bouton qui affiche un menu ; elements() est appelé au clic pour avoir l'état à jour.
function boutonMenu(libelle, nomIcone, elements) {
  const bouton = el('button', { classe: 'bouton', onClick: () => ouvrirMenu(bouton, elements()) }, icone(nomIcone), libelle);
  return bouton;
}

function selecteurEditeur(projet) {
  const automatique = projet.fiche.type === 'android' ? 'android-studio' : 'vscode';
  const select = el('select', {
    classe: 'champ-select',
    disabled: Boolean(projet.erreur),
    title: 'Éditeur utilisé par le bouton « Ouvrir » (enregistré dans projet.json)',
    onChange: () => actions.changerEditeurParDefaut(projet, select.value),
  },
  el('option', { value: '' }, `Automatique (${actions.nomEditeur(automatique)})`),
  EDITEURS_FICHE.map((id) => el('option', { value: id }, actions.nomEditeur(id))));
  select.value = projet.fiche.ouvrir_avec || '';
  return select;
}

function section(titre, ...contenu) {
  return el('section', { classe: 'details-section' }, el('h3', {}, titre), contenu);
}

function entete(visuel, nom, sousTitre, boutons) {
  return el('header', { classe: 'details-entete' },
    visuel,
    el('div', { classe: 'details-titre' }, el('h2', {}, nom), sousTitre),
    boutons,
    el('button', { classe: 'bouton-icone', title: 'Fermer (Échap)', onClick: () => actions.selectionner(null) }, icone('croix')));
}

function alertes(projet) {
  const liste = [];
  if (projet.erreur) {
    liste.push(el('div', { classe: 'alerte erreur' }, icone('erreur'),
      el('div', {}, projet.erreur, el('br'), 'Ouvre le fichier projet.json de ce projet pour le corriger.')));
  }
  if (projet.problemes.length > 0) {
    liste.push(el('div', { classe: 'alerte attention' }, icone('attention'),
      el('div', {}, 'La fiche projet.json a quelques problèmes :',
        el('ul', {}, projet.problemes.map((p) => el('li', {}, p))))));
  }
  return liste;
}

function selecteurCategorie(projet) {
  const categories = actions.listeCategories().map(([nom]) => nom);
  if (!categories.includes(projet.fiche.categorie)) categories.push(projet.fiche.categorie);
  if (!categories.includes('Sans catégorie')) categories.push('Sans catégorie');
  categories.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

  const select = el('select', {
    classe: 'champ-select',
    disabled: Boolean(projet.erreur),
    onChange: () => {
      if (select.value === NOUVELLE_CATEGORIE) {
        select.value = projet.fiche.categorie;
        actions.nouvelleCategorie(projet);
      } else {
        actions.changerCategorie(projet, select.value);
      }
    },
  },
  categories.map((c) => el('option', { value: c }, c)),
  el('option', { value: NOUVELLE_CATEGORIE }, 'Nouvelle catégorie…'));
  select.value = projet.fiche.categorie;
  return select;
}

function tags(projet) {
  const modifiable = !projet.erreur;
  return el('div', { classe: 'liste-etiquettes' },
    projet.fiche.tags.map((t) => el('span', { classe: 'etiquette' }, t,
      modifiable
        ? el('button', { title: `Retirer le tag « ${t} »`, onClick: () => actions.retirerTag(projet, t) }, icone('croix'))
        : null)),
    modifiable
      ? el('button', { classe: 'etiquette', onClick: () => actions.ajouterTag(projet) }, icone('plus'), 'Ajouter')
      : null);
}

function rendreProjet(projet) {
  const f = projet.fiche;
  const boutonFavori = el('button', {
    classe: `bouton-icone${f.favori ? ' favori' : ''}`,
    title: f.favori ? 'Retirer des favoris' : 'Ajouter aux favoris',
    disabled: Boolean(projet.erreur),
    onClick: () => actions.basculerFavori(projet),
  }, icone('etoile'));

  return [
    entete(iconeProjet(projet, 48), f.nom,
      el('span', { classe: 'etiquette type' }, LIBELLES_TYPES[f.type]),
      boutonFavori),
    el('div', { classe: 'details-corps' },
      alertes(projet),
      el('p', { classe: `details-description${f.description ? '' : ' vide'}` }, f.description || 'Aucune description.'),
      el('div', { classe: 'details-boutons' },
        actions.estOuvrableCommeOutil(projet)
          ? el('button', { classe: 'bouton principal', title: 'Ouvrir l\'outil dans un onglet', onClick: () => actions.ouvrirOutil(projet.id) }, icone('lecture'), 'Ouvrir')
          : el('button', {
            classe: 'bouton principal',
            disabled: Boolean(projet.erreur),
            onClick: () => actions.ouvrirAvec(projet),
          }, icone('lecture'), `Ouvrir dans ${actions.nomEditeur(actions.editeurParDefaut(f))}`),
        boutonMenu('Ouvrir avec…', 'ouvrirAvec', () => actions.elementsMenuOuvrirAvec(projet)),
        bientot('Modifier avec Claude', 'claude', 4)),

      section('Actions',
        f.actions.length === 0
          ? el('p', { classe: 'details-aide' }, 'Aucune action. On peut en ajouter dans projet.json (champ « actions »).')
          : el('div', { classe: 'liste-actions' }, f.actions.map((a) => el('button', {
            classe: 'bouton',
            disabled: true,
            title: a.description || `Disponible à l'étape 5 de la construction`,
          }, icone('lecture'), a.nom)))),

      f.outils_lies.length > 0
        ? section('Outils liés',
          el('div', { classe: 'liste-actions' }, f.outils_lies.map((o) => el('button', {
            classe: 'bouton',
            disabled: Boolean(projet.erreur),
            title: o.description ? `${o.description}\n${o.point_entree}` : o.point_entree,
            onClick: () => actions.ouvrirOutil(projet.id, o.point_entree),
          }, icone('outil'), o.nom))))
        : null,

      section('Catégorie', selecteurCategorie(projet)),
      section('Éditeur par défaut', selecteurEditeur(projet)),
      section('Tags', tags(projet)),

      section('Informations',
        el('dl', { classe: 'infos' },
          el('dt', {}, 'Dossier'), el('dd', {}, el('code', {}, projet.dossier)),
          el('dt', {}, 'Point d\'entrée'), el('dd', {}, f.point_entree ? el('code', {}, f.point_entree) : '—'),
          el('dt', {}, 'GitHub'), el('dd', {}, f.git.remote || 'Aucun repo distant'))),

      section('Git', el('p', { classe: 'details-aide' }, 'L\'état Git s\'affichera ici (étape 7).'))),
  ];
}

function rendreToolkit(infos) {
  return [
    entete(el('img', { src: infos.icone, alt: '', width: 48, height: 48 }), 'Toolkit',
      el('span', { classe: 'etiquette type' }, `Version ${infos.version}`), null),
    el('div', { classe: 'details-corps' },
      el('p', { classe: 'details-description' }, infos.description),
      el('div', { classe: 'details-boutons' },
        bientot('Modifier Toolkit avec Claude', 'claude', 4, true),
        boutonMenu('Ouvrir avec…', 'ouvrirAvec', actions.elementsMenuOuvrirToolkit),
        el('button', { classe: 'bouton', onClick: actions.redemarrerToolkit }, icone('redemarrer'), 'Redémarrer Toolkit')),
      section('Informations',
        el('dl', { classe: 'infos' },
          el('dt', {}, 'Code'), el('dd', {}, el('code', {}, infos.dossier)),
          el('dt', {}, 'Projets'), el('dd', {}, el('code', {}, infos.dossierProjets)),
          el('dt', {}, 'Electron'), el('dd', {}, infos.electron))),
      section('Raccourcis',
        el('dl', { classe: 'infos' },
          el('dt', {}, 'Ctrl+F'), el('dd', {}, 'Filtrer les projets'),
          el('dt', {}, 'Échap'), el('dd', {}, 'Fermer ce panneau'),
          el('dt', {}, 'Double-clic'), el('dd', {}, 'Ouvrir un projet'),
          el('dt', {}, 'Ctrl+Tab'), el('dd', {}, 'Onglet suivant'),
          el('dt', {}, 'Ctrl+W'), el('dd', {}, 'Fermer l\'onglet de l\'outil'),
          el('dt', {}, 'F5'), el('dd', {}, 'Recharger l\'outil ou l\'interface'),
          el('dt', {}, 'F12'), el('dd', {}, 'Outils de développement')))),
  ];
}

export function rendre() {
  const e = etat.obtenir();
  // Le panneau n'accompagne que la bibliothèque : les outils prennent toute la largeur.
  if (e.ongletActif !== 'bibliotheque') {
    conteneur.hidden = true;
    return;
  }
  if (e.selection === etat.ID_TOOLKIT && e.infosApp) {
    conteneur.hidden = false;
    conteneur.replaceChildren(...rendreToolkit(e.infosApp));
    return;
  }
  const projet = etat.projetSelectionne();
  conteneur.hidden = !projet;
  if (projet) conteneur.replaceChildren(...rendreProjet(projet));
}

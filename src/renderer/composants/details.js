// Panneau de droite : détails du projet sélectionné (ou de Toolkit lui-même).
import { el } from './dom.js';
import { icone } from './icones.js';
import { iconeProjet } from './icone-projet.js';
import { LIBELLES_TYPES } from './bibliotheque.js';
import * as etat from './etat.js';
import * as actions from './actions.js';
import { ouvrirMenu } from './menu.js';
import * as actionsGit from './actions-git.js';
import { pastillesGit, boutonsGit, dernierCommit } from './git.js';
import * as groupes from './groupes.js';
import { afficherHistorique } from './historique.js';

// Notes d'un projet et rétroliens, gardés quelques secondes (le panneau se redessine souvent).
const cacheNotes = new Map();
const DUREE_CACHE_NOTES = 5000;

function contenuNotes(donnees, projetId) {
  return [
    donnees.notes.length
      ? el('div', { classe: 'liste-actions' }, donnees.notes.map((n) => el('button', {
        classe: 'bouton bouton-note',
        title: n.chemin,
        onClick: () => actions.ouvrirNote(n.chemin),
      }, icone('note'), el('span', {}, n.titre, el('small', {}, n.relatif)))))
      : el('p', { classe: 'details-aide' }, 'Aucune note (.md) dans ce projet.'),
    el('button', { classe: 'etiquette', onClick: () => actions.creerNote(projetId) }, icone('plus'), 'Nouvelle note'),
    donnees.retroliens.length
      ? el('div', { classe: 'retroliens-projet' },
        el('h4', {}, `Cité dans (${donnees.retroliens.length})`),
        donnees.retroliens.map((r) => el('a', { href: '#', onClick: (e) => { e.preventDefault(); actions.ouvrirNote(r.chemin); } },
          icone('note'), r.titre)))
      : null,
  ].filter(Boolean); // (replaceChildren / append écriraient « null » pour un élément absent)
}

// Section « Notes » : fichiers .md du projet (projetId null = Toolkit) et notes qui le citent.
function sectionNotes(projetId) {
  const cle = projetId || '__toolkit__';
  const conteneur = el('div', { classe: 'notes-projet' });
  const cache = cacheNotes.get(cle);
  if (cache?.donnees) conteneur.append(...contenuNotes(cache.donnees, projetId));
  else conteneur.append(el('p', { classe: 'details-aide' }, 'Chargement…'));
  if (!cache || Date.now() - cache.temps > DUREE_CACHE_NOTES) {
    cacheNotes.set(cle, { donnees: cache?.donnees, temps: Date.now() });
    window.toolkit.notes.duProjet(projetId).then((donnees) => {
      cacheNotes.set(cle, { donnees, temps: Date.now() });
      if (conteneur.isConnected) conteneur.replaceChildren(...contenuNotes(donnees, projetId));
    }).catch(() => {});
  }
  return section('Notes', conteneur);
}

// Cibles dont l'état Git a déjà été demandé (pour ne le charger qu'une fois par affichage).
const gitDemande = new Set();

// Section « Git » : état du dépôt et boutons. L'état est chargé à la première ouverture,
// en différé (on ne modifie jamais l'état pendant un rendu).
function nomCible(cible) {
  return cible.type === 'toolkit' ? 'Toolkit' : etat.obtenir().projets.find((p) => p.id === cible.id)?.fiche.nom || cible.id;
}

function sectionGit(cible) {
  const e = actionsGit.etatDe(cible);
  const cle = actionsGit.cle(cible);
  if (!e && !gitDemande.has(cle)) {
    gitDemande.add(cle);
    queueMicrotask(() => actionsGit.rafraichir(cible));
  }
  return section('Git',
    el('div', { classe: 'liste-pastilles' }, pastillesGit(e)),
    dernierCommit(e),
    el('div', { classe: 'details-boutons boutons-git' }, boutonsGit(e),
      e?.estDepot && !e.aucunCommit
        ? el('button', { classe: 'bouton-icone', title: 'Historique des versions (revenir en arrière)', onClick: () => afficherHistorique(cible, e.nom || nomCible(cible)) }, icone('historique'))
        : null,
      el('button', { classe: 'bouton-icone', title: 'Ouvrir le panneau Git et GitHub', onClick: actions.ouvrirGit }, icone('git'))));
}
const conteneur = document.getElementById('details');

const EDITEURS_FICHE = ['toolkit', 'vscode', 'android-studio', 'notepad++', 'explorateur'];

const NOUVELLE_CATEGORIE = '\u0000nouvelle';

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
  EDITEURS_FICHE.map((id) => el('option', { value: id }, id === 'toolkit' ? 'Éditeur de Toolkit (onglet « Code »)' : actions.nomEditeur(id))));
  select.value = projet.fiche.ouvrir_avec || '';
  return select;
}

// Ce que fait le double-clic sur le projet (et le bouton principal) : projet.json > action_par_defaut.
function selecteurActionParDefaut(projet) {
  const select = el('select', {
    classe: 'champ-select',
    disabled: Boolean(projet.erreur),
    title: 'Ce que font le double-clic sur le projet et le bouton principal (enregistré dans projet.json)',
    onChange: () => actions.changerActionParDefaut(projet, select.value),
  }, actions.choixActionsParDefaut(projet).map((c) => el('option', { value: c.valeur }, c.libelle)));
  select.value = projet.fiche.action_par_defaut || '';
  return select;
}

// Bouton principal = l'action par défaut ; si elle a été changée, l'ouverture habituelle
// (outil ou éditeur) reste à côté.
function boutonsOuvrir(projet) {
  const [automatique] = actions.choixActionsParDefaut(projet);
  const defaut = actions.actionParDefaut(projet);
  const bloque = Boolean(projet.erreur);
  return [
    el('button', { classe: 'bouton principal', disabled: bloque, title: 'Action par défaut (aussi au double-clic sur le projet)', onClick: () => actions.ouvrirProjet(projet) },
      icone(defaut.icone), defaut.nomBouton || defaut.libelle),
    defaut.valeur === automatique.valeur ? null
      : el('button', { classe: 'bouton', disabled: bloque, onClick: automatique.lancer }, icone('lecture'), automatique.nomBouton),
  ];
}

// Boutons des actions de projet.json, chacun avec son menu (modifier, déplacer, supprimer…).
function listeActions(projet) {
  const f = projet.fiche;
  const bloque = Boolean(projet.erreur);
  return [
    f.actions.length === 0
      ? el('p', { classe: 'details-aide' }, 'Aucune action. Une action est un bouton qui lance une commande (script Python, Node…) dans le dossier du projet.')
      : el('div', { classe: 'liste-actions' }, f.actions.map((a, index) => {
        const parDefaut = f.action_par_defaut === `action:${a.nom}`;
        const menu = el('button', {
          classe: 'bouton-icone',
          disabled: bloque,
          title: 'Modifier, déplacer ou supprimer cette action',
          onClick: () => ouvrirMenu(menu, actions.elementsMenuAction(projet, index)),
        }, icone('points'));
        return el('div', { classe: 'ligne-action' },
          el('button', {
            classe: 'bouton',
            disabled: bloque,
            title: [a.description, a.commande, parDefaut ? '(action par défaut)' : ''].filter(Boolean).join('\n'),
            onClick: () => actions.lancerAction(projet, index),
          }, icone('lecture'), a.nom, parDefaut ? el('span', { classe: 'marque-defaut' }, 'par défaut') : null),
          menu);
      })),
    bloque ? null : el('div', { classe: 'details-boutons' },
      el('button', { classe: 'etiquette', onClick: () => actions.ajouterAction(projet) }, icone('plus'), 'Ajouter une action')),
  ];
}

function section(titre, ...contenu) {
  return el('section', { classe: 'details-section' }, el('h3', {}, titre), contenu);
}

// Les boutons (épingle, favori) sont sur la ligne du type, sous le nom : le nom garde ainsi
// toute la largeur, même quand le panneau est étroit.
// renommer : fonction appelée au clic sur le nom (null = nom non modifiable).
function entete(visuel, nom, sousTitre, boutons, renommer = null) {
  return el('header', { classe: 'details-entete' },
    visuel,
    el('div', { classe: 'details-titre' },
      renommer
        ? el('h2', { classe: 'modifiable', title: 'Cliquer pour renommer le projet', onClick: renommer },
          nom, el('span', { classe: 'crayon-titre' }, icone('crayon')))
        : el('h2', {}, nom),
      el('div', { classe: 'details-sous-titre' }, sousTitre, boutons)),
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

// Groupes de la barre latérale (pas dans projet.json : modifiable même si la fiche a un problème).
function listeGroupes(projet) {
  return el('div', { classe: 'liste-etiquettes' },
    groupes.groupesDuProjet(projet.id).map((g) => el('span', { classe: 'etiquette' },
      el('button', { classe: 'texte-etiquette', title: 'Afficher les projets de ce groupe', onClick: () => groupes.afficher(g.id) }, groupes.chemin(g.id)),
      el('button', { title: `Retirer du groupe « ${g.nom} »`, onClick: () => groupes.retirerProjet(g.id, projet.id) }, icone('croix')))),
    el('button', { classe: 'etiquette', onClick: () => groupes.choisirGroupesDuProjet(projet) }, icone('plus'), 'Ajouter'));
}

// Projets liés (directs, déclarés d'un côté ou de l'autre, puis indirects) : Claude en est
// informé par les CLAUDE.md (voir src/main/contexte-claude.js).
function projetsLies(projet) {
  const { projets } = etat.obtenir();
  const nom = (id) => projets.find((p) => p.id === id)?.fiche.nom || id;
  const { directs, indirects } = actions.liensDuProjet(projet);
  return el('div', { classe: 'liste-liens' },
    directs.length === 0 && indirects.length === 0
      ? el('p', { classe: 'details-aide' }, 'Aucun. Lier des projets permet à Claude de tenir compte des uns quand il modifie les autres.')
      : null,
    directs.map((d) => el('div', { classe: 'lien-projet' },
      el('div', { classe: 'lien-entete' },
        el('button', { classe: 'lien-nom', title: 'Afficher ce projet', onClick: () => actions.allerAuProjet(d.autre) }, icone('git'), nom(d.autre)),
        el('button', { classe: 'bouton-icone', title: 'Retirer ce lien', onClick: () => actions.retirerLien(d.declarePar, d.declarePar === projet.id ? d.autre : projet.id) }, icone('croix'))),
      el('p', { classe: 'lien-description' }, d.description || '(pas d\'explication)'))),
    indirects.length
      ? el('p', { classe: 'details-aide lien-indirects' }, 'Liés indirectement : ',
        indirects.map((i, n) => [n ? ', ' : '', el('button', { classe: 'lien-nom petit', title: `Via ${i.via.map(nom).join(' → ')}`, onClick: () => actions.allerAuProjet(i.id) }, nom(i.id))]))
      : null,
    el('div', { classe: 'details-boutons' },
      el('button', { classe: 'etiquette', onClick: () => actions.lierProjet(projet) }, icone('plus'), 'Lier à un projet'),
      el('button', { classe: 'etiquette', title: 'Ouvrir le CLAUDE.md de ce projet dans l\'éditeur', onClick: () => actions.ouvrirCode({ type: 'projet', id: projet.id }, projet.fiche.nom, 'CLAUDE.md') }, icone('note'), 'Voir le CLAUDE.md')));
}

function rendreProjet(projet) {
  const f = projet.fiche;
  const boutonFavori = el('button', {
    classe: `bouton-icone${f.favori ? ' favori' : ''}`,
    title: f.favori ? 'Retirer des favoris' : 'Ajouter aux favoris',
    disabled: Boolean(projet.erreur),
    onClick: () => actions.basculerFavori(projet),
  }, icone('etoile'));
  const epingle = actions.estEpingle(projet.id);
  const boutonEpingle = el('button', {
    classe: `bouton-icone${epingle ? ' epingle' : ''}`,
    title: epingle ? 'Désépingler de la barre latérale' : 'Épingler dans la barre latérale',
    onClick: () => actions.basculerEpingle(projet),
  }, icone('epingle'));

  // Icône cliquable : menu pour la changer.
  const boutonIcone = el('button', {
    classe: 'bouton-icone-projet',
    title: 'Changer l\'icône du projet',
    disabled: Boolean(projet.erreur),
    onClick: () => ouvrirMenu(boutonIcone, actions.elementsMenuIcone(projet)),
  }, iconeProjet(projet, 48), el('span', { classe: 'crayon-icone' }, icone('crayon')));

  return [
    entete(boutonIcone, f.nom,
      el('span', { classe: 'etiquette type' }, LIBELLES_TYPES[f.type]),
      [boutonEpingle, boutonFavori],
      projet.erreur ? null : () => actions.renommerProjet(projet)),
    el('div', { classe: 'details-corps' },
      alertes(projet),
      el('p', {
        classe: `details-description modifiable${f.description ? '' : ' vide'}`,
        title: projet.erreur ? '' : 'Cliquer pour modifier la description (Claude s\'en sert pour comprendre le rôle du projet)',
        onClick: () => { if (!projet.erreur) actions.modifierDescription(projet); },
      }, f.description || 'Aucune description : clique ici pour en écrire une.', projet.erreur ? null : el('span', { classe: 'crayon-description' }, icone('crayon'))),
      el('div', { classe: 'details-boutons' }, boutonsOuvrir(projet),
        boutonMenu('Ouvrir avec…', 'ouvrirAvec', () => actions.elementsMenuOuvrirAvec(projet)),
        el('button', {
          classe: 'bouton',
          title: 'Explorer les fichiers du projet et modifier le code dans Toolkit',
          onClick: () => actions.ouvrirCode({ type: 'projet', id: projet.id }, f.nom),
        }, icone('code'), 'Code'),
        el('button', {
          classe: 'bouton',
          disabled: Boolean(projet.erreur),
          title: 'Sauvegarde le projet avec Git puis ouvre Claude Code dans son dossier',
          onClick: () => actions.modifierAvecClaude(projet),
        }, icone('claude'), 'Modifier avec Claude')),

      section('Actions', listeActions(projet)),

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
      section('Action par défaut', selecteurActionParDefaut(projet)),
      section('Éditeur par défaut', selecteurEditeur(projet)),
      section('Tags', tags(projet)),
      section('Groupes', listeGroupes(projet)),
      section('Projets liés', projetsLies(projet)),

      section('Informations',
        el('dl', { classe: 'infos' },
          el('dt', {}, 'Dossier'), el('dd', {}, el('code', {
            classe: 'dossier-modifiable',
            title: 'Cliquer pour renommer le dossier (liens, groupes et conversations de Claude suivent)',
            onClick: () => actions.renommerDossier(projet),
          }, projet.dossier, el('span', { classe: 'crayon-titre' }, icone('crayon')))),
          el('dt', {}, 'Point d\'entrée'), el('dd', {}, f.point_entree ? el('code', {}, f.point_entree) : '—'),
          el('dt', {}, 'GitHub'), el('dd', {}, f.git.remote || 'Aucun repo distant'))),

      sectionNotes(projet.id),
      sectionGit({ type: 'projet', id: projet.id }),
      el('div', { classe: 'zone-danger' },
        el('button', { classe: 'bouton petit danger', title: 'Envoie le dossier du projet à la Corbeille de Windows (après confirmation)', onClick: () => actions.supprimerProjet(projet) },
          icone('effacer'), 'Supprimer ce projet…'))),
  ];
}

function rendreToolkit(infos) {
  return [
    entete(el('img', { src: infos.icone, alt: '', width: 48, height: 48 }), 'Toolkit',
      el('span', { classe: 'etiquette type' }, `Version ${infos.version}`), null),
    el('div', { classe: 'details-corps' },
      el('p', { classe: 'details-description' }, infos.description),
      el('div', { classe: 'details-boutons' },
        el('button', {
          classe: 'bouton principal',
          title: 'Sauvegarde le code de Toolkit avec Git puis ouvre Claude Code dans le dossier app',
          onClick: actions.modifierToolkitAvecClaude,
        }, icone('claude'), 'Modifier Toolkit avec Claude'),
        boutonMenu('Ouvrir avec…', 'ouvrirAvec', actions.elementsMenuOuvrirToolkit),
        el('button', { classe: 'bouton', title: 'Explorer et modifier le code de Toolkit', onClick: () => actions.ouvrirCode({ type: 'toolkit' }, 'Toolkit') }, icone('code'), 'Code'),
        el('button', { classe: 'bouton', onClick: actions.redemarrerToolkit }, icone('redemarrer'), 'Redémarrer Toolkit'),
        el('button', { classe: 'bouton', title: 'Les nouveautés de chaque version de Toolkit', onClick: actions.afficherNotesDeVersion }, icone('note'), 'Notes de version')),
      section('Informations',
        el('dl', { classe: 'infos' },
          el('dt', {}, 'Code'), el('dd', {}, el('code', {}, infos.dossier)),
          el('dt', {}, 'Projets'), el('dd', {}, el('code', {}, infos.dossierProjets)),
          el('dt', {}, 'Electron'), el('dd', {}, infos.electron))),
      sectionNotes(null),
      sectionGit({ type: 'toolkit' }),
      section('Raccourcis',
        el('dl', { classe: 'infos' },
          el('dt', {}, 'Ctrl+K'), el('dd', {}, 'Rechercher dans les projets et les notes'),
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

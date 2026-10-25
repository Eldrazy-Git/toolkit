// Barre latérale : récents, tous les projets, favoris, projets épinglés, groupes, catégories, tags et l'entrée « Toolkit ».
import { el } from './dom.js';
import { icone } from './icones.js';
import { couleurCategorie, iconeProjet } from './icone-projet.js';
import { ouvrirMenu } from './menu.js';
import * as etat from './etat.js';
import * as actions from './actions.js';
import { ouvrirRecherche } from './recherche.js';
import * as groupes from './groupes.js';
import * as recents from './recents.js';

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
      onDblclick: () => actions.ouvrirProjet(projet),
      onKeydown: (e) => { if (e.key === 'Enter') actions.allerAuProjet(projet.id); },
      onContextmenu: menuProjet(projet),
      ...groupes.glissable({ type: 'projet', id: projet.id }),
    },
    iconeProjet(projet, 18),
    el('span', { classe: 'libelle' }, projet.fiche.nom),
    el('button', {
      classe: 'bouton-icone',
      title: 'Désépingler',
      onClick: (e) => { e.stopPropagation(); actions.basculerEpingle(projet); },
    }, icone('croix'))));
}

function menuProjet(projet) {
  return (e) => {
    e.preventDefault();
    ouvrirMenu({ x: e.clientX, y: e.clientY }, actions.elementsMenuProjet(projet, { x: e.clientX, y: e.clientY }));
  };
}

// --- Groupes ------------------------------------------------------------------------------------
// Arbre dépliable (voir groupes.js). Clic sur un groupe = ses projets (sous-groupes compris)
// dans la bibliothèque ; flèche = déplier/replier ; clic droit ou ⋯ = menu.

function ligneGroupe(groupe, niveau, filtre) {
  const actif = filtre.type === 'groupe' && filtre.valeur === groupe.id;
  const menu = (position) => ouvrirMenu(position, groupes.elementsMenu(groupe, position));
  return el('div', {
    classe: `element-nav element-groupe${actif ? ' actif' : ''}`,
    style: { '--niveau': niveau },
    role: 'button',
    tabindex: '0',
    title: groupes.chemin(groupe.id),
    onClick: () => groupes.afficher(groupe.id),
    onKeydown: (e) => {
      if (e.key === 'Enter') groupes.afficher(groupe.id);
      if ((e.key === 'ArrowRight' && groupe.replie) || (e.key === 'ArrowLeft' && !groupe.replie)) groupes.basculerRepli(groupe.id);
    },
    onContextmenu: (e) => {
      e.preventDefault();
      menu({ x: e.clientX, y: e.clientY });
    },
    ...groupes.glissable({ type: 'groupe', id: groupe.id }),
    ...groupes.deposable(groupe.id),
  },
  el('button', {
    classe: `bouton-replier${groupe.replie ? '' : ' ouvert'}`,
    title: groupe.replie ? 'Déplier' : 'Replier',
    onClick: (e) => { e.stopPropagation(); groupes.basculerRepli(groupe.id); },
  }, icone('chevron')),
  icone('dossier'),
  el('span', { classe: 'libelle' }, groupe.nom),
  el('span', { classe: 'compteur' }, groupes.projetsDe(groupe.id).size),
  el('button', {
    classe: 'bouton-icone',
    title: 'Menu du groupe',
    onClick: (e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      menu({ x: r.left, y: r.bottom });
    },
  }, icone('points')));
}

function ligneProjetGroupe(projet, groupe, niveau, actif) {
  return el('div', {
    classe: `element-nav element-projet-groupe${actif ? ' actif' : ''}`,
    style: { '--niveau': niveau },
    role: 'button',
    tabindex: '0',
    title: projet.fiche.description || projet.fiche.nom,
    onClick: () => {
      groupes.afficher(groupe.id);
      actions.selectionner(projet.id);
    },
    onDblclick: () => actions.ouvrirProjet(projet),
    onKeydown: (e) => { if (e.key === 'Enter') actions.ouvrirProjet(projet); },
    onContextmenu: menuProjet(projet),
    ...groupes.glissable({ type: 'projet', id: projet.id, depuis: groupe.id }),
  },
  iconeProjet(projet, 18),
  el('span', { classe: 'libelle' }, projet.fiche.nom),
  el('button', {
    classe: 'bouton-icone',
    title: `Retirer du groupe « ${groupe.nom} » (le projet n'est pas supprimé)`,
    onClick: (e) => { e.stopPropagation(); groupes.retirerProjet(groupe.id, projet.id); },
  }, icone('croix')));
}

function sectionGroupes(projets, filtre, selection, ongletActif) {
  const parId = new Map(projets.map((p) => [p.id, p]));
  const parNom = (a, b) => a.fiche.nom.localeCompare(b.fiche.nom, 'fr', { sensitivity: 'base' });
  const lignes = [];
  const parcourir = (parent, niveau) => {
    for (const g of groupes.enfants(parent)) {
      lignes.push(ligneGroupe(g, niveau, filtre));
      if (g.replie) continue;
      parcourir(g.id, niveau + 1);
      const actifIci = ongletActif === 'bibliotheque' && filtre.type === 'groupe' && filtre.valeur === g.id;
      g.projets.map((id) => parId.get(id)).filter(Boolean).sort(parNom)
        .forEach((p) => lignes.push(ligneProjetGroupe(p, g, niveau + 1, actifIci && selection === p.id)));
    }
  };
  parcourir(null, 0);
  return [
    // Déposer un groupe sur ce titre le remet au premier niveau.
    el('div', { classe: 'barre-section avec-bouton', ...groupes.deposable(null) },
      el('span', {}, 'Groupes'),
      el('button', { classe: 'bouton-icone', title: 'Nouveau groupe', onClick: () => groupes.creer() }, icone('nouveauDossier'))),
    lignes.length
      ? lignes
      : elementNav({ libelle: 'Créer un groupe…', visuel: icone('nouveauDossier'), auClic: () => groupes.creer() }),
  ];
}

// --- Récents ------------------------------------------------------------------------------------
// Dernières ouvertures (voir recents.js) : un clic rouvre de la même façon.
// 5 visibles, « Plus… » pour les 15 ; section repliable (choix gardé dans ce navigateur).

const RECENTS_VISIBLES = 5;
let recentsTous = false;
let recentsReplies = false;
try { recentsReplies = localStorage.getItem('toolkit:recents:replies') === '1'; } catch { /* par défaut : déplié */ }

function descriptionRecent(e) {
  switch (e.type) {
    case 'outil': return { detail: 'outil', titre: `Rouvrir l'outil « ${e.nom} »` };
    case 'editeur': return { detail: e.detail || 'éditeur', titre: `Rouvrir « ${e.nom} » dans ${e.detail || 'son éditeur'}` };
    case 'fichier': return { detail: e.detail || '', titre: `Rouvrir ${e.chemin} (${e.detail}) dans l'éditeur de Toolkit` };
    case 'note': return { detail: 'note', titre: `Rouvrir la note ${e.chemin}` };
    case 'claude': return { detail: 'Claude', titre: `Reprendre la conversation avec Claude sur « ${e.nom} » (sauvegarde Git avant)` };
    default: return { detail: '', titre: e.nom };
  }
}

function rouvrir(e, projets) {
  const projet = projets.find((p) => p.id === e.projetId);
  if (e.type === 'outil') actions.ouvrirOutil(e.projetId, e.outilLie || null);
  else if (e.type === 'editeur' && projet) actions.ouvrirAvec(projet, e.editeurId || undefined);
  else if (e.type === 'fichier') actions.ouvrirCode(e.cible, e.detail || e.nom, e.chemin);
  else if (e.type === 'note') actions.ouvrirNote(e.chemin);
  else if (e.type === 'claude') actions.reprendreClaude(e.cible, e.nom);
}

function visuelRecent(e, projets) {
  const projet = projets.find((p) => p.id === (e.projetId || (e.cible?.type === 'projet' ? e.cible.id : null)));
  if (e.type === 'outil' && projet && !e.outilLie) return iconeProjet(projet, 18);
  return icone({ outil: 'outil', editeur: 'ouvrirAvec', fichier: 'code', note: 'note', claude: 'claude' }[e.type]);
}

function sectionRecents(projets) {
  const liste = recents.liste();
  if (liste.length === 0) return null;
  const visibles = recentsTous ? liste : liste.slice(0, RECENTS_VISIBLES);
  return [
    el('div', {
      classe: 'barre-section avec-bouton titre-repliable',
      title: recentsReplies ? 'Afficher les récents' : 'Masquer les récents',
      onClick: () => {
        recentsReplies = !recentsReplies;
        try { localStorage.setItem('toolkit:recents:replies', recentsReplies ? '1' : '0'); } catch { /* sans importance */ }
        rendre();
      },
    },
    el('span', {}, el('span', { classe: `bouton-replier${recentsReplies ? '' : ' ouvert'}` }, icone('chevron')), 'Récents')),
    recentsReplies ? null : visibles.map((e) => {
      const { detail, titre } = descriptionRecent(e);
      return el('div', {
        classe: 'element-nav element-recent',
        role: 'button',
        tabindex: '0',
        title: titre,
        onClick: () => rouvrir(e, projets),
        onKeydown: (k) => { if (k.key === 'Enter') rouvrir(e, projets); },
        onContextmenu: (k) => {
          k.preventDefault();
          ouvrirMenu({ x: k.clientX, y: k.clientY }, [
            { libelle: 'Rouvrir', icone: 'lecture', action: () => rouvrir(e, projets) },
            { libelle: 'Retirer de la liste', icone: 'croix', action: () => recents.retirer(e) },
            'separateur',
            { libelle: 'Vider la liste des récents', icone: 'effacer', action: recents.vider },
          ]);
        },
      },
      visuelRecent(e, projets),
      el('span', { classe: 'libelle' }, e.nom, detail ? el('span', { classe: 'detail-recent' }, detail) : null),
      el('button', {
        classe: 'bouton-icone',
        title: 'Retirer de la liste',
        onClick: (k) => { k.stopPropagation(); recents.retirer(e); },
      }, icone('croix')));
    }),
    !recentsReplies && liste.length > RECENTS_VISIBLES
      ? el('button', { classe: 'lien-plus', onClick: () => { recentsTous = !recentsTous; rendre(); } },
        recentsTous ? 'Moins' : `Plus… (${liste.length - RECENTS_VISIBLES})`)
      : null,
  ];
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
      sectionRecents(projets),
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

      sectionGroupes(projets, filtre, selection, ongletActif),

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

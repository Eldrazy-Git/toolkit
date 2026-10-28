// Onglet « Git et GitHub » : état de Toolkit et de chaque projet, Commit / Push / Pull,
// « Tout commit », « Tout envoyer », création de dépôts GitHub privés.
// pastillesGit() et boutonsGit() servent aussi au panneau de détails.
import { el, ilYA } from './dom.js';
import { icone } from './icones.js';
import { ouvrirMenu } from './menu.js';
import { notifier } from './notifications.js';
import * as etat from './etat.js';
import * as git from './actions-git.js';
import { afficherModifications, afficherCommits } from './details-git.js';
import { afficherHistorique } from './historique.js';

export const ID_GIT = 'git';

const panneau = el('section', { id: 'git', classe: 'panneau panneau-reglages inactif' });
document.getElementById('zone-contenu').append(panneau);

export function element() {
  return panneau;
}

// action : si présente, la pastille est cliquable (ouvre le détail).
function pastille(texte, classe, titre, action) {
  if (!action) return el('span', { classe: `pastille-git ${classe}`, title: titre }, texte);
  return el('button', { classe: `pastille-git ${classe} cliquable`, title: `${titre}\nClique pour voir le détail.`, onClick: action },
    texte, icone('recherche'));
}

// Pastilles décrivant l'état d'un dépôt.
export function pastillesGit(e) {
  if (!e) return [pastille('Chargement…', 'neutre')];
  if (e.erreur) return [pastille('Erreur', 'rouge', e.erreur)];
  if (!e.estDepot) return [pastille('Pas d\'historique Git', 'neutre', 'Active Git pour pouvoir revenir en arrière et envoyer le projet sur GitHub.')];
  const liste = [];
  if (e.secretsSuivis?.length) liste.push(pastille('Fichiers sensibles dans Git', 'rouge', `Enregistrés dans l'historique : ${e.secretsSuivis.join(', ')}. Ne rends jamais ce dépôt public.`));
  if (e.secretsNonProteges?.length) liste.push(pastille('Fichiers sensibles non protégés', 'orange', `${e.secretsNonProteges.join(', ')} : clique sur « Protéger les fichiers sensibles » (menu ⋯).`));
  if (e.aucunCommit) liste.push(pastille('Aucun commit', 'neutre'));
  if (e.nbModifications > 0) {
    liste.push(pastille(`${e.nbModifications} modification(s) non enregistrée(s)`, 'jaune',
      'Fichiers modifiés depuis le dernier commit. Clique sur « Commit » pour enregistrer une version.',
      () => afficherModifications(e.cible)));
  }
  if (!e.remote) liste.push(pastille('Pas sur GitHub', 'neutre', 'Ce projet n\'est relié à aucun dépôt en ligne (menu ⋯ : créer son dépôt, ou l\'envoyer dans un dépôt partagé).'));
  else if (!e.aucunCommit && !e.amont) {
    liste.push(pastille('Jamais envoyé', 'bleu', 'Cette branche n\'a encore jamais été envoyée sur GitHub.', () => afficherCommits(e.cible, 'envoyer')));
  } else {
    if (e.enAvance > 0) {
      liste.push(pastille(`${e.enAvance} commit(s) à envoyer`, 'bleu', 'Commits faits sur ce PC (par toi ou par Claude) pas encore envoyés sur GitHub.',
        () => afficherCommits(e.cible, 'envoyer')));
    }
    if (e.enRetard > 0) {
      liste.push(pastille(`${e.enRetard} commit(s) à récupérer`, 'violet', 'GitHub contient des changements absents de ce PC : clique sur « Pull ».',
        () => afficherCommits(e.cible, 'recuperer')));
    }
  }
  if (liste.length === 0) liste.push(pastille('À jour', 'vert', e.remote ? 'Tout est enregistré et envoyé (selon la dernière vérification).' : 'Tout est enregistré.'));
  if (e.partage) {
    const depot = e.partage.remote.replace(/\.git$/i, '').split('/').pop();
    liste.unshift(pastille(`Dépôt partagé ${depot} / ${e.partage.dossier}`, 'neutre', 'Ce projet est envoyé dans un dossier d\'un dépôt GitHub commun à plusieurs projets.'));
  }
  return liste;
}

function elementsMenu(e) {
  return [
    !e.estDepot ? { libelle: 'Activer l\'historique Git', icone: 'git', action: () => git.initialiser(e.cible) } : null,
    e.estDepot && !e.remote ? { libelle: 'Créer un dépôt GitHub privé…', icone: 'plus', action: () => git.creerGithub(e.cible) } : null,
    e.estDepot && !e.remote && e.cible.type === 'projet'
      ? { libelle: 'Envoyer dans un dépôt GitHub partagé…', icone: 'dossier', infobulle: 'Un seul dépôt pour plusieurs petits projets (un dossier chacun)', action: () => git.rejoindrePartage(e.cible) }
      : null,
    e.partage ? { libelle: 'Ne plus utiliser le dépôt partagé…', icone: 'croix', action: () => git.quitterPartage(e.cible) } : null,
    e.estDepot && !e.aucunCommit ? { libelle: 'Historique des versions…', icone: 'historique', action: () => afficherHistorique(e.cible, e.nom) } : null,
    e.urlWeb ? { libelle: 'Ouvrir sur GitHub', icone: 'ouvrirAvec', action: () => git.ouvrirGithub(e.cible) } : null,
    e.estDepot ? { libelle: 'Protéger les fichiers sensibles', icone: 'coche', detail: '.gitignore', action: () => git.proteger(e.cible) } : null,
    { libelle: 'Actualiser', icone: 'redemarrer', action: () => git.rafraichir(e.cible) },
  ].filter(Boolean);
}

// Boutons Commit / Push / Pull (+ menu ⋯) pour un dépôt.
export function boutonsGit(e) {
  if (!e || e.erreur) return [];
  const occupe = etat.obtenir().gitOccupe[git.cle(e.cible)];
  if (occupe) return [el('span', { classe: 'statut ok' }, `● ${occupe}`)];
  const menu = el('button', { classe: 'bouton-icone', title: 'Autres actions', onClick: () => ouvrirMenu(menu, elementsMenu(e)) }, '⋯');
  if (!e.estDepot) {
    return [el('button', { classe: 'bouton petit', onClick: () => git.initialiser(e.cible) }, icone('git'), 'Activer Git'), menu];
  }
  return [
    el('button', { classe: 'bouton petit', disabled: e.nbModifications === 0, title: 'Enregistrer une version dans l\'historique (sur ce PC)', onClick: () => git.commit(e.cible) }, icone('coche'), 'Commit'),
    el('button', { classe: 'bouton petit', disabled: !git.peutEnvoyer(e), title: e.remote ? 'Envoyer les commits sur GitHub' : 'Pas de dépôt GitHub : menu ⋯ > Créer un dépôt GitHub privé', onClick: () => git.pousser(e.cible) }, icone('exporter'), 'Push'),
    el('button', { classe: 'bouton petit', disabled: !e.remote, title: 'Récupérer les changements depuis GitHub', onClick: () => git.recuperer(e.cible) }, icone('importer'), 'Pull'),
    menu,
  ];
}

export function dernierCommit(e) {
  if (!e?.dernierCommit) return null;
  return el('span', { classe: 'dernier-commit', title: `${e.dernierCommit.hash} — ${new Date(e.dernierCommit.date).toLocaleString('fr-FR')}` },
    `Dernier commit ${ilYA(e.dernierCommit.date)} : ${e.dernierCommit.message}`);
}

function ligne(e) {
  return el('div', { classe: 'ligne-git' },
    el('div', { classe: 'ligne-git-infos' },
      el('div', { classe: 'ligne-git-nom' },
        el('strong', {}, e.nom),
        e.branche && e.branche !== 'main' && e.branche !== 'master' ? el('span', { classe: 'etiquette' }, e.branche) : null),
      el('div', { classe: 'liste-pastilles' }, pastillesGit(e)),
      dernierCommit(e)),
    el('div', { classe: 'ligne-git-boutons' }, boutonsGit(e)));
}

// Page « Repositories » du compte connecté (gh renvoie son identifiant : lettres, chiffres, tirets).
function ouvrirMesDepots() {
  const { github } = etat.obtenir();
  if (!github?.compte) return;
  window.toolkit.liens.ouvrirExterne(`https://github.com/${encodeURIComponent(github.compte)}?tab=repositories`)
    .catch(() => notifier('Impossible d\'ouvrir le navigateur.', 'erreur'));
}

function enteteGithub() {
  const { github } = etat.obtenir();
  if (!github) return el('p', { classe: 'details-aide' }, 'Vérification de la connexion à GitHub…');
  if (github.connecte) {
    return el('div', { classe: 'compte-github' },
      el('p', { classe: 'statut ok' }, icone('coche'), `Connecté à GitHub : ${github.compte}`),
      el('button', { classe: 'bouton petit', title: 'Ouvre la liste de tes dépôts sur github.com dans le navigateur', onClick: ouvrirMesDepots },
        icone('dossier'), 'Mes dépôts sur GitHub'));
  }
  return el('div', { classe: 'alerte risque-attention' }, icone('attention'),
    el('div', {},
      el('strong', {}, github.installe ? 'Tu n\'es pas connecté à GitHub' : 'GitHub CLI (gh) n\'est pas installé'),
      el('p', {}, 'Commit fonctionne sans GitHub. Pour Push, Pull et créer des dépôts, il faut connecter GitHub.'),
      el('button', { classe: 'bouton petit', onClick: git.aideGithub }, 'Comment faire ?')));
}

export function rendre() {
  const { gitOuvert, git: etats, gitOrdre = [], gitChargement, gitVerification } = etat.obtenir();
  if (!gitOuvert) return;
  const depots = gitOrdre.map((c) => etats[c]).filter(Boolean);
  const nbAEnvoyer = depots.filter(git.peutEnvoyer).length;
  const nbACommiter = depots.filter(git.peutCommiter).length;
  panneau.replaceChildren(el('div', { classe: 'page-reglages page-git' },
    el('div', { classe: 'entete-git' },
      el('h1', {}, 'Git et GitHub'),
      el('div', { classe: 'details-boutons' },
        el('button', { classe: 'bouton', disabled: gitChargement, onClick: git.chargerTout }, icone('redemarrer'), gitChargement ? 'Chargement…' : 'Actualiser'),
        el('button', { classe: 'bouton', disabled: gitVerification, title: 'Interroge GitHub pour savoir s\'il y a des changements à récupérer', onClick: git.verifierEnLigne }, icone('recherche'), gitVerification ? 'Vérification…' : 'Vérifier en ligne'),
        el('button', { classe: 'bouton', disabled: nbACommiter === 0, title: 'Enregistrer une version de chaque projet modifié (sur ce PC)', onClick: git.toutCommiter }, icone('coche'), `Tout commit${nbACommiter ? ` (${nbACommiter})` : ''}`),
        el('button', { classe: 'bouton principal', disabled: nbAEnvoyer === 0, onClick: git.toutPousser }, icone('exporter'), `Tout envoyer${nbAEnvoyer ? ` (${nbAEnvoyer})` : ''}`))),
    enteteGithub(),
    el('p', { classe: 'details-aide legende-git' },
      el('strong', {}, 'Commit'), ' = enregistrer une version sur ce PC. ',
      el('strong', {}, 'Push'), ' = envoyer les versions sur GitHub. ',
      el('strong', {}, 'Pull'), ' = récupérer les versions depuis GitHub.'),
    depots.length === 0 && gitChargement ? el('p', { classe: 'details-aide' }, 'Lecture de l\'état des projets…') : null,
    el('div', { classe: 'liste-git' }, depots.map(ligne))));
}

// Onglet « Git et GitHub » : état de Toolkit et de chaque projet, Commit / Push / Pull,
// « Tout envoyer », création de dépôts GitHub privés.
// pastillesGit() et boutonsGit() servent aussi au panneau de détails.
import { el, ilYA } from './dom.js';
import { icone } from './icones.js';
import { ouvrirMenu } from './menu.js';
import * as etat from './etat.js';
import * as git from './actions-git.js';

export const ID_GIT = 'git';

const panneau = el('section', { id: 'git', classe: 'panneau panneau-reglages inactif' });
document.getElementById('zone-contenu').append(panneau);

export function element() {
  return panneau;
}

function pastille(texte, classe, titre) {
  return el('span', { classe: `pastille-git ${classe}`, title: titre }, texte);
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
  if (e.nbModifications > 0) liste.push(pastille(`${e.nbModifications} modification(s) non enregistrée(s)`, 'jaune', 'Fichiers modifiés depuis le dernier commit. Clique sur « Commit » pour enregistrer une version.'));
  if (!e.remote) liste.push(pastille('Pas sur GitHub', 'neutre', 'Ce projet n\'est relié à aucun dépôt en ligne.'));
  else if (!e.aucunCommit && !e.amont) liste.push(pastille('Jamais envoyé', 'bleu', 'Cette branche n\'a encore jamais été envoyée sur GitHub.'));
  else {
    if (e.enAvance > 0) liste.push(pastille(`${e.enAvance} commit(s) à envoyer`, 'bleu', 'Commits faits sur ce PC (par toi ou par Claude) pas encore envoyés sur GitHub.'));
    if (e.enRetard > 0) liste.push(pastille(`${e.enRetard} commit(s) à récupérer`, 'violet', 'GitHub contient des changements absents de ce PC : clique sur « Pull ».'));
  }
  if (liste.length === 0) liste.push(pastille('À jour', 'vert', e.remote ? 'Tout est enregistré et envoyé (selon la dernière vérification).' : 'Tout est enregistré.'));
  return liste;
}

function elementsMenu(e) {
  return [
    !e.estDepot ? { libelle: 'Activer l\'historique Git', icone: 'git', action: () => git.initialiser(e.cible) } : null,
    e.estDepot && !e.remote ? { libelle: 'Créer un dépôt GitHub privé…', icone: 'plus', action: () => git.creerGithub(e.cible) } : null,
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

function enteteGithub() {
  const { github } = etat.obtenir();
  if (!github) return el('p', { classe: 'details-aide' }, 'Vérification de la connexion à GitHub…');
  if (github.connecte) {
    return el('p', { classe: 'statut ok' }, icone('coche'), `Connecté à GitHub : ${github.compte}`);
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
  panneau.replaceChildren(el('div', { classe: 'page-reglages page-git' },
    el('div', { classe: 'entete-git' },
      el('h1', {}, 'Git et GitHub'),
      el('div', { classe: 'details-boutons' },
        el('button', { classe: 'bouton', disabled: gitChargement, onClick: git.chargerTout }, icone('redemarrer'), gitChargement ? 'Chargement…' : 'Actualiser'),
        el('button', { classe: 'bouton', disabled: gitVerification, title: 'Interroge GitHub pour savoir s\'il y a des changements à récupérer', onClick: git.verifierEnLigne }, icone('recherche'), gitVerification ? 'Vérification…' : 'Vérifier en ligne'),
        el('button', { classe: 'bouton principal', disabled: nbAEnvoyer === 0, onClick: git.toutPousser }, icone('exporter'), `Tout envoyer${nbAEnvoyer ? ` (${nbAEnvoyer})` : ''}`))),
    enteteGithub(),
    el('p', { classe: 'details-aide legende-git' },
      el('strong', {}, 'Commit'), ' = enregistrer une version sur ce PC. ',
      el('strong', {}, 'Push'), ' = envoyer les versions sur GitHub. ',
      el('strong', {}, 'Pull'), ' = récupérer les versions depuis GitHub.'),
    depots.length === 0 && gitChargement ? el('p', { classe: 'details-aide' }, 'Lecture de l\'état des projets…') : null,
    el('div', { classe: 'liste-git' }, depots.map(ligne))));
}

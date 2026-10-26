// Onglet « Réglages » : démarrage avec Windows, dossier des projets, éditeurs, programmes,
// mises à jour, journal des erreurs, à propos.
import { el } from './dom.js';
import { icone } from './icones.js';
import { notifier } from './notifications.js';
import { confirmer } from './dialogue.js';
import * as etat from './etat.js';
import * as actions from './actions.js';
import * as misesAJour from './mises-a-jour.js';
import { pageClaude, pageEditeur, pageInterface, pageRaccourcis } from './preferences-ui.js';
import { pageComptes } from './comptes-ui.js';

export const ID_REGLAGES = 'reglages';

const panneau = el('section', { id: 'reglages', classe: 'panneau panneau-reglages inactif' });
document.getElementById('zone-contenu').append(panneau);

export function element() {
  return panneau;
}

function statut(editeur) {
  if (editeur.source === 'reglage') {
    return editeur.disponible
      ? el('span', { classe: 'statut ok' }, icone('coche'), 'Choisi à la main')
      : el('span', { classe: 'statut erreur' }, icone('erreur'), 'Introuvable à cet emplacement');
  }
  return editeur.disponible
    ? el('span', { classe: 'statut ok' }, icone('coche'), 'Trouvé automatiquement')
    : el('span', { classe: 'statut erreur' }, icone('erreur'), 'Introuvable');
}

function ligneEditeur(editeur) {
  return el('div', { classe: 'reglage-editeur' },
    el('div', { classe: 'reglage-editeur-entete' },
      el('strong', {}, editeur.nom),
      statut(editeur)),
    el('code', { classe: 'reglage-chemin' }, editeur.chemin || 'Aucun programme trouvé'),
    el('div', { classe: 'details-boutons' },
      el('button', { classe: 'bouton petit', onClick: () => actions.parcourirEditeur(editeur.id) }, icone('dossier'), 'Choisir le programme…'),
      editeur.source === 'reglage'
        ? el('button', { classe: 'bouton petit', onClick: () => actions.definirCheminEditeur(editeur.id, null) }, icone('redemarrer'), 'Revenir à la détection automatique')
        : null));
}

function ligneProgramme(p) {
  return el('div', { classe: 'reglage-editeur' },
    el('div', { classe: 'reglage-editeur-entete' },
      el('strong', {}, p.libelle),
      p.chemin
        ? el('span', { classe: 'statut ok' }, icone('coche'), p.version || 'Installé')
        : el('span', { classe: 'statut erreur' }, icone('erreur'), 'Introuvable')),
    el('code', { classe: 'reglage-chemin' }, p.chemin || p.installation || 'Non installé'));
}

// --- Réglages généraux -------------------------------------------------------------------

const apiReglages = window.toolkit.reglages;

// Nouveau dossier des projets choisi, en attente du redémarrage (null sinon).
let dossierProjetsEnAttente = null;

async function changerDemarrage(actif) {
  try {
    etat.modifier({ demarrageWindows: await apiReglages.changerDemarrageWindows(actif) });
    notifier(actif ? 'Toolkit démarrera avec Windows (réduit près de l\'horloge).' : 'Toolkit ne démarrera plus avec Windows.', 'succes');
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  }
}

async function changerDossierProjets(fonction) {
  try {
    const dossier = await fonction();
    if (!dossier) return;
    dossierProjetsEnAttente = dossier;
    rendre();
    const ok = await confirmer({
      titre: 'Redémarrer Toolkit ?',
      message: `Toolkit utilisera le dossier « ${dossier} » pour les projets après un redémarrage.\n\nLes projets actuels ne sont pas déplacés : déplace-les toi-même dans ce dossier si tu veux les retrouver.`,
      bouton: 'Redémarrer maintenant',
    });
    if (ok) await window.toolkit.application.redemarrer();
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  }
}

function sectionsGenerales() {
  const { demarrageWindows, infosApp } = etat.obtenir();
  const caseDemarrage = el('input', { type: 'checkbox', onChange: (e) => changerDemarrage(e.target.checked) });
  caseDemarrage.checked = Boolean(demarrageWindows);
  const dossierActuel = infosApp?.dossierProjets || 'projets';
  return [
    el('section', { classe: 'section-reglages' },
      el('h2', {}, 'Démarrage'),
      el('div', { classe: 'page-formulaire' },
        el('label', { classe: 'champ-formulaire champ-case' }, caseDemarrage,
          el('span', { classe: 'champ-libelle' }, 'Démarrer Toolkit avec Windows'),
          el('span', { classe: 'champ-aide' }, 'Toolkit s\'ouvre discrètement, réduit près de l\'horloge : clique sur son icône pour afficher la fenêtre. Il n\'utilise presque rien tant que la fenêtre est fermée.')))),

    el('section', { classe: 'section-reglages' },
      el('h2', {}, 'Dossier des projets'),
      el('p', {}, 'Dossier actuel : ', el('code', {}, dossierActuel), ' (à l\'intérieur du dossier Toolkit, chemin relatif)'),
      dossierProjetsEnAttente && dossierProjetsEnAttente !== dossierActuel
        ? el('p', { classe: 'statut ok' }, icone('info'), `Après le prochain redémarrage : ${dossierProjetsEnAttente}`)
        : null,
      el('div', { classe: 'details-boutons' },
        el('button', { classe: 'bouton', onClick: () => changerDossierProjets(apiReglages.choisirDossierProjets) }, icone('dossier'), 'Choisir un autre dossier…'),
        dossierActuel !== 'projets'
          ? el('button', { classe: 'bouton', onClick: () => changerDossierProjets(apiReglages.dossierProjetsDefaut) }, 'Revenir au dossier « projets »')
          : null)),
  ];
}

function sectionsFinales() {
  const { infosApp } = etat.obtenir();
  return [
    el('section', { classe: 'section-reglages' },
      el('h2', {}, 'Apparence'),
      el('p', { classe: 'details-aide' }, 'Thème sombre (le seul disponible pour l\'instant).')),

    el('section', { classe: 'section-reglages' },
      el('h2', {}, 'En cas de problème'),
      el('p', { classe: 'details-aide' }, 'Les détails techniques des erreurs sont notés dans un journal. Il peut aider Claude à comprendre un problème.'),
      el('button', {
        classe: 'bouton',
        onClick: () => window.toolkit.application.ouvrirJournal().catch((e) => notifier(e.message, 'erreur')),
      }, icone('note'), 'Ouvrir le journal des erreurs')),

    infosApp
      ? el('section', { classe: 'section-reglages' },
        el('h2', {}, 'À propos'),
        el('dl', { classe: 'infos' },
          el('dt', {}, 'Version'), el('dd', {}, infosApp.version),
          el('dt', {}, 'Electron'), el('dd', {}, infosApp.electron),
          el('dt', {}, 'Emplacement'), el('dd', {}, el('code', {}, infosApp.emplacement))))
      : null,
  ];
}

const ONGLETS_REGLAGES = [
  ['general', 'Général', 'reglages'],
  ['comptes', 'Comptes', 'utilisateur'],
  ['claude', 'Claude', 'claude'],
  ['editeur', 'Éditeur', 'code'],
  ['interface', 'Interface', 'grille'],
  ['raccourcis', 'Raccourcis', 'points'],
  ['mises-a-jour', 'Mises à jour', 'redemarrer'],
];

// Les pages de préférences gardent leur saisie en cours : on ne les redessine que quand on
// change de page (ou sur demande), pas à chaque changement de l'état de Toolkit.
let pageAffichee = null;

export function rendre() {
  const { reglagesOuverts, ongletReglages = 'general' } = etat.obtenir();
  if (!reglagesOuverts) return;
  const pagesFigees = ['comptes', 'claude', 'editeur', 'interface', 'raccourcis'];
  if (pagesFigees.includes(ongletReglages) && pageAffichee === ongletReglages && panneau.firstChild) return;
  pageAffichee = ongletReglages;
  const rafraichir = () => { pageAffichee = null; rendre(); };
  const contenu = {
    general: () => pageGenerale(),
    comptes: pageComptes,
    claude: pageClaude,
    editeur: pageEditeur,
    interface: pageInterface,
    raccourcis: () => pageRaccourcis(rafraichir),
    'mises-a-jour': () => misesAJour.section(),
  }[ongletReglages] || (() => pageGenerale());
  panneau.replaceChildren(el('div', { classe: 'page-reglages' },
    el('h1', {}, 'Réglages'),
    el('nav', { classe: 'onglets-reglages' }, ONGLETS_REGLAGES.map(([id, libelle, ico]) => el('button', {
      classe: `onglet-reglage${id === ongletReglages ? ' actif' : ''}`,
      onClick: () => etat.modifier({ ongletReglages: id }),
    }, icone(ico), libelle))),
    contenu()));
}

function pageGenerale() {
  const { editeurs, programmes } = etat.obtenir();
  const listes = editeurs.filter((e) => e.source !== 'systeme');
  return [
    sectionsGenerales(),

    el('section', { classe: 'section-reglages' },
      el('h2', {}, 'Éditeurs'),
      el('p', { classe: 'details-aide' },
        'Toolkit trouve tout seul les éditeurs installés. Si l\'un d\'eux n\'est pas trouvé, ',
        'clique sur « Choisir le programme… » et sélectionne son fichier .exe ',
        '(par exemple Code.exe, studio64.exe ou notepad++.exe).'),
      listes.length === 0 ? el('p', { classe: 'details-aide' }, 'Recherche des éditeurs…') : listes.map(ligneEditeur),
      el('p', { classe: 'details-aide' }, 'L\'Explorateur Windows est toujours disponible.'),
      el('button', { classe: 'bouton', onClick: actions.redetecterEditeurs }, icone('recherche'), 'Détecter à nouveau')),

    el('section', { classe: 'section-reglages' },
      el('h2', {}, 'Programmes pour les scripts'),
      el('p', { classe: 'details-aide' },
        'Les boutons d\'action des projets utilisent ces programmes. Ils sont détectés automatiquement ; ',
        'n\'installe que ceux dont tes projets ont besoin.'),
      programmes ? programmes.map(ligneProgramme) : el('p', { classe: 'details-aide' }, 'Recherche des programmes…'),
      el('button', { classe: 'bouton', onClick: actions.chargerProgrammes }, icone('recherche'), 'Détecter à nouveau')),

    sectionsFinales(),
  ];
}

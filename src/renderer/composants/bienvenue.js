// Écran de bienvenue (premier lancement, ou palette > « Assistant de bienvenue ») :
// présentation, comptes Claude et GitHub, préférences principales, consignes pour Claude,
// puis premier projet. Chaque réglage est enregistré tout de suite ; « Passer » est possible
// à chaque étape. Vu une fois : preferences.interface.bienvenueVue.
import { el } from './dom.js';
import { icone } from './icones.js';
import * as etat from './etat.js';
import * as actions from './actions.js';
import * as preferences from './preferences.js';
import { caseACocher, choix } from './preferences-ui.js';
import { blocComptes } from './comptes-ui.js';

let ouvert = false;

function etapeAccueil() {
  const { infosApp } = etat.obtenir();
  return {
    titre: 'Bienvenue dans Toolkit',
    contenu: [
      infosApp ? el('img', { classe: 'bienvenue-logo', src: infosApp.icone, alt: '' }) : null,
      el('p', {}, 'Toolkit rassemble tous tes projets au même endroit'),
      el('ul', { classe: 'bienvenue-liste' },
        el('li', {}, icone('lecture'), 'les ouvrir et les lancer en un clic ;'),
        el('li', {}, icone('claude'), 'les créer et les modifier avec Claude, en lui parlant simplement ;'),
        el('li', {}, icone('code'), 'explorer et modifier leur code, avec aperçu ;'),
        el('li', {}, icone('historique'), 'les sauvegarder avec Git et revenir en arrière à tout moment.')),
      el('p', { classe: 'details-aide' }, 'Quelques réglages rapides, et c\'est parti. Tout se modifie plus tard dans Réglages.'),
    ],
  };
}

function etapeComptes() {
  return {
    titre: 'Tes comptes',
    contenu: [
      el('p', {}, 'Claude sert à créer et modifier tes projets (il faut un abonnement Claude Pro ou Max). GitHub, facultatif, sert à sauvegarder tes projets en ligne.'),
      el('p', { classe: 'details-aide' }, 'La connexion s\'ouvre dans un onglet : suis les indications, ton navigateur s\'ouvre sur le site officiel. Reviens ensuite ici.'),
      blocComptes(),
    ],
  };
}

function etapePreferences() {
  const demarrage = el('input', {
    type: 'checkbox',
    onChange: () => window.toolkit.reglages.changerDemarrageWindows(demarrage.checked).catch(() => {}),
  });
  window.toolkit.reglages.demarrageWindows().then((actif) => { demarrage.checked = actif; }).catch(() => {});
  return {
    titre: 'Tes préférences',
    contenu: el('div', { classe: 'page-formulaire' },
      el('label', { classe: 'champ-formulaire champ-case' }, demarrage, el('span', { classe: 'champ-libelle' }, 'Démarrer Toolkit avec Windows'),
        el('span', { classe: 'champ-aide' }, 'Discrètement, près de l\'horloge ; il n\'utilise presque rien tant que la fenêtre est fermée.')),
      choix('interface', 'zoom', 'Taille de l\'interface', [80, 90, 100, 110, 125, 150].map((z) => [z, `${z} %${z === 100 ? ' (normale)' : ''}`]), null, Number),
      choix('claude', 'autonomie', 'Comment Claude doit-il travailler ?', [
        ['', 'Comme réglé dans Claude Code (par défaut)'],
        ['manual', 'Me demander avant chaque modification'],
        ['acceptEdits', 'Modifier les fichiers sans demander, me demander pour le reste'],
        ['plan', 'Me proposer un plan avant de modifier quoi que ce soit'],
      ], 'Toolkit fait toujours une sauvegarde avant que Claude travaille.'),
      caseACocher('claude', 'notifications', 'Me prévenir quand Claude a fini ou attend une réponse'),
      caseACocher('interface', 'restaurerOnglets', 'Rouvrir mes onglets au démarrage')),
  };
}

function etapeConsignes() {
  const zone = el('textarea', { rows: 7, spellcheck: 'true', placeholder: 'Par exemple :\n- Explique-moi simplement ce que tu fais.\n- Écris les commentaires du code en français.\n- Demande-moi avant de supprimer un fichier.' });
  zone.value = preferences.lire('claude').consignes;
  zone.addEventListener('change', () => preferences.modifier('claude', { consignes: zone.value.trim() }));
  return {
    titre: 'Tes consignes pour Claude (facultatif)',
    contenu: [
      el('p', {}, 'Ce que Claude doit toujours savoir ou respecter, pour tous tes projets.'),
      zone,
      el('p', { classe: 'details-aide' }, 'Modifiable plus tard dans Réglages > Claude.'),
    ],
    avantSuivant: () => preferences.modifier('claude', { consignes: zone.value.trim() }),
  };
}

function etapeFin(fermer) {
  const choixFinal = (ico, titre, texte, action) => el('button', { classe: 'carte-bienvenue', onClick: () => { fermer(); action(); } },
    icone(ico), el('strong', {}, titre), el('span', {}, texte));
  return {
    titre: 'C\'est prêt !',
    contenu: [
      el('p', {}, 'Par quoi veux-tu commencer ?'),
      el('div', { classe: 'cartes-bienvenue' },
        choixFinal('plus', 'Créer un outil', 'Décris ce que tu veux, Claude le fabrique.', actions.nouvelOutil),
        choixFinal('importer', 'Importer un projet', 'Un dossier de ton PC ou un dépôt GitHub.', actions.ouvrirImport),
        choixFinal('grille', 'Explorer Toolkit', 'Astuce : Ctrl+Maj+P pour trouver n\'importe quelle commande.', () => {})),
    ],
    dernier: true,
  };
}

export function ouvrirBienvenue() {
  if (ouvert) return;
  ouvert = true;
  let index = 0;
  const fermer = () => {
    ouvert = false;
    voile.remove();
    document.removeEventListener('keydown', surTouche, true);
    preferences.modifier('interface', { bienvenueVue: true });
  };
  const etapes = [etapeAccueil, etapeComptes, etapePreferences, etapeConsignes, () => etapeFin(fermer)];
  const corps = el('div', { classe: 'corps-bienvenue' });
  const points = el('div', { classe: 'points-bienvenue' });
  const boutons = el('div', { classe: 'dialogue-boutons' });
  const dialogue = el('div', { classe: 'dialogue large bienvenue', role: 'dialog', 'aria-modal': 'true' }, corps, points, boutons);
  const voile = el('div', { classe: 'voile' }, dialogue);
  let etape = null;

  async function aller(n) {
    if (etape?.avantSuivant) await etape.avantSuivant();
    index = n;
    etape = etapes[index]();
    corps.replaceChildren(el('h2', {}, etape.titre), ...[etape.contenu].flat().filter(Boolean));
    points.replaceChildren(...etapes.map((_, i) => el('span', { classe: `point${i === index ? ' actif' : ''}` })));
    // (replaceChildren ne déplie pas les listes et écrirait « null » : liste filtrée.)
    boutons.replaceChildren(...[
      index > 0 && !etape.dernier ? el('button', { classe: 'bouton', onClick: () => aller(index - 1) }, 'Précédent') : null,
      el('span', { classe: 'espace' }),
      ...(etape.dernier
        ? [el('button', { classe: 'bouton', onClick: fermer }, 'Fermer')]
        : [el('button', { classe: 'bouton', onClick: fermer }, 'Passer'), el('button', { classe: 'bouton principal', onClick: () => aller(index + 1) }, 'Suivant')]),
    ].filter(Boolean));
    boutons.querySelector('.principal')?.focus();
  }
  // Échap ferme (comme « Passer »).
  function surTouche(e) {
    if (e.key === 'Escape' && !document.querySelectorAll('.voile')[1]) {
      e.stopPropagation();
      fermer();
    }
  }
  document.body.append(voile);
  document.addEventListener('keydown', surTouche, true);
  aller(0);
}

// Au démarrage : seulement pour une nouvelle installation (aucun projet, jamais vu).
export function ouvrirSiPremierLancement() {
  if (preferences.lire('interface').bienvenueVue) return;
  if (etat.obtenir().projets.length > 0) {
    preferences.modifier('interface', { bienvenueVue: true });
    return;
  }
  ouvrirBienvenue();
}

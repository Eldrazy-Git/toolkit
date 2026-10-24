// Onglets : « Bibliothèque » puis un onglet par outil HTML ouvert.
// Chaque outil est une <webview> créée une seule fois puis conservée tant que son
// onglet est ouvert (changer d'onglet ne recharge pas l'outil).
import { el } from './dom.js';
import { icone } from './icones.js';
import { iconeProjet } from './icone-projet.js';
import * as etat from './etat.js';
import * as actions from './actions.js';
import * as reglages from './reglages.js';
import { ID_REGLAGES } from './reglages.js';

export const ID_BIBLIOTHEQUE = 'bibliotheque';

const barre = document.getElementById('onglets');
const zone = document.getElementById('zone-contenu');
const panneauBibliotheque = document.getElementById('bibliotheque');

// id d'onglet -> { element, webview }
const panneaux = new Map();

// --- Barre d'onglets -----------------------------------------------------------------

function onglet({ id, titre, visuel, actif, fermable }) {
  const fermer = (e) => {
    e.stopPropagation();
    actions.fermerOnglet(id);
  };
  return el('div', {
    classe: `onglet${actif ? ' actif' : ''}`,
    role: 'tab',
    'aria-selected': actif ? 'true' : 'false',
    title: titre,
    onClick: () => actions.activerOnglet(id),
    // Clic molette : fermer l'onglet
    onAuxclick: (e) => { if (e.button === 1 && fermable) fermer(e); },
  },
  visuel,
  el('span', { classe: 'onglet-titre' }, titre),
  fermable ? el('button', { classe: 'onglet-fermer', title: 'Fermer (Ctrl+W)', onClick: fermer }, icone('croix')) : null);
}

function visuelOutil(o) {
  const projet = etat.obtenir().projets.find((p) => p.id === o.projetId);
  return projet && !o.outilLie ? iconeProjet(projet, 16) : icone('outil');
}

// --- Panneau d'un outil ------------------------------------------------------------------

function creerPanneau(o) {
  const webview = document.createElement('webview');
  webview.setAttribute('partition', o.partition);
  // Nécessaire pour que les liens « target=_blank » soient transmis à Toolkit
  // (qui les ouvre dans le navigateur, ou les refuse).
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('src', o.url);

  const message = el('div', { classe: 'message-outil', hidden: true });
  const afficherMessage = (titre, texte) => {
    message.replaceChildren(
      el('strong', {}, titre),
      el('p', {}, texte),
      el('button', { classe: 'bouton principal', onClick: () => webview.reloadIgnoringCache() }, icone('redemarrer'), 'Recharger'));
    message.hidden = false;
  };

  webview.addEventListener('did-start-loading', () => { message.hidden = true; });
  webview.addEventListener('did-fail-load', (e) => {
    // -3 = chargement interrompu (par exemple par un rechargement) : pas une erreur.
    if (e.isMainFrame && e.errorCode !== -3) {
      afficherMessage('L\'outil n\'a pas pu se charger', `${e.errorDescription || 'Erreur inconnue'} (${e.validatedURL})`);
    }
  });
  webview.addEventListener('render-process-gone', () => {
    afficherMessage('L\'outil s\'est arrêté', 'Il a planté ou a été fermé. Ses données enregistrées sont conservées.');
  });

  const idContenu = () => webview.getWebContentsId();
  const element = el('section', { classe: 'panneau panneau-outil' },
    el('div', { classe: 'barre-outil' },
      el('button', { classe: 'bouton-icone', title: 'Recharger (F5)', onClick: () => webview.reloadIgnoringCache() }, icone('redemarrer')),
      el('button', { classe: 'bouton petit', onClick: () => actions.exporterDonnees(o, idContenu()) }, icone('exporter'), 'Exporter les données'),
      el('button', { classe: 'bouton petit', onClick: () => actions.importerDonnees(o, idContenu()) }, icone('importer'), 'Importer les données'),
      el('button', { classe: 'bouton petit', title: 'Outils de développement (F12)', onClick: () => webview.openDevTools() }, icone('code'), 'F12'),
      el('code', { classe: 'chemin-outil', title: o.chemin }, o.chemin)),
    el('div', { classe: 'conteneur-webview' }, webview, message));

  zone.append(element);
  return { element, webview };
}

// --- Rendu -----------------------------------------------------------------------------

export function rendre() {
  const { onglets, ongletActif, reglagesOuverts } = etat.obtenir();

  barre.replaceChildren(
    onglet({ id: ID_BIBLIOTHEQUE, titre: 'Bibliothèque', visuel: icone('grille'), actif: ongletActif === ID_BIBLIOTHEQUE, fermable: false }),
    reglagesOuverts
      ? onglet({ id: ID_REGLAGES, titre: 'Réglages', visuel: icone('reglages'), actif: ongletActif === ID_REGLAGES, fermable: true })
      : '',
    ...onglets.map((o) => onglet({ id: o.id, titre: o.nom, visuel: visuelOutil(o), actif: ongletActif === o.id, fermable: true })),
  );

  // Crée les panneaux des nouveaux onglets, supprime ceux des onglets fermés.
  for (const o of onglets) {
    if (!panneaux.has(o.id)) panneaux.set(o.id, creerPanneau(o));
  }
  for (const [id, panneau] of panneaux) {
    if (!onglets.some((o) => o.id === id)) {
      panneau.element.remove();
      panneaux.delete(id);
    }
  }

  panneauBibliotheque.classList.toggle('inactif', ongletActif !== ID_BIBLIOTHEQUE);
  reglages.element().classList.toggle('inactif', ongletActif !== ID_REGLAGES);
  for (const [id, panneau] of panneaux) panneau.element.classList.toggle('inactif', id !== ongletActif);
}

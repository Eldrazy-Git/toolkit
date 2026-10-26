// Onglets : « Bibliothèque » puis un onglet par outil HTML ouvert.
// Onglets ouverts (etat.onglets) de deux genres :
// - 'outil' : outil HTML dans une <webview> ;
// - 'terminal' : Claude Code ou PowerShell (voir terminal.js) ;
// - 'console' : exécution d'une action de projet.json (voir console.js) ;
// - 'note' : note Markdown (voir note.js) ; 'code' : explorateur + éditeur (voir code.js).
// Chaque panneau est créé une seule fois puis conservé tant que son onglet est ouvert
// (changer d'onglet ne recharge pas l'outil et n'interrompt pas le terminal).
import { el } from './dom.js';
import { icone } from './icones.js';
import { iconeProjet } from './icone-projet.js';
import * as etat from './etat.js';
import * as actions from './actions.js';
import * as reglages from './reglages.js';
import { ID_REGLAGES } from './reglages.js';
import * as assistantImport from './import.js';
import { ID_IMPORT } from './import.js';
import * as panneauGit from './git.js';
import { ID_GIT } from './git.js';
import { creerPanneauTerminal } from './terminal.js';
import { creerPanneauConsole } from './console.js';
import { creerPanneauNote } from './note.js';
import { creerApercuAppareil } from './apercu-appareil.js';
import { creerPanneauCode } from './code.js';

export const ID_BIBLIOTHEQUE = 'bibliotheque';

const barre = document.getElementById('onglets');
const zone = document.getElementById('zone-contenu');
const panneauBibliotheque = document.getElementById('bibliotheque');

// id d'onglet -> { element, focus?, detruire?, mettreAJour? }
const panneaux = new Map();
let dernierActif = null;

// --- Barre d'onglets -----------------------------------------------------------------

function onglet({ id, titre, visuel, actif, fermable, attention = false }) {
  const fermer = (e) => {
    e.stopPropagation();
    actions.fermerOnglet(id);
  };
  return el('div', {
    classe: `onglet${actif ? ' actif' : ''}${attention && !actif ? ' attention' : ''}`,
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
  if (o.genre === 'terminal') return icone({ claude: 'claude', connexion: 'utilisateur' }[o.mode] || 'terminal');
  if (o.genre === 'console') return icone('lecture');
  if (o.genre === 'note') return icone('note');
  if (o.genre === 'code') return icone('code');
  const projet = etat.obtenir().projets.find((p) => p.id === o.projetId);
  return projet && !o.outilLie ? iconeProjet(projet, 16) : icone('outil');
}

// --- Panneau d'un outil ------------------------------------------------------------------

function creerPanneauOutil(o) {
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
  const conteneur = el('div', { classe: 'conteneur-webview' });
  // Aperçu ordinateur / smartphone / tablette (la webview est placée dans un cadre).
  const apercu = creerApercuAppareil(webview, conteneur, o.id);
  conteneur.append(apercu.cadre, message);
  const element = el('section', { classe: 'panneau panneau-outil' },
    el('div', { classe: 'barre-outil' },
      el('button', { classe: 'bouton-icone', title: 'Recharger (F5)', onClick: () => webview.reloadIgnoringCache() }, icone('redemarrer')),
      apercu.boutons,
      el('button', { classe: 'bouton petit', title: 'Exporter les données de l\'outil dans un fichier .json', onClick: () => actions.exporterDonnees(o, idContenu()) }, icone('exporter'), el('span', { classe: 'texte-bouton' }, 'Exporter les données')),
      el('button', { classe: 'bouton petit', title: 'Importer les données de l\'outil depuis un fichier .json', onClick: () => actions.importerDonnees(o, idContenu()) }, icone('importer'), el('span', { classe: 'texte-bouton' }, 'Importer les données')),
      el('button', { classe: 'bouton petit', title: 'Outils de développement (F12)', onClick: () => webview.openDevTools() }, icone('code'), 'F12'),
      el('code', { classe: 'chemin-outil', title: o.chemin }, o.chemin)),
    conteneur);

  zone.append(element);
  return { element };
}

function creerPanneau(o) {
  if (o.genre === 'terminal') return creerPanneauTerminal(o, zone);
  if (o.genre === 'console') return creerPanneauConsole({ ...o }, zone);
  if (o.genre === 'note') return creerPanneauNote({ ...o }, zone);
  if (o.genre === 'code') return creerPanneauCode({ ...o }, zone);
  return creerPanneauOutil(o);
}

// --- Rendu -----------------------------------------------------------------------------

export function rendre() {
  const { onglets, ongletActif, reglagesOuverts, importOuvert, gitOuvert } = etat.obtenir();

  barre.replaceChildren(
    onglet({ id: ID_BIBLIOTHEQUE, titre: 'Bibliothèque', visuel: icone('grille'), actif: ongletActif === ID_BIBLIOTHEQUE, fermable: false }),
    reglagesOuverts
      ? onglet({ id: ID_REGLAGES, titre: 'Réglages', visuel: icone('reglages'), actif: ongletActif === ID_REGLAGES, fermable: true })
      : '',
    gitOuvert
      ? onglet({ id: ID_GIT, titre: 'Git et GitHub', visuel: icone('git'), actif: ongletActif === ID_GIT, fermable: true })
      : '',
    importOuvert
      ? onglet({ id: ID_IMPORT, titre: 'Importer un projet', visuel: icone('importer'), actif: ongletActif === ID_IMPORT, fermable: true })
      : '',
    ...onglets.map((o) => onglet({ id: o.id, titre: o.nonEnregistre ? `● ${o.nom}` : o.nom, visuel: visuelOutil(o), actif: ongletActif === o.id, fermable: true, attention: o.attention })),
  );

  // Crée les panneaux des nouveaux onglets, supprime ceux des onglets fermés.
  for (const o of onglets) {
    if (!panneaux.has(o.id)) panneaux.set(o.id, creerPanneau(o));
    else panneaux.get(o.id).mettreAJour?.(o);
  }
  for (const [id, panneau] of panneaux) {
    if (!onglets.some((o) => o.id === id)) {
      if (panneau.detruire) panneau.detruire();
      else panneau.element.remove();
      panneaux.delete(id);
    }
  }

  panneauBibliotheque.classList.toggle('inactif', ongletActif !== ID_BIBLIOTHEQUE);
  reglages.element().classList.toggle('inactif', ongletActif !== ID_REGLAGES);
  assistantImport.element().classList.toggle('inactif', ongletActif !== ID_IMPORT);
  panneauGit.element().classList.toggle('inactif', ongletActif !== ID_GIT);
  for (const [id, panneau] of panneaux) panneau.element.classList.toggle('inactif', id !== ongletActif);

  // En arrivant sur un terminal, le clavier lui est donné directement.
  if (ongletActif !== dernierActif) {
    dernierActif = ongletActif;
    const focus = panneaux.get(ongletActif)?.focus;
    if (focus) requestAnimationFrame(focus);
  }
}

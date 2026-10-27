// Bouton « Simuler le tactile » d'une page HTML affichée dans une <webview> (outil ou
// aperçu de l'onglet « Code ») : la souris se comporte comme un doigt (événements touch).
// Le choix est mémorisé par page (localStorage de l'interface) et réappliqué à chaque
// chargement.
import { el } from './dom.js';
import { icone } from './icones.js';
import { notifier } from './notifications.js';

function lire(cle) {
  try {
    return localStorage.getItem(cle) === '1';
  } catch {
    return false;
  }
}

function ecrire(cle, actif) {
  try {
    if (actif) localStorage.setItem(cle, '1');
    else localStorage.removeItem(cle);
  } catch {
    // Mémorisation impossible : sans gravité.
  }
}

// cleMemoire : identifiant de la page ; webviewInitiale : la <webview> concernée (ou plus
// tard, par attacher(), si elle est créée après le bouton). Renvoie { bouton, attacher }.
export function creerBoutonTactile(cleMemoire, webviewInitiale = null) {
  const cle = `toolkit:tactile:${cleMemoire}`;
  let actif = lire(cle);
  let webview = null;
  let pret = false;

  const bouton = el('button', { classe: 'bouton-icone', onClick: () => changer(!actif) }, icone('doigt'));

  function afficher() {
    bouton.classList.toggle('actif', actif);
    bouton.title = actif
      ? 'Simulation du tactile activée : la souris agit comme un doigt (cliquer pour désactiver)'
      : 'Simuler le tactile : la souris agit comme un doigt (toucher, glisser)';
  }

  async function appliquer() {
    if (!webview || !pret) return;
    try {
      await window.toolkit.outils.tactile(webview.getWebContentsId(), actif);
    } catch (erreur) {
      if (!actif) return;
      actif = false;
      afficher();
      notifier(erreur.message, 'erreur');
    }
  }

  function changer(valeur) {
    actif = valeur;
    ecrire(cle, actif);
    afficher();
    appliquer();
  }

  function attacher(nouvelle) {
    if (nouvelle === webview) return;
    webview = nouvelle;
    pret = false;
    webview.addEventListener('dom-ready', () => {
      pret = true;
      if (actif) appliquer();
    });
  }

  afficher();
  if (webviewInitiale) attacher(webviewInitiale);
  return { bouton, attacher };
}

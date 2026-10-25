// Aperçu d'un outil HTML sur différents appareils : ordinateur, smartphone, tablette.
//
// En mode smartphone / tablette, la <webview> est placée dans un cadre de la taille de
// l'appareil (réduit si la place manque) et le processus principal active la simulation
// mobile de Chromium (balise viewport respectée, écran de la taille de l'appareil, barres
// de défilement fines). Changer de mode ne recharge pas l'outil. Le choix est mémorisé
// par outil (localStorage de l'interface).
import { el } from './dom.js';
import { icone } from './icones.js';

const APPAREILS = {
  ordinateur: { libelle: 'Ordinateur', icone: 'ordinateur' },
  smartphone: { libelle: 'Smartphone', icone: 'smartphone', largeur: 390, hauteur: 844 },
  tablette: { libelle: 'Tablette', icone: 'tablette', largeur: 820, hauteur: 1180 },
};
const MARGE = 24; // espace autour du cadre
const BORDURE = 10; // épaisseur du cadre (voir .cadre-appareil dans app.css)

function lire(cle) {
  try {
    return JSON.parse(localStorage.getItem(cle)) || {};
  } catch {
    return {};
  }
}

function ecrire(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // Mémorisation impossible : sans gravité.
  }
}

// webview : la <webview> de l'outil ; conteneur : la zone qui l'affiche ;
// cleMemoire : identifiant de l'outil (pour retenir le mode choisi).
// Renvoie { cadre (à placer dans conteneur, contient la webview), boutons (pour la barre) }.
export function creerApercuAppareil(webview, conteneur, cleMemoire) {
  const cle = `toolkit:apercu:${cleMemoire}`;
  let { mode = 'ordinateur', paysage = false } = lire(cle);
  if (!APPAREILS[mode]) mode = 'ordinateur';
  let pret = false; // la webview doit avoir chargé avant de pouvoir simuler un appareil

  const cadre = el('div', { classe: 'cadre-appareil' }, webview);
  const taille = el('span', { classe: 'taille-appareil' });
  const boutonsModes = Object.entries(APPAREILS).map(([id, a]) => el('button', {
    classe: 'bouton-icone',
    title: `Affichage ${a.libelle.toLowerCase()}${a.largeur ? ` (${a.largeur} × ${a.hauteur})` : ''}`,
    'data-mode': id,
    onClick: () => changer(id, paysage),
  }, icone(a.icone)));
  const boutonPivoter = el('button', { classe: 'bouton-icone', title: 'Pivoter (portrait / paysage)', onClick: () => changer(mode, !paysage) }, icone('pivoter'));

  function dimensions() {
    const a = APPAREILS[mode];
    if (!a.largeur) return null;
    return paysage ? { largeur: a.hauteur, hauteur: a.largeur } : { largeur: a.largeur, hauteur: a.hauteur };
  }

  // Taille et réduction du cadre selon la place disponible.
  function ajuster() {
    const d = dimensions();
    if (!d) return;
    const echelle = Math.min(1,
      (conteneur.clientWidth - 2 * MARGE) / (d.largeur + 2 * BORDURE),
      (conteneur.clientHeight - 2 * MARGE) / (d.hauteur + 2 * BORDURE));
    cadre.style.setProperty('--largeur', `${d.largeur}px`);
    cadre.style.setProperty('--hauteur', `${d.hauteur}px`);
    cadre.style.setProperty('--echelle', String(Math.max(0.1, echelle)));
    taille.textContent = `${d.largeur} × ${d.hauteur}${echelle < 1 ? ` · ${Math.round(echelle * 100)} %` : ''}`;
  }

  function simuler() {
    if (!pret) return;
    const d = dimensions();
    window.toolkit.outils.emulation(webview.getWebContentsId(), d).catch(() => {});
  }

  function changer(nouveauMode, nouveauPaysage) {
    mode = nouveauMode;
    paysage = nouveauPaysage;
    ecrire(cle, { mode, paysage });
    const d = dimensions();
    conteneur.classList.toggle('mode-appareil', Boolean(d));
    for (const b of boutonsModes) b.classList.toggle('actif', b.dataset.mode === mode);
    boutonPivoter.hidden = !d;
    taille.hidden = !d;
    if (d) ajuster();
    simuler();
  }

  // La simulation est (ré)appliquée à chaque chargement (rechargement, navigation…).
  webview.addEventListener('dom-ready', () => {
    pret = true;
    simuler();
  });
  new ResizeObserver(ajuster).observe(conteneur);
  changer(mode, paysage);

  return {
    cadre,
    boutons: el('div', { classe: 'groupe-apercu' }, boutonsModes, boutonPivoter, taille),
  };
}

// Canaux IPC « outils:* » : préparer l'ouverture d'un outil HTML, exporter/importer/réinitialiser ses données.
'use strict';

const { gerer } = require('./gerer');
const outilsHtml = require('../outils-html');
const outilsDonnees = require('../outils-donnees');
const simulationTactile = require('../simulation-tactile');

function enregistrer() {
  gerer('outils:preparer', (projetId, outilLie) => outilsHtml.preparer(projetId, outilLie));
  gerer('outils:exporter', (idContenu, nom) => outilsDonnees.exporter(idContenu, nom));
  gerer('outils:importer', (idContenu, nom) => outilsDonnees.importer(idContenu, nom));
  gerer('outils:reinitialiser', (idContenu) => outilsDonnees.reinitialiser(idContenu));

  // Aperçu smartphone / tablette : simulation mobile de Chromium (viewport, taille d'écran,
  // barres de défilement fines). appareil : { largeur, hauteur } ou null pour l'ordinateur.
  gerer('outils:emulation', (idContenu, appareil) => {
    const contenu = outilsHtml.contenuOutil(idContenu);
    if (!appareil) {
      contenu.disableDeviceEmulation();
      return;
    }
    const taille = { width: Math.round(appareil.largeur), height: Math.round(appareil.hauteur) };
    contenu.enableDeviceEmulation({
      screenPosition: 'mobile',
      screenSize: taille,
      viewSize: taille,
      deviceScaleFactor: 0, // 0 = garder celui de l'écran
      scale: 1,
      viewPosition: { x: 0, y: 0 },
    });
  });

  // Simulation du tactile dans cette page seulement (voir simulation-tactile.js).
  gerer('outils:tactile', (idContenu, actif) => simulationTactile.definir(outilsHtml.contenuOutil(idContenu), Boolean(actif)));
}

module.exports = { enregistrer };

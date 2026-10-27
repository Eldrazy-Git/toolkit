// Canaux IPC « outils:* » : préparer l'ouverture d'un outil HTML, exporter/importer ses données.
'use strict';

const { gerer } = require('./gerer');
const outilsHtml = require('../outils-html');
const outilsDonnees = require('../outils-donnees');

function enregistrer() {
  gerer('outils:preparer', (projetId, outilLie) => outilsHtml.preparer(projetId, outilLie));
  gerer('outils:exporter', (idContenu, nom) => outilsDonnees.exporter(idContenu, nom));
  gerer('outils:importer', (idContenu, nom) => outilsDonnees.importer(idContenu, nom));

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

  // Simulation du tactile : la souris produit des événements touch (touchstart…), comme
  // le mode appareil des outils de développement de Chrome. Passe par le protocole de
  // débogage (seul moyen d'Electron) ; les réglages restent valables d'une page à l'autre.
  gerer('outils:tactile', async (idContenu, actif) => {
    const contenu = outilsHtml.contenuOutil(idContenu);
    const dbg = contenu.debugger;
    if (!dbg.isAttached()) {
      if (!actif) return;
      try {
        dbg.attach('1.3');
      } catch {
        throw new Error('Impossible de simuler le tactile pendant que les outils de développement (F12) sont ouverts. Ferme-les puis réessaie.');
      }
    }
    await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: Boolean(actif), maxTouchPoints: 5 });
    await dbg.sendCommand('Emulation.setEmitTouchEventsForMouse', { enabled: Boolean(actif), configuration: 'mobile' });
    if (!actif) dbg.detach();
  });
}

module.exports = { enregistrer };

// Canaux IPC « code:* » (explorateur de fichiers et éditeur) et « lsp:* » (aide Python).
// Les dossiers sont désignés par des « cibles » (voir cibles.js), les fichiers par des
// chemins relatifs à ce dossier.
'use strict';

const { ipcMain } = require('electron');
const { gerer } = require('./gerer');
const explorateur = require('../explorateur');
const lspPython = require('../lsp-python');
const { dossierCible } = require('../cibles');
const git = require('../git');

// Arrêts liés à la fermeture d'une interface, enregistrés une seule fois par interface.
const suivis = new WeakMap(); // webContents -> Set de clés
function arreterALaFermeture(contenu, cle) {
  if (!suivis.has(contenu)) {
    suivis.set(contenu, new Set());
    contenu.once('destroyed', () => suivis.get(contenu).forEach((c) => explorateur.arreterSurveillance(c)));
  }
  suivis.get(contenu).add(cle);
}

function enregistrer() {
  gerer('code:lister', async (cible, relatif) => explorateur.lister(await dossierCible(cible), relatif));
  gerer('code:lister-tout', async (cible) => explorateur.listerTout(await dossierCible(cible)));
  gerer('code:lire', async (cible, relatif) => explorateur.lire(await dossierCible(cible), relatif));
  gerer('code:ecrire', async (cible, relatif, texte, options) => explorateur.ecrire(await dossierCible(cible), relatif, texte, options));
  gerer('code:creer', async (cible, parent, nom, type) => explorateur.creer(await dossierCible(cible), parent, nom, type));
  gerer('code:renommer', async (cible, relatif, nom) => explorateur.renommer(await dossierCible(cible), relatif, nom));
  gerer('code:rechercher', async (cible, options) => explorateur.rechercher(await dossierCible(cible), options || {}));
  // Avant de remplacer : sauvegarde Git des modifications en cours (si le dossier a Git).
  gerer('code:remplacer', async (cible, options, remplacement, chemins) => {
    const dossier = await dossierCible(cible);
    let sauvegarde = false;
    if (await git.estDepot(dossier)) {
      sauvegarde = (await git.commiterTout(dossier, `Sauvegarde automatique avant « Remplacer partout » (${new Date().toLocaleString('fr-FR')})`)).commite;
    }
    return { ...(await explorateur.remplacer(dossier, options || {}, String(remplacement ?? ''), chemins)), sauvegarde, git: await git.estDepot(dossier) };
  });
  gerer('code:corbeille', async (cible, relatif) => explorateur.mettreALaCorbeille(await dossierCible(cible), relatif));

  // Surveillance tant que l'onglet est ouvert : « code:changements » (cle, [chemins relatifs]).
  gerer('code:surveiller', async (contenu, cle, cible) => {
    const dossier = await dossierCible(cible);
    explorateur.surveiller(cle, dossier, (chemins) => {
      if (!contenu.isDestroyed()) contenu.send('code:changements', cle, chemins);
    });
    arreterALaFermeture(contenu, cle);
  }, { avecEmetteur: true });
  gerer('code:arreter-surveillance', (cle) => explorateur.arreterSurveillance(cle));

  gerer('lsp:demarrer', async (contenu, cle, cible) => lspPython.demarrer(contenu, cle, await dossierCible(cible)), { avecEmetteur: true });
  gerer('lsp:arreter', (cle) => lspPython.arreter(cle));
  ipcMain.on('lsp:envoyer', (_e, cle, message) => lspPython.envoyer(cle, message));
}

module.exports = { enregistrer };

// Canaux IPC du terminal intégré et de l'intégration Claude Code :
// « terminal:* », « sauvegarde:* » (commit avant Claude), « modeles:* » (Nouvel outil).
//
// Les dossiers sont désignés par des « cibles » (voir cibles.js).
'use strict';

const { ipcMain } = require('electron');
const { gerer } = require('./gerer');
const chemins = require('../chemins');
const terminal = require('../terminal');
const git = require('../git');
const modeles = require('../modeles');
const { dossierCible } = require('../cibles');

function enregistrer() {
  // --- Terminal ---
  gerer('terminal:creer', async (contenu, id, { mode, cible, demande, continuer, colonnes, lignes }) => {
    const dossier = await dossierCible(cible);
    const resultat = await terminal.creer(id, { mode, dossier, demande, continuer, colonnes, lignes }, contenu);
    return { ...resultat, chemin: chemins.versRelatif(dossier) || '.' };
  }, { avecEmetteur: true });
  gerer('terminal:fermer', (id) => terminal.fermer(id));
  // Frappes et redimensionnement : envois sans réponse, pour la réactivité.
  ipcMain.on('terminal:ecrire', (_e, id, donnees) => terminal.ecrire(id, donnees));
  ipcMain.on('terminal:redimensionner', (_e, id, colonnes, lignes) => terminal.redimensionner(id, colonnes, lignes));

  // --- Sauvegarde Git avant de lancer Claude ---
  gerer('sauvegarde:etat', async (cible) => {
    const dossier = await dossierCible(cible);
    const disponible = await git.gitDisponible();
    return { gitDisponible: disponible, estDepot: disponible && await git.estDepot(dossier) };
  });
  // initialiser : crée le dépôt s'il n'existe pas. Renvoie { commite }.
  gerer('sauvegarde:faire', async (cible, { initialiser = false } = {}) => {
    const dossier = await dossierCible(cible);
    if (!(await git.estDepot(dossier))) {
      if (!initialiser) throw new Error('Ce dossier n\'a pas d\'historique Git.');
      await git.initialiser(dossier);
    }
    const date = new Date().toLocaleString('fr-FR');
    return git.commiterTout(dossier, `Sauvegarde automatique avant modification par Claude (${date})`);
  });

  // --- Nouvel outil ---
  gerer('modeles:lister', async () => (await modeles.listerModeles())
    .map(({ id, nom, description }) => ({ id, nom, description })));
  gerer('modeles:creer-projet', (valeurs) => modeles.creerDepuisModele(valeurs));
}

module.exports = { enregistrer };

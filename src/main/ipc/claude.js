// Canaux IPC du terminal intégré et de l'intégration Claude Code :
// « terminal:* », « sauvegarde:* » (commit avant Claude), « modeles:* » (Nouvel outil).
//
// Une « cible » désigne un dossier sans jamais transmettre de chemin depuis l'interface :
// { type: 'projet', id } | { type: 'toolkit' } (dossier app/) | { type: 'racine' } (Toolkit/).
'use strict';

const { ipcMain } = require('electron');
const path = require('node:path');
const { gerer } = require('./gerer');
const chemins = require('../chemins');
const projets = require('../projets');
const terminal = require('../terminal');
const git = require('../git');
const modeles = require('../modeles');
const { existe } = require('../fichiers');

async function dossierCible(cible) {
  let dossier;
  if (cible?.type === 'projet') {
    if (!(await projets.chargerProjet(cible.id))) throw new Error('Ce projet n\'existe plus.');
    dossier = path.join(chemins.projets(), cible.id);
  } else if (cible?.type === 'toolkit') {
    dossier = chemins.app;
  } else if (cible?.type === 'racine') {
    dossier = chemins.racine;
  } else {
    throw new Error('Dossier cible inconnu.');
  }
  if (!(await existe(dossier))) throw new Error('Ce dossier n\'existe plus.');
  return dossier;
}

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

// Canaux IPC « projets:* » : lister et modifier les projets, changer leur icône.
'use strict';

const { dialog, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const { gerer } = require('./gerer');
const projets = require('../projets');
const chemins = require('../chemins');
const contexteClaude = require('../contexte-claude');
const reglages = require('../reglages');
const sessionsClaude = require('../sessions-claude');
const journal = require('../journal');

function enregistrer() {
  gerer('projets:lister', () => projets.listerProjets());
  // Nom, description ou liens changés : le contexte de Claude (CLAUDE.md) suit.
  gerer('projets:modifier', async (id, changements) => {
    const projet = await projets.modifierFiche(id, changements || {});
    contexteClaude.planifier(300);
    return projet;
  });
  // Ajouter, modifier, supprimer ou déplacer une action (voir projets.modifierActions).
  gerer('projets:modifier-actions', (id, operation) => projets.modifierActions(id, operation));
  // Action « fichier » : choisir un fichier du projet (renvoie son chemin relatif, ou null).
  gerer('projets:choisir-fichier', async (contenu, id) => {
    if (!(await projets.chargerProjet(id))) throw new Error('Ce projet n\'existe plus.');
    const racine = path.join(chemins.projets(), id);
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(contenu) || undefined, {
      title: 'Choisis le fichier à ouvrir (dans le dossier du projet)',
      defaultPath: racine,
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;
    const relatif = path.relative(racine, filePaths[0]);
    if (!relatif || relatif.startsWith('..') || path.isAbsolute(relatif)) {
      throw new Error('Ce fichier n\'est pas dans le dossier du projet. Copie-le d\'abord dans le projet, puis choisis-le.');
    }
    return relatif.split(path.sep).join('/');
  }, { avecEmetteur: true });

  // Action « fichier » ouverte avec le programme de Windows (celui qui ouvre ce type de fichier).
  gerer('projets:ouvrir-fichier', async (id, index) => {
    const projet = await projets.chargerProjet(id);
    const action = projet?.fiche.actions[index];
    if (!action || action.genre !== 'fichier') throw new Error('Cette action n\'existe plus dans projet.json.');
    const racine = path.join(chemins.projets(), id);
    const fichier = path.resolve(racine, action.fichier);
    if (!fichier.startsWith(racine + path.sep)) throw new Error('Le fichier doit se trouver dans le dossier du projet.');
    const erreur = await shell.openPath(fichier);
    if (erreur) {
      journal.erreur(`Ouverture de ${action.fichier} :`, erreur);
      throw new Error(`Windows n'a pas pu ouvrir « ${action.fichier} » (fichier introuvable, ou aucun programme pour ce type de fichier).`);
    }
  });
  gerer('projets:renommer-categorie', (ancienne, nouvelle) => projets.renommerCategorie(ancienne, nouvelle));
  gerer('projets:renommer-tag', (ancien, nouveau) => projets.renommerTag(ancien, nouveau));

  // Renommer le dossier d'un projet (l'interface a fermé ses onglets et met à jour groupes,
  // épingles et récents). Suivent aussi : boutons déjà proposés et conversations de Claude.
  gerer('projets:renommer-dossier', async (ancien, nouveau) => {
    const projet = await projets.renommerDossier(ancien, nouveau);
    if (projet.id !== ancien) {
      const dejaProposees = reglages.obtenir().actionsAuto?.[ancien];
      // modifier() fusionne : undefined efface l'ancienne clé (absente du JSON écrit).
      if (dejaProposees) await reglages.modifier({ actionsAuto: { [projet.id]: dejaProposees, [ancien]: undefined } });
      await sessionsClaude.deplacer(path.join(chemins.projets(), ancien), path.join(chemins.projets(), projet.id))
        .catch((erreur) => journal.erreur('Conversations de Claude non déplacées :', erreur));
    }
    contexteClaude.planifier();
    return projet;
  });

  // Suppression d'un projet : son dossier part à la Corbeille de Windows (récupérable),
  // jamais d'effacement définitif. L'interface a demandé une confirmation explicite.
  gerer('projets:supprimer', async (id) => {
    const nom = String(id || '');
    if (!nom || nom !== path.basename(nom) || nom === '.' || nom === '..') throw new Error('Projet invalide.');
    if (!(await projets.chargerProjet(nom))) throw new Error('Ce projet n\'existe plus.');
    const dossier = path.join(chemins.projets(), nom);
    try {
      await shell.trashItem(dossier);
      contexteClaude.planifier();
    } catch {
      throw new Error('Windows refuse de déplacer le dossier : un programme l\'utilise encore (VS Code, Android Studio, l\'Explorateur, un terminal…). Ferme-le puis réessaie.');
    }
  });

  // Choix d'une image comme icône (la boîte s'ouvre dans le dossier du projet, pour pouvoir
  // reprendre une image qui s'y trouve déjà). Renvoie le projet mis à jour, ou null si annulé.
  gerer('projets:choisir-icone', async (contenu, id) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(contenu) || undefined, {
      title: 'Choisis l\'image de l\'icône du projet',
      defaultPath: path.join(chemins.projets(), id),
      filters: [{ name: 'Images', extensions: projets.EXTENSIONS_IMAGES }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;
    return projets.changerIcone(id, filePaths[0]);
  }, { avecEmetteur: true });
}

module.exports = { enregistrer };

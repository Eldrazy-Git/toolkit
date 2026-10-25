// Canaux IPC « git:* » : panneau Git et GitHub (état des dépôts, commit, push, pull…).
// Les dépôts sont désignés par des cibles : { type: 'projet', id } ou { type: 'toolkit' }.
'use strict';

const { shell } = require('electron');
const path = require('node:path');
const { gerer } = require('./gerer');
const git = require('../git');
const github = require('../github');
const projets = require('../projets');
const { dossierCible } = require('../cibles');
const { lireJson, ecrireJson } = require('../fichiers');

// Exécute des tâches asynchrones avec un nombre limité en parallèle.
async function parLots(elements, taille, fonction) {
  const resultats = new Array(elements.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(taille, elements.length) }, async () => {
    while (i < elements.length) {
      const n = i++;
      resultats[n] = await fonction(elements[n]);
    }
  }));
  return resultats;
}

// Toolkit (dossier app/) puis chaque projet.
async function listeDepots() {
  const liste = [{ cible: { type: 'toolkit' }, nom: 'Toolkit (l\'application)', projet: null }];
  for (const p of await projets.listerProjets()) {
    liste.push({ cible: { type: 'projet', id: p.id }, nom: p.fiche.nom, projet: p });
  }
  return liste;
}

async function etatDe(cible, nom) {
  try {
    return { cible, nom, ...(await git.etatDepot(await dossierCible(cible))) };
  } catch (erreur) {
    return { cible, nom, erreur: erreur.message };
  }
}

// Après la création d'un dépôt GitHub, l'adresse est notée dans la fiche du projet.
async function noterRemoteDansFiche(cible, dossier, url) {
  if (cible.type !== 'projet' || !url) return;
  const chemin = path.join(dossier, 'projet.json');
  const fiche = await lireJson(chemin);
  fiche.git = { ...(fiche.git || {}), remote: url };
  await ecrireJson(chemin, fiche);
  await git.commiterFichiers(dossier, ['projet.json'], 'Ajout de l\'adresse du dépôt GitHub dans la fiche');
}

function enregistrer() {
  gerer('git:etats', async () => {
    if (!(await git.gitDisponible())) {
      throw new Error('Git est introuvable sur ce PC. Installe-le (dans PowerShell : winget install Git.Git), puis redémarre Toolkit.');
    }
    const liste = await listeDepots();
    return parLots(liste, 4, ({ cible, nom }) => etatDe(cible, nom));
  });

  gerer('git:etat', async (cible) => {
    const liste = await listeDepots();
    const nom = liste.find((d) => d.cible.type === cible.type && d.cible.id === cible.id)?.nom || '';
    return etatDe(cible, nom);
  });

  gerer('git:commit', async (cible, message) => {
    const texte = String(message || '').trim();
    if (!texte) throw new Error('Écris un message qui décrit les changements.');
    return git.commiterTout(await dossierCible(cible), texte);
  });

  gerer('git:push', async (cible) => git.pousser(await dossierCible(cible)));
  gerer('git:pull', async (cible) => git.recuperer(await dossierCible(cible)));

  // Vérifie en ligne tous les dépôts reliés à un serveur. Renvoie les erreurs éventuelles.
  gerer('git:verifier-en-ligne', async () => {
    const liste = await listeDepots();
    const erreurs = [];
    await parLots(liste, 4, async ({ cible, nom }) => {
      try {
        const dossier = await dossierCible(cible);
        if (await git.estDepot(dossier) && await git.urlRemote(dossier)) await git.verifierEnLigne(dossier);
      } catch (erreur) {
        erreurs.push(`${nom} : ${erreur.message}`);
      }
    });
    return erreurs;
  });

  gerer('git:initialiser', async (cible) => {
    const dossier = await dossierCible(cible);
    if (await git.estDepot(dossier)) throw new Error('Ce projet a déjà un historique Git.');
    await git.initialiser(dossier);
    await git.completerGitignore(dossier);
    return git.commiterTout(dossier, 'Premier commit (historique Git activé depuis Toolkit)');
  });

  // Complète le .gitignore pour protéger les fichiers sensibles. Renvoie les lignes ajoutées.
  gerer('git:proteger', async (cible) => git.completerGitignore(await dossierCible(cible)));

  gerer('git:creer-github', async (cible) => {
    const dossier = await dossierCible(cible);
    const etat = await git.etatDepot(dossier);
    if (!etat.estDepot) throw new Error('Active d\'abord l\'historique Git.');
    if (etat.remote) throw new Error('Ce projet est déjà relié à un dépôt distant.');
    if (etat.aucunCommit) throw new Error('Fais d\'abord un « Commit » : un dépôt vide ne peut pas être envoyé.');
    if (etat.secretsSuivis.length) {
      throw new Error(`Des fichiers sensibles sont enregistrés dans Git (${etat.secretsSuivis.join(', ')}). Retire-les du suivi avant de créer un dépôt GitHub.`);
    }
    let nom = 'toolkit';
    let description = 'Toolkit : application de bureau qui centralise mes projets et intègre Claude Code.';
    if (cible.type === 'projet') {
      const projet = await projets.chargerProjet(cible.id);
      nom = cible.id;
      description = projet?.fiche.description || '';
    }
    const url = await github.creerDepotPrive(dossier, nom, description);
    await noterRemoteDansFiche(cible, dossier, url);
    return { url };
  });

  // Détail : commits à envoyer / à récupérer, et différences d'un fichier.
  gerer('git:commits', async (cible, sens) => git.listerCommits(await dossierCible(cible), sens === 'recuperer' ? 'recuperer' : 'envoyer'));
  gerer('git:differences', async (cible, chemin, hash) => git.differences(await dossierCible(cible), chemin, hash || null));

  // Historique et retour arrière.
  gerer('git:historique', async (cible, chemin) => git.historique(await dossierCible(cible), { chemin: chemin || null }));
  gerer('git:fichiers-depuis', async (cible, hash) => git.fichiersDifferentsDepuis(await dossierCible(cible), hash));
  gerer('git:differences-depuis', async (cible, hash, chemin) => git.differencesDepuis(await dossierCible(cible), hash, chemin));
  gerer('git:restaurer', async (cible, hash, chemins) => git.restaurer(await dossierCible(cible), hash, Array.isArray(chemins) && chemins.length ? chemins : null));

  gerer('git:ouvrir-github', async (cible) => {
    const url = git.urlWeb(await git.urlRemote(await dossierCible(cible)));
    if (!url) throw new Error('Ce projet n\'est relié à aucun dépôt en ligne.');
    await shell.openExternal(url);
  });
}

module.exports = { enregistrer };

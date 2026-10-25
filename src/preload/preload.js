// Pont entre l'interface et le processus principal : seul accès de l'interface au système.
// Tout est exposé sous window.toolkit.<domaine>.<fonction>().
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Appelle un canal IPC et transforme une erreur en exception avec un message clair.
async function appeler(canal, ...args) {
  const reponse = await ipcRenderer.invoke(canal, ...args);
  if (!reponse.ok) throw new Error(reponse.erreur);
  return reponse.resultat;
}

// Abonnement à un événement ; renvoie une fonction pour se désabonner.
function ecouter(canal, rappel) {
  const auditeur = (_evenement, ...args) => rappel(...args);
  ipcRenderer.on(canal, auditeur);
  return () => ipcRenderer.removeListener(canal, auditeur);
}

contextBridge.exposeInMainWorld('toolkit', {
  projets: {
    lister: () => appeler('projets:lister'),
    modifier: (id, changements) => appeler('projets:modifier', id, changements),
    renommerCategorie: (ancienne, nouvelle) => appeler('projets:renommer-categorie', ancienne, nouvelle),
    renommerTag: (ancien, nouveau) => appeler('projets:renommer-tag', ancien, nouveau),
    surChangement: (rappel) => ecouter('projets:changes', rappel),
  },
  outils: {
    // Renvoie { id, nom, url, partition, chemin… } pour créer la <webview> de l'outil.
    preparer: (projetId, outilLie) => appeler('outils:preparer', projetId, outilLie),
    exporter: (idContenu, nom) => appeler('outils:exporter', idContenu, nom),
    importer: (idContenu, nom) => appeler('outils:importer', idContenu, nom),
    // Raccourcis clavier pressés dans un outil (ex. 'fermer' pour Ctrl+W).
    surRaccourci: (rappel) => ecouter('outils:raccourci', rappel),
  },
  editeurs: {
    // [{ id, nom, chemin, source: 'reglage' | 'auto' | 'systeme' | null, disponible }]
    etat: () => appeler('editeurs:etat'),
    redetecter: () => appeler('editeurs:redetecter'),
    definir: (id, chemin) => appeler('editeurs:definir', id, chemin),
    parcourir: (id) => appeler('editeurs:parcourir', id),
    // editeurId absent : éditeur par défaut du projet. Renvoie le nom de l'éditeur utilisé.
    ouvrirProjet: (projetId, editeurId) => appeler('editeurs:ouvrir-projet', projetId, editeurId),
    ouvrirToolkit: (editeurId) => appeler('editeurs:ouvrir-toolkit', editeurId),
  },
  // Terminal intégré. cible : { type: 'projet', id } | { type: 'toolkit' } | { type: 'racine' }
  terminal: {
    // options : { mode: 'claude' | 'powershell', cible, demande?, colonnes, lignes }
    // Renvoie { ok, raison?, chemin }.
    creer: (id, options) => appeler('terminal:creer', id, options),
    ecrire: (id, donnees) => ipcRenderer.send('terminal:ecrire', id, donnees),
    redimensionner: (id, colonnes, lignes) => ipcRenderer.send('terminal:redimensionner', id, colonnes, lignes),
    fermer: (id) => appeler('terminal:fermer', id),
    surDonnees: (rappel) => ecouter('terminal:donnees', rappel), // rappel(id, donnees)
    surFin: (rappel) => ecouter('terminal:fin', rappel), // rappel(id, codeDeSortie)
  },
  // Commit de sauvegarde avant de lancer Claude.
  sauvegarde: {
    etat: (cible) => appeler('sauvegarde:etat', cible), // { gitDisponible, estDepot }
    faire: (cible, options) => appeler('sauvegarde:faire', cible, options), // { commite }
  },
  modeles: {
    lister: () => appeler('modeles:lister'),
    // valeurs : { nom, modeleId, categorie, description } -> { id, nom, demande, avertissement }
    creerProjet: (valeurs) => appeler('modeles:creer-projet', valeurs),
  },
  // Actions de projet.json (scripts lancés avec une console).
  executions: {
    // Lance l'action n° indexAction ; valeurs : { idParametre: valeur }. Renvoie { commande, dossier }.
    lancer: (id, projetId, indexAction, valeurs) => appeler('executions:lancer', id, projetId, indexAction, valeurs),
    arreter: (id) => appeler('executions:arreter', id),
    oublier: (id) => appeler('executions:oublier', id),
    ouvrirDossier: (id) => appeler('executions:ouvrir-dossier', id),
    surSortie: (rappel) => ecouter('execution:sortie', rappel), // rappel(id, 'stdout' | 'stderr', texte)
    surFin: (rappel) => ecouter('execution:fin', rappel), // rappel(id, { code, erreur, arrete, duree, dossierApres })
  },
  dialogues: {
    // options : { type: 'fichier' | 'fichiers' | 'dossier', titre, extensions? } -> chemin(s) ou null
    choisirChemin: (options) => appeler('dialogues:choisir-chemin', options),
  },
  programmes: {
    etat: () => appeler('programmes:etat'), // [{ nom, libelle, chemin, version, installation }]
  },
  // Assistant d'import de projets existants.
  importation: {
    choisirDossier: () => appeler('import:choisir-dossier'), // chemin ou null
    analyser: (chemin) => appeler('import:analyser', chemin), // rapport d'analyse
    cloner: (url) => appeler('import:cloner', url), // rapport d'analyse du clone
    executer: (idAnalyse, choix) => appeler('import:executer', idAnalyse, choix), // { id, etapes, avertissements }
    abandonner: (idAnalyse) => appeler('import:abandonner', idAnalyse),
    surProgression: (rappel) => ecouter('import:progression', rappel), // rappel({ texte, faits, total })
  },
  github: {
    etat: () => appeler('github:etat'), // { installe, connecte, compte }
  },
  // Panneau Git. cible : { type: 'projet', id } | { type: 'toolkit' }
  git: {
    etats: () => appeler('git:etats'), // état de Toolkit et de chaque projet
    etat: (cible) => appeler('git:etat', cible),
    commit: (cible, message) => appeler('git:commit', cible, message),
    push: (cible) => appeler('git:push', cible),
    pull: (cible) => appeler('git:pull', cible), // { message }
    verifierEnLigne: () => appeler('git:verifier-en-ligne'), // [erreurs]
    initialiser: (cible) => appeler('git:initialiser', cible),
    proteger: (cible) => appeler('git:proteger', cible), // lignes ajoutées au .gitignore
    creerGithub: (cible) => appeler('git:creer-github', cible), // { url }
    ouvrirGithub: (cible) => appeler('git:ouvrir-github', cible),
  },
  // Recherche globale (Ctrl+K) et notes Markdown.
  recherche: {
    preparer: () => appeler('recherche:preparer'),
    // [{ type: 'projet' | 'note', titre, chemin, projetId, nomProjet, titreSegments, extrait: [{ t, m }] }]
    chercher: (texte) => appeler('recherche:chercher', texte),
  },
  notes: {
    lire: (chemin) => appeler('notes:lire', chemin), // { chemin, titre, contenu, html, mtime, retroliens }
    // Renvoie la note relue, ou { modifieeAilleurs: true } si le fichier a changé depuis mtimeAttendu.
    enregistrer: (chemin, contenu, mtimeAttendu, forcer) => appeler('notes:enregistrer', chemin, contenu, mtimeAttendu, forcer),
    creer: (projetId, nom) => appeler('notes:creer', projetId, nom), // chemin de la nouvelle note
    duProjet: (projetId) => appeler('notes:du-projet', projetId), // { notes, retroliens }
  },
  liens: {
    ouvrirExterne: (url) => appeler('liens:ouvrir-externe', url),
  },
  reglages: {
    lire: () => appeler('reglages:lire'),
    modifier: (changements) => appeler('reglages:modifier', changements),
    demarrageWindows: () => appeler('reglages:demarrage-windows'), // true / false
    changerDemarrageWindows: (actif) => appeler('reglages:changer-demarrage-windows', actif),
    // Renvoie le nouveau dossier (relatif à Toolkit) ou null ; effet au prochain démarrage.
    choisirDossierProjets: () => appeler('reglages:choisir-dossier-projets'),
    dossierProjetsDefaut: () => appeler('reglages:dossier-projets-defaut'),
  },
  application: {
    infos: () => appeler('application:infos'),
    redemarrer: () => appeler('application:redemarrer'),
    ouvrirJournal: () => appeler('application:ouvrir-journal'),
  },
});

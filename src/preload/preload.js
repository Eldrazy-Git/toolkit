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
  reglages: {
    lire: () => appeler('reglages:lire'),
    modifier: (changements) => appeler('reglages:modifier', changements),
  },
  application: {
    infos: () => appeler('application:infos'),
    redemarrer: () => appeler('application:redemarrer'),
  },
});

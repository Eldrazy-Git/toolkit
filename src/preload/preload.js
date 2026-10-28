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
    // operation : { type: 'ajouter' | 'modifier' | 'supprimer' | 'deplacer', index, action, sens }
    modifierActions: (id, operation) => appeler('projets:modifier-actions', id, operation),
    choisirFichier: (id) => appeler('projets:choisir-fichier', id), // chemin relatif au projet, ou null
    ouvrirFichier: (id, indexAction) => appeler('projets:ouvrir-fichier', id, indexAction), // avec le programme de Windows
    renommerCategorie: (ancienne, nouvelle) => appeler('projets:renommer-categorie', ancienne, nouvelle),
    renommerTag: (ancien, nouveau) => appeler('projets:renommer-tag', ancien, nouveau),
    choisirIcone: (id) => appeler('projets:choisir-icone', id), // projet mis à jour, ou null si annulé
    renommerDossier: (id, nouveau) => appeler('projets:renommer-dossier', id, nouveau), // projet sous son nouvel id
    supprimer: (id) => appeler('projets:supprimer', id), // dossier envoyé à la Corbeille
    // « Repartir de zéro » : { elements: [{ chemin, ignore, dossier, taille }], donneesOutils, modifies }
    analyserRemiseAZero: (id) => appeler('projets:analyser-remise-a-zero', id),
    remettreAZero: (id, chemins, donneesOutils) => appeler('projets:remettre-a-zero', id, chemins, donneesOutils),
    surChangement: (rappel) => ecouter('projets:changes', rappel),
  },
  outils: {
    // Renvoie { id, nom, url, partition, chemin… } pour créer la <webview> de l'outil.
    preparer: (projetId, outilLie) => appeler('outils:preparer', projetId, outilLie),
    exporter: (idContenu, nom) => appeler('outils:exporter', idContenu, nom),
    importer: (idContenu, nom) => appeler('outils:importer', idContenu, nom),
    // Efface toutes les données de l'outil (retour aux réglages du premier lancement).
    reinitialiser: (idContenu) => appeler('outils:reinitialiser', idContenu),
    // Aperçu appareil : { largeur, hauteur } (smartphone, tablette) ou null (ordinateur).
    emulation: (idContenu, appareil) => appeler('outils:emulation', idContenu, appareil),
    tactile: (idContenu, actif) => appeler('outils:tactile', idContenu, actif),
    // Raccourcis clavier pressés dans un outil (ex. 'fermer' pour Ctrl+W).
    surRaccourci: (rappel) => ecouter('outils:raccourci', rappel),
    // Un outil demande la connexion à Claude (pont Claude, voir pont-claude.js).
    surConnexionClaude: (rappel) => ecouter('outils:connexion-claude', rappel),
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
  // Barre de raccourcis vers des logiciels du PC (au-dessus des onglets).
  logiciels: {
    lister: () => appeler('logiciels:lister'), // [{ id, nom, chemin, icone, existe }]
    ajouter: () => appeler('logiciels:ajouter'), // { id, nom } ou null si annulé
    changer: (id) => appeler('logiciels:changer', id), // true, ou false si annulé
    renommer: (id, nom) => appeler('logiciels:renommer', id, nom),
    supprimer: (id) => appeler('logiciels:supprimer', id),
    deplacer: (id, index) => appeler('logiciels:deplacer', id, index),
    lancer: (id) => appeler('logiciels:lancer', id),
    afficher: (id) => appeler('logiciels:afficher', id),
  },
  // Terminal intégré. cible : { type: 'projet', id } | { type: 'toolkit' } | { type: 'racine' }
  terminal: {
    // options : { mode: 'claude' | 'powershell', cible, demande?, continuer?, reprendre?, modele?, effort?, colonnes, lignes }
    // Renvoie { ok, raison?, chemin }.
    creer: (id, options) => appeler('terminal:creer', id, options),
    ecrire: (id, donnees) => ipcRenderer.send('terminal:ecrire', id, donnees),
    redimensionner: (id, colonnes, lignes) => ipcRenderer.send('terminal:redimensionner', id, colonnes, lignes),
    fermer: (id) => appeler('terminal:fermer', id),
    sessions: (cible) => appeler('terminal:sessions', cible), // [{ id, titre, demande, date }] : conversations Claude récentes
    // Numéro de version de Windows (ex. 26100) : xterm.js s'adapte au fonctionnement de ConPTY.
    buildWindows: Number(String(process.getSystemVersion?.() || '').split('.')[2]) || 0,
    surDonnees: (rappel) => ecouter('terminal:donnees', rappel), // rappel(id, donnees)
    surFin: (rappel) => ecouter('terminal:fin', rappel), // rappel(id, codeDeSortie)
    surClaudeAttend: (rappel) => ecouter('terminal:claude-attend', rappel), // rappel(id)
    notifierClaude: (id, nom) => appeler('terminal:notifier-claude', id, nom),
    surAfficher: (rappel) => ecouter('terminal:afficher', rappel), // clic sur la notification
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
    choisirFichier: () => appeler('import:choisir-fichier'), // chemin ou null
    analyser: (chemin) => appeler('import:analyser', chemin), // rapport d'analyse (dossier ou fichier seul)
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
    // Dépôt GitHub partagé : [{ remote, projets: [noms] }]
    depotsPartages: () => appeler('git:depots-partages'),
    // choix : { remote } ou { nouveau: nom } ; dossier : nom du dossier dans le dépôt. -> { url }
    rejoindrePartage: (cible, choix, dossier) => appeler('git:rejoindre-partage', cible, choix, dossier),
    quitterPartage: (cible) => appeler('git:quitter-partage', cible),
    ouvrirGithub: (cible) => appeler('git:ouvrir-github', cible),
    // sens : 'envoyer' | 'recuperer' -> [{ hash, message, date, auteur, fichiers: [{ chemin, etat }] }]
    commits: (cible, sens) => appeler('git:commits', cible, sens),
    // hash absent : changements non enregistrés. -> { texte, binaire, nouveau, tronque }
    differences: (cible, chemin, hash) => appeler('git:differences', cible, chemin, hash),
    // Historique : chemin facultatif -> [{ hash, message, date, auteur, sauvegardeClaude, fichiers }]
    historique: (cible, chemin) => appeler('git:historique', cible, chemin),
    fichiersDepuis: (cible, hash) => appeler('git:fichiers-depuis', cible, hash), // [{ etat, chemin }]
    differencesDepuis: (cible, hash, chemin) => appeler('git:differences-depuis', cible, hash, chemin),
    // chemins absent : tout le projet. -> { sauvegarde, commite }
    restaurer: (cible, hash, chemins) => appeler('git:restaurer', cible, hash, chemins),
  },
  // Explorateur de fichiers et éditeur de code. Chemins relatifs au dossier de la cible.
  code: {
    lister: (cible, relatif) => appeler('code:lister', cible, relatif), // [{ nom, chemin, dossier, genere }]
    listerTout: (cible) => appeler('code:lister-tout', cible), // { fichiers: [chemins], tronque }
    // { chemin, texte, encodage, finLigne, mtime } | { binaire, raison } | { image: 'data:…' }
    lire: (cible, relatif) => appeler('code:lire', cible, relatif),
    // options : { encodage, mtimeAttendu, forcer } -> { mtime } ou { modifieAilleurs: true }
    ecrire: (cible, relatif, texte, options) => appeler('code:ecrire', cible, relatif, texte, options),
    creer: (cible, parent, nom, type) => appeler('code:creer', cible, parent, nom, type), // chemin créé
    renommer: (cible, relatif, nom) => appeler('code:renommer', cible, relatif, nom), // nouveau chemin
    corbeille: (cible, relatif) => appeler('code:corbeille', cible, relatif),
    apercuHtml: (cible, cle) => appeler('code:apercu-html', cible, cle), // { racine (URL), partition }
    rendreMarkdown: (cible, relatif, texte) => appeler('code:rendre-markdown', cible, relatif, texte), // HTML sûr
    // options : { texte, casse, motEntier, regex } -> { fichiers: [{ chemin, resultats }], total, tronque }
    rechercher: (cible, options) => appeler('code:rechercher', cible, options),
    // chemins : fichiers où remplacer -> { fichiers, remplacements, sauvegarde, git }
    remplacer: (cible, options, remplacement, chemins) => appeler('code:remplacer', cible, options, remplacement, chemins),
    surveiller: (cle, cible) => appeler('code:surveiller', cle, cible),
    arreterSurveillance: (cle) => appeler('code:arreter-surveillance', cle),
    surChangements: (rappel) => ecouter('code:changements', rappel), // rappel(cle, [chemins])
  },
  // Aide Python (Pyright) : messages du protocole LSP, adresses « file:///<cle>/… ».
  lsp: {
    demarrer: (cle, cible) => appeler('lsp:demarrer', cle, cible), // { dejaDemarre }
    arreter: (cle) => appeler('lsp:arreter', cle),
    envoyer: (cle, message) => ipcRenderer.send('lsp:envoyer', cle, message),
    surMessage: (rappel) => ecouter('lsp:message', rappel), // rappel(cle, message)
    surFin: (rappel) => ecouter('lsp:fin', rappel), // rappel(cle, code)
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
  // Comptes Claude et GitHub (connexion = terminal de genre « connexion », voir actions.js).
  comptes: {
    etat: () => appeler('comptes:etat'), // { claude: { installe, connecte, email, abonnement }, github: { installe, comptes: [{ nom, actif }] } }
    deconnecterClaude: () => appeler('comptes:deconnecter-claude'),
    changerGithub: (nom) => appeler('comptes:changer-github', nom),
    deconnecterGithub: (nom) => appeler('comptes:deconnecter-github', nom),
    connecterGithub: () => appeler('comptes:connecter-github'), // { code, url }
    annulerGithub: () => appeler('comptes:annuler-github'),
    surFinGithub: (rappel) => ecouter('comptes:github-fin', rappel), // rappel({ reussi, erreur })
  },
  // Mises à jour des bibliothèques et programmes utilisés par Toolkit.
  misesAJour: {
    verifier: () => appeler('mises-a-jour:verifier'), // { date, paquets, audit, programmes }
    etat: () => appeler('mises-a-jour:etat'), // { resultat, automatique, derniereVerification }
    automatique: (actif) => appeler('mises-a-jour:automatique', actif),
    installer: (paquets) => appeler('mises-a-jour:installer', paquets), // Toolkit quitte puis redémarre
    surDisponibles: (rappel) => ecouter('mises-a-jour:disponibles', rappel), // rappel({ toolkit: version | null })
    // Nouvelle version de Toolkit : analyse (aucune modification) puis application.
    etatToolkit: () => appeler('toolkit-maj:etat'), // { etat: 'a-jour' | 'disponible' | 'inconnu', actuelle, derniere }
    notesDeVersion: () => appeler('toolkit-maj:notes-version'), // [{ version, html }], la plus récente d'abord
    analyserToolkit: () => appeler('toolkit-maj:analyser'),
    appliquerToolkit: () => appeler('toolkit-maj:appliquer'), // { version, conflits, dependancesChangees }
  },
  // Publier une nouvelle version de Toolkit (copie de développement seulement).
  publication: {
    developpement: () => appeler('publication:developpement'), // true / false
    preparer: () => appeler('publication:preparer'), // { reprise, notes } ou { derniere, commits, versions, suggestion, raison, notes }
    publier: (choix) => appeler('publication:publier', choix), // choix { version, notes } -> { version, url }
    surEtape: (rappel) => ecouter('publication:etape', rappel), // rappel(texte)
  },
  application: {
    infos: () => appeler('application:infos'),
    redemarrer: () => appeler('application:redemarrer'),
    ouvrirJournal: () => appeler('application:ouvrir-journal'),
    // Des fichiers ou notes ont des modifications non enregistrées (protège la fermeture).
    signalerNonEnregistre: (valeur) => ipcRenderer.send('application:non-enregistre', valeur),
    // Disposition du clavier (AZERTY…) : { position de touche: caractère }.
    disposition: (carte) => ipcRenderer.send('application:disposition', carte),
    // Combinaisons déjà réservées par un autre programme du PC -> [combinaisons prises]
    raccourcisPris: (combinaisons) => appeler('raccourcis:pris', combinaisons),
    // Programme qui a réservé chaque raccourci, quand on peut le savoir -> { combinaison: texte | null }
    proprietairesRaccourcis: (combinaisons) => appeler('raccourcis:proprietaires', combinaisons),
  },
});

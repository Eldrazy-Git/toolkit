// Canaux IPC « application:* » et « reglages:* » : infos sur Toolkit, réglages, redémarrage.
'use strict';

const { app, dialog, shell, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { gerer } = require('./gerer');
const chemins = require('../chemins');
const reglages = require('../reglages');
const demarrageWindows = require('../demarrage-windows');
const misesAJour = require('../mises-a-jour');

// Réglages modifiables directement depuis l'interface (les autres ont leur propre canal).
const CLES_MODIFIABLES = ['interface', 'preferences'];

// Vérifie un dossier de projets choisi et renvoie son chemin relatif à la racine de Toolkit.
function dossierProjetsRelatif(absolu) {
  const relatif = path.relative(chemins.racine, absolu);
  if (path.isAbsolute(relatif)) {
    throw new Error(`Choisis un dossier sur le même disque que Toolkit (${path.parse(chemins.racine).root}) : `
      + 'Toolkit ne garde que des chemins relatifs, pour pouvoir être déplacé.');
  }
  const morceaux = relatif.split(path.sep);
  if (relatif === '' || ['app', 'donnees'].includes(morceaux[0].toLowerCase())) {
    throw new Error('Ce dossier fait partie de Toolkit lui-même : choisis un autre dossier.');
  }
  return morceaux.join('/');
}

function enregistrer({ quitter }) {
  gerer('application:infos', () => {
    const paquet = require(path.join(chemins.app, 'package.json'));
    return {
      nom: paquet.productName,
      version: paquet.version,
      description: paquet.description,
      dossier: chemins.versRelatif(chemins.app),
      dossierProjets: chemins.versRelatif(chemins.projets()),
      // Affichage seulement (jamais enregistré) : où se trouve Toolkit en ce moment.
      emplacement: chemins.racine,
      icone: pathToFileURL(path.join(chemins.app, 'assets', 'icone.png')).href,
      electron: process.versions.electron,
    };
  });

  gerer('application:redemarrer', () => {
    // Sans « --cache » : après un redémarrage demandé, on veut voir la fenêtre.
    app.relaunch({ args: process.argv.slice(1).filter((a) => a !== '--cache') });
    quitter();
  });

  gerer('application:ouvrir-journal', async () => {
    await fs.mkdir(chemins.donnees, { recursive: true });
    await fs.appendFile(chemins.journal, '', 'utf8');
    const erreur = await shell.openPath(chemins.journal);
    if (erreur) throw new Error(`Impossible d'ouvrir le journal : ${erreur}`);
  });

  gerer('reglages:lire', () => reglages.obtenir());

  gerer('reglages:modifier', async (changements) => {
    const filtres = Object.fromEntries(
      Object.entries(changements || {}).filter(([cle]) => CLES_MODIFIABLES.includes(cle)),
    );
    const resultat = await reglages.modifier(filtres);
    // Consignes pour Claude : CLAUDE.md à la racine de Toolkit. Zoom : appliqué tout de suite.
    if (filtres.preferences?.claude) require('../contexte-claude').planifier(300);
    if (filtres.preferences?.interface?.zoom) {
      BrowserWindow.getAllWindows().forEach((f) => f.webContents.setZoomFactor(Number(filtres.preferences.interface.zoom) / 100));
    }
    return resultat;
  });

  // Raccourcis déjà réservés par un AUTRE programme du PC (Windows les lui donne avant
  // Toolkit) : on essaie de les réserver un instant ; si c'est refusé, ils sont pris.
  // Renvoie la liste des combinaisons prises (format de Toolkit, ex. « Ctrl+Shift+P »).
  gerer('raccourcis:pris', (combinaisons) => (Array.isArray(combinaisons) ? combinaisons : []).filter((combi) => {
    const accelerateur = String(combi || '').split('+').map((m) => ({ Ctrl: 'Control', Espace: 'Space', '+': 'Plus' }[m] || m)).join('+');
    try {
      if (globalShortcut.isRegistered(accelerateur)) return false; // réservé par Toolkit lui-même
      const libre = globalShortcut.register(accelerateur, () => {});
      if (libre) globalShortcut.unregister(accelerateur);
      return !libre;
    } catch {
      return false; // touche inconnue d'Electron (ex. « ù ») : impossible de vérifier
    }
  }));

  // Quel programme a réservé ces raccourcis (AMD Radeon Software, PowerToys…) -> { combinaison: description | null }
  gerer('raccourcis:proprietaires', (combinaisons) => require('../proprietaires-raccourcis').proprietaires(combinaisons));

  // Comptes Claude et GitHub (voir comptes.js).
  const comptes = require('../comptes');
  gerer('comptes:etat', async () => {
    const [claude, github] = await Promise.all([comptes.etatClaude(), comptes.etatGithub()]);
    return { claude, github };
  });
  gerer('comptes:deconnecter-claude', () => comptes.deconnecterClaude());
  gerer('comptes:changer-github', (nom) => comptes.changerCompteGithub(nom));
  gerer('comptes:deconnecter-github', (nom) => comptes.deconnecterGithub(nom));
  // Connexion à GitHub : renvoie { code, url } ; la fin arrive par « comptes:github-fin ».
  gerer('comptes:connecter-github', (contenu) => new Promise((resoudre, rejeter) => {
    let repondu = false;
    comptes.connecterGithub((infos) => {
      repondu = true;
      resoudre(infos);
    }, (reussi, erreur) => {
      if (!repondu) rejeter(new Error(`La connexion à GitHub n'a pas pu démarrer : ${erreur}`));
      else if (!contenu.isDestroyed()) contenu.send('comptes:github-fin', { reussi, erreur });
    }).catch(rejeter);
  }), { avecEmetteur: true });
  gerer('comptes:annuler-github', () => comptes.annulerConnexionGithub());

  // Disposition du clavier (pour les raccourcis pressés dans un outil HTML).
  ipcMain.on('application:disposition', (_e, carte) => require('../outils-html').definirDisposition(carte));

  // Mises à jour de Toolkit (voir mises-a-jour.js).
  gerer('mises-a-jour:verifier', () => misesAJour.verifier());
  gerer('mises-a-jour:etat', () => ({
    resultat: misesAJour.dernier(),
    automatique: reglages.obtenir().misesAJour?.automatique !== false,
    derniereVerification: reglages.obtenir().misesAJour?.derniereVerification || null,
  }));
  gerer('mises-a-jour:automatique', (actif) => reglages.modifier({ misesAJour: { automatique: Boolean(actif) } }));
  // Installation : le script attend que Toolkit soit fermé, installe, puis le relance.
  gerer('mises-a-jour:installer', async (paquets) => {
    await misesAJour.preparerInstallation(paquets);
    setTimeout(quitter, 300);
  });

  gerer('reglages:demarrage-windows', () => demarrageWindows.estActif());
  gerer('reglages:changer-demarrage-windows', (actif) => demarrageWindows.changer(actif));

  // Choix d'un autre dossier de projets. Renvoie le chemin relatif, ou null si annulé.
  // Le changement s'applique au prochain démarrage (les projets ne sont pas déplacés).
  gerer('reglages:choisir-dossier-projets', async (contenu) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(contenu) || undefined, {
      title: 'Dossier où Toolkit range les projets',
      defaultPath: chemins.projets(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;
    const relatif = dossierProjetsRelatif(filePaths[0]);
    await reglages.modifier({ dossierProjets: relatif });
    return relatif;
  }, { avecEmetteur: true });

  gerer('reglages:dossier-projets-defaut', async () => {
    await reglages.modifier({ dossierProjets: 'projets' });
    return 'projets';
  });
}

module.exports = { enregistrer };

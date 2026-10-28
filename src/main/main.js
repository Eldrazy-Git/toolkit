// Point d'entrée de Toolkit : démarrage, fenêtre principale, zone de notification.
'use strict';

const { app, BrowserWindow, Menu, nativeTheme, screen, dialog, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const chemins = require('./chemins');
const journal = require('./journal');
const reglages = require('./reglages');
const projets = require('./projets');
const activite = require('./activite');
const lanceur = require('./lanceur');
const zoneNotification = require('./zone-notification');
const outilsHtml = require('./outils-html');
const terminal = require('./terminal');
const executions = require('./executions');

// Toujours avant « ready » : les données d'Electron (cache, stockage des outils…)
// vont dans donnees/ pour suivre le dossier Toolkit s'il est déplacé.
app.setPath('userData', chemins.donneesElectron);
app.setName('Toolkit');
app.setAppUserModelId('Toolkit');
outilsHtml.enregistrerSchema();

// Une erreur imprévue est notée dans le journal au lieu de faire planter Toolkit.
process.on('uncaughtException', (erreur) => journal.erreur('Erreur non gérée :', erreur));
process.on('unhandledRejection', (raison) => journal.erreur('Promesse rejetée non gérée :', raison));

let fenetre = null;
let enTrainDeQuitter = false;

// Des fichiers ou notes ont des modifications non enregistrées (signalé par l'interface).
let travailNonEnregistre = false;

function quitter() {
  if (travailNonEnregistre && fenetre) {
    afficherFenetre();
    const choix = dialog.showMessageBoxSync(fenetre, {
      type: 'warning',
      title: 'Toolkit',
      message: 'Des fichiers ont des modifications non enregistrées.',
      detail: 'Si tu quittes maintenant, ces modifications seront perdues.',
      buttons: ['Annuler', 'Quitter sans enregistrer'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choix !== 1) return;
  }
  enTrainDeQuitter = true;
  app.quit();
}

// --- Fenêtre principale ------------------------------------------------------------

// Position et taille mémorisées, si elles sont encore visibles sur un écran.
function limitesMemorisees() {
  const f = reglages.obtenir().fenetre;
  if (!f) return {};
  const visible = screen.getAllDisplays().some(({ workArea: z }) =>
    f.x < z.x + z.width - 50 && f.x + f.largeur > z.x + 50 && f.y >= z.y - 10 && f.y < z.y + z.height - 50);
  return visible ? { x: f.x, y: f.y, width: f.largeur, height: f.hauteur } : { width: f.largeur, height: f.hauteur };
}

function memoriserLimites() {
  if (!fenetre) return;
  const { x, y, width, height } = fenetre.getNormalBounds();
  reglages.modifier({ fenetre: { x, y, largeur: width, hauteur: height, maximisee: fenetre.isMaximized() } })
    .catch((erreur) => journal.erreur('Mémorisation de la fenêtre :', erreur));
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1280,
    height: 800,
    ...limitesMemorisees(),
    minWidth: 800,
    minHeight: 500,
    title: 'Toolkit',
    icon: chemins.icone,
    backgroundColor: '#1e1e1e',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: chemins.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true, // les outils HTML s'affichent dans des <webview> (voir outils-html.js)
    },
  });

  if (reglages.obtenir().fenetre?.maximisee) fenetre.maximize();
  fenetre.once('ready-to-show', () => fenetre.show());
  fenetre.loadFile(chemins.interface);

  const contenu = fenetre.webContents;
  // Taille de l'interface choisie dans Réglages > Interface.
  contenu.on('did-finish-load', () => {
    const zoom = Number(reglages.obtenir().preferences?.interface?.zoom) || 100;
    contenu.setZoomFactor(Math.min(200, Math.max(50, zoom)) / 100);
  });
  outilsHtml.attacher(contenu);

  // F12 : outils de développement. Ctrl+R / F5 : recharger l'interface.
  contenu.on('before-input-event', (evenement, touche) => {
    if (touche.type !== 'keyDown') return;
    if (touche.key === 'F12') {
      contenu.toggleDevTools();
      evenement.preventDefault();
    } else if (touche.key === 'F5' || (touche.control && touche.key.toLowerCase() === 'r')) {
      contenu.reload();
      evenement.preventDefault();
    }
  });

  // L'interface ne doit jamais naviguer ailleurs ni ouvrir de fenêtre.
  contenu.on('will-navigate', (evenement) => evenement.preventDefault());
  contenu.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Les erreurs de l'interface vont dans le journal.
  contenu.on('console-message', (details) => {
    if (details.level === 'error' || details.level === 'warning') {
      journal.erreur(`[interface] ${details.message} (${details.sourceId}:${details.lineNumber})`);
    }
  });

  // Si l'interface plante, on la recharge au lieu de laisser une fenêtre blanche.
  contenu.on('render-process-gone', (_e, details) => {
    journal.erreur('Interface arrêtée :', details.reason);
    if (details.reason !== 'clean-exit' && fenetre) contenu.reload();
  });

  fenetre.on('close', (evenement) => {
    memoriserLimites();
    if (enTrainDeQuitter) return;
    // Un script ou un terminal tourne, ou du travail n'est pas enregistré : on cache
    // seulement la fenêtre (rien n'est perdu).
    if (activite.estOccupe() || travailNonEnregistre) {
      evenement.preventDefault();
      fenetre.hide();
    }
    afficherAstuceZoneNotification();
  });

  fenetre.on('focus', () => fenetre?.flashFrame(false));

  fenetre.on('closed', () => {
    fenetre = null;
    travailNonEnregistre = false;
    projets.arreterSurveillance();
    // Rien ne doit tourner pour l'éditeur quand la fenêtre est fermée.
    require('./explorateur').arreterToutesSurveillances();
    require('./lsp-python').arreterTout();
  });

  projets.demarrerSurveillance(() => {
    fenetre?.webContents.send('projets:changes');
    require('./contexte-claude').planifier();
  });
}

function afficherFenetre() {
  if (!fenetre) {
    creerFenetre();
    return;
  }
  if (fenetre.isMinimized()) fenetre.restore();
  fenetre.show();
  fenetre.focus();
}

// La première fois qu'on ferme la fenêtre, on explique où Toolkit est passé.
function afficherAstuceZoneNotification() {
  if (reglages.obtenir().astuceZoneNotificationVue) return;
  zoneNotification.afficherMessage(
    'Toolkit continue en arrière-plan',
    'Clique sur son icône près de l\'horloge pour le rouvrir. Clic droit > Quitter pour le fermer complètement.',
  );
  reglages.modifier({ astuceZoneNotificationVue: true }).catch(() => {});
}

// --- Démarrage ---------------------------------------------------------------------

async function demarrer() {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);

  await reglages.charger();
  chemins.definirDossierProjets(reglages.obtenir().dossierProjets);
  await fs.mkdir(chemins.projets(), { recursive: true });

  // Recrée le lanceur s'il manque (par exemple après un déplacement ou un clonage).
  lanceur.mettreAJour().catch((erreur) => journal.erreur('Lanceur :', erreur));
  // Démarrage avec Windows : entrée réécrite avec les chemins actuels (si Toolkit a été déplacé).
  require('./demarrage-windows').mettreAJour();
  // Boutons de compilation des projets Java / applications Android (un peu après le démarrage).
  setTimeout(() => require('./actions-auto').completerProjets()
    .catch((erreur) => journal.erreur('Boutons de compilation :', erreur)), 3000);
  // Mises à jour : vérification si la dernière date de plus d'une semaine (une seule fois).
  setTimeout(() => require('./mises-a-jour').verifierSiBesoin()
    .then((resultat) => { if (resultat) fenetre?.webContents.send('mises-a-jour:disponibles', { toolkit: resultat.toolkit?.disponible ? resultat.toolkit.derniere.version : null }); })
    .catch((erreur) => journal.info(`Vérification des mises à jour impossible : ${erreur.message}`)), 30000);
  // Ce que Claude sait des autres projets (projets/CLAUDE.md, sections « Projets liés »).
  require('./contexte-claude').planifier(5000);

  require('./ipc/projets').enregistrer();
  require('./ipc/application').enregistrer({ quitter });
  require('./ipc/outils').enregistrer();
  require('./ipc/editeurs').enregistrer();
  require('./ipc/claude').enregistrer();
  require('./ipc/executions').enregistrer();
  require('./ipc/import').enregistrer();
  require('./ipc/git').enregistrer();
  require('./ipc/recherche').enregistrer();
  require('./ipc/code').enregistrer();
  require('./ipc/logiciels').enregistrer();
  ipcMain.on('application:non-enregistre', (_e, valeur) => { travailNonEnregistre = Boolean(valeur); });

  zoneNotification.creer({ afficher: afficherFenetre, quitter });

  // « --cache » : démarrage discret, seulement l'icône dans la zone de notification.
  if (!process.argv.includes('--cache')) creerFenetre();
}

if (!app.requestSingleInstanceLock()) {
  // Toolkit est déjà ouvert : l'autre instance affiche sa fenêtre.
  app.quit();
} else {
  app.on('second-instance', afficherFenetre);
  app.on('before-quit', () => {
    enTrainDeQuitter = true;
    terminal.fermerTous();
    executions.arreterTout();
    require('./lsp-python').arreterTout();
  });
  // Toutes les fenêtres fermées : Toolkit reste dans la zone de notification.
  app.on('window-all-closed', () => {});
  app.whenReady().then(demarrer).catch((erreur) => {
    journal.erreur('Échec du démarrage :', erreur);
    dialog.showErrorBox('Toolkit n\'a pas pu démarrer', `${erreur.message}\n\nDétails dans donnees/journal.log`);
    app.exit(1);
  });
}

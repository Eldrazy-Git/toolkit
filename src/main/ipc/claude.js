// Canaux IPC du terminal intégré et de l'intégration Claude Code :
// « terminal:* », « sauvegarde:* » (commit avant Claude), « modeles:* » (Nouvel outil).
//
// Les dossiers sont désignés par des « cibles » (voir cibles.js).
'use strict';

const { ipcMain, Notification, BrowserWindow } = require('electron');
const { gerer } = require('./gerer');
const chemins = require('../chemins');
const terminal = require('../terminal');
const git = require('../git');
const modeles = require('../modeles');
const { dossierCible } = require('../cibles');
const contexteClaude = require('../contexte-claude');
const sessionsClaude = require('../sessions-claude');

function enregistrer() {
  // --- Terminal ---
  gerer('terminal:creer', async (contenu, id, { mode, cible, demande, continuer, reprendre, modele, effort, colonnes, lignes, connexion }) => {
    // Connexion à un compte (Claude, GitHub) : programme officiel, dans le dossier personnel.
    if (mode === 'connexion') {
      const commande = await require('../comptes').commandeConnexion(connexion);
      const resultat = await terminal.creer(id, { mode: 'commande', commande, dossier: require('node:os').homedir(), colonnes, lignes }, contenu);
      return { ...resultat, chemin: connexion === 'claude' ? 'claude auth login' : 'gh auth login' };
    }
    const dossier = await dossierCible(cible);
    // Claude peut lire les projets liés à celui-ci (voir contexte-claude.js).
    const dossiersLies = mode === 'claude' && cible.type === 'projet' ? await contexteClaude.dossiersLies(cible.id) : [];
    // « Reprendre la conversation » : la plus récente de ce dossier, désignée par son id
    // (le terminal sait alors laquelle il affiche) ; « --continue » si aucune n'est trouvée.
    if (mode === 'claude' && continuer && !reprendre) reprendre = (await sessionsClaude.lister(dossier))[0]?.id;
    // Conversation encore vide (aucune demande envoyée) : rien à reprendre, Claude refuserait.
    // On en recommence une avec le même id.
    let nouvelleSession;
    if (mode === 'claude' && reprendre && !(await sessionsClaude.existe(dossier, reprendre))) {
      nouvelleSession = reprendre;
      reprendre = undefined;
      continuer = false;
    }
    const resultat = await terminal.creer(id, { mode, dossier, demande, continuer, reprendre, nouvelleSession, modele, effort, colonnes, lignes, dossiersLies }, contenu);
    return { ...resultat, chemin: chemins.versRelatif(dossier) || '.' };
  }, { avecEmetteur: true });
  gerer('terminal:sessions', async (cible) => sessionsClaude.lister(await dossierCible(cible)));
  gerer('terminal:fermer', (id) => terminal.fermer(id));

  // Claude a fini ou attend : notification Windows (un clic ramène sur son onglet) et
  // clignotement du bouton de Toolkit dans la barre des tâches.
  gerer('terminal:notifier-claude', (contenu, id, nom) => {
    const fenetre = BrowserWindow.fromWebContents(contenu);
    if (fenetre && !fenetre.isFocused()) fenetre.flashFrame(true);
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: `Claude a terminé — ${String(nom || '').slice(0, 60)}`,
      body: 'Claude a fini son travail ou attend ta réponse. Clique pour y aller.',
      icon: chemins.icone,
    });
    notification.on('click', () => {
      if (!fenetre || fenetre.isDestroyed()) return;
      if (fenetre.isMinimized()) fenetre.restore();
      fenetre.show();
      fenetre.focus();
      if (!contenu.isDestroyed()) contenu.send('terminal:afficher', id);
    });
    notification.show();
  }, { avecEmetteur: true });
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

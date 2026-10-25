// Point d'entrée de l'interface : branche les composants sur l'état et charge les données.
import * as etat from './composants/etat.js';
import * as actions from './composants/actions.js';
import * as barreLaterale from './composants/barre-laterale.js';
import * as bibliotheque from './composants/bibliotheque.js';
import * as details from './composants/details.js';
import * as onglets from './composants/onglets.js';
import * as reglages from './composants/reglages.js';
import * as assistantImport from './composants/import.js';
import * as panneauGit from './composants/git.js';
import * as groupes from './composants/groupes.js';
import * as recents from './composants/recents.js';
import { notifier } from './composants/notifications.js';
import * as raccourcis from './composants/raccourcis.js';
import * as commandes from './composants/commandes.js';
import * as session from './composants/session.js';
import * as preferencesUtilisateur from './composants/preferences.js';

let nonEnregistre = false;
etat.abonner(() => {
  const maintenant = etat.obtenir().onglets.some((o) => o.nonEnregistre);
  if (maintenant !== nonEnregistre) {
    nonEnregistre = maintenant;
    window.toolkit.application.signalerNonEnregistre(maintenant);
  }
  barreLaterale.rendre();
  onglets.rendre();
  bibliotheque.rendre();
  details.rendre();
  reglages.rendre();
  assistantImport.rendre();
  panneauGit.rendre();
  session.suivre();
});

// Raccourcis clavier (voir composants/raccourcis.js, modifiables dans les Réglages).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('.voile')) {
    actions.selectionner(null);
    return;
  }
  if (document.querySelector('.voile')) return; // une fenêtre de dialogue est ouverte
  const commande = raccourcis.commandeDe(e, 'partout') || raccourcis.commandeDe(e, 'editeur');
  if (commande && commandes.executer(commande.id)) e.preventDefault();
});

// Ctrl+W pressé à l'intérieur d'un outil (les touches n'arrivent pas jusqu'ici).
// Vérification hebdomadaire (au démarrage) : des mises à jour sont proposées.
window.toolkit.misesAJour.surDisponibles(() => {
  notifier('Des mises à jour sont disponibles pour Toolkit : Réglages > Mises à jour.');
});

// Claude a fini ou attend une réponse (voir src/main/terminal.js) : si on regarde ailleurs,
// l'onglet est signalé et une notification Windows est affichée.
window.toolkit.terminal.surClaudeAttend((id) => {
  if (!preferencesUtilisateur.lire('claude').notifications) return;
  const { onglets, ongletActif } = etat.obtenir();
  const onglet = onglets.find((o) => o.id === id);
  if (!onglet || (document.hasFocus() && ongletActif === id)) return;
  etat.modifier({ onglets: onglets.map((o) => (o.id === id ? { ...o, attention: true } : o)) });
  window.toolkit.terminal.notifierClaude(id, onglet.nomCible).catch(() => {});
});
window.toolkit.terminal.surAfficher((id) => actions.activerOnglet(id));
// Retour dans Toolkit : l'onglet affiché n'a plus besoin d'être signalé.
window.addEventListener('focus', () => {
  const { onglets, ongletActif } = etat.obtenir();
  if (onglets.some((o) => o.id === ongletActif && o.attention)) actions.activerOnglet(ongletActif);
});

// Raccourci pressé à l'intérieur d'un outil (les touches n'arrivent pas jusqu'ici).
window.toolkit.outils.surRaccourci((id) => commandes.executer(id));

// Dernier filet de sécurité : une erreur imprévue s'affiche au lieu de passer inaperçue.
// (Le détail technique part aussi dans donnees/journal.log via la console.)
window.addEventListener('unhandledrejection', (e) => notifier(e.reason?.message || String(e.reason), 'erreur'));
window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
  notifier('Une erreur inattendue s\'est produite dans l\'interface. Si quelque chose ne marche plus, appuie sur F5. Détails : Réglages > Ouvrir le journal des erreurs.', 'erreur');
});

let sessionSauvee = null;

async function demarrer() {
  try {
    const [reglagesSauves, infosApp] = await Promise.all([
      window.toolkit.reglages.lire(),
      window.toolkit.application.infos(),
    ]);
    const preferences = reglagesSauves.interface || {};
    sessionSauvee = preferences.session;
    etat.modifier({
      vue: preferences.vue === 'liste' ? 'liste' : 'grille',
      tri: typeof preferences.tri === 'string' ? preferences.tri : 'nom',
      epingles: Array.isArray(preferences.epingles) ? preferences.epingles : [],
      groupes: groupes.nettoyer(preferences.groupes),
      recents: recents.nettoyer(preferences.recents),
      preferences: reglagesSauves.preferences || {},
      infosApp,
    });
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  }
  window.toolkit.projets.surChangement(actions.chargerProjets);
  await actions.chargerProjets();
  await actions.chargerEditeurs();
  await session.restaurer(sessionSauvee);
  raccourcis.verifierConflits(notifier);
}

demarrer();

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
import { ouvrirRecherche } from './composants/recherche.js';

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
});

document.addEventListener('keydown', (e) => {
  const touche = e.key.toLowerCase();
  if (e.ctrlKey && touche === 'k') {
    e.preventDefault();
    ouvrirRecherche();
  } else if (e.ctrlKey && e.shiftKey && touche === 'f' && document.querySelector('.panneau-code:not(.inactif)')) {
    e.preventDefault();
    document.querySelector('.panneau-code:not(.inactif)').dispatchEvent(new CustomEvent('rechercher'));
  } else if (e.ctrlKey && touche === 'f') {
    e.preventDefault();
    actions.activerOnglet(onglets.ID_BIBLIOTHEQUE);
    bibliotheque.focaliserFiltre();
  } else if (e.ctrlKey && touche === 'p' && document.querySelector('.panneau-code:not(.inactif)')) {
    // Onglet « Code » affiché : aller à un fichier.
    e.preventDefault();
    const champ = document.querySelector('.panneau-code:not(.inactif) .code-recherche');
    champ.focus();
    champ.select();
  } else if (e.ctrlKey && touche === 'w') {
    e.preventDefault();
    actions.fermerOngletActif();
  } else if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    actions.ongletSuivant(e.shiftKey ? -1 : 1);
  } else if (e.key === 'Escape' && !document.querySelector('.voile')) {
    actions.selectionner(null);
  }
});

// Ctrl+W pressé à l'intérieur d'un outil (les touches n'arrivent pas jusqu'ici).
window.toolkit.outils.surRaccourci((raccourci) => {
  if (raccourci === 'fermer') actions.fermerOngletActif();
  if (raccourci === 'recherche') ouvrirRecherche();
});

// Dernier filet de sécurité : une erreur imprévue s'affiche au lieu de passer inaperçue.
// (Le détail technique part aussi dans donnees/journal.log via la console.)
window.addEventListener('unhandledrejection', (e) => notifier(e.reason?.message || String(e.reason), 'erreur'));
window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
  notifier('Une erreur inattendue s\'est produite dans l\'interface. Si quelque chose ne marche plus, appuie sur F5. Détails : Réglages > Ouvrir le journal des erreurs.', 'erreur');
});

async function demarrer() {
  try {
    const [reglagesSauves, infosApp] = await Promise.all([
      window.toolkit.reglages.lire(),
      window.toolkit.application.infos(),
    ]);
    const preferences = reglagesSauves.interface || {};
    etat.modifier({
      vue: preferences.vue === 'liste' ? 'liste' : 'grille',
      tri: typeof preferences.tri === 'string' ? preferences.tri : 'nom',
      epingles: Array.isArray(preferences.epingles) ? preferences.epingles : [],
      groupes: groupes.nettoyer(preferences.groupes),
      recents: recents.nettoyer(preferences.recents),
      infosApp,
    });
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  }
  window.toolkit.projets.surChangement(actions.chargerProjets);
  await actions.chargerProjets();
  await actions.chargerEditeurs();
}

demarrer();

// Point d'entrée de l'interface : branche les composants sur l'état et charge les données.
import * as etat from './composants/etat.js';
import * as actions from './composants/actions.js';
import * as barreLaterale from './composants/barre-laterale.js';
import * as bibliotheque from './composants/bibliotheque.js';
import * as details from './composants/details.js';
import { notifier } from './composants/notifications.js';

etat.abonner(() => {
  barreLaterale.rendre();
  bibliotheque.rendre();
  details.rendre();
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    bibliotheque.focaliserFiltre();
  } else if (e.key === 'Escape' && !document.querySelector('.voile')) {
    actions.selectionner(null);
  }
});

// Dernier filet de sécurité : une erreur imprévue s'affiche au lieu de passer inaperçue.
window.addEventListener('unhandledrejection', (e) => notifier(e.reason?.message || String(e.reason), 'erreur'));

async function demarrer() {
  try {
    const [reglages, infosApp] = await Promise.all([
      window.toolkit.reglages.lire(),
      window.toolkit.application.infos(),
    ]);
    etat.modifier({ vue: reglages.interface?.vue === 'liste' ? 'liste' : 'grille', infosApp });
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  }
  window.toolkit.projets.surChangement(actions.chargerProjets);
  await actions.chargerProjets();
}

demarrer();

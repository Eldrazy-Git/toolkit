// Point d'entrée de l'interface : branche les composants sur l'état et charge les données.
import * as etat from './composants/etat.js';
import * as actions from './composants/actions.js';
import * as barreLaterale from './composants/barre-laterale.js';
import * as bibliotheque from './composants/bibliotheque.js';
import * as details from './composants/details.js';
import * as onglets from './composants/onglets.js';
import * as reglages from './composants/reglages.js';
import { notifier } from './composants/notifications.js';

etat.abonner(() => {
  barreLaterale.rendre();
  onglets.rendre();
  bibliotheque.rendre();
  details.rendre();
  reglages.rendre();
});

document.addEventListener('keydown', (e) => {
  const touche = e.key.toLowerCase();
  if (e.ctrlKey && touche === 'f') {
    e.preventDefault();
    actions.activerOnglet(onglets.ID_BIBLIOTHEQUE);
    bibliotheque.focaliserFiltre();
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
});

// Dernier filet de sécurité : une erreur imprévue s'affiche au lieu de passer inaperçue.
window.addEventListener('unhandledrejection', (e) => notifier(e.reason?.message || String(e.reason), 'erreur'));

async function demarrer() {
  try {
    const [reglagesSauves, infosApp] = await Promise.all([
      window.toolkit.reglages.lire(),
      window.toolkit.application.infos(),
    ]);
    etat.modifier({ vue: reglagesSauves.interface?.vue === 'liste' ? 'liste' : 'grille', infosApp });
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  }
  window.toolkit.projets.surChangement(actions.chargerProjets);
  await actions.chargerProjets();
  await actions.chargerEditeurs();
}

demarrer();

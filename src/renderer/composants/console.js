// Panneau « console » : exécution d'une action de projet.json et sa sortie en direct.
// stdout en couleur normale, stderr en orange ; arrêt, relance, ouverture du dossier de sortie.
import { el } from './dom.js';
import { icone } from './icones.js';
import * as actions from './actions.js';

const api = window.toolkit.executions;

// Au-delà, les plus anciens morceaux de sortie sont retirés (pour rester fluide).
const MORCEAUX_MAX = 4000;

// id d'exécution -> { ecrire, terminer }
const actives = new Map();
api.surSortie((id, flux, texte) => actives.get(id)?.ecrire(flux, texte));
api.surFin((id, infos) => actives.get(id)?.terminer(infos));

// Retire les codes de couleur des terminaux (ex. « \x1b[32m »), illisibles ici.
function sansCodesAnsi(texte) {
  // eslint-disable-next-line no-control-regex
  return texte.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g, '').replace(/\r(?!\n)/g, '\n');
}

function dureeLisible(ms) {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  return `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
}

// onglet : { id, projetId, indexAction, valeurs, nomAction, nomProjet }
export function creerPanneauConsole(onglet, parent) {
  const puce = el('span', { classe: 'statut' });
  const boutonArreter = el('button', { classe: 'bouton petit danger', onClick: () => idExecution && api.arreter(idExecution) }, icone('carre'), 'Arrêter');
  const boutonRelancer = el('button', { classe: 'bouton petit', hidden: true, onClick: () => demarrer() }, icone('redemarrer'), 'Relancer');
  const boutonEffacer = el('button', { classe: 'bouton-icone', title: 'Effacer la console', onClick: () => sortie.replaceChildren() }, icone('effacer'));
  const commande = el('code', { classe: 'chemin-outil' });
  const sortie = el('pre', { classe: 'sortie-console' });
  const bandeau = el('div', { classe: 'bandeau-fin', hidden: true });
  const element = el('section', { classe: 'panneau panneau-console' },
    el('div', { classe: 'barre-outil' }, puce, boutonArreter, boutonRelancer, boutonEffacer, commande),
    sortie,
    bandeau);
  parent.append(element);

  let idExecution = null;
  let derniereExecution = null;
  let dernierLancement = onglet.lancement;

  function ajouter(texte, classe) {
    // Défilement automatique seulement si on est déjà en bas (sinon on laisse lire).
    const enBas = sortie.scrollHeight - sortie.scrollTop - sortie.clientHeight < 30;
    sortie.append(el('span', { classe }, texte));
    while (sortie.childNodes.length > MORCEAUX_MAX) sortie.firstChild.remove();
    if (enBas) sortie.scrollTop = sortie.scrollHeight;
  }

  function afficherEtat(enCours, texte, classe) {
    puce.className = `statut ${classe}`;
    puce.replaceChildren(texte);
    boutonArreter.hidden = !enCours;
    boutonRelancer.hidden = enCours;
    // Différé : peut être appelé pendant le rendu des onglets (voir terminal.js).
    queueMicrotask(() => actions.marquerTerminal(onglet.id, enCours));
  }

  function terminer({ code, erreur, arrete, duree, dossierApres }) {
    actives.delete(idExecution);
    const id = idExecution;
    idExecution = null;
    if (erreur) {
      ajouter(`\n${erreur}\n`, 'ligne-erreur');
      afficherEtat(false, 'Échec', 'erreur');
    } else if (arrete) {
      ajouter(`\nArrêté à ta demande (après ${dureeLisible(duree)}).\n`, 'ligne-info');
      afficherEtat(false, 'Arrêté', 'termine');
    } else if (code === 0) {
      ajouter(`\n✔ Terminé avec succès en ${dureeLisible(duree)}.\n`, 'ligne-succes');
      afficherEtat(false, '✔ Terminé', 'ok');
    } else {
      ajouter(`\n✖ Le script s'est terminé avec une erreur (code ${code}) après ${dureeLisible(duree)}.\n`, 'ligne-erreur');
      afficherEtat(false, `✖ Erreur (code ${code})`, 'erreur');
    }
    if (dossierApres) {
      bandeau.replaceChildren(
        icone('dossier'),
        el('span', {}, 'Dossier de sortie : ', el('code', {}, dossierApres)),
        el('button', { classe: 'bouton petit principal', onClick: () => api.ouvrirDossier(id).catch((e) => ajouter(`${e.message}\n`, 'ligne-erreur')) },
          'Ouvrir dans l\'Explorateur'));
      bandeau.hidden = false;
    }
  }

  async function demarrer() {
    bandeau.hidden = true;
    if (sortie.childNodes.length > 0) ajouter(`\n${'─'.repeat(60)}\n`, 'ligne-info');
    const id = crypto.randomUUID();
    if (derniereExecution) api.oublier(derniereExecution).catch(() => {});
    idExecution = id;
    derniereExecution = id;
    actives.set(id, {
      ecrire: (flux, texte) => ajouter(sansCodesAnsi(texte), flux === 'stderr' ? 'ligne-stderr' : null),
      terminer,
    });
    afficherEtat(true, '● En cours', 'ok');
    try {
      const infos = await api.lancer(id, onglet.projetId, onglet.indexAction, onglet.valeurs);
      commande.replaceChildren(infos.commande);
      commande.title = `Dans ${infos.dossier} :\n${infos.commande}`;
      ajouter(`> ${infos.commande}\n\n`, 'ligne-info');
    } catch (erreur) {
      actives.delete(id);
      idExecution = null;
      ajouter(`${erreur.message}\n`, 'ligne-erreur');
      afficherEtat(false, 'Impossible de lancer', 'erreur');
    }
  }

  demarrer();

  return {
    element,
    // Appelé à chaque rendu : relance si l'action a été recliquée (onglet.lancement a changé).
    mettreAJour(o) {
      if (o.lancement === dernierLancement || idExecution) return;
      dernierLancement = o.lancement;
      onglet.valeurs = o.valeurs;
      demarrer();
    },
    detruire() {
      if (idExecution) api.arreter(idExecution).catch(() => {});
      if (derniereExecution) api.oublier(derniereExecution).catch(() => {});
      actives.delete(idExecution);
      element.remove();
    },
  };
}

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

// Résumé d'une erreur pour l'utilisateur et pour Claude : la section « What went wrong » de
// Gradle si elle existe, sinon les dernières lignes. { titre: 1re ligne utile, texte }
function resumerErreur(texte) {
  const gradle = /\* What went wrong:\s*\n([\s\S]*?)(?:\n\* Try:|\n\* Exception is:|$)/.exec(texte);
  const lignesErreurJava = texte.split('\n').filter((l) => /: error:|^e: |error: /.test(l)).slice(0, 15);
  let resume;
  if (gradle) resume = `${gradle[1].trim()}${lignesErreurJava.length ? `\n\n${lignesErreurJava.join('\n')}` : ''}`;
  else resume = texte.trim().split('\n').slice(-40).join('\n');
  resume = resume.slice(0, 4000);
  // Titre : la première erreur du compilateur (sans le chemin complet du fichier) si elle
  // existe, plus parlante que le message général de Gradle.
  const titre = lignesErreurJava.length
    ? lignesErreurJava[0].trim().replace(/^.*[\\/]/, '')
    : resume.split('\n').map((l) => l.trim()).find((l) => l && !/^>/.test(l)) || '';
  return { titre: titre.slice(0, 200), texte: resume };
}

// Conseil simple pour les erreurs les plus courantes (sinon null).
function conseilPour(texte) {
  if (/SDK location not found|ANDROID_HOME|sdk\.dir/i.test(texte)) {
    return 'Le SDK Android est introuvable : ouvre ce projet une fois dans Android Studio (il configure le SDK), puis réessaie.';
  }
  if (/Unsupported class file major version|requires Java \d+|incompatible.*Java|Could not target platform|toolchain/i.test(texte)) {
    return 'Problème de version de Java : ce projet demande une autre version. Regarde Réglages > Programmes, ou demande à Claude.';
  }
  if (/Could not (resolve|GET|HEAD|download)|UnknownHostException|Connection (refused|timed out)|No route to host/i.test(texte)) {
    return 'Gradle n\'a pas pu télécharger ce dont il a besoin : vérifie ta connexion Internet, puis réessaie.';
  }
  if (/introuvable/i.test(texte) && /Installe|winget/i.test(texte)) return 'Un programme nécessaire est introuvable : suis les instructions ci-dessus.';
  if (/Compilation failed|compileJava|compileKotlin|: error:|^e: /m.test(texte)) {
    return 'Erreur dans le code du projet : Claude peut la lire et la corriger.';
  }
  return null;
}

// onglet : { id, projetId, indexAction, valeurs, nom }
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

  // Texte de l'exécution en cours (fin seulement), pour résumer une erreur.
  let texteExecution = '';
  let commandeLancee = '';

  function bandeauSucces(id, dossierApres, produits) {
    const ouvrir = () => api.ouvrirDossier(id).catch((e) => ajouter(`${e.message}\n`, 'ligne-erreur'));
    bandeau.className = 'bandeau-fin';
    bandeau.replaceChildren(
      icone(produits.length ? 'coche' : 'dossier'),
      produits.length
        ? el('span', {}, 'Fichier produit : ', el('code', {}, produits[0]),
          produits.length > 1 ? el('small', {}, ` (+ ${produits.length - 1} autre(s))`) : null,
          el('small', {}, ` — dans ${dossierApres}`))
        : el('span', {}, 'Dossier de sortie : ', el('code', {}, dossierApres)),
      el('button', { classe: 'bouton petit principal', onClick: ouvrir },
        produits.length ? 'Afficher dans l\'Explorateur' : 'Ouvrir dans l\'Explorateur'));
    bandeau.hidden = false;
  }

  function bandeauEchec() {
    const resume = resumerErreur(texteExecution);
    const conseil = conseilPour(texteExecution);
    bandeau.className = 'bandeau-fin echec';
    bandeau.replaceChildren(
      icone('erreur'),
      el('div', { classe: 'resume-erreur' },
        el('strong', {}, conseil || 'L\'action a échoué. Claude peut lire l\'erreur et t\'aider à la corriger.'),
        resume.titre ? el('code', {}, resume.titre) : null),
      el('button', {
        classe: 'bouton petit principal',
        title: 'Ouvre Claude dans ce projet avec l\'erreur déjà décrite',
        onClick: () => actions.demanderCorrection(onglet.projetId, onglet.nom, commandeLancee, resume.texte),
      }, icone('claude'), 'Demander à Claude de corriger'));
    bandeau.hidden = false;
  }

  function terminer({ code, erreur, arrete, duree, dossierApres, produits = [] }) {
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
    if (!arrete && (erreur || code !== 0)) bandeauEchec();
    else if (dossierApres) bandeauSucces(id, dossierApres, produits);
  }

  async function demarrer() {
    bandeau.hidden = true;
    texteExecution = '';
    if (sortie.childNodes.length > 0) ajouter(`\n${'─'.repeat(60)}\n`, 'ligne-info');
    const id = crypto.randomUUID();
    if (derniereExecution) api.oublier(derniereExecution).catch(() => {});
    idExecution = id;
    derniereExecution = id;
    actives.set(id, {
      ecrire: (flux, texte) => {
        const propre = sansCodesAnsi(texte);
        texteExecution = (texteExecution + propre).slice(-60000);
        ajouter(propre, flux === 'stderr' ? 'ligne-stderr' : null);
      },
      terminer,
    });
    afficherEtat(true, '● En cours', 'ok');
    try {
      const infos = await api.lancer(id, onglet.projetId, onglet.indexAction, onglet.valeurs);
      commandeLancee = infos.commande;
      commande.replaceChildren(infos.commande);
      commande.title = `Dans ${infos.dossier} :\n${infos.commande}`;
      for (const info of infos.infos || []) ajouter(`${info}\n`, 'ligne-info');
      ajouter(`> ${infos.commande}\n\n`, 'ligne-info');
    } catch (erreur) {
      actives.delete(id);
      idExecution = null;
      texteExecution = erreur.message;
      ajouter(`${erreur.message}\n`, 'ligne-erreur');
      afficherEtat(false, 'Impossible de lancer', 'erreur');
      bandeauEchec();
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

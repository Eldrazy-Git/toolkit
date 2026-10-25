// Détail Git d'un dépôt : modifications non enregistrées (fichiers et différences) et
// commits à envoyer / à récupérer (message, date, fichiers, différences).
// Ouvert en cliquant sur les pastilles jaune, bleue ou violette (panneau Git, détails).
import { el, ilYA } from './dom.js';
import { icone } from './icones.js';
import { notifier } from './notifications.js';
import { fenetre } from './dialogue.js';
import * as actionsGit from './actions-git.js';

const api = window.toolkit.git;

const COULEURS_ETATS = {
  modifié: 'jaune', nouveau: 'vert', ajouté: 'vert', supprimé: 'rouge', renommé: 'bleu', copié: 'bleu', 'en conflit': 'rouge',
};
// Lignes techniques de « git diff » inutiles pour l'utilisateur.
const ENTETES_DIFF = /^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|rename from|rename to|\\ No newline)/;
const LIGNES_MAX = 3000;

function badgeEtat(etat) {
  return el('span', { classe: `pastille-git petite ${COULEURS_ETATS[etat] || 'neutre'}` }, etat);
}

function info(texte) {
  return el('span', { classe: 'diff-info' }, texte);
}

// Lignes colorées d'une différence (vert = ajouté, rouge = retiré, bleu = position).
function lignesDiff(d) {
  if (d.binaire) return [info('Fichier binaire (image, archive…) : son contenu ne peut pas être affiché.')];
  const lignes = d.texte.split('\n').filter((l) => l !== '' && !ENTETES_DIFF.test(l));
  if (lignes.length === 0) return [info('Aucune différence de contenu (changement de droits ou de fins de ligne).')];
  const resultat = lignes.slice(0, LIGNES_MAX).map((l) => {
    if (l.startsWith('@@')) {
      // « +0,0 » : plus aucune ligne après le changement = fichier supprimé.
      if (/\+0,0 @@/.test(l)) return el('span', { classe: 'diff-bloc' }, 'Fichier supprimé : tout son contenu est retiré\n');
      return el('span', { classe: 'diff-bloc' }, `Vers la ligne ${/\+(\d+)/.exec(l)?.[1] || '?'}\n`);
    }
    const classe = l[0] === '+' ? 'diff-ajout' : l[0] === '-' ? 'diff-retrait' : 'diff-contexte';
    return el('span', { classe }, `${l}\n`);
  });
  if (d.nouveau) resultat.unshift(info('Nouveau fichier : tout son contenu est ajouté.\n'));
  if (d.tronque || lignes.length > LIGNES_MAX) resultat.push(info('… (fichier trop long : seul le début est affiché)'));
  return resultat;
}

// Zone qui affiche les différences d'un fichier. charger(chemin, hash) : hash absent =
// changements non enregistrés ; sinon changements apportés par ce commit.
// lire / legende : autre source de différences (ex. historique : « depuis cette version »).
export function creerZoneDiff(cible, {
  lire = (chemin, hash) => api.differences(cible, chemin, hash),
  legende = (hash) => (hash ? ` (commit ${hash.slice(0, 7)})` : ''),
} = {}) {
  const titre = el('div', { classe: 'titre-diff' }, 'Clique sur un fichier pour voir ce qui a changé dedans.');
  const contenu = el('pre', { classe: 'diff' });
  let demande = 0;
  async function charger(chemin, hash = null) {
    const numero = ++demande;
    titre.replaceChildren(icone('note'), el('code', {}, chemin), el('span', { classe: 'details-aide' }, legende(hash)));
    contenu.replaceChildren(info('Chargement…'));
    try {
      const d = await lire(chemin, hash);
      if (numero === demande) contenu.replaceChildren(...lignesDiff(d)); // sinon : un autre fichier a été demandé
    } catch (erreur) {
      contenu.replaceChildren(el('span', { classe: 'diff-retrait' }, erreur.message));
    }
  }
  return { element: el('div', { classe: 'zone-diff' }, titre, contenu), charger };
}

// Bouton d'un fichier ; au clic, il est surligné et ses différences sont chargées.
export function boutonFichier(fichier, conteneurListe, auClic) {
  const bouton = el('button', {
    classe: 'fichier-git',
    title: fichier.chemin,
    onClick: () => {
      conteneurListe.querySelectorAll('.fichier-git.choisi').forEach((b) => b.classList.remove('choisi'));
      bouton.classList.add('choisi');
      auClic();
    },
  }, badgeEtat(fichier.etat), el('span', { classe: 'chemin-fichier' }, fichier.chemin));
  return bouton;
}

// --- Modifications non enregistrées ---------------------------------------------------------

export async function afficherModifications(cible) {
  await actionsGit.rafraichir(cible);
  const e = actionsGit.etatDe(cible);
  if (!e?.estDepot || e.nbModifications === 0) {
    notifier('Aucune modification non enregistrée : tout est déjà dans un commit.');
    return;
  }
  const zone = creerZoneDiff(cible);
  const liste = el('div', { classe: 'liste-fichiers-git' });
  liste.append(...e.modifications.map((f) => boutonFichier(f, liste, () => zone.charger(f.chemin))));
  fenetre({
    titre: `Modifications non enregistrées — ${e.nom}`,
    corps: [
      el('p', { classe: 'details-aide' },
        `${e.nbModifications} fichier(s) ont changé depuis le dernier commit`
        + `${e.nbModifications > e.modifications.length ? ` (les ${e.modifications.length} premiers sont listés)` : ''}. `
        + 'Dans le détail : en vert ce qui a été ajouté, en rouge ce qui a été retiré.'),
      liste,
      zone.element,
    ],
    boutons: [{
      libelle: 'Commit…',
      style: 'principal',
      action: (fermer) => {
        fermer(null);
        actionsGit.commit(cible);
      },
    }],
  });
  liste.firstChild?.click();
}

// --- Commits à envoyer / à récupérer --------------------------------------------------------

// sens : 'envoyer' (commits de ce PC pas encore sur GitHub) ou 'recuperer' (commits de GitHub
// pas encore sur ce PC ; connus seulement après « Vérifier en ligne »).
export async function afficherCommits(cible, sens) {
  let commits;
  try {
    commits = await api.commits(cible, sens);
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
    return;
  }
  const e = actionsGit.etatDe(cible);
  if (commits.length === 0) {
    notifier(sens === 'envoyer' ? 'Aucun commit à envoyer.' : 'Aucun commit à récupérer (clique sur « Vérifier en ligne » pour interroger GitHub).');
    return;
  }
  const zone = creerZoneDiff(cible);
  const liste = el('div', { classe: 'liste-commits' });
  for (const c of commits) {
    liste.append(el('details', { classe: 'commit-git' },
      el('summary', {},
        el('span', { classe: 'commit-message' }, c.message),
        el('span', { classe: 'commit-meta', title: new Date(c.date).toLocaleString('fr-FR') },
          `${ilYA(c.date)} · ${c.auteur} · ${c.hash} · ${c.fichiers.length} fichier(s)`)),
      el('div', { classe: 'liste-fichiers-git' },
        c.fichiers.map((f) => boutonFichier(f, liste, () => zone.charger(f.chemin, c.hash))))));
  }

  const boutons = [];
  if (sens === 'envoyer' && actionsGit.peutEnvoyer(e)) {
    boutons.push({ libelle: 'Envoyer sur GitHub (Push)', style: 'principal', action: (fermer) => { fermer(null); actionsGit.pousser(cible); } });
  }
  if (sens === 'recuperer') {
    boutons.push({ libelle: 'Récupérer (Pull)', style: 'principal', action: (fermer) => { fermer(null); actionsGit.recuperer(cible); } });
  }
  fenetre({
    titre: `${sens === 'envoyer' ? 'Commits à envoyer' : 'Commits à récupérer'} — ${e?.nom || ''}`,
    corps: [
      el('p', { classe: 'details-aide' }, sens === 'envoyer'
        ? `${commits.length} version(s) enregistrée(s) sur ce PC (par toi ou par Claude) et pas encore envoyée(s) sur GitHub. Clique sur un commit pour voir ses fichiers, puis sur un fichier pour voir ses changements.`
        : `${commits.length} version(s) présente(s) sur GitHub et pas encore sur ce PC. Clique sur un commit pour voir ses fichiers, puis sur un fichier pour voir ses changements.`),
      liste,
      zone.element,
    ],
    boutons,
  });
  liste.querySelector('details')?.setAttribute('open', '');
}

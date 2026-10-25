// Fenêtre « Historique des versions » d'un projet (ou d'un seul fichier) : liste des commits,
// les sauvegardes faites avant Claude mises en avant, ce qu'une version a changé ou ce qui
// diffère depuis, et retour arrière (tout le projet ou un fichier) avec confirmation.
// Le retour arrière ne détruit rien : il crée une nouvelle version, elle-même annulable.
import { el, ilYA } from './dom.js';
import { icone } from './icones.js';
import { notifier } from './notifications.js';
import { fenetre, confirmer } from './dialogue.js';
import { creerZoneDiff, boutonFichier } from './details-git.js';
import * as actionsGit from './actions-git.js';

const api = window.toolkit.git;

const dateLongue = (date) => new Date(date).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

// options : { chemin } pour l'historique d'un seul fichier ; nom : nom affiché du projet.
export async function afficherHistorique(cible, nom, { chemin = null } = {}) {
  let versions;
  try {
    versions = await api.historique(cible, chemin);
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
    return;
  }
  if (versions.length === 0) {
    notifier(chemin
      ? 'Ce fichier n\'a encore aucune version enregistrée dans Git.'
      : 'Aucune version enregistrée : active l\'historique Git puis fais un premier commit.');
    return;
  }

  let choisie = null;
  let mode = 'version'; // 'version' : ce que la version a changé ; 'depuis' : différences avec maintenant
  let demande = 0;
  let fermerFenetre = null;

  const liste = el('div', { classe: 'liste-versions', role: 'listbox' });
  const detail = el('div', { classe: 'detail-version' });

  function ligneVersion(v, index) {
    return el('button', {
      classe: `version${v.sauvegardeClaude ? ' avant-claude' : ''}`,
      role: 'option',
      title: `${v.message}\n${dateLongue(v.date)} · ${v.auteur}`,
      onClick: () => choisir(v),
    },
    el('span', { classe: 'pastille-version' }, icone(v.sauvegardeClaude ? 'claude' : index === 0 ? 'coche' : 'git')),
    el('span', { classe: 'texte-version' },
      el('span', { classe: 'message-version' }, v.sauvegardeClaude ? 'Avant une modification par Claude' : v.message),
      el('span', { classe: 'meta-version' }, `${ilYA(v.date)} · ${v.auteur}${index === 0 ? ' · version actuelle' : ''}`)));
  }

  async function choisir(v) {
    choisie = v;
    // Une sauvegarde avant Claude : ce qui compte, c'est ce qui a changé DEPUIS.
    mode = v.sauvegardeClaude ? 'depuis' : 'version';
    liste.querySelectorAll('.version').forEach((b, i) => b.classList.toggle('choisi', versions[i] === v));
    await rendreDetail();
  }

  async function rendreDetail() {
    const v = choisie;
    const numero = ++demande;
    detail.replaceChildren(el('p', { classe: 'details-aide' }, 'Chargement…'));
    let fichiers;
    try {
      fichiers = mode === 'version' ? v.fichiers : await api.fichiersDepuis(cible, v.hash);
    } catch (erreur) {
      detail.replaceChildren(el('p', { classe: 'dialogue-erreur' }, erreur.message));
      return;
    }
    if (numero !== demande) return;
    if (chemin) fichiers = fichiers.filter((f) => f.chemin === chemin);

    const zone = creerZoneDiff(cible, mode === 'version' ? {} : {
      lire: (c) => api.differencesDepuis(cible, v.hash, c),
      legende: () => ' (rouge = comme dans cette version, vert = maintenant)',
    });
    const listeFichiers = el('div', { classe: 'liste-fichiers-git' });
    listeFichiers.append(...fichiers.map((f) => {
      const ligne = el('div', { classe: 'ligne-fichier-version' },
        boutonFichier(mode === 'depuis' ? { ...f, etat: f.etat === 'ajouté' ? 'nouveau' : f.etat } : f, listeFichiers, () => zone.charger(f.chemin, mode === 'version' ? v.hash : null)),
        el('button', {
          classe: 'bouton petit',
          title: 'Remettre ce fichier comme dans cette version',
          onClick: () => restaurer([f.chemin]),
        }, icone('annuler'), 'Remettre'));
      return ligne;
    }));

    const onglet = (valeur, libelle, aide) => el('button', {
      classe: `bouton petit${mode === valeur ? ' actif' : ''}`,
      title: aide,
      onClick: () => { mode = valeur; rendreDetail(); },
    }, libelle);

    detail.replaceChildren(
      el('div', { classe: 'entete-version' },
        el('strong', {}, v.sauvegardeClaude ? 'Sauvegarde faite juste avant que Claude modifie le projet' : v.message),
        el('span', { classe: 'details-aide' }, `${dateLongue(v.date)} · ${v.auteur} · ${v.hash.slice(0, 7)}`)),
      el('div', { classe: 'groupe-boutons choix-mode' },
        onglet('version', 'Ce que cette version a changé', 'Les changements enregistrés dans cette version'),
        onglet('depuis', 'Différences avec maintenant', 'Tout ce qui a changé depuis cette version (ce que tu perdrais en revenant en arrière)')),
      fichiers.length
        ? listeFichiers
        : el('p', { classe: 'details-aide' }, mode === 'depuis' ? 'Aucune différence : les fichiers sont identiques à cette version.' : 'Cette version ne change aucun fichier.'),
      fichiers.length ? zone.element : null);
    listeFichiers.querySelector('.fichier-git')?.click();
  }

  async function restaurer(chemins) {
    const v = choisie;
    const quoi = chemins
      ? (chemins.length === 1 ? `Le fichier « ${chemins[0]} »` : `${chemins.length} fichiers`)
      : `Tout le projet « ${nom} »`;
    const ok = await confirmer({
      titre: 'Revenir à cette version ?',
      message: `${quoi} va redevenir comme le ${dateLongue(v.date)}.\n\n`
        + '• Tes modifications en cours sont d\'abord enregistrées dans une sauvegarde.\n'
        + `• ${chemins ? 'S\'il n\'existait pas encore à ce moment-là, il est retiré' : 'Les fichiers créés depuis sont retirés'} (ils restent dans l'historique).\n`
        + '• Ce retour en arrière devient lui-même une version : tu pourras l\'annuler ici.',
      bouton: 'Revenir à cette version',
    });
    if (!ok) return;
    try {
      const r = await api.restaurer(cible, v.hash, chemins);
      notifier(r.commite ? `${quoi} est revenu à la version du ${dateLongue(v.date)}.` : 'Rien à changer : c\'était déjà identique à cette version.', 'succes');
    } catch (erreur) {
      notifier(erreur.message, 'erreur');
      return;
    }
    actionsGit.rafraichir(cible);
    fermerFenetre?.();
    afficherHistorique(cible, nom, { chemin });
  }

  liste.append(...versions.map(ligneVersion));
  const boutons = chemin ? [] : [{
    libelle: 'Remettre tout le projet comme à cette version…',
    style: 'principal',
    action: () => { if (choisie) restaurer(null); },
  }];
  fenetre({
    titre: chemin ? `Historique de « ${chemin} »` : `Historique des versions — ${nom}`,
    corps: [
      el('p', { classe: 'details-aide' },
        'Chaque ligne est une version enregistrée (commit). ',
        el('span', { classe: 'marque-claude' }, icone('claude'), ' Avant une modification par Claude'),
        ' : choisis-la puis « Remettre » pour annuler ce que Claude a changé.'),
      el('div', { classe: 'historique' }, liste, detail),
    ],
    boutons,
    // Accès à la fermeture pour rouvrir la fenêtre à jour après un retour en arrière.
    surOuverture: (fermer) => { fermerFenetre = () => fermer(null); },
  });
  choisir(versions[0]);
}

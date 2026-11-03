// Onglet « Skills » : bouton « Vérifier les projets » et rapport des ajustements à faire.
// La vérification se fait projet par projet (progression, arrêt possible). Rien n'est modifié sans clic.
import { el, ilYA } from './dom.js';
import { icone } from './icones.js';
import { ouvrirMenu } from './menu.js';
import { notifier } from './notifications.js';
import { cocher, demanderTexte } from './dialogue.js';
import * as etat from './etat.js';
import * as actions from './actions.js';

const api = window.toolkit.verification;

// Projets dépliés dans le rapport : gardés d'un rendu à l'autre (null = pas encore choisi).
let deplies = null;
let lecture = null;
let arretDemande = false;

async function essayer(fonction) {
  try {
    return await fonction();
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
    return undefined;
  }
}

export function chargerRapport() {
  if (lecture) return lecture;
  lecture = api.lire()
    .then((rapport) => etat.modifier({ verification: rapport }))
    .catch((erreur) => notifier(erreur.message, 'erreur'))
    .finally(() => { lecture = null; });
  return lecture;
}

// Choix des projets : tout est coché, il suffit de décocher (ou « Tout décocher » pour en choisir un).
export async function verifierProjets() {
  const projets = etat.obtenir().projets.filter((p) => !p.erreur);
  if (!projets.length) {
    notifier('Aucun projet à vérifier.', 'erreur');
    return;
  }
  const choix = await cocher({
    titre: 'Vérifier les projets',
    message: 'Compare les projets cochés à tes skills, puis donne la liste des ajustements. Ne modifie rien, et n\'utilise pas Claude.',
    elements: projets
      .map((p) => ({ valeur: p.id, libelle: p.fiche.nom, coche: true }))
      .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr')),
    filtrable: true,
    toutCocher: true,
    bouton: 'Vérifier',
  });
  if (!choix) return;
  if (!choix.choisis.length) {
    notifier('Coche au moins un projet à vérifier.', 'erreur');
    return;
  }
  arretDemande = false;
  deplies = null;
  await essayer(() => api.commencer());
  const noms = new Map(projets.map((p) => [p.id, p.fiche.nom]));
  const echecs = [];
  let fait = 0;
  for (const id of choix.choisis) {
    if (arretDemande) break;
    etat.modifier({ verificationEnCours: { fait, total: choix.choisis.length, nom: noms.get(id) } });
    try {
      await api.verifierProjet(id);
    } catch (erreur) {
      echecs.push(`${noms.get(id)} : ${erreur.message}`);
    }
    fait += 1;
  }
  etat.modifier({ verificationEnCours: null });
  await chargerRapport();
  if (echecs.length) notifier(`Pas de vérification pour ${echecs.join(' ; ')}`, 'erreur');
  else if (arretDemande) notifier(`Vérification arrêtée : ${fait} projet(s) vérifié(s).`);
}

async function faire(ligne, a) {
  const projet = etat.obtenir().projets.find((p) => p.id === ligne.id);
  if (!projet) {
    notifier('Ce projet n\'existe plus.', 'erreur');
    return;
  }
  // false : l'utilisateur a renoncé à l'étape de sauvegarde, Claude n'a pas été lancé.
  if (await actions.modifierAvecClaude(projet, a.demande) === false) return;
  await essayer(() => api.marquerLance(ligne.id, a.cle));
  await chargerRapport();
}

async function ignorer(ligne, a) {
  await essayer(() => api.ignorer(ligne.id, a.cle));
  await chargerRapport();
}

async function ajouterException(ligne, a) {
  const raison = await demanderTexte({
    titre: 'Ne plus détecter cet ajustement dans ce projet',
    message: `« ${a.titre} »\n\nL'exception est notée dans projet.json (la vérification la respecte) et dans le CLAUDE.md de « ${ligne.nom} » (Claude la respecte). Le code du projet ne change pas. Pourquoi cette exception ? (facultatif, mais utile plus tard)`,
    exemple: 'Par exemple : ce code a été adapté exprès',
    bouton: 'Ajouter l\'exception',
  });
  if (raison === null) return;
  const fait = await essayer(() => api.ajouterException(ligne.id, a.cle, raison));
  await chargerRapport();
  if (fait) notifier('Exception ajoutée : pense à faire un commit de ce projet (onglet « Git et GitHub »).', 'succes');
}

// Un Claude par projet coché, chacun avec sa sauvegarde Git. Un projet où Claude travaille déjà est
// laissé de côté : sa demande ne pourrait que remplacer le presse-papiers.
async function mettreAJourFiches() {
  const fiches = await essayer(() => api.fiches());
  if (!fiches?.length) {
    await chargerRapport();
    return;
  }
  const choix = await cocher({
    titre: 'Mettre à jour les fiches',
    message: 'Pour chaque projet coché : sauvegarde Git, puis un onglet Claude qui met à jour son CLAUDE.md, son projet.json ou son README, sans toucher au code, et fait un commit local. Chaque onglet utilise ton quota Claude : décoche ce qui peut attendre.',
    elements: fiches.map((f) => ({ valeur: f.id, libelle: `${f.nom} : ${f.titres.join(' ; ')}`, coche: true })),
    toutCocher: true,
    bouton: 'Lancer Claude',
  });
  if (!choix?.choisis.length) return;
  const { projets } = etat.obtenir();
  const occupes = [];
  for (const f of fiches.filter((x) => choix.choisis.includes(x.id))) {
    const projet = projets.find((p) => p.id === f.id);
    if (!projet) continue;
    if (actions.claudeOuvertSur(projet)) {
      occupes.push(f.nom);
      continue;
    }
    if (await actions.modifierAvecClaude(projet, f.demande) === false) continue;
    for (const cle of f.cles) await essayer(() => api.marquerLance(f.id, cle));
  }
  await chargerRapport();
  if (occupes.length) notifier(`Claude travaille déjà sur ${occupes.join(', ')} : ces projets n'ont pas été lancés. Relance le bouton quand il aura fini.`);
}

async function retirerException(e) {
  const fait = await essayer(() => api.retirerException(e.projet, e.cle));
  await chargerRapport();
  if (fait) notifier('Exception retirée : la prochaine vérification pourra de nouveau détecter cet ajustement.', 'succes');
}

function ligneAjustement(ligne, a) {
  const menu = a.fichiers.length
    ? el('button', {
      classe: 'bouton-icone',
      title: 'Voir les fichiers concernés',
      onClick: () => ouvrirMenu(menu, a.fichiers.map((f) => ({
        libelle: f,
        icone: 'code',
        action: () => actions.ouvrirCode({ type: 'projet', id: ligne.id }, ligne.nom, f),
      }))),
    }, icone('points'))
    : null;
  return el('div', { classe: 'ligne-git ligne-skill ligne-ajustement' },
    el('div', { classe: 'ligne-git-infos' },
      el('div', { classe: 'ligne-git-nom' },
        el('strong', {}, a.titre),
        a.gravite === 'important' ? el('span', { classe: 'pastille-git orange' }, 'Important') : null,
        a.lance ? el('span', { classe: 'pastille-git', title: 'Une prochaine vérification dira si c\'est réglé.' }, 'Claude lancé') : null),
      a.detail ? el('p', { classe: 'skill-description' }, a.detail) : null,
      el('p', { classe: 'details-aide' }, a.source.nom, a.fichiers.length ? ` · ${a.fichiers[0]}${a.fichiers.length > 1 ? ` et ${a.fichiers.length - 1} autre(s)` : ''}` : '')),
    el('div', { classe: 'ligne-git-boutons' },
      el('button', { classe: 'bouton petit principal', title: 'Sauvegarde le projet avec Git, puis ouvre Claude avec cette demande. Il t\'explique ce qu\'il compte faire avant de modifier.', onClick: () => faire(ligne, a) }, icone('claude'), 'Faire'),
      el('button', { classe: 'bouton petit', title: 'Retire cette ligne du rapport. La prochaine vérification la retrouvera.', onClick: () => ignorer(ligne, a) }, icone('croix'), 'Ignorer'),
      el('button', { classe: 'bouton petit', title: 'Ne plus détecter cet ajustement dans ce projet : noté dans son projet.json et son CLAUDE.md', onClick: () => ajouterException(ligne, a) }, icone('note'), 'Exception'),
      menu));
}

function blocProjet(ligne) {
  const nombre = ligne.ajustements.length;
  const bloc = el('details', {
    classe: 'bloc-verification',
    open: deplies.has(ligne.id),
    onToggle: () => {
      if (bloc.open) deplies.add(ligne.id);
      else deplies.delete(ligne.id);
    },
  },
  el('summary', {},
    el('strong', {}, ligne.nom),
    el('span', { classe: 'etiquette' }, `${nombre} à faire`),
    el('span', { classe: 'details-aide' }, `vérifié ${ilYA(new Date(ligne.date))}`)),
  el('div', { classe: 'liste-git' }, ligne.ajustements.map((a) => ligneAjustement(ligne, a))));
  return bloc;
}

function blocExceptions(exceptions) {
  if (!exceptions.length) return null;
  return el('details', { classe: 'bloc-verification' },
    el('summary', {}, el('strong', {}, 'Exceptions'), el('span', { classe: 'etiquette' }, String(exceptions.length))),
    el('div', { classe: 'liste-git' }, exceptions.map((e) => el('div', { classe: 'ligne-git ligne-skill' },
      el('div', { classe: 'ligne-git-infos' },
        el('div', { classe: 'ligne-git-nom' }, el('strong', {}, e.titre)),
        el('p', { classe: 'details-aide' }, e.nomProjet, ` · ${e.date}`, e.raison ? ` · ${e.raison}` : '')),
      el('div', { classe: 'ligne-git-boutons' },
        el('button', { classe: 'bouton petit', title: 'La prochaine vérification pourra de nouveau détecter cet ajustement', onClick: () => retirerException(e) }, icone('annuler'), 'Retirer'))))));
}

export function boutonVerifier() {
  const { verificationEnCours } = etat.obtenir();
  return el('button', {
    classe: 'bouton',
    disabled: Boolean(verificationEnCours),
    title: 'Comparer tes projets à tes skills, puis lister ce qu\'il reste à faire',
    onClick: verifierProjets,
  }, icone('coche'), 'Vérifier les projets');
}

export function sectionRapport() {
  const { verification, verificationEnCours } = etat.obtenir();
  if (!verification && !verificationEnCours) {
    queueMicrotask(chargerRapport);
    return null;
  }
  if (verificationEnCours) {
    return [
      el('h2', { classe: 'titre-skills' }, 'Vérification en cours'),
      el('div', { classe: 'details-boutons progression-verification' },
        el('span', { classe: 'details-aide' }, `${verificationEnCours.fait + 1} sur ${verificationEnCours.total} : ${verificationEnCours.nom}…`),
        el('button', { classe: 'bouton petit', onClick: () => { arretDemande = true; } }, 'Arrêter')),
    ];
  }
  const lignes = verification.projets || [];
  const exceptions = verification.exceptions || [];
  if (!lignes.length && !exceptions.length) return null;
  const avecTravail = lignes.filter((l) => l.ajustements.length);
  const total = avecTravail.reduce((n, l) => n + l.ajustements.length, 0);
  if (deplies === null) deplies = new Set(avecTravail.length <= 3 ? avecTravail.map((l) => l.id) : []);
  const problemes = [...new Set(lignes.flatMap((l) => l.problemes || []))];
  const nombreFiches = lignes.filter((l) => l.ajustements.some((a) => a.infos && !a.lance)).length;
  return [
    el('h2', { classe: 'titre-skills' }, `Rapport de vérification (${total} à faire)`),
    el('p', { classe: 'details-aide' }, total
      ? `${lignes.length} projet(s) vérifié(s), ${avecTravail.length} avec des ajustements. « Faire » ouvre Claude, après une sauvegarde Git : rien ne change sans ton accord.`
      : `${lignes.length} projet(s) vérifié(s) : rien à faire.`),
    nombreFiches ? el('div', { classe: 'details-boutons' },
      el('button', {
        classe: 'bouton',
        title: 'Traite d\'un coup les CLAUDE.md, projet.json et README signalés : tu choisis les projets avant que Claude se lance',
        onClick: mettreAJourFiches,
      }, icone('claude'), `Mettre à jour les fiches (${nombreFiches} projet${nombreFiches > 1 ? 's' : ''})`)) : null,
    problemes.length ? el('div', { classe: 'alerte attention' }, icone('attention'),
      el('div', {}, 'Certains contrôles n\'ont pas pu se faire :', el('ul', {}, problemes.map((p) => el('li', {}, p))))) : null,
    avecTravail.map(blocProjet),
    blocExceptions(exceptions),
  ];
}

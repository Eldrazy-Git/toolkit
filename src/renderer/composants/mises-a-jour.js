// Section « Mises à jour » des Réglages : bibliothèques de Toolkit (package.json), failles
// connues, programmes du PC. Voir src/main/mises-a-jour.js pour les règles de prudence.
import { el, ilYA } from './dom.js';
import { icone } from './icones.js';
import { notifier } from './notifications.js';
import { confirmer, fenetre, formulaire } from './dialogue.js';
import * as etat from './etat.js';
import * as actions from './actions.js';

const api = window.toolkit.misesAJour;
const GRAVITES = { critical: ['critique', 'rouge'], high: ['élevée', 'rouge'], moderate: ['moyenne', 'orange'], low: ['faible', 'jaune'], info: ['info', 'neutre'] };

// État local de la section (pas besoin de le partager ailleurs).
let infos = null; // { resultat, automatique, derniereVerification }
let enCours = false;
let erreur = null;
const coches = new Set(); // noms des bibliothèques à installer
let demandeFaite = false;
let developpement = false; // copie de développement : bouton « Publier une nouvelle version »

const redessiner = () => etat.modifier({});

async function charger() {
  try {
    infos = await api.etat();
    if (infos.resultat) preparerCoches(infos.resultat);
    developpement = await window.toolkit.publication.developpement().catch(() => false);
  } catch (e) {
    erreur = e.message;
  }
  redessiner();
}

function preparerCoches(resultat) {
  coches.clear();
  for (const p of resultat.paquets) if (p.sure || p.aInstaller) coches.add(p.nom);
}

export async function verifier() {
  if (enCours) return;
  enCours = true;
  erreur = null;
  redessiner();
  try {
    const resultat = await api.verifier();
    infos = { ...(infos || {}), resultat, derniereVerification: resultat.date };
    preparerCoches(resultat);
    actions.chargerEtatToolkit(); // le point de la barre latérale suit (résultat déjà en mémoire)
  } catch (e) {
    erreur = e.message;
  }
  enCours = false;
  redessiner();
}

async function installer() {
  const { paquets } = infos.resultat;
  const choisis = paquets.filter((p) => coches.has(p.nom) && (p.sure || p.aInstaller));
  if (!choisis.length) return;
  const { onglets } = etat.obtenir();
  if (onglets.some((o) => o.nonEnregistre)) {
    notifier('Enregistre d\'abord tes fichiers et notes : Toolkit va devoir se fermer.', 'erreur');
    return;
  }
  const occupes = onglets.filter((o) => o.enCours);
  const ok = await confirmer({
    titre: 'Installer les mises à jour',
    message: `${choisis.map((p) => `• ${p.nom} : ${p.installee} → ${p.sure?.version || p.demandee}`).join('\n')}\n\n`
      + 'Toolkit va se fermer, une fenêtre noire installe les mises à jour (une à deux minutes), puis Toolkit se relance tout seul.\n'
      + 'Une sauvegarde Git du code de Toolkit est faite avant : on peut revenir en arrière.'
      + (occupes.length ? `\n\nAttention : ${occupes.length} terminal(aux) ou script(s) en cours seront arrêtés.` : ''),
    bouton: 'Installer et redémarrer',
  });
  if (!ok) return;
  try {
    await api.installer(choisis.map((p) => ({ nom: p.nom, version: p.sure?.version || null })));
  } catch (e) {
    notifier(e.message, 'erreur');
  }
}

// Changement de version majeure : confié à Claude (lecture des notes de version, adaptation).
function demanderMajeureAClaude(p) {
  const demande = `Je voudrais passer la bibliothèque « ${p.nom} » de Toolkit de la version ${p.installee} à la version ${p.majeure.version} (changement de version majeure). `
    + 'Lis ses notes de version (changelog, guide de migration), dis-moi simplement ce qui change et les risques, puis, si je suis d\'accord, adapte le code de Toolkit. '
    + 'Important : Toolkit tourne depuis ce dossier, donc ne lance pas « npm install » toi-même (electron.exe et node-pty sont verrouillés) ; '
    + 'modifie seulement la version dans package.json et le code, fais un commit, puis dis-moi de cliquer sur « Installer » dans Réglages > Mises à jour. '
    + 'Respecte les décisions notées dans CLAUDE.md (par exemple pour Electron).';
  actions.modifierToolkitAvecClaude(demande);
}

function badge(texte, couleur) {
  return el('span', { classe: `pastille-git petite ${couleur}` }, texte);
}

const dateCourte = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

function lignePaquet(p) {
  const etats = [];
  if (p.erreur) etats.push(el('span', { classe: 'details-aide' }, p.erreur));
  if (p.aInstaller) etats.push(badge(`${p.demandee} prête à installer`, 'bleu'));
  if (p.sure) etats.push(badge(`${p.sure.version} disponible`, 'vert'), el('span', { classe: 'details-aide' }, ` publiée ${ilYA(p.sure.date)}`));
  if (p.attente) etats.push(el('span', { classe: 'details-aide' }, ` · ${p.attente.version} trop récente, proposée à partir du ${dateCourte(p.attente.disponibleLe)}`));
  if (!p.sure && !p.aInstaller && !p.erreur && !p.attente) etats.push(badge('à jour', 'neutre'));
  const cochable = Boolean(p.sure || p.aInstaller);
  return el('div', { classe: 'ligne-maj' },
    el('label', { classe: 'case-maj' },
      el('input', {
        type: 'checkbox',
        disabled: !cochable,
        ...(cochable && coches.has(p.nom) ? { checked: true } : {}),
        onChange: (e) => { if (e.target.checked) coches.add(p.nom); else coches.delete(p.nom); redessiner(); },
      }),
      el('strong', {}, p.nom),
      el('code', {}, p.installee || '—')),
    el('div', { classe: 'etat-maj' }, etats),
    p.majeure
      ? el('div', { classe: 'majeure-maj' },
        badge(`version majeure ${p.majeure.version}`, 'orange'),
        el('span', { classe: 'details-aide' }, p.majeure.mure ? ' peut demander d\'adapter le code. ' : ` publiée ${ilYA(p.majeure.date)} : mieux vaut attendre un peu. `),
        p.majeure.mure ? el('button', { classe: 'bouton petit', onClick: () => demanderMajeureAClaude(p) }, icone('claude'), 'Faire avec Claude') : null)
      : null);
}

function ligneFaille(f) {
  const [libelle, couleur] = GRAVITES[f.gravite] || [f.gravite, 'neutre'];
  return el('div', { classe: 'ligne-maj' },
    el('div', { classe: 'case-maj' }, badge(libelle, couleur), el('strong', {}, f.nom), f.via.length ? el('span', { classe: 'details-aide' }, `(dans ${f.via.join(', ')})`) : null),
    el('ul', { classe: 'titres-faille' }, f.titres.slice(0, 4).map((t) => el('li', {}, t))),
    f.remarque ? el('p', { classe: 'remarque-faille' }, icone('info'), f.remarque) : null);
}

function ligneProgramme(p) {
  return el('div', { classe: 'ligne-maj' },
    el('div', { classe: 'case-maj' }, el('strong', {}, p.nom), el('code', {}, p.installee || 'non trouvé')),
    el('div', { classe: 'etat-maj' },
      p.aJour === null ? el('span', { classe: 'details-aide' }, 'Impossible de comparer.')
        : p.aJour ? badge('à jour', 'neutre')
          : [badge(`${p.derniere} disponible`, 'vert'),
            el('span', { classe: 'details-aide' }, ' Dans PowerShell : '),
            el('code', { classe: 'commande-maj' }, p.commande),
            el('button', {
              classe: 'bouton-icone',
              title: 'Copier la commande',
              onClick: () => navigator.clipboard.writeText(p.commande).then(() => notifier('Commande copiée : colle-la dans PowerShell (clic droit).')).catch(() => {}),
            }, icone('note'))]));
}

// --- Nouvelle version de Toolkit lui-même --------------------------------------------------------

const liste = (titre, fichiers, aide) => (fichiers.length
  ? el('div', { classe: 'groupe-maj-toolkit' }, el('strong', {}, `${titre} (${fichiers.length})`), aide ? el('p', { classe: 'details-aide' }, aide) : null,
    el('ul', {}, fichiers.slice(0, 30).map((f) => el('li', {}, el('code', {}, f))), fichiers.length > 30 ? el('li', {}, `… et ${fichiers.length - 30} autre(s)`) : null))
  : null);

// Claude finit la fusion des fichiers modifiés des deux côtés (proposé après le redémarrage).
export function demanderFusionAClaude(version, fichiers) {
  actions.modifierToolkitAvecClaude(`Toolkit vient d'être mis à jour vers la version ${version}. Ces fichiers avaient été modifiés à la fois par moi et dans la version officielle, et n'ont pas pu être fusionnés automatiquement : ${fichiers.join(', ')}. `
    + `C'est MA version qui est en place. La version officielle d'avant est dans .mise-a-jour/${version}/base/ et la nouvelle dans .mise-a-jour/${version}/nouveau/ (mêmes chemins). `
    + 'Pour chaque fichier, intègre dans mon fichier les changements faits par la version officielle (compare base et nouveau), SANS retirer mes propres ajouts ni changer mes réglages. '
    + 'Explique-moi simplement ce que tu fais, vérifie la syntaxe, puis fais un commit. Je redémarrerai Toolkit ensuite.');
}

async function installerToolkit() {
  const { onglets } = etat.obtenir();
  if (onglets.some((o) => o.nonEnregistre)) {
    notifier('Enregistre d\'abord tes fichiers et notes : Toolkit va devoir redémarrer.', 'erreur');
    return;
  }
  notifier('Préparation de la mise à jour (téléchargement et comparaison avec tes modifications)…');
  let plan;
  try {
    plan = await api.analyserToolkit();
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
    return;
  }
  const corps = el('div', { classe: 'resume-maj-toolkit' },
    el('p', {}, `Toolkit ${plan.actuelle} → ${plan.version}. Tes projets et tes réglages ne sont pas touchés, et une sauvegarde Git est faite avant (tout reste annulable avec l'historique).`),
    el('p', {}, `${plan.misAJour} fichier(s) de Toolkit seront mis à jour.`),
    liste('Tes modifications gardées telles quelles', plan.gardes, 'Fichiers que tu as modifiés et que la nouvelle version ne change pas.'),
    liste('Fusionnés automatiquement', plan.fusionnes, 'Modifiés par toi ET par la nouvelle version : les deux sont combinés.'),
    liste('À finir avec Claude', plan.conflits, 'Modifiés des deux côtés au même endroit : TA version est gardée. Après le redémarrage, Claude pourra y intégrer les nouveautés officielles.'),
    liste('Gardés bien que retirés de la version officielle', plan.gardesMalgreRetrait, 'Tu les avais modifiés : ils ne sont pas supprimés.'),
    plan.dependancesChangees ? el('p', { classe: 'details-aide' }, 'Les bibliothèques changent : une fenêtre noire les installera pendant le redémarrage (une à deux minutes).') : null);
  let confirme = false;
  await fenetre({
    titre: `Installer Toolkit ${plan.version} ?`,
    corps,
    boutons: [{ libelle: 'Installer et redémarrer', style: 'principal', action: (fermer) => { confirme = true; fermer(null); } }],
  });
  if (!confirme) return;
  try {
    const r = await api.appliquerToolkit();
    if (r.conflits.length) {
      try { localStorage.setItem('toolkit:maj:conflits', JSON.stringify({ version: r.version, fichiers: r.conflits })); } catch { /* proposé seulement maintenant */ }
    }
    if (r.dependancesChangees) await api.installer([]);
    else await window.toolkit.application.redemarrer();
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
  }
}

// Après le redémarrage : proposer à Claude de finir les fusions restantes.
export async function proposerFinDeFusion() {
  let attente = null;
  try {
    attente = JSON.parse(localStorage.getItem('toolkit:maj:conflits') || 'null');
    localStorage.removeItem('toolkit:maj:conflits');
  } catch { /* rien en attente */ }
  if (!attente?.fichiers?.length) return;
  const ok = await confirmer({
    titre: `Toolkit ${attente.version} est installé`,
    message: `${attente.fichiers.length} fichier(s) que tu avais modifiés ont aussi changé dans la nouvelle version : ta version est gardée pour l'instant.\n\nDemander à Claude d'y intégrer les nouveautés officielles, en gardant tes ajouts ?`,
    bouton: 'Demander à Claude',
  });
  if (ok) demanderFusionAClaude(attente.version, attente.fichiers);
}

function blocToolkit(t) {
  if (!t) return null;
  if (t.erreur) return el('p', { classe: 'details-aide' }, `Nouvelles versions de Toolkit : vérification impossible (${t.erreur}).`);
  if (!t.disponible) return el('p', {}, badge('à jour', 'neutre'), ` Toolkit ${t.actuelle} est la dernière version.`);
  const notes = el('article', { classe: 'markdown notes-version' });
  notes.innerHTML = t.derniere.notesHtml || ''; // rendu par le processus principal, HTML brut désactivé
  return el('div', { classe: 'carte-maj-toolkit' },
    el('div', { classe: 'titre-maj-toolkit' }, icone('redemarrer'), el('strong', {}, `Toolkit ${t.derniere.version} est disponible`), el('span', { classe: 'details-aide' }, `(tu as la ${t.actuelle})`)),
    t.derniere.notesHtml ? notes : null,
    el('p', { classe: 'details-aide' }, 'Tes projets, tes réglages et ce que tu as ajouté ou modifié dans Toolkit sont gardés.'),
    el('button', { classe: 'bouton principal', onClick: installerToolkit }, icone('importer'), 'Installer la mise à jour…'));
}

// --- Publier une nouvelle version (copie de développement seulement) ---------------------------

const NIVEAUX = [['correctif', 'corrections seulement'], ['nouveautes', 'nouveautés'], ['majeure', 'très gros changement (refonte…)']];
let publicationEnCours = false;

// Choix du numéro (conseillé d'après les commits) et des notes, confirmation, puis publication
// avec l'avancement affiché étape par étape.
async function publierVersion() {
  if (publicationEnCours) return;
  notifier('Préparation : vérification de GitHub et des changements depuis la dernière version…');
  let p;
  try {
    p = await window.toolkit.publication.preparer();
  } catch (e) {
    notifier(e.message, 'erreur');
    return;
  }
  let choix;
  if (p.reprise) {
    const ok = await confirmer({
      titre: `Terminer la publication de Toolkit ${p.reprise} ?`,
      message: `La publication de la version ${p.reprise} a été commencée mais n'est pas allée jusqu'au bout (pas encore de Release sur GitHub).\n\nToolkit va refabriquer l'installateur, envoyer les commits et créer la Release.`,
      bouton: 'Terminer la publication',
    });
    if (!ok) return;
    choix = { version: p.reprise, notes: p.notes || `Toolkit ${p.reprise}` };
  } else {
    const liste = p.commits.slice(0, 10).map((c) => `• ${c}`).join('\n') + (p.commits.length > 10 ? `\n… et ${p.commits.length - 10} autre(s)` : '');
    choix = await formulaire({
      titre: 'Publier une nouvelle version de Toolkit',
      message: `${p.commits.length} changement(s) depuis la version ${p.derniere} :\n${liste}\n\nConseil : ${p.raison}`,
      champs: [
        {
          id: 'version',
          libelle: 'Numéro de la nouvelle version',
          type: 'choix',
          valeur: p.versions[p.suggestion],
          options: NIVEAUX.map(([niveau, libelle]) => ({ valeur: p.versions[niveau], libelle: `${p.versions[niveau]} : ${libelle}${niveau === p.suggestion ? ' (conseillé)' : ''}` })),
        },
        {
          id: 'notes',
          libelle: 'Notes de version',
          type: 'zone',
          valeur: p.notes,
          obligatoire: true,
          aide: 'Montrées aux utilisateurs avant d\'installer. Une ligne « - … » par changement, en phrases simples (tu peux reformuler).',
        },
      ],
      bouton: 'Continuer',
    });
    if (!choix) return;
    const ok = await confirmer({
      titre: `Publier Toolkit ${choix.version} ?`,
      message: `Toolkit va :\n• noter le numéro ${choix.version} et les notes de version (commit) ;\n• fabriquer l'installateur ;\n• envoyer les commits sur GitHub, créer l'étiquette v${choix.version} et la Release.\n\n`
        + 'Tous les Toolkit installés verront cette version dans Réglages > Mises à jour. Une version publiée ne doit plus être retirée : publie seulement ce que tu as essayé.',
      bouton: 'Publier',
    });
    if (!ok) return;
  }

  publicationEnCours = true;
  const etapes = el('ul', { classe: 'etapes-publication' });
  const fin = el('div');
  const arreterEcoute = window.toolkit.publication.surEtape((texte) => etapes.append(el('li', {}, texte)));
  fenetre({ titre: `Publication de Toolkit ${choix.version}`, corps: [etapes, fin] });
  try {
    const r = await window.toolkit.publication.publier(choix);
    etapes.append(el('li', {}, el('strong', {}, `Toolkit ${r.version} est publié.`)));
    if (r.url) {
      fin.append(el('button', { classe: 'bouton principal', onClick: () => window.toolkit.liens.ouvrirExterne(r.url).catch(() => {}) },
        icone('exporter'), 'Voir la Release sur GitHub'));
    }
    notifier(`Toolkit ${r.version} est publié.`);
  } catch (e) {
    fin.append(el('p', { classe: 'dialogue-erreur' }, e.message));
  } finally {
    arreterEcoute();
    publicationEnCours = false;
  }
}

function blocPublication() {
  return el('div', { classe: 'details-boutons' },
    el('button', { classe: 'bouton', onClick: publierVersion }, icone('tag'), 'Publier une nouvelle version…'),
    el('span', { classe: 'details-aide' }, 'Copie de développement : numéro choisi d\'après tes changements, puis envoi sur GitHub.'));
}

export function section() {
  if (!demandeFaite) {
    demandeFaite = true;
    queueMicrotask(charger);
  }
  const r = infos?.resultat;
  const aInstaller = r ? r.paquets.filter((p) => coches.has(p.nom) && (p.sure || p.aInstaller)) : [];
  return el('section', { classe: 'section-reglages section-maj' },
    el('h2', {}, 'Mises à jour'),
    el('p', { classe: 'details-aide' },
      'Bibliothèques utilisées par Toolkit et programmes du PC. Une version publiée depuis moins de 7 jours n\'est pas encore proposée. ',
      'Les « versions majeures », qui peuvent demander d\'adapter le code, se font avec Claude.'),
    el('div', { classe: 'details-boutons' },
      el('button', { classe: 'bouton', disabled: enCours, onClick: verifier }, icone('recherche'), enCours ? 'Vérification…' : 'Vérifier maintenant'),
      el('label', { classe: 'champ-case en-ligne' },
        el('input', {
          type: 'checkbox',
          ...(infos?.automatique !== false ? { checked: true } : {}),
          onChange: (e) => api.automatique(e.target.checked).then(() => { infos = { ...(infos || {}), automatique: e.target.checked }; }).catch(() => {}),
        }),
        'Vérifier automatiquement une fois par semaine'),
      infos?.derniereVerification ? el('span', { classe: 'details-aide' }, `Dernière vérification : ${ilYA(infos.derniereVerification)}`) : null),
    erreur ? el('p', { classe: 'dialogue-erreur' }, erreur) : null,
    developpement ? [el('h3', {}, 'Publier Toolkit'), blocPublication()] : null,
    r ? [
      el('h3', {}, 'Toolkit'),
      blocToolkit(r.toolkit),
      el('h3', {}, 'Bibliothèques de Toolkit'),
      r.paquets.map(lignePaquet),
      el('p', { classe: 'details-aide' }, 'Electron : décision notée dans CLAUDE.md (passer à une nouvelle version majeure seulement quand elle a quelques correctifs).'),
      el('div', { classe: 'details-boutons' },
        el('button', { classe: 'bouton principal', disabled: !aInstaller.length, onClick: installer }, icone('importer'),
          aInstaller.length ? `Installer ${aInstaller.length} mise(s) à jour et redémarrer` : 'Rien à installer')),
      el('h3', {}, 'Failles de sécurité connues'),
      r.audit === null ? el('p', { classe: 'details-aide' }, 'Vérification impossible (npm audit n\'a pas répondu).')
        : r.audit.length ? r.audit.map(ligneFaille) : el('p', { classe: 'details-aide' }, 'Aucune faille connue.'),
      el('h3', {}, 'Programmes du PC'),
      el('p', { classe: 'details-aide' }, 'Ils sont installés pour tout le PC : Toolkit ne les met pas à jour lui-même. Copie la commande et lance-la dans PowerShell.'),
      r.programmes.map(ligneProgramme),
    ] : (enCours ? null : el('p', { classe: 'details-aide' }, 'Clique sur « Vérifier maintenant » (connexion Internet nécessaire).')));
}

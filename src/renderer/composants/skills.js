// Onglet « Skills » : bibliothèque personnelle de skills (voir docs/skills.md et src/main/skills.js).
import { el } from './dom.js';
import { icone } from './icones.js';
import { ouvrirMenu } from './menu.js';
import { notifier } from './notifications.js';
import { choisir, confirmer, formulaire } from './dialogue.js';
import * as etat from './etat.js';
import * as actions from './actions.js';
import * as actionsGit from './actions-git.js';
import { boutonVerifier, sectionRapport } from './verification.js';

export const ID_SKILLS = 'skills';

const api = window.toolkit.skills;
const CIBLE_SKILLS = { type: 'skills' };

const panneau = el('section', { id: 'skills', classe: 'panneau panneau-reglages inactif' });
document.getElementById('zone-contenu').append(panneau);

export function element() {
  return panneau;
}

// --- Données ---------------------------------------------------------------------------------

let lecture = null;

export function chargerSkills() {
  if (lecture) return lecture;
  lecture = api.lister()
    .then((donnees) => {
      const avant = etat.obtenir().skills?.propositions?.length;
      etat.modifier({ skills: donnees, skillsDate: Date.now() });
      if (avant !== undefined && donnees.propositions.length > avant) {
        notifier('Claude propose un nouveau skill : à accepter ou à refuser dans l\'onglet « Skills ».');
      }
    })
    .catch((erreur) => {
      etat.modifier({ skillsDate: Date.now() }); // pas de nouvel essai à chaque rendu
      notifier(erreur.message, 'erreur');
    })
    .finally(() => { lecture = null; });
  return lecture;
}

// --- Actions ---------------------------------------------------------------------------------

async function essayer(fonction) {
  try {
    return await fonction();
  } catch (erreur) {
    notifier(erreur.message, 'erreur');
    return undefined;
  }
}

function demandeAmeliorerSkill(s) {
  return `Je veux améliorer le skill « ${s.id} » (\`.claude/skills/${s.id}/SKILL.md\`). Lis-le, puis demande-moi ce que je veux changer. Quand c'est fait, fais un commit local.`;
}

function demandeContenuSkill(cree, valeurs) {
  return `Écris le skill « ${cree.id} » (\`.claude/skills/${cree.id}/SKILL.md\`), que je viens de créer. Ce qu'il doit faire : ${valeurs.description}\n`
    + 'Pose-moi tes questions avant de commencer, puis fais un commit local.';
}

function demandeAnciensKits(anciens) {
  return `Ma bibliothèque contient encore d'anciens kits, que Toolkit n'utilise plus : ${anciens.map((id) => `\`${id}/\``).join(', ')} `
    + '(un dossier par kit, avec kit.json, guide et fichiers). Pour chacun, dis-moi s\'il contient un vrai savoir-faire '
    + '(règles, pièges, choix pas évidents) qui mériterait un skill, ou s\'il ne fait que reprendre une bibliothèque ou une documentation qui existe déjà. '
    + 'Donne-moi la liste et attends mon accord. Ensuite seulement : écris les skills retenus (une façon de faire, pas du code figé à recopier), '
    + 'retire les dossiers des kits avec git rm (l\'historique Git les garde), et fais un commit local.';
}

async function creerSkill() {
  const valeurs = await formulaire({
    titre: 'Créer un skill',
    message: 'Un skill donne à Claude une façon de faire pour une tâche précise (étapes, règles, pièges), dans tous tes projets.',
    champs: [
      { id: 'nom', libelle: 'Nom', obligatoire: true, exemple: 'Par exemple : Revue de code' },
      { id: 'description', libelle: 'Ce qu\'il fait et quand l\'utiliser', obligatoire: true, aide: 'Claude s\'en sert pour décider quand utiliser ce skill.' },
    ],
    bouton: 'Créer',
  });
  if (!valeurs) return;
  const cree = await essayer(() => api.creer(valeurs));
  if (!cree) return;
  await chargerSkills();
  actionsGit.rafraichir(CIBLE_SKILLS);
  const choix = await choisir({
    titre: 'Skill créé',
    message: `« ${cree.id} » est dans ta bibliothèque. Il reste à écrire ses instructions : Claude peut s'en charger.`,
    boutons: [
      { libelle: 'Plus tard', valeur: 'plus-tard' },
      { libelle: 'Continuer avec Claude', valeur: 'claude', style: 'principal' },
    ],
  });
  if (choix === 'claude') await actions.ameliorerSkillsAvecClaude(demandeContenuSkill(cree, valeurs));
}

// --- Propositions de Claude ------------------------------------------------------------------

async function accepterProposition(p) {
  const ok = await confirmer({
    titre: `Accepter « ${p.nom} »`,
    message: `${p.fichiers.length} fichier(s) entreront dans ta bibliothèque (skills/.claude/skills/${p.id}) et dans son historique Git. Claude pourra ensuite utiliser ce skill dans tous tes projets.`
      + (p.avertissements.length ? `\n\nÀ vérifier avant d'accepter :\n${p.avertissements.map((a) => `• ${a}`).join('\n')}` : ''),
    bouton: 'Accepter',
  });
  if (!ok) return;
  const resultat = await essayer(() => api.accepterProposition(p.id));
  await chargerSkills();
  if (resultat) {
    actionsGit.rafraichir(CIBLE_SKILLS);
    notifier(`« ${resultat.nom} » est dans ta bibliothèque.`, 'succes');
  }
}

async function refuserProposition(p) {
  const ok = await confirmer({
    titre: `Refuser « ${p.nom} »`,
    message: 'La proposition part à la Corbeille et n\'entre pas dans ta bibliothèque. Toolkit note ce refus pour que Claude ne la propose plus.',
    bouton: 'Refuser',
    danger: true,
  });
  if (!ok) return;
  await essayer(() => api.refuserProposition(p.id));
  await chargerSkills();
}

function demandeProposition(p) {
  const correction = p.problemes.length ? ` Elle ne peut pas être acceptée pour l'instant :\n${p.problemes.map((t) => `- ${t}`).join('\n')}\nCorrige ces problèmes.` : ' Lis-la, puis demande-moi ce que je veux changer.';
  return `Je veux retoucher la proposition \`propositions/${p.id}/\` avant de décider.${correction} Reste dans ce dossier : elle n'entre pas dans la bibliothèque tant que je ne l'ai pas acceptée dans Toolkit.`;
}

function ligneProposition(p) {
  const fichierPrincipal = p.fichiers.includes('SKILL.md') ? 'SKILL.md' : p.fichiers[0];
  const menu = el('button', {
    classe: 'bouton-icone',
    title: 'Autres actions',
    onClick: () => ouvrirMenu(menu, [
      { libelle: 'Voir les fichiers', icone: 'code', action: () => actions.ouvrirCode(CIBLE_SKILLS, 'Skills', fichierPrincipal ? `propositions/${p.id}/${fichierPrincipal}` : null) },
      { libelle: 'Retoucher avec Claude', icone: 'claude', action: () => actions.ameliorerSkillsAvecClaude(demandeProposition(p)) },
    ]),
  }, icone('points'));
  const bloquee = p.problemes.length > 0;
  return el('div', { classe: 'ligne-git ligne-skill ligne-proposition' },
    el('div', { classe: 'ligne-git-infos' },
      el('div', { classe: 'ligne-git-nom' }, el('strong', {}, p.nom), el('span', { classe: 'etiquette type' }, 'Skill')),
      p.description ? el('p', { classe: 'skill-description' }, p.description) : null,
      p.motif ? el('p', { classe: 'details-aide proposition-motif' }, p.motif) : null,
      bloquee ? el('div', { classe: 'alerte erreur proposition-alerte' }, icone('erreur'),
        el('div', {}, 'À corriger avant de pouvoir l\'accepter :', el('ul', {}, p.problemes.map((t) => el('li', {}, t))))) : null,
      p.avertissements.length ? el('div', { classe: 'alerte attention proposition-alerte' }, icone('attention'),
        el('div', {}, 'Peut-être propre à un projet ou à ce PC :', el('ul', {}, p.avertissements.map((t) => el('li', {}, t))))) : null),
    el('div', { classe: 'ligne-git-boutons' },
      el('button', { classe: 'bouton petit principal', disabled: bloquee, title: bloquee ? 'À corriger d\'abord (voir la liste)' : 'Faire entrer cette proposition dans ta bibliothèque', onClick: () => accepterProposition(p) }, icone('coche'), 'Accepter'),
      el('button', { classe: 'bouton petit', title: 'Envoyer cette proposition à la Corbeille', onClick: () => refuserProposition(p) }, icone('croix'), 'Refuser'),
      menu));
}

function sectionPropositions(propositions) {
  if (!propositions.length) return null;
  return [
    el('h2', { classe: 'titre-skills' }, `Propositions de Claude (${propositions.length})`),
    el('p', { classe: 'details-aide' }, 'Rien de tout cela n\'est utilisé tant que tu ne l\'as pas accepté.'),
    el('div', { classe: 'liste-git' }, propositions.map(ligneProposition)),
  ];
}

// --- Anciens kits (avant la version 1.18) -----------------------------------------------------

function sectionAnciens(donnees) {
  const anciens = donnees.anciensKits || [];
  const alertes = [];
  if (donnees.ancienDossier) {
    alertes.push(el('div', { classe: 'alerte attention' }, icone('attention'),
      el('div', {}, 'Un dossier « kits » existe encore à côté du dossier « skills » de Toolkit. Toolkit ne s\'en sert plus et ne le fusionne pas : regarde ce qu\'il contient, puis range-le toi-même.')));
  }
  if (anciens.length) {
    alertes.push(el('div', { classe: 'alerte attention' }, icone('attention'),
      el('div', {},
        el('p', { classe: 'skill-description' }, `Ta bibliothèque contient encore ${anciens.length} ancien(s) kit(s) : ${anciens.join(', ')}. Toolkit ne s'en sert plus.`),
        el('p', { classe: 'details-aide' }, 'Claude peut garder sous forme de skills ce qui est un vrai savoir-faire, puis retirer le reste (l\'historique Git garde tout). Il te montre la liste avant.'),
        el('div', { classe: 'details-boutons' },
          el('button', { classe: 'bouton petit', title: 'Sauvegarde la bibliothèque avec Git puis ouvre Claude dans son dossier', onClick: () => actions.ameliorerSkillsAvecClaude(demandeAnciensKits(anciens)) }, icone('claude'), 'Transformer avec Claude')))));
  }
  return alertes.length ? alertes : null;
}

// --- Affichage -------------------------------------------------------------------------------

function ligneSkill(s) {
  const menu = el('button', {
    classe: 'bouton-icone',
    title: 'Autres actions',
    onClick: () => ouvrirMenu(menu, [
      { libelle: 'Voir le fichier', icone: 'code', action: () => actions.ouvrirCode(CIBLE_SKILLS, 'Skills', `.claude/skills/${s.id}/SKILL.md`) },
    ]),
  }, icone('points'));
  return el('div', { classe: 'ligne-git ligne-skill' },
    el('div', { classe: 'ligne-git-infos' },
      el('div', { classe: 'ligne-git-nom' }, el('strong', {}, s.id)),
      el('p', { classe: 'skill-description' }, s.description || '(sans description)')),
    el('div', { classe: 'ligne-git-boutons' },
      el('button', {
        classe: 'bouton petit',
        title: 'Sauvegarde la bibliothèque avec Git puis ouvre Claude dans son dossier',
        onClick: () => actions.ameliorerSkillsAvecClaude(demandeAmeliorerSkill(s)),
      }, icone('claude'), 'Améliorer avec Claude'),
      menu));
}

function pageAbsente() {
  return [
    el('p', { classe: 'details-aide' }, 'Tes skills donnent à Claude ta façon de faire (étapes, règles, pièges) pour concevoir tous tes projets. Toolkit n\'en fournit aucun : ils t\'appartiennent. La bibliothèque est créée à ta première utilisation.'),
    el('div', { classe: 'details-boutons' },
      el('button', { classe: 'bouton principal', onClick: actionsGit.creerBibliotheque }, icone('plus'), 'Créer la bibliothèque'),
      el('button', { classe: 'bouton', title: 'Sur un autre PC : copie ton dépôt GitHub privé de skills', onClick: recupererDepuisGithub }, icone('importer'), 'Récupérer depuis GitHub')),
  ];
}

async function recupererDepuisGithub() {
  await actionsGit.chargerGithub();
  await actionsGit.recupererBibliotheque();
}

export function rendre() {
  const { skillsOuvert, skills: donnees, skillsDate } = etat.obtenir();
  if (!skillsOuvert) return;
  if (!donnees && !skillsDate) queueMicrotask(chargerSkills);
  const entete = el('div', { classe: 'entete-git' },
    el('h1', {}, 'Skills'),
    donnees?.existe ? el('div', { classe: 'details-boutons' },
      el('button', { classe: 'bouton', onClick: chargerSkills }, icone('redemarrer'), 'Actualiser'),
      boutonVerifier(),
      el('button', { classe: 'bouton', title: 'Ouvre Claude dans la bibliothèque (sauvegarde Git avant)', onClick: () => actions.ameliorerSkillsAvecClaude() }, icone('claude'), 'Améliorer avec Claude'),
      el('button', { classe: 'bouton', title: 'Commit, Push, Pull et dépôt GitHub privé de la bibliothèque', onClick: actions.ouvrirGit }, icone('git'), 'Git et GitHub')) : null);
  if (!donnees) {
    panneau.replaceChildren(el('div', { classe: 'page-reglages page-git' }, entete, el('p', { classe: 'details-aide' }, 'Chargement…')));
    return;
  }
  if (!donnees.existe) {
    panneau.replaceChildren(el('div', { classe: 'page-reglages page-git' }, entete, pageAbsente()));
    return;
  }
  const skills = donnees.skills || [];
  panneau.replaceChildren(el('div', { classe: 'page-reglages page-git' },
    entete,
    el('p', { classe: 'details-aide legende-git' }, 'Ta façon de faire, à toi : Toolkit n\'en fournit aucun. Claude Code charge ces skills tout seul et s\'en sert pour concevoir tes projets.'),
    el('div', { classe: 'details-boutons barre-skills' },
      el('button', { classe: 'bouton principal', onClick: creerSkill }, icone('plus'), 'Créer un skill')),
    sectionAnciens(donnees),
    sectionRapport(),
    sectionPropositions(donnees.propositions || []),
    el('h2', { classe: 'titre-skills' }, `Skills (${skills.length})`),
    skills.length
      ? el('div', { classe: 'liste-git' }, skills.map(ligneSkill))
      : el('p', { classe: 'details-aide' }, 'Aucun skill pour l\'instant.')));
}

// Vérification des projets par rapport à la bibliothèque de skills (voir docs/skills.md).
// Déterministe et sans Claude : aucun quota consommé. L'analyse ne modifie jamais un projet ; seules
// ajouterException() et retirerException() écrivent, à la demande de l'utilisateur.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const chemins = require('./chemins');
const projets = require('./projets');
const skills = require('./skills');
const git = require('./git');
const journal = require('./journal');
const { lireJson, ecrireJson, ecrireSection } = require('./fichiers');

const FICHIER_REGLES = 'verification.json';
const TAILLE_MAX_LECTURE = 2 * 1024 * 1024;
const DUREE_CACHE = 60 * 1000;
const DUREE_MAX_SCRIPT = 180 * 1000;
const FICHIERS_MAX_PROJET = 100000;
const DEBUT_SECTION = '<!-- toolkit:exceptions (section tenue à jour par Toolkit : ne pas la modifier à la main) -->';
const FIN_SECTION = '<!-- /toolkit:exceptions -->';
const SUITE_DEMANDE = '\n\nExplique-moi d\'abord simplement ce que tu comptes faire, et attends mon accord avant de modifier quoi que ce soit. '
  + 'Fais ensuite un commit local, sans push.';

// Parcours d'un projet sans Git : dossiers générés ignorés.
const DOSSIERS_IGNORES = new Set(['node_modules', 'build', 'bin', 'out', 'dist', 'run', 'target', '__pycache__', 'venv']);

// Fichiers d'informations d'un projet, à sa racine (bouton « Mettre à jour les fiches »).
const FICHIER_INFOS = /^(CLAUDE\.md|projet\.json|README(\.(md|txt))?)$/i;
const SUITE_FICHES = '\n\nNe modifie que CLAUDE.md, projet.json et le README : ni le code, ni les réglages, ni les sections entre <!-- toolkit:… --> et <!-- /toolkit:… -->. '
  + 'Écris seulement ce que tu as vérifié dans le projet ; si tu ne sais pas, pose-moi la question au lieu de deviner. '
  + 'Fais ensuite un commit local, sans push, puis dis-moi ce que tu as écrit et les questions restées ouvertes.';

const fichierRapport = () => path.join(chemins.donnees, 'verification-projets.json');
const uniques = (liste) => [...new Set(liste)];

// --- Fichiers d'un projet -----------------------------------------------------------------------

// Tous les fichiers que Git suit ou pourrait suivre ; à défaut de dépôt, le parcours habituel.
async function fichiersDuProjet(dossier) {
  if (await git.estDepot(dossier).catch(() => false)) {
    const r = await git.git(dossier, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
    if (r.code === 0) return uniques(r.sortie.split('\0').filter(Boolean));
  }
  const liste = [];
  const file = [dossier];
  while (file.length && liste.length < FICHIERS_MAX_PROJET) {
    const courant = file.shift();
    for (const e of await fs.readdir(courant, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && !DOSSIERS_IGNORES.has(e.name)) file.push(path.join(courant, e.name));
      } else if (e.isFile()) {
        liste.push(path.relative(dossier, path.join(courant, e.name)).split(path.sep).join('/'));
      }
    }
  }
  return liste;
}

// Lecteur de texte d'un projet : jamais un fichier sensible, un binaire ou un fichier énorme.
function lecteurDeTexte(dossier) {
  const memoire = new Map();
  return async (relatif) => {
    if (memoire.has(relatif)) return memoire.get(relatif);
    let texte = null;
    if (!git.EXPRESSION_SECRETS.test(relatif)) {
      const chemin = path.join(dossier, ...relatif.split('/'));
      const infos = await fs.stat(chemin).catch(() => null);
      if (infos?.isFile() && infos.size <= TAILLE_MAX_LECTURE) {
        const tampon = await fs.readFile(chemin).catch(() => null);
        if (tampon && !tampon.includes(0)) texte = tampon.toString('utf8');
      }
    }
    memoire.set(relatif, texte);
    return texte;
  };
}

// --- Bibliothèque : ce qu'il faut vérifier --------------------------------------------------------

// « **/*.{kt,java} » -> expression régulière sur un chemin relatif.
function motifVersExpression(motif) {
  let sortie = '';
  for (let i = 0; i < motif.length; i += 1) {
    const c = motif[i];
    if (c === '*' && motif[i + 1] === '*') {
      if (motif[i + 2] === '/') {
        sortie += '(?:.*/)?';
        i += 2;
      } else {
        sortie += '.*';
        i += 1;
      }
    } else if (c === '*') sortie += '[^/]*';
    else if (c === '?') sortie += '[^/]';
    else if (c === '{') sortie += '(?:';
    else if (c === '}') sortie += ')';
    else if (c === ',') sortie += '|';
    else sortie += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${sortie}$`, 'i');
}

function preparerCondition(c) {
  if (!c || typeof c.fichiers !== 'string' || !c.fichiers.trim()) throw new Error('chaque condition de « si » doit donner « fichiers »');
  const prete = { fichiers: motifVersExpression(c.fichiers) };
  if (typeof c.contient === 'string') prete.contient = new RegExp(c.contient, 'm');
  else if (typeof c.ne_contient_pas === 'string') prete.neContientPas = new RegExp(c.ne_contient_pas, 'm');
  else if (typeof c.existe === 'boolean') prete.existe = c.existe;
  else if (typeof c.taille_min_ko === 'number') prete.tailleMin = c.taille_min_ko * 1024;
  else throw new Error('une condition doit donner « contient », « ne_contient_pas », « existe » ou « taille_min_ko »');
  return prete;
}

function preparerRegle(brute, source) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(brute?.id || '')) throw new Error('chaque règle doit avoir un « id » (minuscules, chiffres, tirets)');
  if (typeof brute.titre !== 'string' || !brute.titre.trim()) throw new Error(`la règle « ${brute.id} » doit avoir un « titre »`);
  if (!Array.isArray(brute.si) || !brute.si.length) throw new Error(`la règle « ${brute.id} » doit avoir des conditions « si »`);
  return {
    cle: `${source.genre}:${source.id}:${brute.id}`,
    source,
    titre: brute.titre.trim(),
    detail: typeof brute.detail === 'string' ? brute.detail.trim() : '',
    gravite: brute.gravite === 'important' ? 'important' : 'conseil',
    types: Array.isArray(brute.types) ? brute.types : null,
    demande: typeof brute.demande === 'string' ? brute.demande.trim() : '',
    conditions: brute.si.map(preparerCondition),
    // D'après les conditions et pas les fichiers trouvés : un CLAUDE.md absent n'en donne aucun.
    infos: brute.si.every((c) => FICHIER_INFOS.test(c.fichiers)),
  };
}

// Règles et scripts d'un skill. Une erreur n'empêche jamais le reste de la vérification.
async function lireReglesDe(dossier, source, resultat) {
  let brut;
  try {
    brut = await lireJson(path.join(dossier, FICHIER_REGLES));
  } catch (erreur) {
    if (erreur.code === 'ENOENT') return;
    resultat.problemes.push(`${source.nom} : ${FICHIER_REGLES} est illisible.`);
    return;
  }
  try {
    for (const regle of Array.isArray(brut?.regles) ? brut.regles : []) resultat.regles.push(preparerRegle(regle, source));
    if (brut?.script) {
      const relatif = brut.script.chemin;
      if (typeof relatif !== 'string' || !relatif || relatif.includes(':') || /^[\\/]/.test(relatif) || relatif.split(/[\\/]/).includes('..')) {
        throw new Error('« script.chemin » doit rester dans son dossier');
      }
      resultat.scripts.push({
        source,
        chemin: path.join(dossier, ...relatif.split(/[\\/]/)),
        arguments: Array.isArray(brut.script.arguments) ? brut.script.arguments.filter((a) => typeof a === 'string') : [],
        types: Array.isArray(brut.script.types) ? brut.script.types : null,
        demande: typeof brut.script.demande === 'string' ? brut.script.demande.trim() : '',
      });
    }
  } catch (erreur) {
    resultat.problemes.push(`${source.nom} : ${FICHIER_REGLES} à corriger (${erreur.message}).`);
  }
}

let cache = null;

async function bibliotheque() {
  if (cache && Date.now() - cache.date < DUREE_CACHE) return cache;
  const resultat = { date: Date.now(), skills: [], regles: [], scripts: [], problemes: [] };
  resultat.skills = await skills.listerSkills();
  for (const s of resultat.skills) {
    await lireReglesDe(path.join(chemins.skills, '.claude', 'skills', s.id), { genre: 'skill', id: s.id, nom: `Skill « ${s.id} »` }, resultat);
  }
  cache = resultat;
  return resultat;
}

function oublierBibliotheque() {
  cache = null;
}

// --- Contrôles --------------------------------------------------------------------------------

async function evaluerRegle(regle, dossier, fichiers, lire) {
  const trouves = [];
  for (const c of regle.conditions) {
    const liste = fichiers.filter((f) => c.fichiers.test(f));
    if (c.existe !== undefined) {
      if ((liste.length > 0) !== c.existe) return null;
      if (c.existe) trouves.push(...liste);
    } else if (c.tailleMin !== undefined) {
      const gros = [];
      for (const f of liste) {
        const infos = await fs.stat(path.join(dossier, ...f.split('/'))).catch(() => null);
        if (infos && infos.size >= c.tailleMin) gros.push(f);
      }
      if (!gros.length) return null;
      trouves.push(...gros);
    } else {
      const expression = c.contient || c.neContientPas;
      const avec = [];
      for (const f of liste) {
        const texte = await lire(f);
        if (texte !== null && expression.test(texte)) avec.push(f);
      }
      if (c.contient) {
        if (!avec.length) return null;
        trouves.push(...avec);
      } else if (avec.length) {
        return null;
      }
    }
  }
  return uniques(trouves);
}

function demandePar(modele, source, titre, detail, fichiers) {
  const liste = fichiers.join(', ');
  if (modele) return modele.replaceAll('{{fichiers}}', liste).replaceAll('{{titre}}', titre).replaceAll('{{detail}}', detail);
  return `Suis le skill \`${source.id}\`. À traiter dans ce projet : ${titre}.${detail ? ` ${detail}` : ''}${liste ? ` Fichiers concernés : ${liste}.` : ''}`;
}

// Avant la version 1.18, Toolkit ajoutait des « kits » aux projets (champ « kits » de projet.json,
// sections <!-- toolkit:kit=…= --> du CLAUDE.md). Ces déclarations ne servent plus : le code reste.
async function ajustementAnciensKits(lire) {
  let declares = [];
  try {
    const brut = JSON.parse((await lire('projet.json')) || '{}');
    if (Array.isArray(brut.kits)) declares = brut.kits.map((k) => k?.id).filter((id) => typeof id === 'string');
  } catch {
    // fiche illisible : signalée ailleurs
  }
  const sections = [...((await lire('CLAUDE.md')) || '').matchAll(/<!-- toolkit:kit=([a-z0-9-]+)=/g)].map((m) => m[1]);
  const kits = uniques([...declares, ...sections]);
  if (!kits.length) return [];
  return [{
    cle: 'toolkit:anciens-kits',
    source: { genre: 'toolkit', id: 'anciens-kits', nom: 'Toolkit' },
    gravite: 'conseil',
    titre: 'Le projet déclare encore des kits, que Toolkit n\'utilise plus',
    detail: `Kits déclarés : ${kits.join(', ')}. Leur code reste dans le projet ; seules les déclarations sont à retirer.`,
    fichiers: ['projet.json', 'CLAUDE.md'],
    // Sections toolkit:… à retirer : « Mettre à jour les fiches » les interdit, donc pas concerné.
    infos: false,
    demande: `Ce projet déclare encore des kits (${kits.join(', ')}), que Toolkit n'utilise plus. Retire le champ « kits » de projet.json `
      + 'et, dans CLAUDE.md, les sections entre <!-- toolkit:kit=…= --> et <!-- /toolkit:kit=…= -->. Ne change pas le code du projet. '
      + 'Si ces sections contenaient des règles encore utiles au projet, réécris-les simplement dans CLAUDE.md, sans renvoyer vers le dossier « kits ».',
  }];
}

async function ajustementsDesRegles(fiche, dossier, fichiers, lire, bib) {
  const sortie = [];
  for (const regle of bib.regles) {
    if (regle.types && !regle.types.includes(fiche.type)) continue;
    const trouves = await evaluerRegle(regle, dossier, fichiers, lire);
    if (!trouves) continue;
    sortie.push({
      cle: regle.cle,
      source: regle.source,
      gravite: regle.gravite,
      titre: regle.titre,
      detail: regle.detail,
      fichiers: trouves.slice(0, 6),
      demande: demandePar(regle.demande, regle.source, regle.titre, regle.detail, trouves.slice(0, 20)),
      infos: regle.infos,
    });
  }
  return sortie;
}

// Le programme de Toolkit sert aussi de Node : rien à installer sur le PC.
function lancerScript(script, dossier) {
  return new Promise((resoudre, rejeter) => {
    execFile(process.execPath, [script.chemin, dossier, ...script.arguments], {
      cwd: dossier,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: DUREE_MAX_SCRIPT,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    }, (erreur, sortie) => {
      // Un code de sortie différent de zéro peut seulement dire « quelque chose a été trouvé ».
      if (erreur && (erreur.killed || typeof erreur.code !== 'number')) rejeter(erreur);
      else resoudre(sortie);
    });
  });
}

async function ajustementsDesScripts(fiche, dossier, bib, problemes) {
  const sortie = [];
  for (const script of bib.scripts) {
    if (script.types && !script.types.includes(fiche.type)) continue;
    let resultat;
    try {
      resultat = JSON.parse(await lancerScript(script, dossier));
    } catch (erreur) {
      journal.erreur(`Vérification : script de ${script.source.nom}`, erreur);
      problemes.push(`${script.source.nom} : son script de vérification n'a pas abouti pour ce projet.`);
      continue;
    }
    for (const a of Array.isArray(resultat?.ajustements) ? resultat.ajustements : []) {
      if (typeof a?.cle !== 'string' || typeof a?.titre !== 'string') continue;
      const fichiers = Array.isArray(a.fichiers) ? a.fichiers.filter((f) => typeof f === 'string') : [];
      const detail = typeof a.detail === 'string' ? a.detail : '';
      sortie.push({
        cle: `${script.source.genre}:${script.source.id}:${a.cle}`,
        source: script.source,
        gravite: a.gravite === 'conseil' ? 'conseil' : 'important',
        titre: a.titre,
        detail,
        fichiers: fichiers.slice(0, 6),
        demande: demandePar(script.demande, script.source, a.titre, detail, fichiers.slice(0, 20)),
      });
    }
  }
  return sortie;
}

// --- Analyse (aucune écriture) ----------------------------------------------------------------

// Renvoie { ajustements (à faire), problemes, exceptions (nombre écarté) }. Les exceptions du
// projet sont retirées de la liste.
async function analyserProjet(id) {
  const projet = await projets.chargerProjet(id);
  if (!projet) throw new Error(`Le projet « ${id} » est introuvable.`);
  if (projet.erreur) throw new Error(`La fiche de « ${id} » est illisible : ${projet.erreur}`);
  const { fiche } = projet;
  const dossier = path.join(chemins.projets(), id);
  const bib = await bibliotheque();
  const fichiers = await fichiersDuProjet(dossier);
  const lire = lecteurDeTexte(dossier);
  const problemes = [...bib.problemes];
  const aFaire = [
    ...await ajustementAnciensKits(lire),
    ...await ajustementsDesRegles(fiche, dossier, fichiers, lire, bib),
    ...await ajustementsDesScripts(fiche, dossier, bib, problemes),
  ];
  const ecartees = new Set((fiche.exceptions_verification || []).map((e) => e.cle));
  const ajustements = aFaire
    .filter((a) => !ecartees.has(a.cle))
    .map((a) => ({ ...a, demande: `${a.demande}${SUITE_DEMANDE}` }))
    .sort((a, b) => (a.gravite === b.gravite ? a.titre.localeCompare(b.titre, 'fr') : a.gravite === 'important' ? -1 : 1));
  return { ajustements, problemes, exceptions: aFaire.length - ajustements.length };
}

// --- Rapport (donnees/verification-projets.json, jamais versionné) -------------------------------

async function lireFichierRapport() {
  try {
    const brut = await lireJson(fichierRapport());
    if (!brut || typeof brut.projets !== 'object' || !brut.projets) return { projets: {} };
    for (const entree of Object.values(brut.projets)) entree.ajustements = entree.ajustements || [];
    return brut;
  } catch (erreur) {
    if (erreur.code !== 'ENOENT') journal.erreur('Rapport de vérification illisible :', erreur);
    return { projets: {} };
  }
}

async function ecrireFichierRapport(rapport) {
  await fs.mkdir(chemins.donnees, { recursive: true });
  await ecrireJson(fichierRapport(), rapport);
}

// Un ajustement qui ne concerne que les fichiers d'informations du projet. Sans « infos » (script
// d'un skill, rapport plus ancien) : d'après les fichiers signalés.
function concerneLesInfos(a) {
  if (typeof a.infos === 'boolean') return a.infos;
  return (a.fichiers || []).length > 0 && a.fichiers.every((f) => FICHIER_INFOS.test(f));
}

// Ce que l'interface affiche : les projets qui existent encore, et les exceptions de chaque projet.
async function lire() {
  const rapport = await lireFichierRapport();
  const liste = (await projets.listerProjets()).filter((p) => !p.erreur);
  const noms = new Map(liste.map((p) => [p.id, p.fiche.nom]));
  const lignes = Object.entries(rapport.projets)
    .filter(([id]) => noms.has(id))
    .map(([id, entree]) => ({ id, nom: noms.get(id), ...entree, ajustements: entree.ajustements.map((a) => ({ ...a, infos: concerneLesInfos(a) })) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const exceptions = liste.flatMap((p) => (p.fiche.exceptions_verification || []).map((e) => ({ projet: p.id, nomProjet: p.fiche.nom, ...e })));
  return { projets: lignes, exceptions };
}

// Projets du rapport dont les fichiers d'informations restent à mettre à jour, avec une seule demande
// à Claude par projet. Ce qui a déjà été lancé n'est pas repris.
async function fichesAMettreAJour() {
  const { projets: lignes } = await lire();
  const sortie = [];
  for (const ligne of lignes) {
    const points = ligne.ajustements.filter((a) => a.infos && !a.lance);
    if (!points.length) continue;
    const liste = points.map((a) => `- ${a.titre}. ${a.demande.replace(SUITE_DEMANDE, '')}`).join('\n');
    sortie.push({
      id: ligne.id,
      nom: ligne.nom,
      cles: points.map((a) => a.cle),
      titres: points.map((a) => a.titre),
      demande: `Mets à jour les fichiers d'informations de ce projet. Points relevés par « Vérifier les projets » :\n${liste}${SUITE_FICHES}`,
    });
  }
  return sortie;
}

// Vérifie un projet et remplace ses résultats dans le rapport : ce qui avait été ignoré revient.
async function verifierProjet(id) {
  const resultat = await analyserProjet(id);
  const rapport = await lireFichierRapport();
  rapport.projets[id] = { date: new Date().toISOString(), ...resultat };
  await ecrireFichierRapport(rapport);
  return resultat;
}

async function modifierEntree(id, modification) {
  const rapport = await lireFichierRapport();
  const entree = rapport.projets[id];
  if (!entree) return null;
  const retour = modification(entree);
  await ecrireFichierRapport(rapport);
  return retour;
}

// Ignorer : retire la ligne du rapport actuel seulement. La prochaine vérification la retrouve.
function ignorer(id, cle) {
  return modifierEntree(id, (entree) => {
    entree.ajustements = entree.ajustements.filter((a) => a.cle !== cle);
  });
}

// « Faire » a été cliqué : la ligne reste jusqu'à la prochaine vérification, qui dira si c'est réglé.
function marquerLance(id, cle) {
  return modifierEntree(id, (entree) => {
    const a = entree.ajustements.find((x) => x.cle === cle);
    if (a) a.lance = true;
  });
}

// --- Exceptions : projet.json (lu par la vérification) et CLAUDE.md (lu par Claude) ---------------

const uneLigne = (texte) => String(texte || '').replace(/\s+/g, ' ').replace(/-->/g, '').trim();

function texteSection(exceptions) {
  if (!exceptions.length) return null;
  return [
    DEBUT_SECTION,
    '## Vérifications écartées',
    '',
    'L\'utilisateur a décidé de ne pas appliquer ces ajustements à ce projet. Ne les propose pas et ne les fais pas, sauf s\'il le demande.',
    '',
    ...exceptions.map((e) => `- **${e.titre}** (\`${e.cle}\`, ${e.date})${e.raison ? ` : ${e.raison}` : ''}`),
    FIN_SECTION,
  ].join('\n');
}

async function ecrireExceptions(id, nomProjet, exceptions) {
  await projets.modifierFiche(id, { exceptions_verification: exceptions });
  await ecrireSection(path.join(chemins.projets(), id, 'CLAUDE.md'), DEBUT_SECTION, FIN_SECTION, texteSection(exceptions), { creerSi: `# ${nomProjet}\n\n` });
}

async function ajouterException(id, cle, raison) {
  const projet = await projets.chargerProjet(id);
  if (!projet || projet.erreur) throw new Error('Ce projet n\'est pas disponible.');
  const rapport = await lireFichierRapport();
  const entree = rapport.projets[id];
  const ajustement = (entree?.ajustements || []).find((a) => a.cle === cle);
  if (!ajustement) throw new Error('Cet ajustement n\'est plus dans le rapport : relance la vérification.');
  const exceptions = (projet.fiche.exceptions_verification || []).filter((e) => e.cle !== cle);
  exceptions.push({ cle, titre: uneLigne(ajustement.titre), raison: uneLigne(raison), date: new Date().toISOString().slice(0, 10) });
  await ecrireExceptions(id, projet.fiche.nom, exceptions);
  await ignorer(id, cle);
  return { cle };
}

async function retirerException(id, cle) {
  const projet = await projets.chargerProjet(id);
  if (!projet || projet.erreur) throw new Error('Ce projet n\'est pas disponible.');
  await ecrireExceptions(id, projet.fiche.nom, (projet.fiche.exceptions_verification || []).filter((e) => e.cle !== cle));
  return { cle };
}

module.exports = {
  analyserProjet,
  verifierProjet,
  oublierBibliotheque,
  lire,
  fichesAMettreAJour,
  ignorer,
  marquerLance,
  ajouterException,
  retirerException,
  motifVersExpression,
};

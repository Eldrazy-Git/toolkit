// Vérification des projets par rapport à la bibliothèque de kits et de skills (voir docs/kits.md).
// Déterministe et sans Claude : aucun quota consommé. L'analyse ne modifie jamais un projet ; seules
// ajouterException() et retirerException() écrivent, à la demande de l'utilisateur.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const chemins = require('./chemins');
const projets = require('./projets');
const kits = require('./kits');
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

// Détection du code recopié d'un kit : seules les lignes qui disent quelque chose comptent.
const EXTENSIONS_CODE = new Set(['.js', '.mjs', '.cjs', '.ts', '.css', '.html', '.py', '.java', '.kt', '.kts', '.xml']);
const LONGUEUR_MIN_LIGNE = 24;
const LIGNES_MIN_COMMUNES = 8;
const PART_MIN_COMMUNE = 0.35;
const LIGNE_SANS_INTERET = /^(\/\/|\/\*|\*|#|<!--|import\s|package\s|from\s+\S+\s+import\s|using\s)/;

const fichierRapport = () => path.join(chemins.donnees, 'verification-kits.json');
const uniques = (liste) => [...new Set(liste)];

// --- Fichiers d'un projet -----------------------------------------------------------------------

// Tous les fichiers que Git suit ou pourrait suivre ; à défaut de dépôt, le parcours habituel.
async function fichiersDuProjet(dossier) {
  if (await git.estDepot(dossier).catch(() => false)) {
    const r = await git.git(dossier, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
    if (r.code === 0) return uniques(r.sortie.split('\0').filter(Boolean));
  }
  const liste = [];
  await kits.parcourirProjet(dossier, (chemin) => {
    liste.push(path.relative(dossier, chemin).split(path.sep).join('/'));
    return liste.length >= FICHIERS_MAX_PROJET;
  });
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

function lignesSignificatives(texte) {
  const lignes = new Set();
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trim().replace(/\s+/g, ' ');
    if (ligne.length >= LONGUEUR_MIN_LIGNE && !LIGNE_SANS_INTERET.test(ligne) && !ligne.includes('{{')) lignes.add(ligne);
  }
  return lignes;
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
  };
}

// Règles et scripts d'un skill ou d'un kit. Une erreur n'empêche jamais le reste de la vérification.
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

// Un kit qui écrit à la racine du projet est un point de départ (nouveau projet), pas un composant
// qu'on remplace dans un projet existant : il n'entre pas dans la détection du code recopié.
function kitComposant(kit) {
  return kit.genre === 'code' && (kit.fichiers || []).every((g) => {
    const destinations = typeof g.vers === 'string' ? [g.vers] : Object.values(g.vers || {});
    return destinations.every((d) => d !== '.' && d !== './');
  });
}

async function lignesDuKit(k) {
  const lignes = new Set();
  const parcourir = async (dossier) => {
    for (const e of await fs.readdir(dossier, { withFileTypes: true }).catch(() => [])) {
      const chemin = path.join(dossier, e.name);
      if (e.isDirectory()) await parcourir(chemin);
      else if (e.isFile() && EXTENSIONS_CODE.has(path.extname(e.name).toLowerCase())) {
        const infos = await fs.stat(chemin).catch(() => null);
        if (!infos || infos.size > TAILLE_MAX_LECTURE) continue;
        const tampon = await fs.readFile(chemin).catch(() => null);
        if (tampon && !tampon.includes(0)) for (const l of lignesSignificatives(tampon.toString('utf8'))) lignes.add(l);
      }
    }
  };
  for (const groupe of k.kit.fichiers || []) await parcourir(path.join(k.dossier, ...String(groupe.source).split('/')));
  return lignes;
}

let cache = null;

async function bibliotheque() {
  if (cache && Date.now() - cache.date < DUREE_CACHE) return cache;
  const resultat = { date: Date.now(), kits: [], skills: [], regles: [], scripts: [], problemes: [], empreintes: [] };
  resultat.kits = (await kits.listerKits()).filter((k) => !k.erreur);
  resultat.skills = await kits.listerSkills();
  for (const s of resultat.skills) {
    await lireReglesDe(path.join(chemins.kits, '.claude', 'skills', s.id), { genre: 'skill', id: s.id, nom: `Skill « ${s.id} »` }, resultat);
  }
  for (const k of resultat.kits) {
    await lireReglesDe(k.dossier, { genre: 'kit', id: k.id, nom: `Kit « ${k.kit.nom} »` }, resultat);
    if (kitComposant(k.kit)) {
      const lignes = await lignesDuKit(k);
      if (lignes.size >= LIGNES_MIN_COMMUNES) resultat.empreintes.push({ k, lignes });
    }
  }
  cache = resultat;
  return resultat;
}

function oublierBibliotheque() {
  cache = null;
}

// --- Contrôles --------------------------------------------------------------------------------

function ajustementsDesKits(fiche, bib) {
  const sortie = [];
  for (const entree of fiche.kits || []) {
    const k = bib.kits.find((x) => x.id === entree.id);
    if (!k) {
      sortie.push({
        cle: `kit-absent:${entree.id}`,
        source: { genre: 'kit', id: entree.id, nom: `Kit « ${entree.id} »` },
        gravite: 'conseil',
        titre: `Le kit « ${entree.id} » n'est plus dans ta bibliothèque`,
        detail: `Le projet le déclare en version ${entree.version}, mais ta bibliothèque ne l'a plus, ou il est à corriger.`,
        fichiers: [],
        demande: `Le kit « ${entree.id} » de ce projet n'est plus dans ma bibliothèque. Regarde ce que le projet en utilise, et dis-moi s'il faut retirer sa déclaration de projet.json et de CLAUDE.md, ou garder le code tel quel.`,
      });
    } else if (kits.comparerVersions(k.kit.version, entree.version) > 0) {
      sortie.push({
        cle: `kit-version:${entree.id}`,
        source: { genre: 'kit', id: entree.id, nom: `Kit « ${k.kit.nom} »` },
        gravite: 'important',
        titre: `Le kit « ${k.kit.nom} » peut passer de la version ${entree.version} à la version ${k.kit.version}`,
        detail: 'Rien n\'est mis à jour automatiquement.',
        fichiers: [],
        demande: `Mets à jour le kit « ${k.kit.nom} » de ce projet, de la version ${entree.version} à la version ${k.kit.version}. `
          + `La bibliothèque est ouverte dans ta session : compare ce projet avec \`kits/${k.id}/\` (kit.json, fichiers, guide, règles), `
          + 'reporte les changements en gardant ce qui a été adapté à ce projet, puis mets à jour la version dans projet.json (champ « kits ») '
          + `et la section \`toolkit:kit=${k.id}=\` de CLAUDE.md. Ne modifie pas la bibliothèque.`,
      });
    }
  }
  return sortie;
}

// Le projet contient-il du code très proche d'un kit qu'il ne déclare pas ?
async function ajustementsCodeRecopie(fiche, fichiers, lire, bib) {
  const installes = new Set((fiche.kits || []).map((e) => e.id));
  const candidates = bib.empreintes.filter((e) => !installes.has(e.k.id) && kits.convientAuType(e.k.kit, fiche.type));
  if (!candidates.length) return [];
  const communes = new Map(candidates.map((e) => [e.k.id, { lignes: new Set(), parFichier: new Map() }]));
  for (const relatif of fichiers) {
    if (!EXTENSIONS_CODE.has(path.extname(relatif).toLowerCase())) continue;
    const texte = await lire(relatif);
    if (!texte) continue;
    const lignes = lignesSignificatives(texte);
    for (const e of candidates) {
      const c = communes.get(e.k.id);
      let nombre = 0;
      for (const l of lignes) {
        if (e.lignes.has(l)) {
          c.lignes.add(l);
          nombre += 1;
        }
      }
      if (nombre) c.parFichier.set(relatif, nombre);
    }
  }
  const sortie = [];
  for (const e of candidates) {
    const c = communes.get(e.k.id);
    const part = c.lignes.size / e.lignes.size;
    if (c.lignes.size < LIGNES_MIN_COMMUNES || part < PART_MIN_COMMUNE) continue;
    const principaux = [...c.parFichier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f]) => f);
    const pourcent = Math.round(part * 100);
    sortie.push({
      cle: `kit-recopie:${e.k.id}`,
      source: { genre: 'kit', id: e.k.id, nom: `Kit « ${e.k.kit.nom} »` },
      gravite: 'conseil',
      titre: `Du code ressemble au kit « ${e.k.kit.nom} »`,
      detail: `${pourcent} % des lignes du kit se retrouvent dans ce projet. Le kit n'y est pourtant pas déclaré.`,
      fichiers: principaux,
      demande: `Le code de ce projet ressemble au kit « ${e.k.kit.nom} » (\`kits/${e.k.id}/\`) : ${pourcent} % de ses lignes s'y retrouvent, surtout dans ${principaux.join(', ')}. `
        + 'Suis le skill `migrer-vers-kit` s\'il existe. Compare d\'abord les deux, dis-moi ce que le kit apporterait et ce que le projet risquerait de perdre, puis dis-moi si la migration en vaut la peine.',
    });
  }
  return sortie;
}

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
  const qui = source.genre === 'skill' ? `Suis le skill \`${source.id}\`. ` : `Le guide du kit est dans \`kits/${source.id}/guide.md\`. `;
  return `${qui}À traiter dans ce projet : ${titre}.${detail ? ` ${detail}` : ''}${liste ? ` Fichiers concernés : ${liste}.` : ''}`;
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

// Renvoie { ajustements, problemes, exceptions (nombre écarté) }. Les exceptions du projet sont retirées.
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
  const tous = [
    ...ajustementsDesKits(fiche, bib),
    ...await ajustementsCodeRecopie(fiche, fichiers, lire, bib),
    ...await ajustementsDesRegles(fiche, dossier, fichiers, lire, bib),
    ...await ajustementsDesScripts(fiche, dossier, bib, problemes),
  ];
  const ecartees = new Set((fiche.exceptions_verification || []).map((e) => e.cle));
  const ajustements = tous
    .filter((a) => !ecartees.has(a.cle))
    .map((a) => ({ ...a, demande: `${a.demande}${SUITE_DEMANDE}` }))
    .sort((a, b) => (a.gravite === b.gravite ? a.titre.localeCompare(b.titre, 'fr') : a.gravite === 'important' ? -1 : 1));
  return { ajustements, problemes, exceptions: tous.length - ajustements.length };
}

// --- Rapport (donnees/verification-kits.json, jamais versionné) ---------------------------------

async function lireFichierRapport() {
  try {
    const brut = await lireJson(fichierRapport());
    return brut && typeof brut.projets === 'object' && brut.projets ? brut : { projets: {} };
  } catch (erreur) {
    if (erreur.code !== 'ENOENT') journal.erreur('Rapport de vérification illisible :', erreur);
    return { projets: {} };
  }
}

async function ecrireFichierRapport(rapport) {
  await fs.mkdir(chemins.donnees, { recursive: true });
  await ecrireJson(fichierRapport(), rapport);
}

// Ce que l'interface affiche : les projets qui existent encore, et les exceptions de chaque projet.
async function lire() {
  const rapport = await lireFichierRapport();
  const liste = (await projets.listerProjets()).filter((p) => !p.erreur);
  const noms = new Map(liste.map((p) => [p.id, p.fiche.nom]));
  const lignes = Object.entries(rapport.projets)
    .filter(([id]) => noms.has(id))
    .map(([id, entree]) => ({ id, nom: noms.get(id), ...entree }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const exceptions = liste.flatMap((p) => (p.fiche.exceptions_verification || []).map((e) => ({ projet: p.id, nomProjet: p.fiche.nom, ...e })));
  return { projets: lignes, exceptions };
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
  const ajustement = rapport.projets[id]?.ajustements?.find((a) => a.cle === cle);
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
  ignorer,
  marquerLance,
  ajouterException,
  retirerException,
  motifVersExpression,
};

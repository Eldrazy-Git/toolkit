// Commande pour la bibliothèque de kits (voir docs/kits.md) : lister et ajouter un kit à un projet.
// Ne pose jamais de question : Claude la lance sans saisie possible.
'use strict';

const path = require('node:path');
const chemins = require('../src/main/chemins');
const reglages = require('../src/main/reglages');
const projets = require('../src/main/projets');
const journal = require('../src/main/journal');
const kits = require('../src/main/kits');

const AIDE = `Bibliothèque de kits de Toolkit

  node kit.js lister [--type <type>] [--langage <langage>] [--projet <dossier>]
  node kit.js ajouter <kit> [--projet <dossier>] [--var nom=valeur]... [--essai]

--projet   dossier du projet dans projets/ (par défaut : le projet où la commande est lancée)
--var      valeur d'une variable du kit (ex. --var package=fr.exemple.outil)
--essai    montre ce qui serait fait, sans rien écrire
Types    : ${projets.TYPES.join(', ')}
Langages : ${kits.LANGAGES.join(', ')}`;

function lireArguments(liste) {
  const options = { positions: [], variables: {} };
  const suivant = (i, nom) => {
    if (i + 1 >= liste.length) throw new Error(`Il manque une valeur après ${nom}.`);
    return liste[i + 1];
  };
  for (let i = 0; i < liste.length; i += 1) {
    const a = liste[i];
    if (a === '--essai') options.essai = true;
    else if (a === '--aide' || a === '--help' || a === '-h') options.aide = true;
    else if (a === '--projet' || a === '--type' || a === '--langage') {
      options[a.slice(2)] = suivant(i, a);
      i += 1;
    } else if (a === '--var') {
      const texte = suivant(i, a);
      const position = texte.indexOf('=');
      if (position < 1) throw new Error(`« --var ${texte} » : écris --var nom=valeur.`);
      options.variables[texte.slice(0, position)] = texte.slice(position + 1);
      i += 1;
    } else if (a.startsWith('--')) throw new Error(`Option inconnue : ${a}.`);
    else options.positions.push(a);
  }
  return options;
}

// Le projet nommé, sinon celui où la commande est lancée.
function projetVise(options) {
  if (options.projet) return options.projet;
  const relatif = path.relative(chemins.projets(), process.cwd());
  const premier = relatif.split(path.sep)[0];
  return !relatif || path.isAbsolute(relatif) || premier === '..' ? null : premier;
}

async function lister(options) {
  let { type, langage } = options;
  if (type && !projets.TYPES.includes(type)) throw new Error(`Type inconnu : « ${type} » (attendu : ${projets.TYPES.join(', ')}).`);
  if (langage && !kits.LANGAGES.includes(langage)) throw new Error(`Langage inconnu : « ${langage} » (attendu : ${kits.LANGAGES.join(', ')}).`);
  let projet = null;
  if (options.projet) {
    projet = await projets.chargerProjet(options.projet);
    if (!projet) throw new Error(`Le projet « ${options.projet} » est introuvable.`);
    type = projet.fiche.type;
  }
  await kits.ecrireCatalogue();
  const tous = await kits.listerKits();
  const valides = [];
  for (const k of tous.filter((x) => !x.erreur)) {
    if (type && !kits.convientAuType(k.kit, type)) continue;
    if (langage && k.kit.langages && !k.kit.langages.includes(langage)) continue;
    if (projet && k.kit.langages && !(await kits.projetALangage(path.join(chemins.projets(), projet.id), type, k.kit.langages))) continue;
    valides.push(k);
  }
  if (!valides.length) console.log(tous.length ? 'Aucun kit ne correspond.' : 'Aucun kit pour l\'instant.');
  for (const { id, kit: k } of valides) {
    const present = projet?.fiche.kits.find((i) => i.id === id);
    const types = k.types === 'tous' ? 'tous les types' : k.types.join(', ');
    console.log(`${id} ${k.version} [${k.genre === 'regles' ? 'règles' : 'code'} ; ${types}${k.langages ? ` ; ${k.langages.join(', ')}` : ''}]${present ? ` (déjà dans le projet : ${present.version})` : ''}`);
    console.log(`  ${k.description}`);
  }
  const invalides = tous.filter((k) => k.erreur);
  if (invalides.length) {
    console.log('\nKits inutilisables (à corriger) :');
    for (const k of invalides) console.log(`- ${k.id} : ${k.erreur}`);
  }
  const skills = await kits.listerSkills();
  if (skills.length) {
    console.log('\nSkills :');
    for (const s of skills) console.log(`- ${s.id} : ${s.description || '(sans description)'}`);
  }
}

function afficherKits(resume, verbe) {
  for (const k of resume.kits) {
    console.log(`\n${k.nom} (${k.id} ${k.version}) ${verbe} :`);
    if (!k.fichiers.length) console.log('  aucun fichier : règles seulement');
    for (const f of k.fichiers) console.log(`  ${f}`);
  }
  for (const [id, valeur] of Object.entries(resume.detections)) console.log(`\nVariable « ${id} » détectée dans le projet : ${valeur}`);
}

async function ajouter(options) {
  const idKit = options.positions[1];
  if (!idKit) throw new Error('Indique le kit à ajouter : node kit.js ajouter <kit>.');
  const idProjet = projetVise(options);
  if (!idProjet) throw new Error('Indique le projet : --projet <dossier du projet>.');
  const plan = await kits.planifierAjout({ kit: idKit, projet: idProjet, variables: options.variables });
  if (options.essai) {
    console.log(`Essai pour « ${plan.projet.nom} » : rien n'a été écrit.`);
    afficherKits(kits.resumerPlan(plan), 'serait ajouté');
    return;
  }
  const resume = await kits.executerAjout(plan);
  console.log(`Ajouté à « ${resume.projet.nom} » (noté dans projet.json et CLAUDE.md).`);
  afficherKits(resume, 'ajouté');
  const aAdapter = resume.kits.filter((k) => k.adaptation);
  if (aAdapter.length) {
    console.log('\nCe n\'est pas terminé : ces kits doivent être adaptés au projet. Claude doit suivre leur guide :');
    for (const k of aAdapter) console.log(`- ${k.guide} (à la racine de Toolkit)`);
  }
}

async function principal() {
  const options = lireArguments(process.argv.slice(2));
  const commande = options.positions[0];
  if (options.aide || !commande) {
    console.log(AIDE);
    return;
  }
  await reglages.charger();
  chemins.definirDossierProjets(reglages.obtenir().dossierProjets);
  if (commande === 'lister') await lister(options);
  else if (commande === 'ajouter') await ajouter(options);
  else throw new Error(`Commande inconnue : « ${commande} ». Commandes : lister, ajouter.`);
}

journal.sansConsole();
principal().catch((erreur) => {
  // Problème prévu : message en français tel quel. Bug ou erreur système : trace au journal seulement.
  const imprevu = erreur.code || erreur.constructor !== Error;
  if (imprevu) journal.erreur('Commande kit :', erreur);
  console.error(imprevu ? 'Erreur imprévue : les détails sont dans donnees/journal.log.' : erreur.message);
  process.exitCode = 1;
});

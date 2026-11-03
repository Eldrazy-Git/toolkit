// Commande pour la bibliothèque de skills (voir docs/skills.md) : contrôle des propositions.
// Ne pose jamais de question : Claude la lance sans saisie possible.
'use strict';

const chemins = require('../src/main/chemins');
const reglages = require('../src/main/reglages');
const journal = require('../src/main/journal');
const skills = require('../src/main/skills');

const AIDE = `Bibliothèque de skills de Toolkit

  node skills.js lister         liste les skills de la bibliothèque
  node skills.js propositions   contrôle ce qui attend dans skills/propositions/ (rien n'est modifié)`;

async function lister() {
  const liste = await skills.listerSkills();
  if (!liste.length) console.log('Aucun skill pour l\'instant.');
  for (const s of liste) console.log(`- ${s.id} : ${s.description || '(sans description)'}`);
}

// Pour que Claude voie aussitôt si ce qu'il a déposé pourra être accepté.
async function propositions() {
  const liste = await skills.listerPropositions();
  if (!liste.length) console.log('Aucune proposition en attente.');
  for (const p of liste) {
    console.log(`${p.id} : ${p.problemes.length ? 'à corriger' : 'prête, en attente de la décision de l\'utilisateur'}`);
    for (const t of p.problemes) console.log(`  problème : ${t}`);
    for (const t of p.avertissements) console.log(`  à vérifier : ${t}`);
  }
}

async function principal() {
  const [commande] = process.argv.slice(2);
  if (!commande || ['--aide', '--help', '-h'].includes(commande)) {
    console.log(AIDE);
    return;
  }
  await reglages.charger();
  chemins.definirDossierProjets(reglages.obtenir().dossierProjets);
  await skills.migrerAncienDossier();
  if (commande === 'lister') await lister();
  else if (commande === 'propositions') await propositions();
  else throw new Error(`Commande inconnue : « ${commande} ». Commandes : lister, propositions.`);
}

journal.sansConsole();
principal().catch((erreur) => {
  // Problème prévu : message en français tel quel. Bug ou erreur système : trace au journal seulement.
  const imprevu = erreur.code || erreur.constructor !== Error;
  if (imprevu) journal.erreur('Commande skills :', erreur);
  console.error(imprevu ? 'Erreur imprévue : les détails sont dans donnees/journal.log.' : erreur.message);
  process.exitCode = 1;
});

// « Repartir de zéro » : remet un projet dans l'état d'un clone neuf, pour voir ce qu'un
// nouvel utilisateur verra. Ce qui n'est pas dans Git (fichiers générés, ignorés ou jamais
// enregistrés) part à la Corbeille, et les données mémorisées par ses outils HTML sont
// effacées. Les fichiers suivis par Git ne sont jamais touchés (Historique pour ça).
'use strict';

const { app, shell, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const chemins = require('./chemins');
const git = require('./git');
const projets = require('./projets');
const outilsHtml = require('./outils-html');

// Fichiers propres à Toolkit : un clone neuf les a aussi (ou Toolkit les recrée).
const PROPRES_A_TOOLKIT = ['projet.json', 'claude.md'];

async function taille(chemin) {
  let total = 0;
  try {
    const infos = await fs.lstat(chemin);
    if (!infos.isDirectory()) return infos.size;
    for (const entree of await fs.readdir(chemin, { withFileTypes: true })) {
      total += await taille(path.join(chemin, entree.name));
    }
  } catch {
    // Fichier verrouillé ou disparu : on l'ignore dans le total.
  }
  return total;
}

// Hôtes (donc partitions) des pages HTML du projet : outil principal, outils liés et
// pages ouvertes par une action « fichier ».
function hotesDuProjet(projet) {
  const f = projet.fiche;
  const hotes = [];
  if (/\.html?$/i.test(f.point_entree || '')) hotes.push(outilsHtml.calculerHote(projet.id, null));
  for (const o of f.outils_lies) hotes.push(outilsHtml.calculerHote(projet.id, o.point_entree));
  for (const a of f.actions) {
    if (a.genre === 'fichier' && /\.html?$/i.test(a.fichier || '')) hotes.push(outilsHtml.calculerHote(projet.id, a.fichier));
  }
  return [...new Set(hotes)];
}

async function existe(chemin) {
  try {
    await fs.access(chemin);
    return true;
  } catch {
    return false;
  }
}

async function charger(id) {
  if (!id || id !== path.basename(id) || id === '.' || id === '..') throw new Error('Projet invalide.');
  const projet = await projets.chargerProjet(id);
  if (!projet) throw new Error('Ce projet n\'existe plus.');
  if (projet.erreur) throw new Error('La fiche projet.json de ce projet est illisible : corrige-la d\'abord.');
  const dossier = path.join(chemins.projets(), id);
  if (!(await git.estDepot(dossier))) {
    throw new Error('Ce projet n\'a pas d\'historique Git : Toolkit ne peut pas savoir quels fichiers sont d\'origine. Active Git (bouton « Commit » des détails) puis réessaie.');
  }
  return { projet, dossier };
}

// Ne modifie RIEN. Renvoie { elements: [{ chemin, ignore, dossier, taille }], donneesOutils, modifies }.
async function analyser(id) {
  const { projet, dossier } = await charger(id);
  const s = await git.git(dossier, ['-c', 'core.quotepath=off', 'status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=normal']);
  if (s.code !== 0) throw new Error('Impossible de lire l\'état Git du projet.');

  const icone = (projet.fiche.icone || '').toLowerCase();
  const elements = [];
  let modifies = 0;
  for (const ligne of s.sortie.split('\0')) {
    if (ligne.length < 4) continue;
    const code = ligne.slice(0, 2);
    const chemin = ligne.slice(3);
    if (code !== '??' && code !== '!!') {
      modifies++;
      continue;
    }
    const sansBarre = chemin.replace(/\/$/, '');
    if (PROPRES_A_TOOLKIT.includes(sansBarre.toLowerCase()) || sansBarre.toLowerCase() === icone) continue;
    elements.push({
      chemin: sansBarre,
      ignore: code === '!!',
      dossier: chemin.endsWith('/'),
      taille: await taille(path.join(dossier, sansBarre)),
    });
  }
  elements.sort((a, b) => b.ignore - a.ignore || a.chemin.localeCompare(b.chemin));

  let donneesOutils = false;
  for (const hote of hotesDuProjet(projet)) {
    if (await existe(path.join(app.getPath('userData'), 'Partitions', `outil-${hote}`))) donneesOutils = true;
  }
  return { elements, donneesOutils, modifies };
}

// cheminsChoisis : parmi ceux renvoyés par analyser() (les autres sont refusés).
async function executer(id, cheminsChoisis, effacerDonneesOutils) {
  const { projet, dossier } = await charger(id);
  const { elements } = await analyser(id);
  const permis = new Set(elements.map((e) => e.chemin));
  const echecs = [];
  let envoyes = 0;
  for (const chemin of cheminsChoisis || []) {
    if (!permis.has(chemin)) continue;
    try {
      await shell.trashItem(path.join(dossier, chemin));
      envoyes++;
    } catch {
      echecs.push(chemin);
    }
  }
  if (effacerDonneesOutils) {
    for (const hote of hotesDuProjet(projet)) {
      const ses = session.fromPartition(`persist:outil-${hote}`);
      await ses.clearStorageData();
      await ses.clearCache();
    }
  }
  if (echecs.length) {
    throw new Error(`${envoyes ? `${envoyes} élément(s) sont partis à la Corbeille, mais ` : ''}`
      + `ces éléments n'ont pas pu y être envoyés : ${echecs.join(', ')}.\n`
      + 'Ils sont sûrement encore utilisés (un serveur, un script ou un programme ouvert dessus) : ferme-le puis réessaie.');
  }
  return { envoyes };
}

module.exports = { analyser, executer };

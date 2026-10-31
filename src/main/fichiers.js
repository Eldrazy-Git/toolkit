// Petites fonctions utilitaires pour lire et écrire des fichiers JSON en toute sécurité.
'use strict';

const fs = require('node:fs/promises');

// Traduit une erreur de syntaxe JSON en message compréhensible.
function messageErreurJson(erreur) {
  const position = /line (\d+) column (\d+)/.exec(erreur.message);
  if (position) return `erreur de syntaxe à la ligne ${position[1]}, colonne ${position[2]}`;
  return 'erreur de syntaxe (virgule, guillemet ou accolade manquant ?)';
}

async function lireJson(chemin) {
  const texte = await fs.readFile(chemin, 'utf8');
  // Retire l'éventuel BOM ajouté par certains éditeurs Windows.
  return JSON.parse(texte.replace(/^﻿/, ''));
}

// JSON indenté, mais les listes courtes de valeurs simples restent sur une ligne
// (["a", "b"] plutôt qu'une valeur par ligne) pour que les fiches restent lisibles.
function formaterJson(objet) {
  return JSON.stringify(objet, null, 2).replace(/\[\n([^[\]{}]*?)\n\s*\]/g, (bloc, interieur) => {
    const ligne = `[${interieur.split('\n').map((v) => v.trim()).join(' ')}]`;
    return ligne.length <= 80 ? ligne : bloc;
  });
}

// Écrit d'abord dans un fichier temporaire puis le renomme : un plantage en cours
// d'écriture ne laisse jamais un fichier à moitié écrit.
async function ecrireJson(chemin, objet) {
  const texte = `${formaterJson(objet)}\n`;
  const temporaire = `${chemin}.tmp`;
  await fs.writeFile(temporaire, texte, 'utf8');
  try {
    await fs.rename(temporaire, chemin);
  } catch (erreur) {
    // Fichier verrouillé un instant (antivirus, éditeur) : écriture directe.
    if (erreur.code !== 'EPERM' && erreur.code !== 'EBUSY') throw erreur;
    await fs.writeFile(chemin, texte, 'utf8');
    await fs.rm(temporaire, { force: true });
  }
}

async function existe(chemin) {
  try {
    await fs.access(chemin);
    return true;
  } catch {
    return false;
  }
}

// Remplace (ou ajoute, ou retire si section = null) la section entre debut et fin d'un fichier
// texte ; le reste du fichier n'est pas touché. Renvoie true si le fichier a changé.
async function ecrireSection(fichier, debut, fin, section, { creerSi = null } = {}) {
  let actuel = null;
  try {
    actuel = await fs.readFile(fichier, 'utf8');
  } catch (erreur) {
    if (erreur.code !== 'ENOENT') throw erreur;
  }
  if (actuel === null) {
    if (!section) return false;
    await fs.writeFile(fichier, `${creerSi || ''}${section}\n`, 'utf8');
    return true;
  }
  const crlf = actuel.includes('\r\n');
  const texte = actuel.replace(/\r\n/g, '\n');
  const i = texte.indexOf(debut.split(' (')[0]);
  const j = texte.indexOf(fin);
  let nouveau;
  if (i >= 0 && j > i) {
    const avant = texte.slice(0, i);
    const apres = texte.slice(j + fin.length);
    nouveau = section ? `${avant}${section}${apres}` : `${avant.replace(/\n+$/, '\n')}${apres.replace(/^\n+/, '')}`;
  } else {
    if (!section) return false;
    nouveau = `${texte.replace(/\n*$/, '\n\n')}${section}\n`;
  }
  if (nouveau === texte) return false;
  // Fichier qui ne contenait que la section retirée : supprimé plutôt que laissé vide.
  if (!nouveau.trim()) {
    await fs.unlink(fichier);
    return true;
  }
  await fs.writeFile(fichier, crlf ? nouveau.replace(/\n/g, '\r\n') : nouveau, 'utf8');
  return true;
}

module.exports = { lireJson, ecrireJson, existe, messageErreurJson, ecrireSection };

// Journal des erreurs techniques, dans donnees/journal.log.
// Utile quand Toolkit est lancé sans console (Lancer Toolkit.vbs).
'use strict';

const fs = require('node:fs');
const chemins = require('./chemins');

const TAILLE_MAX = 1024 * 1024;

function ecrire(niveau, elements) {
  const texte = elements
    .map((e) => (e instanceof Error ? e.stack || e.message : String(e)))
    .join(' ');
  const ligne = `[${new Date().toISOString()}] ${niveau} ${texte}\n`;
  if (niveau === 'ERREUR') console.error(texte);
  else console.log(texte);
  try {
    fs.mkdirSync(chemins.donnees, { recursive: true });
    if (fs.existsSync(chemins.journal) && fs.statSync(chemins.journal).size > TAILLE_MAX) {
      fs.renameSync(chemins.journal, `${chemins.journal}.ancien`);
    }
    fs.appendFileSync(chemins.journal, ligne, 'utf8');
  } catch {
    // Le journal ne doit jamais faire planter l'application.
  }
}

module.exports = {
  info: (...e) => ecrire('INFO', e),
  erreur: (...e) => ecrire('ERREUR', e),
};

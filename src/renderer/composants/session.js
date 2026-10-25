// Onglets de la dernière fois (préférence « Rouvrir les onglets de la dernière fois ») :
// outils, onglets « Code » (avec leurs fichiers ouverts) et notes. Les terminaux, consoles
// et Claude ne sont jamais relancés. Rangés dans reglages.json > interface.session.
import * as etat from './etat.js';
import * as actions from './actions.js';
import * as preferences from './preferences.js';

let pret = false; // pas d'enregistrement avant la restauration (sinon on effacerait la session)
let derniere = null;
let minuterie = null;

function cleOnglet(o) {
  if (o.genre === 'outil') return `outil:${o.projetId}:${o.outilLie || ''}`;
  if (o.genre === 'code') return `code:${o.cible.type}:${o.cible.id || ''}`;
  if (o.genre === 'note') return `note:${o.chemin}`;
  return null;
}

function instantane() {
  const { onglets, ongletActif } = etat.obtenir();
  const gardes = onglets.filter((o) => ['outil', 'code', 'note'].includes(o.genre));
  const actif = onglets.find((o) => o.id === ongletActif);
  return {
    onglets: gardes.map((o) => {
      if (o.genre === 'outil') return { genre: 'outil', projetId: o.projetId, outilLie: o.outilLie || null };
      if (o.genre === 'code') return { genre: 'code', cible: o.cible, nomCible: o.nomCible, fichiers: o.fichiers || [], fichierActif: o.fichierActif || null };
      return { genre: 'note', chemin: o.chemin };
    }),
    actif: actif ? cleOnglet(actif) : ongletActif,
  };
}

// Appelé à chaque changement de l'état : enregistre la session (regroupé, si elle a changé).
export function suivre() {
  if (!pret) return;
  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    const texte = JSON.stringify(instantane());
    if (texte === derniere) return;
    derniere = texte;
    window.toolkit.reglages.modifier({ interface: { session: JSON.parse(texte) } }).catch(() => {});
  }, 1000);
}

export async function restaurer(sauvee) {
  try {
    if (!preferences.lire('interface').restaurerOnglets || !Array.isArray(sauvee?.onglets)) return;
    const projets = new Set(etat.obtenir().projets.map((p) => p.id));
    for (const o of sauvee.onglets) {
      if (o.genre === 'outil' && projets.has(o.projetId)) await actions.ouvrirOutil(o.projetId, o.outilLie);
      else if (o.genre === 'code' && o.cible && (o.cible.type !== 'projet' || projets.has(o.cible.id))) {
        actions.ouvrirCode(o.cible, o.nomCible || o.cible.id || 'Toolkit', o.fichierActif, Array.isArray(o.fichiers) ? o.fichiers : []);
      } else if (o.genre === 'note' && typeof o.chemin === 'string') actions.ouvrirNote(o.chemin);
    }
    const actif = etat.obtenir().onglets.find((o) => cleOnglet(o) === sauvee.actif);
    etat.modifier({ ongletActif: actif ? actif.id : 'bibliotheque' });
  } finally {
    pret = true;
    derniere = JSON.stringify(instantane());
  }
}

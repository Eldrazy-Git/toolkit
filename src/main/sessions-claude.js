// Dernières conversations Claude Code d'un dossier (bouton « Sessions » du terminal Claude).
//
// Claude Code range chaque conversation dans ~/.claude/projects/<dossier encodé>/<id>.jsonl,
// où le dossier encodé est le chemin dont chaque caractère non alphanumérique devient « - ».
// On ne lit que le début et la fin de chaque fichier (ils peuvent peser plusieurs Mo) :
// le titre (« custom-title », « ai-title » ou dernière demande) est répété vers la fin,
// la première demande est au début. Lecture seule : rien n'est jamais modifié.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const MAXIMUM = 15;
const MORCEAU = 64 * 1024;
const ID_SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dossierProjets() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
}

function encoder(dossier) {
  return dossier.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}

// Lit [debut, debut + taille[ d'un fichier, en texte.
async function lireMorceau(poignee, debut, taille) {
  const tampon = Buffer.alloc(taille);
  const { bytesRead } = await poignee.read(tampon, 0, taille, debut);
  return tampon.subarray(0, bytesRead).toString('utf8');
}

// Lignes JSON complètes d'un morceau (la première et la dernière peuvent être coupées).
function lignesJson(texte) {
  const objets = [];
  for (const ligne of texte.split('\n')) {
    if (!ligne.startsWith('{')) continue;
    try {
      objets.push(JSON.parse(ligne));
    } catch {
      // Ligne coupée par la lecture partielle : ignorée.
    }
  }
  return objets;
}

function texteDemande(message) {
  const contenu = message?.content;
  if (typeof contenu === 'string') return contenu;
  if (Array.isArray(contenu)) return contenu.find((c) => c?.type === 'text')?.text || '';
  return '';
}

// Les messages techniques (commandes « / », sorties de commandes…) ne font pas un bon titre.
function demandeLisible(texte) {
  const t = String(texte || '').trim();
  if (!t || t.startsWith('<') || t.startsWith('[Request interrupted')) return '';
  return t.replace(/\s+/g, ' ');
}

async function resumer(fichier, taille) {
  const poignee = await fs.open(fichier, 'r');
  try {
    const debut = lignesJson(await lireMorceau(poignee, 0, Math.min(taille, MORCEAU)));
    const fin = taille > MORCEAU ? lignesJson(await lireMorceau(poignee, taille - MORCEAU, MORCEAU)) : debut;
    let titre = '';
    let derniereDemande = '';
    for (const o of fin) {
      if (o.type === 'custom-title' && o.customTitle) titre = o.customTitle;
      else if (o.type === 'ai-title' && o.aiTitle && !titre) titre = o.aiTitle;
      else if (o.type === 'last-prompt' && o.lastPrompt) derniereDemande = demandeLisible(o.lastPrompt) || derniereDemande;
    }
    const premiere = debut.map((o) => (o.type === 'user' && !o.isMeta ? demandeLisible(texteDemande(o.message)) : ''))
      .find(Boolean) || '';
    return { titre: titre || premiere || derniereDemande, demande: premiere || derniereDemande };
  } finally {
    await poignee.close();
  }
}

// Dossiers de Claude Code qui correspondent à ce dossier. La lettre du lecteur peut avoir
// été notée en minuscule (« c--Users… ») : casse ignorée, donc parfois plusieurs dossiers.
async function dossiersDe(dossier) {
  let dossiers;
  try {
    dossiers = await fs.readdir(dossierProjets(), { withFileTypes: true });
  } catch {
    return []; // Claude Code n'a encore jamais été utilisé sur ce PC.
  }
  const cle = encoder(dossier);
  return dossiers.filter((d) => d.isDirectory() && d.name.toLowerCase() === cle).map((d) => path.join(dossierProjets(), d.name));
}

// La conversation a-t-elle été enregistrée ? (Elle ne l'est qu'après une première demande.)
async function existe(dossier, id) {
  for (const chemin of await dossiersDe(dossier)) {
    if ((await fs.stat(path.join(chemin, `${id}.jsonl`)).catch(() => null))?.size > 0) return true;
  }
  return false;
}

// Renvoie [{ id, titre, demande, date }] (la plus récente d'abord), [] s'il n'y en a aucune.
async function lister(dossier) {
  const fichiers = [];
  for (const chemin of await dossiersDe(dossier)) {
    for (const nom of await fs.readdir(chemin).catch(() => [])) {
      const id = nom.replace(/\.jsonl$/i, '');
      if (id === nom || !ID_SESSION.test(id)) continue;
      const infos = await fs.stat(path.join(chemin, nom)).catch(() => null);
      if (infos?.isFile() && infos.size > 0) fichiers.push({ id, fichier: path.join(chemin, nom), taille: infos.size, date: infos.mtimeMs });
    }
  }
  fichiers.sort((a, b) => b.date - a.date);

  const sessions = [];
  for (const f of fichiers) {
    if (sessions.length >= MAXIMUM) break;
    if (sessions.some((s) => s.id === f.id)) continue;
    const resume = await resumer(f.fichier, f.taille).catch(() => null);
    // Conversation sans aucune demande (Claude ouvert puis refermé) : rien à reprendre.
    if (!resume?.titre) continue;
    sessions.push({ id: f.id, titre: resume.titre.slice(0, 120), demande: resume.demande.slice(0, 300), date: f.date });
  }
  return sessions;
}

module.exports = { lister, existe, ID_SESSION };

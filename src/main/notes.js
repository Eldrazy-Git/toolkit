// Notes Markdown (.md) : lecture, rendu HTML, enregistrement, création.
//
// Le rendu est fait ici avec markdown-it, HTML brut DÉSACTIVÉ (une note ne peut pas injecter
// de code dans l'interface). Les liens deviennent des attributs data-* que l'interface gère :
// data-projet / data-note (liens [[…]] et liens relatifs vers un .md), data-externe (web).
// Seuls les .md de projets/ et de app/ peuvent être lus ou écrits.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const MarkdownIt = require('markdown-it');
const chemins = require('./chemins');
const recherche = require('./recherche');

// --- Chemins autorisés ------------------------------------------------------------------------

// chemin : relatif à la racine de Toolkit, avec « / ». Renvoie le chemin absolu ou lance une erreur.
function absoluNote(chemin) {
  const relatif = String(chemin || '').replace(/\\/g, '/');
  if (!relatif.toLowerCase().endsWith('.md')) throw new Error('Seuls les fichiers .md peuvent être ouverts comme notes.');
  const absolu = path.resolve(chemins.racine, relatif);
  const autorises = [chemins.projets(), chemins.app];
  if (!autorises.some((d) => absolu.startsWith(d + path.sep))) {
    throw new Error('Cette note est en dehors des projets et de l\'application.');
  }
  return absolu;
}

// --- Rendu Markdown ---------------------------------------------------------------------------

function echapper(texte) {
  return String(texte).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

// Règle markdown-it pour [[cible]] et [[cible|libellé]].
function pluginLiensWiki(md) {
  md.inline.ruler.before('link', 'lien_wiki', (state, silencieux) => {
    const { src, pos } = state;
    if (src.charCodeAt(pos) !== 0x5B || src.charCodeAt(pos + 1) !== 0x5B) return false;
    const fin = src.indexOf(']]', pos + 2);
    if (fin < 0) return false;
    const contenu = src.slice(pos + 2, fin);
    if (!contenu.trim() || /[\n[\]]/.test(contenu)) return false;
    if (!silencieux) state.push('lien_wiki', '', 0).content = contenu;
    state.pos = fin + 2;
    return true;
  });
}

function rendre(contenu, cheminNote) {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
  md.use(pluginLiensWiki);
  const dossierNote = path.posix.dirname(cheminNote);

  md.renderer.rules.lien_wiki = (jetons, i) => {
    const brut = jetons[i].content;
    const [cible, libelle] = brut.split('|');
    const texte = echapper((libelle || cible).trim());
    const lien = recherche.resoudreLien(brut, cheminNote);
    if (!lien) return `<span class="lien-casse" title="Aucun projet ni note ne s'appelle « ${echapper(cible.trim())} »">${texte}</span>`;
    return lien.type === 'projet'
      ? `<a href="#" class="lien-interne" data-projet="${echapper(lien.id)}" title="Projet">${texte}</a>`
      : `<a href="#" class="lien-interne" data-note="${echapper(lien.chemin)}" title="${echapper(lien.chemin)}">${texte}</a>`;
  };

  const ouvertureLien = md.renderer.rules.link_open || ((jetons, i, options, env, soi) => soi.renderToken(jetons, i, options));
  md.renderer.rules.link_open = (jetons, i, options, env, soi) => {
    const jeton = jetons[i];
    const href = jeton.attrGet('href') || '';
    if (/^(https?:|mailto:)/i.test(href)) {
      jeton.attrSet('data-externe', href);
      jeton.attrSet('title', href);
    } else if (!href.startsWith('#')) {
      // Lien relatif vers une autre note du dépôt.
      let cible = href.split('#')[0];
      try {
        cible = decodeURI(cible);
      } catch {
        // Adresse mal formée : laissée telle quelle.
      }
      const note = recherche.noteConnue(path.posix.normalize(path.posix.join(dossierNote, cible)));
      if (note) jeton.attrSet('data-note', note);
      else jeton.attrSet('class', 'lien-casse');
    }
    jeton.attrSet('href', '#');
    return ouvertureLien(jetons, i, options, env, soi);
  };

  // Images relatives : affichées depuis le disque (seulement à l'intérieur de Toolkit).
  const image = md.renderer.rules.image;
  md.renderer.rules.image = (jetons, i, options, env, soi) => {
    const jeton = jetons[i];
    const src = jeton.attrGet('src') || '';
    if (!/^(https?:|data:)/i.test(src)) {
      let relatif = src;
      try {
        relatif = decodeURI(src);
      } catch {
        // Adresse mal formée.
      }
      const absolu = path.resolve(chemins.racine, dossierNote, relatif);
      jeton.attrSet('src', absolu.startsWith(chemins.racine + path.sep) ? pathToFileURL(absolu).href : '');
    }
    return image(jetons, i, options, env, soi);
  };

  return md.render(contenu);
}

// --- Lecture, écriture, création ----------------------------------------------------------------

async function lire(chemin) {
  const absolu = absoluNote(chemin);
  let contenu;
  let infos;
  try {
    [contenu, infos] = await Promise.all([fs.readFile(absolu, 'utf8'), fs.stat(absolu)]);
  } catch {
    throw new Error('Cette note est introuvable (elle a peut-être été déplacée ou supprimée).');
  }
  contenu = contenu.replace(/^﻿/, '');
  await recherche.mettreAJour({ forcer: true });
  const relatif = chemins.versRelatif(absolu);
  return {
    chemin: relatif,
    titre: /^#\s+(.+)$/m.exec(contenu)?.[1]?.trim() || path.posix.basename(relatif, '.md'),
    contenu,
    html: rendre(contenu, relatif),
    mtime: infos.mtimeMs,
    retroliens: recherche.retroliens(`note:${relatif}`),
  };
}

// mtimeAttendu : date de modification lue à l'ouverture ; si le fichier a changé depuis
// (modifié dans VS Code, par Claude…), l'enregistrement est refusé sauf si forcer = true.
async function enregistrer(chemin, contenu, mtimeAttendu, forcer = false) {
  const absolu = absoluNote(chemin);
  let original = '';
  try {
    const infos = await fs.stat(absolu);
    if (!forcer && mtimeAttendu && Math.abs(infos.mtimeMs - mtimeAttendu) > 1) {
      const erreur = new Error('MODIFIEE_AILLEURS');
      throw erreur;
    }
    original = await fs.readFile(absolu, 'utf8');
  } catch (erreur) {
    if (erreur.message === 'MODIFIEE_AILLEURS') throw erreur;
  }
  // On garde les fins de ligne Windows si le fichier en avait.
  const texte = original.includes('\r\n') ? String(contenu).replace(/\r?\n/g, '\r\n') : String(contenu);
  await fs.writeFile(absolu, texte, 'utf8');
  return lire(chemin);
}

function nomDeFichier(nom) {
  return recherche.slug(nom).slice(0, 60) || 'note';
}

// Crée une note dans <projet>/notes/ (ou app/docs/ pour Toolkit). Renvoie son chemin.
async function creer(projetId, nom) {
  const titre = String(nom || '').trim();
  if (!titre) throw new Error('Donne un nom à la note.');
  const dossier = projetId ? path.join(chemins.projets(), projetId, 'notes') : path.join(chemins.app, 'docs');
  if (projetId && /[\\/:*?"<>|]/.test(projetId)) throw new Error('Projet invalide.');
  await fs.mkdir(dossier, { recursive: true });
  let fichier = path.join(dossier, `${nomDeFichier(titre)}.md`);
  for (let n = 2; await fs.access(fichier).then(() => true, () => false); n++) {
    fichier = path.join(dossier, `${nomDeFichier(titre)}-${n}.md`);
  }
  await fs.writeFile(fichier, `# ${titre}\n\n`, 'utf8');
  await recherche.mettreAJour({ forcer: true });
  return chemins.versRelatif(fichier);
}

module.exports = { lire, enregistrer, creer, rendre };

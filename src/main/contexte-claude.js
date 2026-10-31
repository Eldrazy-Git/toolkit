// Ce que Claude Code sait des AUTRES projets :
// - projets/CLAUDE.md : catalogue de tous les projets (rôle, dossier, liens, groupes).
//   Claude Code lit automatiquement les CLAUDE.md des dossiers parents : chaque session
//   lancée dans un projet le voit donc.
// - CLAUDE.md de chaque projet lié : section « Projets liés » (liens directs ET indirects,
//   avec leur explication), pour qu'une mise à jour tienne compte des autres projets.
// - Au lancement de Claude sur un projet, ses projets liés lui sont ouverts (--add-dir).
// Les liens sont déclarés dans projet.json (champ « liens » : [{ projet, description }]) ;
// un lien vaut dans les deux sens. Les sections gérées sont entre des marqueurs et
// réécrites seulement si leur contenu change ; le reste des fichiers n'est jamais touché.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const chemins = require('./chemins');
const projets = require('./projets');
const reglages = require('./reglages');
const journal = require('./journal');

const DEBUT_LIES = '<!-- toolkit:projets-lies (section tenue à jour par Toolkit : ne pas la modifier à la main) -->';
const FIN_LIES = '<!-- /toolkit:projets-lies -->';
const DEBUT_CONSIGNES = '<!-- toolkit:consignes (section tenue à jour par Toolkit depuis Réglages > Claude : ne pas la modifier ici) -->';
const FIN_CONSIGNES = '<!-- /toolkit:consignes -->';
const DEBUT_CATALOGUE = '<!-- toolkit:catalogue (section tenue à jour par Toolkit : ne pas la modifier à la main) -->';
const FIN_CATALOGUE = '<!-- /toolkit:catalogue -->';
const LIBELLES_TYPES = { html: 'outil HTML', script: 'script', java: 'projet Java (Gradle)', android: 'application Android', autre: 'autre' };

const uneLigne = (texte, max = 220) => {
  const t = String(texte || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

// --- Graphe des liens ----------------------------------------------------------------------

// Renvoie Map id -> [{ voisin, description, sens: 'vers' | 'depuis' }]
function graphe(liste) {
  const ids = new Set(liste.map((p) => p.id));
  const aretes = new Map(liste.map((p) => [p.id, []]));
  for (const p of liste) {
    for (const l of p.fiche.liens || []) {
      if (!ids.has(l.projet) || l.projet === p.id) continue;
      aretes.get(p.id).push({ voisin: l.projet, description: l.description, sens: 'vers' });
      aretes.get(l.projet).push({ voisin: p.id, description: l.description, sens: 'depuis' });
    }
  }
  return aretes;
}

// Projets reliés à id (directement ou par d'autres) : [{ id, distance, via: [ids] }]
function relies(id, aretes) {
  const vus = new Map([[id, { distance: 0, via: [] }]]);
  const file = [id];
  while (file.length) {
    const courant = file.shift();
    for (const { voisin } of aretes.get(courant) || []) {
      if (vus.has(voisin)) continue;
      const info = vus.get(courant);
      vus.set(voisin, { distance: info.distance + 1, via: info.distance ? [...info.via, courant] : [] });
      file.push(voisin);
    }
  }
  vus.delete(id);
  return [...vus].map(([pid, info]) => ({ id: pid, ...info })).sort((a, b) => a.distance - b.distance);
}

// --- Contenu des sections -------------------------------------------------------------------

function sectionProjetsLies(projet, parId, aretes) {
  const liste = relies(projet.id, aretes);
  if (!liste.length) return null;
  const nom = (id) => parId.get(id)?.fiche.nom || id;
  const decrire = (id) => {
    const p = parId.get(id);
    return `**${p.fiche.nom}** (\`../${id}/\`, ${LIBELLES_TYPES[p.fiche.type] || p.fiche.type})${p.fiche.description ? ` — ${uneLigne(p.fiche.description)}` : ''}`;
  };
  const directs = liste.filter((l) => l.distance === 1);
  const indirects = liste.filter((l) => l.distance > 1);
  const lignes = [
    DEBUT_LIES,
    '## Projets liés',
    '',
    `« ${projet.fiche.nom} » est lié à d'autres projets de l'utilisateur (même dossier \`projets/\`).`,
    'Avant une modification qui touche ce qu\'ils partagent (format ou nom de fichiers, données,',
    'API, ressources, versions…), lis le projet concerné et vérifie l\'impact sur lui. Tu peux',
    'lire leurs fichiers avec les chemins relatifs ci-dessous. Ne modifie un autre projet que si',
    'l\'utilisateur le demande ; sinon, dis-lui précisément ce qu\'il faudra y changer, et dans',
    'quel projet. Si tu découvres un lien qui n\'est pas listé ici, signale-le-lui : les liens se',
    'déclarent dans Toolkit (panneau du projet > « Projets liés »).',
    '',
    '### Liens directs',
    '',
  ];
  for (const d of directs) {
    lignes.push(`- ${decrire(d.id)}`);
    for (const a of aretes.get(projet.id).filter((x) => x.voisin === d.id)) {
      lignes.push(a.sens === 'vers'
        ? `  - Lien (déclaré par ce projet) : ${uneLigne(a.description, 400)}`
        : `  - Lien (déclaré par « ${nom(d.id)} ») : ${uneLigne(a.description, 400)}`);
    }
  }
  if (indirects.length) {
    lignes.push('', '### Liens indirects (par l\'intermédiaire d\'autres projets)', '');
    for (const i of indirects) lignes.push(`- ${decrire(i.id)} — via ${i.via.map(nom).join(' → ')}`);
  }
  lignes.push(FIN_LIES);
  return lignes.join('\n');
}

function sectionCatalogue(liste, aretes) {
  const parId = new Map(liste.map((p) => [p.id, p]));
  const lignes = [
    DEBUT_CATALOGUE,
    '# Projets de l\'utilisateur (Toolkit)',
    '',
    'Ce dossier contient tous les projets de l\'utilisateur, un par sous-dossier (chacun a son',
    'propre dépôt Git et souvent son propre CLAUDE.md). Si une demande concerne un autre projet',
    'que celui où tu travailles, regarde cette liste : son dossier est `../<dossier>/` depuis un',
    'projet. Ne modifie pas un autre projet sans que l\'utilisateur le demande.',
    '',
    '| Projet | Dossier | Type | Rôle | Liés à |',
    '|---|---|---|---|---|',
  ];
  for (const p of liste) {
    const voisins = [...new Set((aretes.get(p.id) || []).map((a) => parId.get(a.voisin)?.fiche.nom).filter(Boolean))];
    const cellule = (t) => uneLigne(t, 160).replace(/\|/g, '/');
    lignes.push(`| ${cellule(p.fiche.nom)} | \`${p.id}/\` | ${LIBELLES_TYPES[p.fiche.type] || p.fiche.type} | ${cellule(p.fiche.description) || '—'} | ${cellule(voisins.join(', ')) || '—'} |`);
  }
  // Liens détaillés
  const liens = liste.flatMap((p) => (p.fiche.liens || []).filter((l) => parId.has(l.projet) && l.projet !== p.id)
    .map((l) => `- **${p.fiche.nom}** → **${parId.get(l.projet).fiche.nom}** : ${uneLigne(l.description, 400)}`));
  if (liens.length) lignes.push('', '## Liens entre projets', '', ...liens);
  // Groupes de la barre latérale (rangement : pas forcément de lien technique)
  const groupes = (reglages.obtenir().interface?.groupes || []).filter((g) => g && g.nom);
  const cheminGroupe = (g) => {
    const noms = [];
    for (let x = g; x && noms.length < 20; x = groupes.find((y) => y.id === x.parent)) noms.unshift(x.nom);
    return noms.join(' › ');
  };
  const lignesGroupes = groupes
    .map((g) => ({ nom: cheminGroupe(g), membres: (g.projets || []).map((id) => parId.get(id)?.fiche.nom).filter(Boolean) }))
    .filter((g) => g.membres.length)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map((g) => `- ${g.nom} : ${g.membres.join(', ')}`);
  if (lignesGroupes.length) {
    lignes.push('', '## Groupes (rangement choisi par l\'utilisateur, pas forcément un lien technique)', '', ...lignesGroupes);
  }
  lignes.push('', '*Liste tenue à jour automatiquement par Toolkit.*', FIN_CATALOGUE);
  return lignes.join('\n');
}

// --- Écriture des sections ------------------------------------------------------------------

// Remplace (ou ajoute, ou retire si section = null) la section entre debut et fin.
// Renvoie true si le fichier a changé.
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

let enCours = null;
let minuterie = null;

// Met à jour le catalogue et les sections « Projets liés ». Renvoie les fichiers modifiés.
async function toutMettreAJour() {
  const liste = (await projets.listerProjets()).filter((p) => !p.erreur);
  const aretes = graphe(liste);
  const parId = new Map(liste.map((p) => [p.id, p]));
  const modifies = [];
  // Consignes personnelles (Réglages > Claude) : CLAUDE.md à la racine de Toolkit, lu par
  // Claude Code pour Toolkit lui-même (app/) comme pour tous les projets.
  const consignes = String(reglages.obtenir().preferences?.claude?.consignes || '').trim();
  const fichierConsignes = path.join(chemins.racine, 'CLAUDE.md');
  const sectionConsignes = consignes ? [
    DEBUT_CONSIGNES,
    '# Consignes de l\'utilisateur pour tous ses projets',
    '',
    'Ces consignes viennent de l\'utilisateur (Réglages de Toolkit > Claude). Applique-les dans',
    'tous les projets, sauf si le CLAUDE.md du projet ou l\'utilisateur demande autre chose.',
    '',
    consignes,
    FIN_CONSIGNES,
  ].join('\n') : null;
  if (await ecrireSection(fichierConsignes, DEBUT_CONSIGNES, FIN_CONSIGNES, sectionConsignes)) modifies.push(fichierConsignes);
  const catalogue = path.join(chemins.projets(), 'CLAUDE.md');
  if (await ecrireSection(catalogue, DEBUT_CATALOGUE, FIN_CATALOGUE, sectionCatalogue(liste, aretes))) modifies.push(catalogue);
  for (const p of liste) {
    const fichier = path.join(chemins.projets(), p.id, 'CLAUDE.md');
    try {
      const section = sectionProjetsLies(p, parId, aretes);
      if (await ecrireSection(fichier, DEBUT_LIES, FIN_LIES, section, { creerSi: `# ${p.fiche.nom}\n\n` })) modifies.push(fichier);
    } catch (erreur) {
      journal.erreur(`CLAUDE.md de « ${p.id} » :`, erreur);
    }
  }
  if (modifies.length) journal.info(`Contexte Claude mis à jour : ${modifies.map((f) => chemins.versRelatif(f)).join(', ')}`);
  return modifies.map((f) => chemins.versRelatif(f));
}

// Mise à jour groupée (plusieurs changements rapprochés = une seule écriture).
function planifier(delai = 1500) {
  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    enCours = (enCours || Promise.resolve()).then(toutMettreAJour).catch((erreur) => journal.erreur('Contexte Claude :', erreur));
  }, delai);
}

// Dossiers des projets reliés (directement ou non) à ce projet, pour « claude --add-dir ».
async function dossiersLies(projetId) {
  const liste = (await projets.listerProjets()).filter((p) => !p.erreur);
  return relies(projetId, graphe(liste)).map((r) => path.join(chemins.projets(), r.id));
}

// Bouton « Discuter » : Claude lancé à la racine de Toolkit, en lecture seule. Réécrit à chaque
// lancement pour que le catalogue soit à jour ; un fichier, car la ligne de commande de Windows
// est limitée (environ 32 000 caractères) et le catalogue grandit avec les projets.
// Renvoie { fichier, dossiers } : les consignes, et le dossier des projets s'il est hors de la racine.
async function preparerDiscussion() {
  const liste = (await projets.listerProjets()).filter((p) => !p.erreur);
  const dossierProjets = chemins.versRelatif(chemins.projets());
  const texte = [
    '# Discussion avec l\'utilisateur de Toolkit',
    '',
    'L\'utilisateur a ouvert cette conversation avec le bouton « Discuter » de Toolkit, l\'application',
    'de bureau qui centralise ses projets. Il vient réfléchir avec toi : idées, choix, organisation,',
    'priorités, questions sur ses projets ou sur Toolkit.',
    '',
    '- Réponds en français, simplement : il ne sait pas forcément coder.',
    '- Ton dossier de travail est la racine de Toolkit. `app/` contient le code de Toolkit : lis',
    '  `app/CLAUDE.md` avant de répondre à une question sur Toolkit.',
    `- Chaque projet est dans \`${dossierProjets}/<dossier>/\` (\`projet.json\`, souvent un \`CLAUDE.md\`) :`,
    '  lis-les avant de parler d\'un projet en détail, sans inventer ce que tu n\'as pas vérifié.',
    '- N\'explore pas `donnees/` (données internes de Toolkit) ni les `node_modules`.',
    '- Cette conversation est en lecture seule : tu ne peux ni modifier de fichier ni lancer de',
    '  commande. Quand une décision mène à du travail, dis où le faire et donne une demande prête à',
    '  copier : « Modifier avec Claude » dans les détails d\'un projet, « Modifier Toolkit avec Claude »',
    '  dans ceux de Toolkit, ou « Nouvel outil ». Toolkit y fait d\'abord une sauvegarde Git.',
    '',
    sectionCatalogue(liste, graphe(liste)).replace(/<!--.*?-->\n?/g, ''),
    '',
  ].join('\n');
  const fichier = path.join(chemins.donnees, 'discussion-claude.md');
  await fs.writeFile(fichier, texte, 'utf8');
  return { fichier, dossiers: dossierProjets.startsWith('..') ? [chemins.projets()] : [] };
}

module.exports = { toutMettreAJour, planifier, dossiersLies, preparerDiscussion };

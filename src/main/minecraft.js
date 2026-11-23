// Mods Minecraft (Gradle) : chargeur utilisé, versions actuelles (gradle.properties) et versions
// disponibles en ligne pour « Changer de version de Minecraft… ».
// Rien n'est modifié ici : la mise à jour elle-même est confiée à Claude (code à adapter),
// avec les numéros de version trouvés ici pour qu'il n'ait pas à les deviner.
// Sources : meta.fabricmc.net (versions du jeu et du loader), maven.fabricmc.net (Loom),
// api.modrinth.com (Fabric API), piston-meta.mojang.com (versions du jeu, autres chargeurs).
// Résultats gardés 10 min en mémoire : aucune requête périodique.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { net } = require('electron');
const { dossierCible } = require('./cibles');

const DUREE_CACHE = 10 * 60 * 1000;
const TAILLE_MAX = 256 * 1024;
const cache = new Map();

async function lireUrl(url, format = 'json') {
  const memoire = cache.get(url);
  if (memoire && Date.now() - memoire.temps < DUREE_CACHE) return memoire.valeur;
  let reponse;
  try {
    reponse = await net.fetch(url, { headers: { 'user-agent': 'Toolkit' } });
  } catch {
    throw new Error('Impossible de joindre le site des versions de Minecraft. Vérifie ta connexion Internet.');
  }
  if (!reponse.ok) throw new Error(`Le site des versions a répondu par une erreur (${reponse.status}). Réessaie plus tard.`);
  const valeur = format === 'json' ? await reponse.json() : await reponse.text();
  cache.set(url, { valeur, temps: Date.now() });
  return valeur;
}

// Format .properties : « cle=valeur », « cle: valeur » ; # et ! = commentaires.
function lireProprietes(texte) {
  const proprietes = {};
  for (const ligne of String(texte || '').split(/\r?\n/)) {
    const m = /^[ \t]*([^#!\s=:][^=:\s]*)[ \t]*[=:\s][ \t]*(.*?)[ \t]*$/.exec(ligne);
    if (m) proprietes[m[1]] = m[2];
  }
  return proprietes;
}

async function lireTexte(chemin) {
  try {
    if ((await fs.stat(chemin)).size > TAILLE_MAX) return '';
    return await fs.readFile(chemin, 'utf8');
  } catch {
    return '';
  }
}

function chargeurDe(scriptGradle) {
  if (/fabric-loom/.test(scriptGradle)) return 'fabric';
  if (/net\.neoforged/.test(scriptGradle)) return 'neoforge';
  if (/net\.minecraftforge/.test(scriptGradle)) return 'forge';
  return null;
}

const NOMS_CHARGEURS = { fabric: 'Fabric', neoforge: 'NeoForge', forge: 'Forge' };

// { chargeur, nomChargeur, versionMinecraft, proprietes } d'un projet (lecture seule).
async function infosMod(id) {
  const dossier = await dossierCible({ type: 'projet', id });
  const proprietes = lireProprietes(await lireTexte(path.join(dossier, 'gradle.properties')));
  const script = (await lireTexte(path.join(dossier, 'build.gradle'))) || (await lireTexte(path.join(dossier, 'build.gradle.kts')));
  const chargeur = chargeurDe(script);
  const versionMinecraft = proprietes.minecraft_version || null;
  if (!versionMinecraft) throw new Error('Ce projet n\'indique pas sa version de Minecraft (ligne « minecraft_version » de gradle.properties).');
  // Fabric API : déclarée dans gradle.properties (fabric_version, fabric_api_version) ou build.gradle.
  const cleFabricApi = Object.keys(proprietes).find((cle) => /^fabric_(api_)?version$/i.test(cle)) || null;
  const utiliseFabricApi = chargeur === 'fabric' && (Boolean(cleFabricApi) || /fabric-api/.test(script));
  return {
    chargeur, nomChargeur: NOMS_CHARGEURS[chargeur] || null, versionMinecraft, proprietes,
    utiliseFabricApi, versionFabricApi: cleFabricApi ? proprietes[cleFabricApi] : null,
    versionLoader: chargeur === 'fabric' ? proprietes.loader_version || null : null,
  };
}

// Versions du jeu, de la plus récente à la plus ancienne : [{ version, stable }].
// Pour un mod Fabric : celles que Fabric prend en charge ; sinon : la liste de Mojang.
async function versionsMinecraft(chargeur) {
  if (chargeur === 'fabric') {
    const liste = await lireUrl('https://meta.fabricmc.net/v2/versions/game');
    return liste.map((v) => ({ version: v.version, stable: Boolean(v.stable) }));
  }
  const manifeste = await lireUrl('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
  return (manifeste.versions || []).map((v) => ({ version: v.id, stable: v.type === 'release' }));
}

// Dernière version publiée de Loom (hors préversions), lue dans le dépôt Maven de Fabric.
async function derniereVersionLoom() {
  const xml = await lireUrl('https://maven.fabricmc.net/net/fabricmc/fabric-loom/maven-metadata.xml', 'texte');
  const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
    .filter((v) => /^\d+(\.\d+)*$/.test(v));
  const comparer = (a, b) => {
    const x = a.split('.').map(Number);
    const y = b.split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
    return 0;
  };
  return versions.sort(comparer).pop() || null;
}

// Chaque recherche est indépendante : une source en panne n'empêche pas les autres.
async function ouNull(promesse) {
  try {
    return await promesse;
  } catch {
    return null;
  }
}

// Versions des dépendances Fabric pour une version du jeu :
// { loader, versionsLoader, fabricApi, versionsFabricApi, loom }
// (null quand rien n'a été trouvé, par exemple Fabric API pas encore sortie).
// versionsFabricApi : [{ version, type ('release' | 'beta' | 'alpha'), date }], la plus récente
// d'abord (30 au plus), pour que l'utilisateur choisisse.
async function dependancesFabric(version) {
  const v = encodeURIComponent(version);
  const [loaders, api, loom] = await Promise.all([
    ouNull(lireUrl(`https://meta.fabricmc.net/v2/versions/loader/${v}`)),
    ouNull(lireUrl(`https://api.modrinth.com/v2/project/fabric-api/version?loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(JSON.stringify([version]))}`)),
    ouNull(derniereVersionLoom()),
  ]);
  const loader = Array.isArray(loaders) ? (loaders.find((l) => l.loader?.stable) || loaders[0])?.loader?.version || null : null;
  // [{ version, stable }], la plus récente d'abord (30 au plus), pour que l'utilisateur choisisse.
  const versionsLoader = (Array.isArray(loaders) ? loaders : [])
    .filter((l) => l?.loader?.version)
    .slice(0, 30)
    .map((l) => ({ version: l.loader.version, stable: Boolean(l.loader.stable) }));
  const versionsFabricApi = (Array.isArray(api) ? api : [])
    .filter((v) => v && v.version_number)
    .slice(0, 30)
    .map((v) => ({ version: v.version_number, type: v.version_type || 'release', date: v.date_published || null }));
  const fabricApi = versionsFabricApi[0]?.version || null;
  return { loader, versionsLoader, fabricApi, versionsFabricApi, loom };
}

// Tout ce dont l'interface a besoin pour proposer le changement de version.
async function preparerChangement(id) {
  const infos = await infosMod(id);
  const versions = await versionsMinecraft(infos.chargeur);
  return { ...infos, versions };
}

async function dependances(id, version) {
  const infos = await infosMod(id);
  if (infos.chargeur !== 'fabric') return null;
  return dependancesFabric(String(version));
}

module.exports = { preparerChangement, dependances, lireProprietes, chargeurDe };

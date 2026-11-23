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

// --- Fabric API recommandée pour une version de Fabric Loader --------------------------------
// Chaque version de Fabric API indique dans son fabric.mod.json la version minimale du loader
// (« depends.fabricloader »). Ce fichier est lu directement dans le .jar du dépôt Maven de Fabric
// par lectures partielles (Range) : fin du zip -> répertoire central -> fabric.mod.json, soit
// quelques Ko au lieu de ~2,5 Mo. Résultat gardé en mémoire (une version publiée ne change pas).
const zlib = require('node:zlib');

const loaderMinimalCache = new Map();

async function lirePlage(url, debut, fin) {
  let reponse;
  try {
    reponse = await net.fetch(url, { headers: { 'user-agent': 'Toolkit', range: debut === null ? `bytes=-${fin}` : `bytes=${debut}-${fin}` } });
  } catch {
    throw new Error('Impossible de joindre le dépôt de Fabric. Vérifie ta connexion Internet.');
  }
  if (reponse.status !== 206) throw new Error(`Le dépôt de Fabric a répondu par une erreur (${reponse.status}).`);
  return Buffer.from(await reponse.arrayBuffer());
}

// Contenu d'un fichier à la racine d'un .jar distant, ou null s'il n'y est pas.
async function lireFichierDuJar(url, nom) {
  const fin = await lirePlage(url, null, 65536);
  const eocd = fin.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Fichier de Fabric API illisible.');
  const tailleRepertoire = fin.readUInt32LE(eocd + 12);
  const debutRepertoire = fin.readUInt32LE(eocd + 16);
  const repertoire = await lirePlage(url, debutRepertoire, debutRepertoire + tailleRepertoire - 1);
  for (let i = 0; i + 46 <= repertoire.length && repertoire.readUInt32LE(i) === 0x02014b50;) {
    const methode = repertoire.readUInt16LE(i + 10);
    const tailleCompressee = repertoire.readUInt32LE(i + 20);
    const longueurNom = repertoire.readUInt16LE(i + 28);
    const longueurExtra = repertoire.readUInt16LE(i + 30);
    const longueurCommentaire = repertoire.readUInt16LE(i + 32);
    const position = repertoire.readUInt32LE(i + 42);
    if (repertoire.toString('utf8', i + 46, i + 46 + longueurNom) === nom) {
      // L'en-tête local peut avoir un « extra » différent : marge de 1 Ko.
      const bloc = await lirePlage(url, position, position + 30 + longueurNom + 1024 + tailleCompressee);
      const debut = 30 + bloc.readUInt16LE(26) + bloc.readUInt16LE(28);
      const donnees = bloc.subarray(debut, debut + tailleCompressee);
      return (methode === 8 ? zlib.inflateRawSync(donnees) : donnees).toString('utf8');
    }
    i += 46 + longueurNom + longueurExtra + longueurCommentaire;
  }
  return null;
}

// Version minimale de Fabric Loader exigée par une version de Fabric API (null = aucune).
async function loaderMinimalFabricApi(version) {
  if (loaderMinimalCache.has(version)) return loaderMinimalCache.get(version);
  const v = encodeURIComponent(version);
  const url = `https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/${v}/fabric-api-${v}.jar`;
  const texte = await lireFichierDuJar(url, 'fabric.mod.json');
  let minimum = null;
  try {
    const exigence = JSON.parse(texte || '{}').depends?.fabricloader;
    const m = /(\d+(?:\.\d+)+)/.exec(Array.isArray(exigence) ? exigence.join(' ') : String(exigence || ''));
    minimum = m ? m[1] : null;
  } catch {
    minimum = null;
  }
  loaderMinimalCache.set(version, minimum);
  return minimum;
}

// Compare deux numéros « 0.16.10 » (suffixes comme « +build.1 » ignorés).
function comparerVersions(a, b) {
  const x = String(a).split(/[+-]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
  const y = String(b).split(/[+-]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

// Fabric API la plus récente (pour cette version du jeu) qui fonctionne avec ce loader :
// { version, loaderMinimal } ou null si aucune de la liste ne convient.
// Recherche par dichotomie (le loader exigé ne baisse jamais d'une version à la suivante).
async function fabricApiRecommandee(versionJeu, loader) {
  const { versionsFabricApi } = await dependancesFabric(String(versionJeu));
  const liste = versionsFabricApi.map((v) => v.version);
  const convient = async (i) => {
    const minimum = await loaderMinimalFabricApi(liste[i]);
    return !minimum || comparerVersions(loader, minimum) >= 0;
  };
  let bas = 0;
  let haut = liste.length; // première position (de la plus récente à la plus ancienne) qui convient
  while (bas < haut) {
    const milieu = Math.floor((bas + haut) / 2);
    if (await convient(milieu)) haut = milieu;
    else bas = milieu + 1;
  }
  if (bas >= liste.length) return null;
  return { version: liste[bas], loaderMinimal: await loaderMinimalFabricApi(liste[bas]) };
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

module.exports = { preparerChangement, dependances, fabricApiRecommandee, comparerVersions, lireProprietes, chargeurDe };

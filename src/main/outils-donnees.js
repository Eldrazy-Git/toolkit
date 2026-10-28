// Export et import des données d'un outil HTML (localStorage + IndexedDB) dans un
// fichier JSON lisible, et réinitialisation (tout effacer).
//
// Les fonctions « collecter » et « restaurer » sont exécutées DANS la page de l'outil
// (executeJavaScript) : elles doivent donc être autonomes (aucune variable extérieure).
'use strict';

const { dialog, app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const outilsHtml = require('./outils-html');

const FORMAT = 'toolkit-donnees-outil';

// --- Exécuté dans la page de l'outil -----------------------------------------------------

/* eslint-disable no-undef */
async function collecter(format) {
  function base64(tampon) {
    const octets = new Uint8Array(tampon);
    let binaire = '';
    for (let i = 0; i < octets.length; i += 0x8000) {
      binaire += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    }
    return btoa(binaire);
  }

  // Transforme une valeur IndexedDB en JSON, en marquant les types spéciaux par « __t ».
  async function encoder(v) {
    if (v === undefined) return { __t: 'undefined' };
    if (typeof v === 'bigint') return { __t: 'bigint', v: String(v) };
    if (typeof v === 'number' && !Number.isFinite(v)) return { __t: 'nombre', v: String(v) };
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Date) return { __t: 'Date', v: v.getTime() };
    if (v instanceof Blob) {
      return { __t: v instanceof File ? 'File' : 'Blob', type: v.type, nom: v.name || null, v: base64(await v.arrayBuffer()) };
    }
    if (v instanceof ArrayBuffer) return { __t: 'ArrayBuffer', v: base64(v) };
    if (ArrayBuffer.isView(v)) {
      return { __t: v.constructor.name, v: base64(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)) };
    }
    if (v instanceof Map) return { __t: 'Map', v: await Promise.all([...v].map(async ([k, x]) => [await encoder(k), await encoder(x)])) };
    if (v instanceof Set) return { __t: 'Set', v: await Promise.all([...v].map(encoder)) };
    if (v instanceof RegExp) return { __t: 'RegExp', v: v.source, drapeaux: v.flags };
    if (Array.isArray(v)) return Promise.all(v.map(encoder));
    const objet = {};
    for (const [cle, valeur] of Object.entries(v)) objet[cle] = await encoder(valeur);
    return '__t' in v ? { __t: 'objet', v: objet } : objet;
  }

  const requete = (r) => new Promise((ok, ko) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });

  const stockageLocal = {};
  for (let i = 0; i < localStorage.length; i++) {
    const cle = localStorage.key(i);
    stockageLocal[cle] = localStorage.getItem(cle);
  }

  const bases = [];
  for (const { name, version } of await indexedDB.databases()) {
    const base = await requete(indexedDB.open(name));
    const magasins = [];
    for (const nomMagasin of base.objectStoreNames) {
      const magasin = base.transaction(nomMagasin, 'readonly').objectStore(nomMagasin);
      const [valeurs, cles] = await Promise.all([requete(magasin.getAll()), requete(magasin.getAllKeys())]);
      const index = [...magasin.indexNames].map((n) => {
        const i = magasin.index(n);
        return { nom: n, keyPath: i.keyPath, unique: i.unique, multiEntry: i.multiEntry };
      });
      magasins.push({
        nom: nomMagasin,
        keyPath: magasin.keyPath,
        autoIncrement: magasin.autoIncrement,
        index,
        enregistrements: await Promise.all(valeurs.map(async (valeur, n) => ({
          cle: await encoder(cles[n]),
          valeur: await encoder(valeur),
        }))),
      });
    }
    base.close();
    bases.push({ nom: name, version, magasins });
  }

  return JSON.stringify({
    format,
    version: 1,
    origine: location.origin,
    date: new Date().toISOString(),
    localStorage: stockageLocal,
    indexedDB: bases,
  }, null, 2);
}

async function restaurer(texte) {
  function depuisBase64(t) {
    const binaire = atob(t);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return octets.buffer;
  }

  const TYPES_TABLEAUX = {
    Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
    Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView,
  };

  function decoder(v) {
    if (Array.isArray(v)) return v.map(decoder);
    if (v === null || typeof v !== 'object') return v;
    switch (v.__t) {
      case undefined: return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decoder(x)]));
      case 'undefined': return undefined;
      case 'bigint': return BigInt(v.v);
      case 'nombre': return Number(v.v);
      case 'Date': return new Date(v.v);
      case 'Blob': return new Blob([depuisBase64(v.v)], { type: v.type });
      case 'File': return new File([depuisBase64(v.v)], v.nom || 'fichier', { type: v.type });
      case 'ArrayBuffer': return depuisBase64(v.v);
      case 'Map': return new Map(v.v.map(([k, x]) => [decoder(k), decoder(x)]));
      case 'Set': return new Set(v.v.map(decoder));
      case 'RegExp': return new RegExp(v.v, v.drapeaux);
      case 'objet': return decoder(v.v);
      default:
        if (TYPES_TABLEAUX[v.__t]) return new TYPES_TABLEAUX[v.__t](depuisBase64(v.v));
        return v;
    }
  }

  const requete = (r) => new Promise((ok, ko) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.onblocked = () => ko(new Error('Base de données encore utilisée.'));
  });

  const donnees = JSON.parse(texte);

  localStorage.clear();
  for (const [cle, valeur] of Object.entries(donnees.localStorage || {})) localStorage.setItem(cle, valeur);

  // Remplace toutes les bases existantes par celles du fichier.
  for (const { name } of await indexedDB.databases()) await requete(indexedDB.deleteDatabase(name));

  for (const b of donnees.indexedDB || []) {
    const ouverture = indexedDB.open(b.nom, b.version || 1);
    ouverture.onupgradeneeded = () => {
      const base = ouverture.result;
      for (const m of b.magasins) {
        const options = { autoIncrement: m.autoIncrement };
        if (m.keyPath !== null) options.keyPath = m.keyPath;
        const magasin = base.createObjectStore(m.nom, options);
        for (const i of m.index) magasin.createIndex(i.nom, i.keyPath, { unique: i.unique, multiEntry: i.multiEntry });
      }
    };
    const base = await requete(ouverture);
    for (const m of b.magasins) {
      const transaction = base.transaction(m.nom, 'readwrite');
      const magasin = transaction.objectStore(m.nom);
      for (const e of m.enregistrements) {
        if (m.keyPath === null) magasin.put(decoder(e.valeur), decoder(e.cle));
        else magasin.put(decoder(e.valeur));
      }
      await new Promise((ok, ko) => {
        transaction.oncomplete = ok;
        transaction.onerror = () => ko(transaction.error);
      });
    }
    base.close();
  }
  return {
    cles: Object.keys(donnees.localStorage || {}).length,
    bases: (donnees.indexedDB || []).length,
  };
}
/* eslint-enable no-undef */

// --- Côté Toolkit ---------------------------------------------------------------------

function nomDeFichier(nom) {
  const propre = nom.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'outil';
  const date = new Date().toISOString().slice(0, 10);
  return `${propre} - donnees ${date}.json`;
}

// Renvoie le chemin du fichier créé, ou null si l'utilisateur a annulé.
async function exporter(idContenu, nomOutil) {
  const contenu = outilsHtml.contenuOutil(idContenu);
  let texte;
  try {
    texte = await contenu.executeJavaScript(`(${collecter})(${JSON.stringify(FORMAT)})`);
  } catch (erreur) {
    throw new Error(`Impossible de lire les données de l'outil : ${erreur.message}`);
  }
  const { canceled, filePath } = await dialog.showSaveDialog(outilsHtml.fenetreDe(contenu), {
    title: `Exporter les données de « ${nomOutil} »`,
    defaultPath: path.join(app.getPath('documents'), nomDeFichier(nomOutil)),
    filters: [{ name: 'Données Toolkit', extensions: ['json'] }],
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, texte, 'utf8');
  return path.basename(filePath);
}

// Remplace les données de l'outil par celles d'un fichier exporté.
// Renvoie { fichier, cles, bases } ou null si l'utilisateur a annulé.
async function importer(idContenu, nomOutil) {
  const contenu = outilsHtml.contenuOutil(idContenu);
  const { canceled, filePaths } = await dialog.showOpenDialog(outilsHtml.fenetreDe(contenu), {
    title: `Importer des données dans « ${nomOutil} »`,
    defaultPath: app.getPath('documents'),
    filters: [{ name: 'Données Toolkit', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;

  let texte;
  try {
    texte = (await fs.readFile(filePaths[0], 'utf8')).replace(/^﻿/, '');
    const donnees = JSON.parse(texte);
    if (donnees.format !== FORMAT) throw new Error('format');
  } catch {
    throw new Error('Ce fichier n\'est pas un export de données Toolkit.');
  }

  // L'outil est d'abord remplacé par une page vide de la même origine : il ferme ainsi
  // ses bases de données, qui peuvent alors être effacées et recréées.
  const urlOutil = contenu.getURL();
  // (new URL().origin vaut « null » pour un protocole personnalisé : on reconstruit l'origine.)
  const origine = `${outilsHtml.SCHEMA}://${new URL(urlOutil).host}`;
  await contenu.loadURL(`${origine}${outilsHtml.CHEMIN_PAGE_VIDE}`);
  try {
    const resultat = await contenu.executeJavaScript(`(${restaurer})(${JSON.stringify(texte)})`);
    return { fichier: path.basename(filePaths[0]), ...resultat };
  } catch (erreur) {
    throw new Error(`L'import a échoué : ${erreur.message}`);
  } finally {
    await contenu.loadURL(urlOutil).catch(() => {});
  }
}

// Efface toutes les données de l'outil (localStorage, IndexedDB, cookies, cache,
// service workers…) : il repart comme au premier lancement. La partition est propre à
// l'outil, rien d'autre n'est touché. Les fichiers du projet ne sont pas modifiés.
async function reinitialiser(idContenu) {
  const contenu = outilsHtml.contenuOutil(idContenu);
  const urlOutil = contenu.getURL();
  const origine = `${outilsHtml.SCHEMA}://${new URL(urlOutil).host}`;
  // Page vide d'abord : l'outil ferme ses bases et ne réécrit rien pendant l'effacement.
  await contenu.loadURL(`${origine}${outilsHtml.CHEMIN_PAGE_VIDE}`);
  try {
    await contenu.executeJavaScript('localStorage.clear(); sessionStorage.clear();').catch(() => {});
    await contenu.session.clearStorageData();
    await contenu.session.clearCache();
  } catch (erreur) {
    throw new Error(`La réinitialisation a échoué : ${erreur.message}`);
  } finally {
    await contenu.loadURL(urlOutil).catch(() => {});
  }
}

module.exports = { exporter, importer, reinitialiser };

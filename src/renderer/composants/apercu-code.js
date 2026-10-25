// Aperçu à côté de l'éditeur (onglet « Code ») pour les fichiers représentables :
// - HTML : la page servie comme un outil (fichiers voisins compris), rechargée à chaque
//   enregistrement ;
// - Markdown : rendu comme une note, en direct ;
// - SVG : l'image, en direct ;
// - XML Android : layout, icône vectorielle, forme, ressources (voir apercu-android.js) ;
// - CSV / TSV : tableau.
// Les images (png, jpg…) sont déjà affichées directement par l'éditeur.
import { el } from './dom.js';
import { icone } from './icones.js';
import { chargerRessources, dossierResDe, apercuXml, genreXml } from './apercu-android.js';

const api = window.toolkit.code;

// Genre d'aperçu d'un fichier, d'après son nom (et son contenu pour le XML).
export function genreApercu(chemin, texte = '') {
  const extension = chemin.toLowerCase().split('.').pop();
  if (['html', 'htm'].includes(extension)) return 'html';
  if (['md', 'markdown'].includes(extension)) return 'markdown';
  if (extension === 'svg') return 'svg';
  if (['csv', 'tsv'].includes(extension)) return 'tableau';
  if (extension === 'xml' && (/\/res\//.test(`/${chemin}`) || genreXml(texte))) return 'xml';
  return null;
}

// Découpe un CSV (guillemets, séparateur , ; ou tabulation). 500 lignes au plus.
function lireCsv(texte, separateur) {
  const lignes = [];
  let ligne = [];
  let champ = '';
  let guillemets = false;
  for (let i = 0; i < texte.length && lignes.length < 500; i += 1) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i += 1; } else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === separateur) { ligne.push(champ); champ = ''; } else if (c === '\n') { ligne.push(champ.replace(/\r$/, '')); lignes.push(ligne); ligne = []; champ = ''; } else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

// cible, cle : dossier ouvert dans l'onglet « Code ». Renvoie { element, montrer(doc, raison), invalider() }.
export function creerApercu({ cible, cle }) {
  const contenu = el('div', { classe: 'apercu-contenu' });
  const titre = el('span', { classe: 'apercu-titre' }, 'Aperçu');
  const boutonRecharger = el('button', { classe: 'bouton-icone', title: 'Recharger l\'aperçu', onClick: () => montrer(dernier, 'forcer') }, icone('redemarrer'));
  const boutonSombre = el('button', { classe: 'bouton-icone', title: 'Thème clair / sombre (layouts Android)', hidden: true, onClick: () => { sombre = !sombre; montrer(dernier, 'forcer'); } }, icone('ordinateur'));
  const element = el('div', { classe: 'code-apercu' },
    el('div', { classe: 'apercu-entete' }, icone('lecture'), titre, boutonSombre, boutonRecharger),
    contenu);

  let webview = null;
  let racineHtml = null;
  let dernier = null; // document affiché
  let numero = 0;
  let sombre = false;
  const ressources = new Map(); // dossier res -> promesse de ressources

  function ressourcesDe(chemin) {
    const dossier = dossierResDe(chemin);
    if (!ressources.has(dossier)) {
      ressources.set(dossier, chargerRessources(dossier, {
        lister: (d) => api.lister(cible, d),
        lireTexte: async (c) => {
          try {
            const lu = await api.lire(cible, c);
            return lu.texte ?? null;
          } catch {
            return null;
          }
        },
        lireImage: async (c) => {
          try {
            return (await api.lire(cible, c)).image || null;
          } catch {
            return null;
          }
        },
      }));
    }
    return ressources.get(dossier);
  }

  async function montrerHtml(doc, raison) {
    if (!racineHtml) racineHtml = await api.apercuHtml(cible, cle);
    const url = racineHtml.racine + doc.chemin.split('/').map(encodeURIComponent).join('/');
    if (!webview) {
      webview = document.createElement('webview');
      webview.setAttribute('partition', racineHtml.partition);
      webview.setAttribute('src', url);
      webview.classList.add('apercu-webview');
    } else if (webview.getAttribute('src') !== url) {
      webview.setAttribute('src', url);
    } else if (raison === 'enregistre' || raison === 'forcer') {
      try { webview.reloadIgnoringCache(); } catch { webview.setAttribute('src', url); }
    }
    if (webview.parentElement !== contenu) contenu.replaceChildren(webview);
  }

  // raison : 'ouverture' | 'frappe' | 'enregistre' | 'forcer'
  async function montrer(doc, raison = 'ouverture') {
    dernier = doc;
    if (!doc?.modele) return;
    const chemin = doc.chemin;
    const texte = doc.modele.getValue();
    const genre = genreApercu(chemin, texte);
    boutonSombre.hidden = genre !== 'xml';
    titre.textContent = `Aperçu — ${chemin.split('/').pop()}`;
    const n = ++numero;
    try {
      if (genre === 'html') {
        if (raison === 'frappe') return; // la page est relue depuis le disque : à l'enregistrement
        await montrerHtml(doc, raison);
        return;
      }
      let rendu;
      if (genre === 'markdown') {
        const article = el('article', { classe: 'markdown apercu-markdown' });
        article.innerHTML = await api.rendreMarkdown(cible, chemin, texte); // HTML brut désactivé côté processus principal
        rendu = article;
      } else if (genre === 'svg') {
        rendu = el('div', { classe: 'apercu-centre' }, el('div', { classe: 'apercu-damier' },
          el('img', { classe: 'apercu-svg', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texte)}`, alt: '' })));
      } else if (genre === 'tableau') {
        const separateur = chemin.toLowerCase().endsWith('.tsv') ? '\t' : ((texte.split('\n')[0].match(/;/g) || []).length > (texte.split('\n')[0].match(/,/g) || []).length ? ';' : ',');
        const lignes = lireCsv(texte, separateur);
        rendu = el('div', { classe: 'apercu-tableau' }, el('table', {},
          lignes[0] ? el('thead', {}, el('tr', {}, lignes[0].map((c) => el('th', {}, c)))) : null,
          el('tbody', {}, lignes.slice(1).map((l) => el('tr', {}, l.map((c) => el('td', {}, c)))))),
        lignes.length >= 500 ? el('p', { classe: 'details-aide' }, 'Seules les 500 premières lignes sont affichées.') : null);
      } else if (genre === 'xml') {
        rendu = await apercuXml(texte, await ressourcesDe(chemin), { sombre });
      } else {
        rendu = el('p', { classe: 'details-aide apercu-vide' }, 'Pas d\'aperçu pour ce type de fichier.');
      }
      if (n !== numero) return;
      contenu.replaceChildren(rendu);
    } catch (erreur) {
      if (n === numero) contenu.replaceChildren(el('div', { classe: 'apercu-erreur' }, icone('attention'), el('p', {}, erreur.message)));
    }
  }

  return {
    element,
    montrer,
    // Des fichiers ont changé : ressources Android relues, page HTML rechargée.
    invalider(chemins = []) {
      if (chemins.some((c) => /(^|\/)res\//.test(c))) ressources.clear();
      if (dernier && chemins.length) montrer(dernier, genreApercu(dernier.chemin) === 'html' ? 'enregistre' : 'forcer');
    },
    detruire() {
      webview?.remove();
    },
  };
}

// Aperçu des fichiers XML Android dans l'éditeur : layouts (dessinés de façon approchée,
// comme le mode « Design » d'Android Studio en plus simple), icônes vectorielles
// (<vector> -> SVG), formes (<shape>), et fichiers de ressources (<resources> : couleurs,
// textes, dimensions). Les valeurs @string/@color/@dimen/@drawable sont cherchées dans le
// dossier res/ du module. Rien n'est exécuté : tout est construit avec el().
import { el } from './dom.js';
import { icone } from './icones.js';

const PROFONDEUR_MAX = 6; // <include> et tools:listitem imbriqués
const COULEURS_THEME = {
  colorPrimary: '#6750a4', colorOnPrimary: '#ffffff', colorPrimaryContainer: '#eaddff', colorOnPrimaryContainer: '#21005d',
  colorSecondary: '#625b71', colorSecondaryContainer: '#e8def8', colorSurface: '#fef7ff', colorOnSurface: '#1d1b20',
  colorOnSurfaceVariant: '#49454f', colorOutline: '#79747e', colorError: '#b3261e', colorAccent: '#6750a4',
  colorControlNormal: '#49454f', textColorPrimary: '#1d1b20', textColorSecondary: '#49454f', colorBackground: '#fef7ff',
  colorSurfaceVariant: '#e7e0ec', colorTertiary: '#7d5260',
};
const COULEURS_ANDROID = { white: '#ffffff', black: '#000000', transparent: 'transparent', darker_gray: '#aaaaaa', holo_blue_dark: '#0099cc', holo_red_dark: '#cc0000', holo_green_dark: '#669900' };
const TEXTES_ANDROID = { ok: 'OK', cancel: 'Annuler', yes: 'Oui', no: 'Non' };

// --- Ressources du module (res/values, drawables, layouts) --------------------------------

// lireTexte(chemin) -> texte ou null ; lister(dossier) -> [{ nom, chemin, dossier }] ;
// lireImage(chemin) -> data: URL ou null. Renvoie un objet de ressources (avec cache).
export async function chargerRessources(dossierRes, { lireTexte, lister, lireImage }) {
  const r = { strings: new Map(), colors: new Map(), dimens: new Map(), drawables: new Map(), layouts: new Map(), menus: new Map(), cache: new Map(), lireTexte, lireImage, dossierRes };
  if (dossierRes === null) return r;
  let dossiers = [];
  try {
    dossiers = (await lister(dossierRes)).filter((d) => d.dossier);
  } catch {
    return r;
  }
  for (const d of dossiers) {
    const nom = d.nom.toLowerCase();
    let fichiers = [];
    try {
      fichiers = (await lister(d.chemin)).filter((f) => !f.dossier);
    } catch {
      continue;
    }
    if (nom === 'values') {
      for (const f of fichiers.filter((x) => x.nom.endsWith('.xml'))) {
        const doc = analyser(await lireTexte(f.chemin));
        if (!doc) continue;
        for (const n of doc.documentElement.children) {
          const cle = n.getAttribute('name');
          if (!cle) continue;
          if (n.tagName === 'string') r.strings.set(cle, n.textContent.replace(/\\'/g, '\'').replace(/\\"/g, '"').replace(/\\n/g, '\n'));
          else if (n.tagName === 'color') r.colors.set(cle, n.textContent.trim());
          else if (n.tagName === 'dimen') r.dimens.set(cle, n.textContent.trim());
        }
      }
    } else if (nom.startsWith('drawable') || nom.startsWith('mipmap')) {
      // Densité la plus haute en dernier : elle remplace les autres (meilleure qualité).
      for (const f of fichiers) {
        const base = f.nom.replace(/\.(9\.)?[^.]+$/, '');
        const existant = r.drawables.get(base);
        if (!existant || f.nom.endsWith('.xml') || /xxx?hdpi/.test(nom)) r.drawables.set(base, f.chemin);
      }
    } else if (nom === 'layout') {
      for (const f of fichiers) r.layouts.set(f.nom.replace(/\.xml$/, ''), f.chemin);
    } else if (nom === 'menu') {
      for (const f of fichiers) r.menus.set(f.nom.replace(/\.xml$/, ''), f.chemin);
    }
  }
  return r;
}

// Dossier res/ d'un fichier « …/res/layout/x.xml » (ou null).
export function dossierResDe(chemin) {
  const morceaux = chemin.split('/');
  const index = morceaux.lastIndexOf('res');
  return index > 0 || (index === 0 && morceaux.length > 1) ? morceaux.slice(0, index + 1).join('/') : null;
}

function analyser(texte) {
  if (!texte) return null;
  const doc = new DOMParser().parseFromString(texte, 'application/xml');
  return doc.querySelector('parsererror') ? null : doc;
}

// --- Valeurs ----------------------------------------------------------------------------------

function couleur(valeur, r, profondeur = 0) {
  if (!valeur || profondeur > 8) return null;
  const v = valeur.trim();
  if (v.startsWith('#')) {
    const hex = v.slice(1);
    if (hex.length === 8) return `#${hex.slice(2)}${hex.slice(0, 2)}`; // AARRGGBB -> RRGGBBAA
    if (hex.length === 4) return `#${hex.slice(1)}${hex[0]}`;
    return v;
  }
  let m = /^@(?:android:)?color\/(.+)$/.exec(v);
  if (m) return v.includes('android:') ? COULEURS_ANDROID[m[1]] || '#888888' : couleur(r.colors.get(m[1]), r, profondeur + 1) || '#888888';
  m = /^\?(?:android:)?(?:attr\/)?(.+)$/.exec(v);
  if (m) return COULEURS_THEME[m[1]] || null;
  return null;
}

function texte(valeur, r) {
  if (valeur === null || valeur === undefined) return null;
  let m = /^@android:string\/(.+)$/.exec(valeur);
  if (m) return TEXTES_ANDROID[m[1]] || m[1];
  m = /^@string\/(.+)$/.exec(valeur);
  if (m) return r.strings.has(m[1]) ? r.strings.get(m[1]) : `@string/${m[1]}`;
  return valeur.replace(/\\n/g, '\n').replace(/\\'/g, '\'');
}

// Taille en px (1dp = 1px dans l'aperçu) ; 'match' | 'wrap' | nombre | null.
function taille(valeur, r, profondeur = 0) {
  if (!valeur || profondeur > 5) return null;
  if (valeur === 'match_parent' || valeur === 'fill_parent') return 'match';
  if (valeur === 'wrap_content') return 'wrap';
  const m = /^@dimen\/(.+)$/.exec(valeur);
  if (m) return taille(r.dimens.get(m[1]), r, profondeur + 1);
  const n = /^(-?[\d.]+)\s*(dp|dip|sp|px|pt)?$/.exec(valeur.trim());
  return n ? Number(n[1]) : null;
}

const px = (valeur, r) => {
  const t = taille(valeur, r);
  return typeof t === 'number' ? `${t}px` : null;
};

// Attribut : les attributs « tools: » (aperçu seulement) priment, comme dans Android Studio.
function attr(n, nom) {
  return n.getAttribute(`tools:${nom}`) ?? n.getAttribute(`android:${nom}`) ?? n.getAttribute(`app:${nom}`);
}

// --- Drawables : vecteurs, formes, images ----------------------------------------------------

function vecteurVersSvg(racine, r, teinteForcee = null) {
  const largeur = parseFloat(racine.getAttribute('android:viewportWidth')) || 24;
  const hauteur = parseFloat(racine.getAttribute('android:viewportHeight')) || 24;
  const teinte = teinteForcee || couleur(racine.getAttribute('android:tint'), r);
  const echapper = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const contenu = (noeud) => [...noeud.children].map((n) => {
    if (n.tagName === 'group') {
      const tx = parseFloat(n.getAttribute('android:translateX')) || 0;
      const ty = parseFloat(n.getAttribute('android:translateY')) || 0;
      const sx = parseFloat(n.getAttribute('android:scaleX') ?? 1);
      const sy = parseFloat(n.getAttribute('android:scaleY') ?? 1);
      const rot = parseFloat(n.getAttribute('android:rotation')) || 0;
      const px0 = parseFloat(n.getAttribute('android:pivotX')) || 0;
      const py0 = parseFloat(n.getAttribute('android:pivotY')) || 0;
      const transformation = `translate(${tx} ${ty}) translate(${px0} ${py0}) rotate(${rot}) scale(${sx} ${sy}) translate(${-px0} ${-py0})`;
      return `<g transform="${transformation}">${contenu(n)}</g>`;
    }
    if (n.tagName !== 'path') return '';
    const d = n.getAttribute('android:pathData') || '';
    const remplissage = teinte || couleur(n.getAttribute('android:fillColor'), r) || (n.getAttribute('android:strokeColor') ? 'none' : '#000');
    const trait = couleur(n.getAttribute('android:strokeColor'), r);
    const regle = n.getAttribute('android:fillType') === 'evenOdd' ? 'evenodd' : 'nonzero';
    const attributs = [
      `d="${echapper(d)}"`,
      `fill="${echapper(n.getAttribute('android:fillColor') || teinte ? remplissage : 'none')}"`,
      `fill-rule="${regle}"`,
      `fill-opacity="${parseFloat(n.getAttribute('android:fillAlpha') ?? 1)}"`,
      trait ? `stroke="${echapper(trait)}" stroke-width="${parseFloat(n.getAttribute('android:strokeWidth')) || 1}"` : '',
    ];
    return `<path ${attributs.join(' ')}/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largeur} ${hauteur}">${contenu(racine)}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Style CSS d'une forme <shape> (fond, coins, bordure, dégradé).
function styleForme(racine, r) {
  const style = {};
  const plein = racine.querySelector('solid');
  if (plein) style['background-color'] = couleur(plein.getAttribute('android:color'), r) || 'transparent';
  const degrade = racine.querySelector('gradient');
  if (degrade) {
    const angle = (parseFloat(degrade.getAttribute('android:angle')) || 0);
    const couleurs = ['startColor', 'centerColor', 'endColor'].map((c) => couleur(degrade.getAttribute(`android:${c}`), r)).filter(Boolean);
    style['background-image'] = `linear-gradient(${90 - angle}deg, ${couleurs.join(', ')})`;
  }
  const coins = racine.querySelector('corners');
  if (coins) style['border-radius'] = px(coins.getAttribute('android:radius'), r) || '0';
  if (racine.getAttribute('android:shape') === 'oval') style['border-radius'] = '50%';
  const bord = racine.querySelector('stroke');
  if (bord) style.border = `${px(bord.getAttribute('android:width'), r) || '1px'} ${bord.getAttribute('android:dashWidth') ? 'dashed' : 'solid'} ${couleur(bord.getAttribute('android:color'), r) || '#888'}`;
  const dimension = racine.querySelector('size');
  if (dimension) {
    style.width = px(dimension.getAttribute('android:width'), r) || undefined;
    style.height = px(dimension.getAttribute('android:height'), r) || undefined;
  }
  return style;
}

// Drawable -> { image: dataURL } | { style } | { couleur } | null
async function drawable(valeur, r, teinte = null) {
  if (!valeur) return null;
  const c = couleur(valeur, r);
  if (c) return { couleur: c };
  const m = /^@(?:drawable|mipmap)\/(.+)$/.exec(valeur);
  if (!m) return null;
  const cle = `${m[1]}|${teinte || ''}`;
  if (r.cache.has(cle)) return r.cache.get(cle);
  const chemin = r.drawables.get(m[1]);
  let resultat = null;
  if (chemin?.endsWith('.xml')) {
    const doc = analyser(await r.lireTexte(chemin));
    const racine = doc?.documentElement;
    if (racine?.tagName === 'vector') resultat = { image: vecteurVersSvg(racine, r, teinte) };
    else if (racine?.tagName === 'shape') resultat = { style: styleForme(racine, r) };
    else if (racine && ['selector', 'layer-list', 'ripple', 'inset', 'adaptive-icon'].includes(racine.tagName)) {
      // Premier élément utilisable (état par défaut, calque du fond…).
      const items = [...racine.querySelectorAll('item, foreground, background')];
      const choisi = items.find((i) => ![...i.attributes].some((a) => a.name.startsWith('android:state_'))) || items[0];
      const reference = choisi?.getAttribute('android:drawable') || choisi?.getAttribute('android:color');
      if (reference) resultat = await drawable(reference, r, teinte);
      else if (choisi?.querySelector('shape')) resultat = { style: styleForme(choisi.querySelector('shape'), r) };
    }
  } else if (chemin) {
    const image = await r.lireImage(chemin);
    if (image) resultat = { image };
  }
  r.cache.set(cle, resultat);
  return resultat;
}

function appliquerFond(element, d) {
  if (!d) return;
  if (d.couleur) element.style.setProperty('background-color', d.couleur);
  if (d.image) {
    element.style.setProperty('background-image', `url("${d.image}")`);
    element.style.setProperty('background-size', '100% 100%');
  }
  if (d.style) Object.entries(d.style).forEach(([k, v]) => { if (v && k !== 'width' && k !== 'height') element.style.setProperty(k, v); });
}

// --- Layout ------------------------------------------------------------------------------------

const NOM_COURT = (balise) => balise.split('.').pop();
const est = (balise, ...noms) => noms.includes(NOM_COURT(balise));

function espacements(element, n, r) {
  const valeur = (nom) => px(n.getAttribute(`android:${nom}`), r);
  const tous = valeur('padding');
  const h = valeur('paddingHorizontal');
  const v = valeur('paddingVertical');
  const p = {
    top: valeur('paddingTop') || v || tous,
    bottom: valeur('paddingBottom') || v || tous,
    left: valeur('paddingStart') || valeur('paddingLeft') || h || tous,
    right: valeur('paddingEnd') || valeur('paddingRight') || h || tous,
  };
  Object.entries(p).forEach(([cote, x]) => { if (x) element.style.setProperty(`padding-${cote}`, x); });
  const marge = valeur('layout_margin');
  const mh = valeur('layout_marginHorizontal');
  const mv = valeur('layout_marginVertical');
  const m = {
    top: valeur('layout_marginTop') || mv || marge,
    bottom: valeur('layout_marginBottom') || mv || marge,
    left: valeur('layout_marginStart') || valeur('layout_marginLeft') || mh || marge,
    right: valeur('layout_marginEnd') || valeur('layout_marginRight') || mh || marge,
  };
  Object.entries(m).forEach(([cote, x]) => { if (x) element.style.setProperty(`margin-${cote}`, x); });
}

// Dimensions de la vue selon le conteneur parent ('colonne', 'ligne', 'pile').
function dimensions(element, n, r, parent) {
  const l = taille(n.getAttribute('android:layout_width'), r);
  const h = taille(n.getAttribute('android:layout_height'), r);
  const poids = parseFloat(n.getAttribute('android:layout_weight')) || 0;
  const regler = (propriete, valeur, axePrincipal) => {
    if (valeur === 'match') {
      if (axePrincipal) element.style.setProperty('flex', '1 1 auto');
      else element.style.setProperty('align-self', 'stretch');
      element.style.setProperty(propriete === 'width' ? 'min-width' : 'min-height', '0');
    } else if (typeof valeur === 'number' && !(valeur === 0 && poids)) {
      element.style.setProperty(propriete, `${valeur}px`);
      element.style.setProperty('flex-shrink', '0');
    }
  };
  if (parent === 'ligne') {
    regler('width', l, true);
    regler('height', h, false);
  } else if (parent === 'colonne') {
    regler('width', l, false);
    regler('height', h, true);
  } else {
    if (l === 'match') element.style.setProperty('justify-self', 'stretch');
    else if (typeof l === 'number') element.style.setProperty('width', `${l}px`);
    if (h === 'match') element.style.setProperty('align-self', 'stretch');
    else if (typeof h === 'number') element.style.setProperty('height', `${h}px`);
  }
  if (poids) element.style.setProperty('flex', `${poids} 1 0`);
  // layout_gravity (dans une pile ou à travers l'axe d'une LinearLayout)
  const gravite = n.getAttribute('android:layout_gravity') || '';
  if (gravite) {
    const h2 = /center_horizontal|center(?!_)/.test(gravite) ? 'center' : /end|right/.test(gravite) ? 'end' : null;
    const v2 = /center_vertical|center(?!_)/.test(gravite) ? 'center' : /bottom/.test(gravite) ? 'end' : null;
    if (parent === 'pile') {
      if (h2) element.style.setProperty('justify-self', h2);
      if (v2) element.style.setProperty('align-self', v2);
    } else if (parent === 'colonne' && h2) element.style.setProperty('align-self', h2 === 'end' ? 'flex-end' : 'center');
    else if (parent === 'ligne' && v2) element.style.setProperty('align-self', v2 === 'end' ? 'flex-end' : 'center');
  }
}

// Contrainte ConstraintLayout simple : placement par rapport au parent.
function placementContrainte(element, n) {
  const a = (nom) => n.getAttribute(`app:layout_constraint${nom}`);
  const haut = a('Top_toTopOf') === 'parent';
  const bas = a('Bottom_toBottomOf') === 'parent';
  const debut = a('Start_toStartOf') === 'parent' || a('Left_toLeftOf') === 'parent';
  const fin = a('End_toEndOf') === 'parent' || a('Right_toRightOf') === 'parent';
  if (debut && fin) element.style.setProperty('justify-self', 'center');
  else if (fin) element.style.setProperty('justify-self', 'end');
  if (haut && bas) element.style.setProperty('align-self', 'center');
  else if (bas) element.style.setProperty('align-self', 'end');
  // Contraintes vers d'autres vues : non suivies (l'aperçu empile alors ces vues).
  return [...n.attributes].some((x) => x.name.startsWith('app:layout_constraint') && x.value !== 'parent' && /_to/.test(x.name));
}

function gravite(element, valeur, texte = false) {
  if (!valeur) return;
  if (/center_horizontal|center(?!_)/.test(valeur)) element.style.setProperty(texte ? 'text-align' : 'align-items', 'center');
  if (/end|right/.test(valeur)) element.style.setProperty(texte ? 'text-align' : 'align-items', texte ? 'right' : 'flex-end');
  if (/center_vertical|center(?!_)/.test(valeur)) element.style.setProperty('justify-content', 'center');
  if (/bottom/.test(valeur)) element.style.setProperty('justify-content', 'flex-end');
}

function styleTexte(element, n, r, { taillePolice = 14, couleurParDefaut = '#1d1b20' } = {}) {
  element.style.setProperty('font-size', px(n.getAttribute('android:textSize'), r) || `${taillePolice}px`);
  element.style.setProperty('color', couleur(attr(n, 'textColor'), r) || couleurParDefaut);
  const style = n.getAttribute('android:textStyle') || '';
  if (style.includes('bold')) element.style.setProperty('font-weight', '700');
  if (style.includes('italic')) element.style.setProperty('font-style', 'italic');
  if (n.getAttribute('android:textAllCaps') === 'true') element.style.setProperty('text-transform', 'uppercase');
  const lignes = parseInt(n.getAttribute('android:maxLines') || (n.getAttribute('android:singleLine') === 'true' ? '1' : ''), 10);
  if (lignes) {
    element.style.setProperty('display', '-webkit-box');
    element.style.setProperty('-webkit-line-clamp', String(lignes));
    element.style.setProperty('-webkit-box-orient', 'vertical');
    element.style.setProperty('overflow', 'hidden');
  }
  const apparence = n.getAttribute('android:textAppearance') || n.getAttribute('style') || '';
  if (/Headline|Display|Title/i.test(apparence) && !n.getAttribute('android:textSize')) element.style.setProperty('font-size', /Display/.test(apparence) ? '36px' : /Headline/.test(apparence) ? '24px' : '20px');
}

async function enfants(n, r, contexte, conteneur, parent) {
  for (const enfant of n.children) {
    const vue = await rendreVue(enfant, r, contexte, parent);
    if (vue) conteneur.append(vue);
  }
}

async function rendreVue(n, r, contexte, parent = 'pile') {
  const balise = n.tagName;
  const visibilite = attr(n, 'visibility');
  if (visibilite === 'gone') return null;
  if (balise === 'requestFocus' || balise === 'tag') return null;
  contexte.vues += 1;
  if (contexte.vues > 1500) return null;

  // <include layout="@layout/x" />
  if (balise === 'include') {
    const nom = /@layout\/(.+)/.exec(n.getAttribute('layout') || '')?.[1];
    return rendreLayoutNomme(nom, r, contexte, parent, n);
  }

  const e = el('div', { classe: 'av', title: `${NOM_COURT(balise)}${n.getAttribute('android:id') ? ` ${n.getAttribute('android:id').replace(/^@\+?id\//, '#')}` : ''}` });
  if (visibilite === 'invisible') e.style.setProperty('visibility', 'hidden');
  const alpha = n.getAttribute('android:alpha');
  if (alpha) e.style.setProperty('opacity', alpha);
  dimensions(e, n, r, parent);
  espacements(e, n, r);
  appliquerFond(e, await drawable(attr(n, 'background'), r));
  const elevation = taille(n.getAttribute('android:elevation') || n.getAttribute('app:elevation'), r);
  if (typeof elevation === 'number' && elevation > 0) e.style.setProperty('box-shadow', `0 ${Math.ceil(elevation / 2)}px ${elevation * 1.5}px rgba(0,0,0,0.25)`);
  if (parent === 'pile' && /ConstraintLayout/.test(contexte.parentBalise || '') && placementContrainte(e, n)) contexte.approx = true;

  const texteVue = texte(attr(n, 'text'), r);
  const indice = texte(attr(n, 'hint'), r);

  // Conteneurs
  if (est(balise, 'LinearLayout', 'LinearLayoutCompat', 'RadioGroup', 'TableLayout', 'TableRow')) {
    const horizontal = est(balise, 'TableRow') || (n.getAttribute('android:orientation') || (est(balise, 'RadioGroup') ? 'vertical' : 'horizontal')) === 'horizontal';
    e.classList.add(horizontal ? 'av-ligne' : 'av-colonne');
    const g = n.getAttribute('android:gravity') || '';
    if (horizontal) {
      if (/center_vertical|center(?!_)/.test(g)) e.style.setProperty('align-items', 'center');
      if (/bottom/.test(g)) e.style.setProperty('align-items', 'flex-end');
      if (/center_horizontal|center(?!_)/.test(g)) e.style.setProperty('justify-content', 'center');
      if (/end|right/.test(g)) e.style.setProperty('justify-content', 'flex-end');
    } else gravite(e, g);
    await enfants(n, r, { ...contexte, parentBalise: balise }, e, horizontal ? 'ligne' : 'colonne');
    return e;
  }
  if (est(balise, 'ScrollView', 'NestedScrollView', 'HorizontalScrollView')) {
    e.classList.add(est(balise, 'HorizontalScrollView') ? 'av-ligne' : 'av-colonne', 'av-defilement');
    await enfants(n, r, contexte, e, est(balise, 'HorizontalScrollView') ? 'ligne' : 'colonne');
    return e;
  }
  if (est(balise, 'CardView', 'MaterialCardView')) {
    e.classList.add('av-pile', 'av-carte');
    const fond = couleur(n.getAttribute('app:cardBackgroundColor'), r);
    if (fond) e.style.setProperty('background-color', fond);
    const rayon = px(n.getAttribute('app:cardCornerRadius'), r);
    if (rayon) e.style.setProperty('border-radius', rayon);
    await enfants(n, r, contexte, e, 'pile');
    return e;
  }
  if (est(balise, 'Toolbar', 'MaterialToolbar', 'ActionBar')) {
    e.classList.add('av-barre-titre');
    if (!attr(n, 'background')) e.style.setProperty('background-color', COULEURS_THEME.colorSurface);
    const titre = texte(attr(n, 'title'), r);
    e.append(el('span', { classe: 'av-icone-nav' }, n.getAttribute('app:navigationIcon') ? '←' : ''), el('span', { classe: 'av-titre' }, titre || ''));
    await enfants(n, r, contexte, e, 'ligne');
    return e;
  }
  if (est(balise, 'BottomNavigationView', 'NavigationBarView')) {
    e.classList.add('av-nav-bas');
    const titres = await titresMenu(n.getAttribute('app:menu'), r);
    (titres.length ? titres : ['Accueil', 'Recherche', 'Profil']).slice(0, 5).forEach((t, i) => e.append(el('span', { classe: `av-onglet-nav${i === 0 ? ' actif' : ''}` }, el('span', { classe: 'av-pastille-nav' }), t)));
    return e;
  }
  if (est(balise, 'TabLayout')) {
    e.classList.add('av-onglets');
    const items = [...n.children].filter((c) => est(c.tagName, 'TabItem')).map((c) => texte(attr(c, 'text'), r) || 'Onglet');
    (items.length ? items : ['Onglet 1', 'Onglet 2', 'Onglet 3']).forEach((t, i) => e.append(el('span', { classe: `av-onglet${i === 0 ? ' actif' : ''}` }, t)));
    return e;
  }
  if (est(balise, 'RecyclerView', 'ListView', 'GridView', 'ViewPager', 'ViewPager2')) {
    e.classList.add('av-colonne', 'av-liste');
    const element = /@layout\/(.+)/.exec(n.getAttribute('tools:listitem') || '')?.[1];
    const nombre = parseInt(n.getAttribute('tools:itemCount') || '3', 10);
    if (element && contexte.profondeur < PROFONDEUR_MAX) {
      for (let i = 0; i < Math.min(nombre, 8); i += 1) {
        const item = await rendreLayoutNomme(element, r, contexte, 'colonne');
        if (item) e.append(item);
      }
    } else {
      e.append(el('div', { classe: 'av-remplacant' }, `${NOM_COURT(balise)} (liste : ajoute tools:listitem="@layout/…" pour voir ses éléments)`));
    }
    return e;
  }
  if (est(balise, 'fragment', 'FragmentContainerView', 'NavHostFragment', 'ComposeView', 'WebView', 'MapView', 'SurfaceView', 'TextureView', 'VideoView', 'PreviewView')) {
    e.classList.add('av-remplacant');
    e.append(NOM_COURT(balise) === 'ComposeView' ? 'Contenu Jetpack Compose (non affichable ici)' : `${NOM_COURT(balise)}${n.getAttribute('android:name') ? ` : ${NOM_COURT(n.getAttribute('android:name'))}` : ''}`);
    if (!n.getAttribute('android:layout_height') || taille(n.getAttribute('android:layout_height'), r) !== 'wrap') e.style.setProperty('min-height', '80px');
    return e;
  }

  // Widgets
  if (est(balise, 'Button', 'MaterialButton', 'AppCompatButton', 'ToggleButton', 'ExtendedFloatingActionButton')) {
    const style = n.getAttribute('style') || '';
    e.classList.add('av-bouton', /Outlined/.test(style) ? 'contour' : /TextButton|Borderless/.test(style) ? 'texte' : 'plein');
    if (est(balise, 'ExtendedFloatingActionButton')) e.classList.add('fab-etendu');
    const icon = await drawable(n.getAttribute('app:icon'), r);
    if (icon?.image) e.append(el('img', { src: icon.image, alt: '', classe: 'av-icone-bouton' }));
    e.append(texteVue ?? NOM_COURT(balise));
    styleTexte(e, n, r, { couleurParDefaut: e.classList.contains('plein') ? '#ffffff' : COULEURS_THEME.colorPrimary });
    const teinte = couleur(n.getAttribute('app:backgroundTint') || n.getAttribute('android:backgroundTint'), r);
    if (teinte) e.style.setProperty('background-color', teinte);
    gravite(e, n.getAttribute('android:gravity'), true);
    return e;
  }
  if (est(balise, 'FloatingActionButton')) {
    e.classList.add('av-fab');
    const icon = await drawable(attr(n, 'srcCompat') || attr(n, 'src'), r);
    if (icon?.image) e.append(el('img', { src: icon.image, alt: '' }));
    const teinte = couleur(n.getAttribute('app:backgroundTint'), r);
    if (teinte) e.style.setProperty('background-color', teinte);
    return e;
  }
  if (est(balise, 'EditText', 'TextInputEditText', 'AppCompatEditText', 'AutoCompleteTextView', 'MaterialAutoCompleteTextView')) {
    e.classList.add('av-champ');
    e.append(el('span', { classe: texteVue ? '' : 'av-indice' }, texteVue || indice || ''));
    styleTexte(e, n, r, { taillePolice: 16 });
    if (!texteVue) e.style.setProperty('color', '#79747e');
    return e;
  }
  if (est(balise, 'TextInputLayout')) {
    e.classList.add('av-colonne', 'av-champ-cadre', /Outlined/.test(n.getAttribute('style') || '') ? 'contour' : 'rempli');
    if (indice) e.append(el('span', { classe: 'av-libelle-champ' }, indice));
    await enfants(n, r, contexte, e, 'colonne');
    return e;
  }
  if (est(balise, 'CheckBox', 'MaterialCheckBox', 'AppCompatCheckBox', 'RadioButton', 'MaterialRadioButton', 'Switch', 'SwitchCompat', 'SwitchMaterial', 'MaterialSwitch', 'CheckedTextView')) {
    const coche = n.getAttribute('android:checked') === 'true';
    const genre = /Switch/.test(balise) ? 'interrupteur' : /Radio/.test(balise) ? 'radio' : 'case';
    e.classList.add('av-ligne', 'av-coche');
    const marque = el('span', { classe: `av-${genre}${coche ? ' coche' : ''}` });
    const libelle = el('span', {}, texteVue || '');
    styleTexte(libelle, n, r);
    if (genre === 'interrupteur') e.append(libelle, marque);
    else e.append(marque, libelle);
    return e;
  }
  if (est(balise, 'ProgressBar', 'LinearProgressIndicator', 'CircularProgressIndicator', 'ContentLoadingProgressBar')) {
    const horizontal = /Horizontal/.test(n.getAttribute('style') || '') || est(balise, 'LinearProgressIndicator');
    e.classList.add(horizontal ? 'av-progression' : 'av-sablier');
    if (horizontal) e.append(el('span', { style: { width: `${Math.min(100, parseInt(n.getAttribute('android:progress') || '40', 10))}%` } }));
    return e;
  }
  if (est(balise, 'SeekBar', 'Slider', 'RangeSlider', 'RatingBar')) {
    if (est(balise, 'RatingBar')) {
      e.classList.add('av-etoiles');
      const nb = parseInt(n.getAttribute('android:numStars') || '5', 10);
      const note = parseFloat(n.getAttribute('android:rating') || '3');
      e.append('★'.repeat(Math.round(Math.min(note, nb))) + '☆'.repeat(Math.max(0, nb - Math.round(note))));
    } else {
      e.classList.add('av-curseur');
      e.append(el('span', { classe: 'av-piste' }), el('span', { classe: 'av-bouton-curseur' }));
    }
    return e;
  }
  if (est(balise, 'ImageView', 'AppCompatImageView', 'ShapeableImageView', 'ImageButton', 'AppCompatImageButton', 'CircleImageView')) {
    e.classList.add('av-image');
    const teinte = couleur(n.getAttribute('app:tint') || n.getAttribute('android:tint'), r);
    const image = await drawable(attr(n, 'srcCompat') || attr(n, 'src'), r, teinte);
    if (image?.image) {
      const img = el('img', { src: image.image, alt: '' });
      const echelle = n.getAttribute('android:scaleType') || 'fitCenter';
      img.style.setProperty('object-fit', /centerCrop/.test(echelle) ? 'cover' : /fitXY/.test(echelle) ? 'fill' : 'contain');
      e.append(img);
    } else if (image?.couleur) {
      e.style.setProperty('background-color', image.couleur);
    } else if (image?.style) {
      appliquerFond(e, image);
    } else {
      e.classList.add('av-image-vide');
      e.append(icone('image'));
    }
    if (est(balise, 'CircleImageView') || /circle/i.test(n.getAttribute('app:shapeAppearanceOverlay') || '')) e.style.setProperty('border-radius', '50%');
    if (!n.getAttribute('android:layout_width') || taille(n.getAttribute('android:layout_width'), r) === 'wrap') e.style.setProperty('width', '48px');
    if (!n.getAttribute('android:layout_height') || taille(n.getAttribute('android:layout_height'), r) === 'wrap') e.style.setProperty('height', '48px');
    return e;
  }
  if (est(balise, 'TextView', 'MaterialTextView', 'AppCompatTextView', 'Chip', 'Chronometer', 'TextClock')) {
    e.classList.add('av-texte');
    if (est(balise, 'Chip')) e.classList.add('av-puce');
    e.append(texteVue ?? (est(balise, 'TextClock', 'Chronometer') ? '12:34' : ''));
    styleTexte(e, n, r);
    gravite(e, n.getAttribute('android:gravity'), true);
    const gauche = await drawable(n.getAttribute('android:drawableStart') || n.getAttribute('android:drawableLeft'), r);
    if (gauche?.image) e.prepend(el('img', { src: gauche.image, alt: '', classe: 'av-icone-texte' }));
    return e;
  }
  if (est(balise, 'View', 'Space', 'Divider', 'MaterialDivider')) {
    if (est(balise, 'MaterialDivider', 'Divider')) e.classList.add('av-separateur');
    return e;
  }

  // Autres conteneurs (FrameLayout, ConstraintLayout, RelativeLayout, CoordinatorLayout,
  // AppBarLayout, vues personnalisées…) : enfants superposés ou empilés.
  const empile = est(balise, 'ConstraintLayout', 'RelativeLayout', 'CoordinatorLayout', 'AppBarLayout', 'CollapsingToolbarLayout', 'MotionLayout', 'DrawerLayout', 'SwipeRefreshLayout', 'merge', 'layout', 'PercentRelativeLayout');
  const connu = empile || est(balise, 'FrameLayout', 'MaterialToolbar', 'CardView');
  if (est(balise, 'RelativeLayout', 'CoordinatorLayout', 'AppBarLayout', 'CollapsingToolbarLayout', 'DrawerLayout', 'SwipeRefreshLayout', 'merge', 'layout')) {
    e.classList.add('av-colonne');
    if (est(balise, 'RelativeLayout', 'CoordinatorLayout')) contexte.approx = true;
    await enfants(n, r, { ...contexte, parentBalise: balise }, e, 'colonne');
  } else if (est(balise, 'ConstraintLayout', 'MotionLayout')) {
    // Vues contraintes au parent : placées dans une pile ; les autres : empilées en colonne.
    e.classList.add('av-pile');
    const colonne = el('div', { classe: 'av av-colonne av-flux' });
    for (const enfant of n.children) {
      const vue = await rendreVue(enfant, r, { ...contexte, parentBalise: balise }, 'pile');
      if (!vue) continue;
      const libre = [...enfant.attributes].some((x) => x.name.startsWith('app:layout_constraint') && x.value !== 'parent' && /_to/.test(x.name));
      if (libre) colonne.append(vue);
      else e.append(vue);
    }
    if (colonne.children.length) e.prepend(colonne);
  } else {
    e.classList.add('av-pile');
    if (!connu) {
      e.classList.add('av-inconnu');
      e.dataset.nom = NOM_COURT(balise);
      if (!n.children.length) e.append(el('span', { classe: 'av-remplacant-texte' }, NOM_COURT(balise)));
    }
    await enfants(n, r, { ...contexte, parentBalise: balise }, e, 'pile');
  }
  return e;
}

async function titresMenu(valeur, r) {
  const nom = /@menu\/(.+)/.exec(valeur || '')?.[1];
  if (!nom || !r.menus.has(nom)) return [];
  const doc = analyser(await r.lireTexte(r.menus.get(nom)));
  return doc ? [...doc.querySelectorAll('item')].map((i) => texte(i.getAttribute('android:title'), r) || '') : [];
}

async function rendreLayoutNomme(nom, r, contexte, parent, include = null) {
  if (!nom || contexte.profondeur >= PROFONDEUR_MAX) return null;
  const chemin = r.layouts.get(nom);
  const doc = chemin ? analyser(await r.lireTexte(chemin)) : null;
  if (!doc) return el('div', { classe: 'av av-remplacant' }, `@layout/${nom} introuvable`);
  const vue = await rendreVue(doc.documentElement, r, { ...contexte, profondeur: contexte.profondeur + 1 }, parent);
  // Un <include> peut redéfinir la taille et les marges.
  if (vue && include) {
    dimensions(vue, include, r, parent);
    espacements(vue, include, r);
  }
  return vue;
}

// --- Points d'entrée ----------------------------------------------------------------------------

// Type d'aperçu d'un XML Android : 'layout' | 'vector' | 'shape' | 'resources' | null.
export function genreXml(texteXml) {
  const doc = analyser(texteXml);
  const racine = doc?.documentElement;
  if (!racine) return null;
  if (racine.tagName === 'vector') return 'vector';
  if (['shape', 'selector', 'layer-list', 'ripple', 'adaptive-icon', 'inset'].includes(racine.tagName)) return 'drawable';
  if (racine.tagName === 'resources') return 'resources';
  if ([...racine.attributes].some((a) => a.value === 'http://schemas.android.com/apk/res/android') && racine.tagName !== 'manifest' && racine.tagName !== 'menu') return 'layout';
  return null;
}

// Renvoie l'élément d'aperçu (ou lance une erreur lisible).
export async function apercuXml(texteXml, r, { sombre = false } = {}) {
  const doc = analyser(texteXml);
  if (!doc) throw new Error('Le XML contient une erreur : corrige-la pour voir l\'aperçu.');
  const racine = doc.documentElement;
  const genre = genreXml(texteXml);

  if (genre === 'vector') {
    return el('div', { classe: 'apercu-centre' },
      el('div', { classe: 'apercu-damier' }, el('img', { classe: 'apercu-vecteur', src: vecteurVersSvg(racine, r), alt: '' })),
      el('p', { classe: 'details-aide' }, `Icône vectorielle ${racine.getAttribute('android:width') || ''} × ${racine.getAttribute('android:height') || ''}`));
  }
  if (genre === 'drawable') {
    const boite = el('div', { classe: 'apercu-forme' });
    if (racine.tagName === 'shape') {
      const style = styleForme(racine, r);
      Object.entries(style).forEach(([k, v]) => { if (v) boite.style.setProperty(k, v); });
    } else {
      const d = analyser(texteXml);
      const items = [...d.documentElement.querySelectorAll('item, foreground, background')];
      const choisi = items.find((i) => ![...i.attributes].some((a) => a.name.startsWith('android:state_'))) || items[0];
      const reference = choisi?.getAttribute('android:drawable') || choisi?.getAttribute('android:color');
      if (reference) appliquerFond(boite, await drawable(reference, r));
      else if (choisi?.querySelector('shape')) appliquerFond(boite, { style: styleForme(choisi.querySelector('shape'), r) });
    }
    return el('div', { classe: 'apercu-centre' }, el('div', { classe: 'apercu-damier' }, boite),
      el('p', { classe: 'details-aide' }, racine.tagName === 'shape' ? 'Forme' : `${racine.tagName} : état par défaut`));
  }
  if (genre === 'resources') {
    const couleurs = [...racine.querySelectorAll('color')];
    const textes = [...racine.querySelectorAll('string')];
    const dimensionsListe = [...racine.querySelectorAll('dimen')];
    const styles = [...racine.querySelectorAll('style')];
    return el('div', { classe: 'apercu-ressources' },
      couleurs.length ? [el('h3', {}, `Couleurs (${couleurs.length})`), el('div', { classe: 'grille-couleurs' }, couleurs.map((c) => {
        const valeur = couleur(c.textContent.trim(), r) || 'transparent';
        return el('div', { classe: 'case-couleur' }, el('span', { classe: 'echantillon', style: { '--c': valeur } }), el('strong', {}, c.getAttribute('name')), el('code', {}, c.textContent.trim()));
      }))] : null,
      textes.length ? [el('h3', {}, `Textes (${textes.length})`), el('dl', { classe: 'infos' }, textes.flatMap((t) => [el('dt', {}, t.getAttribute('name')), el('dd', {}, texte(t.textContent, r))]))] : null,
      dimensionsListe.length ? [el('h3', {}, `Dimensions (${dimensionsListe.length})`), el('dl', { classe: 'infos' }, dimensionsListe.flatMap((d) => [el('dt', {}, d.getAttribute('name')), el('dd', {}, d.textContent.trim())]))] : null,
      styles.length ? [el('h3', {}, `Styles et thèmes (${styles.length})`), el('ul', {}, styles.map((s) => el('li', {}, s.getAttribute('name'), s.getAttribute('parent') ? el('span', { classe: 'details-aide' }, ` ← ${s.getAttribute('parent')}`) : '')))] : null,
      !couleurs.length && !textes.length && !dimensionsListe.length && !styles.length ? el('p', { classe: 'details-aide' }, 'Rien d\'affichable dans ce fichier de ressources.') : null);
  }
  if (genre === 'layout') {
    const contexte = { profondeur: 0, vues: 0, approx: false, parentBalise: '' };
    const vue = await rendreVue(racine, r, contexte, 'colonne');
    const ecran = el('div', { classe: `av-ecran${sombre ? ' sombre' : ''}` }, vue);
    return el('div', { classe: 'apercu-android' },
      el('div', { classe: 'apercu-telephone' }, el('div', { classe: 'av-barre-etat' }, el('span', {}, '12:30'), el('span', {}, '▾ ▮')), ecran),
      el('p', { classe: 'details-aide apercu-note' },
        contexte.approx
          ? 'Aperçu approximatif : certaines positions (ConstraintLayout entre vues, RelativeLayout) sont simplifiées. Android Studio reste la référence.'
          : 'Aperçu simplifié (thème Material par défaut). Android Studio reste la référence.'));
  }
  throw new Error('Ce fichier XML n\'a pas d\'aperçu (layout, icône vectorielle, forme ou ressources Android seulement).');
}

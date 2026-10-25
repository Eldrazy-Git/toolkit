// Fonctions pour construire l'interface sans innerHTML (pas de risque d'injection).

// el('button', { classe: 'bouton', onClick: f, title: 'Info' }, 'Texte', autreElement)
// - « classe » : attribut class
// - « onXxx » : écouteur d'événement « xxx »
// - « style » : objet de propriétés CSS (variables comprises : { '--couleur': '#f00' })
// - valeur true : attribut sans valeur ; false/null/undefined : attribut ignoré
export function el(balise, proprietes = {}, ...enfants) {
  const noeud = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(proprietes)) {
    if (valeur === undefined || valeur === null || valeur === false) continue;
    if (cle === 'classe') noeud.className = valeur;
    else if (cle.startsWith('on')) noeud.addEventListener(cle.slice(2).toLowerCase(), valeur);
    else if (cle === 'style') Object.entries(valeur).forEach(([p, v]) => noeud.style.setProperty(p, v));
    else if (cle === 'value') noeud.value = valeur;
    else noeud.setAttribute(cle, valeur === true ? '' : valeur);
  }
  ajouter(noeud, enfants);
  return noeud;
}

function ajouter(noeud, enfants) {
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    noeud.append(enfant instanceof Node ? enfant : String(enfant));
  }
}

// Date relative en français : « il y a 2 heures », « hier »…
const relatif = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
export function ilYA(date) {
  const secondes = Math.round((date - Date.now()) / 1000);
  const unites = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unite, duree] of unites) {
    if (Math.abs(secondes) >= duree) return relatif.format(Math.round(secondes / duree), unite);
  }
  return 'à l\'instant';
}

// Comparaison de textes sans tenir compte des majuscules ni des accents.
export function normaliser(texte) {
  return String(texte).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

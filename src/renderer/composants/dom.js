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

// Comparaison de textes sans tenir compte des majuscules ni des accents.
export function normaliser(texte) {
  return String(texte).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

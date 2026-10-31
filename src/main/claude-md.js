// Génère le fichier CLAUDE.md d'un projet (création d'un outil, import d'un projet).
// Ce fichier explique le projet à Claude Code, qu'il soit lancé depuis Toolkit,
// VS Code ou Android Studio.
'use strict';

const MARQUEUR_SECTION = '## Intégration Toolkit';

function cheminVersRacine(dossierRelatif) {
  return dossierRelatif.split('/').filter(Boolean).map(() => '..').join('/');
}

function consignesToolkit(dossierRelatif) {
  const versRacine = cheminVersRacine(dossierRelatif);
  return `- Emplacement : \`${dossierRelatif}/\`, à l'intérieur du dossier Toolkit
  (la racine de Toolkit est donc \`${versRacine}\` depuis ce dossier).
- Ce projet peut être modifié librement depuis n'importe quel éditeur (VS Code, Android
  Studio, Notepad++…), sans passer par Toolkit.
- Sa fiche \`projet.json\` décrit le projet pour Toolkit (nom, type, point d'entrée,
  actions…). **Garde-la à jour** si tu changes le point d'entrée, ajoutes ou modifies une
  action (bouton), etc. Le format est documenté dans \`${versRacine}/app/docs/projet-json.md\`.
- Explique ce que tu fais en français, simplement.
- Git : fais des **commits locaux** réguliers avec des messages clairs en français.
  **Ne fais jamais de push** : l'utilisateur pousse lui-même depuis Toolkit.
  Ne versionne jamais de secrets (clés, mots de passe, keystores, \`.env\`, \`local.properties\`).`;
}

// CLAUDE.md complet. fiche : fiche projet.json ; dossierRelatif : ex. "projets/mon-outil" ;
// technologies, lancer : textes décrivant le projet (fournis par le modèle ou l'import).
function genererClaudeMd({ fiche, dossierRelatif, technologies, lancer }) {
  return `# ${fiche.nom}

## Ce projet fait partie de Toolkit

${consignesToolkit(dossierRelatif)}

## Rôle du projet

${fiche.description || '(À compléter.)'}

## Technologies

${technologies || '(À compléter.)'}

## Lancer ou compiler

${lancer || '(À compléter.)'}
`;
}

// Section à ajouter à la fin d'un CLAUDE.md existant (projet importé qui en avait déjà un).
// Renvoie null si la section est déjà présente.
function sectionPourClaudeMdExistant(contenuActuel, { dossierRelatif, technologies, lancer }) {
  if (contenuActuel.includes(MARQUEUR_SECTION)) return null;
  return `\n\n${MARQUEUR_SECTION}

Ce projet a été importé dans Toolkit (application qui centralise les projets de l'utilisateur).

${consignesToolkit(dossierRelatif)}
${technologies ? `\nTechnologies détectées : ${technologies}\n` : ''}${lancer ? `\nLancer ou compiler : ${lancer}\n` : ''}`;
}

module.exports = { genererClaudeMd, sectionPourClaudeMdExistant };

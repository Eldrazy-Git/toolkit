// Génère le fichier CLAUDE.md d'un projet (création d'un outil, import d'un projet).
// Ce fichier explique le projet à Claude Code, qu'il soit lancé depuis Toolkit,
// VS Code ou Android Studio.
'use strict';

// fiche : fiche projet.json ; dossierRelatif : ex. "projets/mon-outil" ;
// technologies, lancer : textes décrivant le projet (fournis par le modèle ou l'import).
function genererClaudeMd({ fiche, dossierRelatif, technologies, lancer }) {
  const profondeur = dossierRelatif.split('/').filter(Boolean).length;
  const versRacine = Array(profondeur).fill('..').join('/');
  return `# ${fiche.nom}

## Ce projet fait partie de Toolkit

- Emplacement : \`${dossierRelatif}/\`, à l'intérieur du dossier Toolkit
  (la racine de Toolkit est donc \`${versRacine}\` depuis ce dossier).
- Ce projet peut être modifié librement depuis n'importe quel éditeur (VS Code, Android
  Studio, Notepad++…), sans passer par Toolkit.
- Sa fiche \`projet.json\` décrit le projet pour Toolkit (nom, type, point d'entrée,
  actions…). **Garde-la à jour** si tu changes le point d'entrée, ajoutes ou modifies une
  action (bouton), etc. Le format est documenté dans \`${versRacine}/app/docs/projet-json.md\`.
- L'utilisateur ne sait pas coder : explique-lui ce que tu fais en français, simplement.

## Rôle du projet

${fiche.description || '(À compléter.)'}

## Technologies

${technologies || '(À compléter.)'}

## Lancer ou compiler

${lancer || '(À compléter.)'}

## Git

Fais des **commits locaux** réguliers avec des messages clairs en français.
**Ne fais jamais de push** : l'utilisateur pousse lui-même depuis Toolkit.
Ne versionne jamais de secrets (clés, mots de passe, keystores, \`.env\`, \`local.properties\`).
`;
}

module.exports = { genererClaudeMd };

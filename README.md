# Toolkit

Toolkit est une application pour Windows qui rassemble **tous tes projets** au même endroit :
outils HTML, scripts Python ou Node, mods Minecraft, application Android…
Tu peux les ouvrir, les lancer, les compiler, les sauvegarder sur GitHub et les modifier avec
Claude Code, sans quitter l'application.

> L'application est en cours de construction. Les fonctions arrivent étape par étape.

---

## 1. Ce qu'il faut installer avant

| Logiciel | À quoi il sert | Obligatoire ? |
|---|---|---|
| Node.js (version 20 ou plus) | fait tourner Toolkit | oui |
| Git | sauvegarde l'historique de tes projets | oui |
| Claude Code (`claude`) | modifie et crée des outils | oui |
| GitHub CLI (`gh`) | crée des repos sur GitHub | seulement pour GitHub |
| Python | lance les scripts Python | seulement pour ces scripts |

**Pour vérifier ce qui est installé :**

1. Ouvre le dossier `Toolkit\app` dans l'Explorateur.
2. Clique dans la barre d'adresse en haut, tape `powershell` puis appuie sur Entrée.
   Une fenêtre bleue ou noire s'ouvre directement dans le bon dossier.
3. Tape cette commande puis Entrée :
   ```
   npm run verifier
   ```
4. Chaque ligne affiche `[OK]` ou explique exactement quoi faire.

## 2. Installer Toolkit (une seule fois)

Dans la même fenêtre PowerShell, dans le dossier `Toolkit\app` :

```
npm install
```

Patiente jusqu'à la fin (une à quelques minutes, une connexion internet est nécessaire).

## 3. Lancer Toolkit

- **Normalement :** double-clique sur `Lancer Toolkit.vbs` dans le dossier `Toolkit`.
  Aucune fenêtre noire ne s'ouvre, seulement Toolkit.
- **Pour voir les messages techniques** (utile en cas de problème) : dans PowerShell, dans
  `Toolkit\app`, tape `npm start`.

## 4. Comment sont rangés les dossiers

```
Toolkit\
├── app\                  le code de l'application (ne pas y mettre tes projets)
├── projets\              tous tes projets, un dossier par projet
├── templates\            (facultatif) tes propres modèles pour « Nouvel outil »
├── donnees\              tes réglages et les données de tes outils
└── Lancer Toolkit.vbs    le raccourci pour lancer l'application
```

Chaque projet contient une **fiche** `projet.json` (nom, description, catégorie, boutons…)
et un fichier `CLAUDE.md` qui explique le projet à Claude Code.

## 5. Déplacer le dossier Toolkit

Tu peux déplacer le dossier `Toolkit` entier où tu veux (autre disque, autre dossier) :

1. Quitte Toolkit (clic droit sur son icône près de l'horloge > Quitter).
2. Déplace le dossier `Toolkit` complet.
3. Relance avec `Lancer Toolkit.vbs`.

Tout suit automatiquement : projets, réglages, données des outils, démarrage avec Windows.

## 6. Sauvegardes

- Chaque projet peut avoir son propre historique Git et son propre repo GitHub.
- Le dossier `donnees\` contient tes réglages et les données de tes outils : il n'est
  envoyé sur GitHub nulle part. Pour le sauvegarder, copie-le simplement ailleurs.
- Le code de l'application (`app\`) a son propre repo Git : en le récupérant ailleurs, on
  obtient un Toolkit vide, sans tes projets.

## 7. En cas de problème

| Problème | Solution |
|---|---|
| Rien ne se passe au double-clic sur `Lancer Toolkit.vbs` | Lance `npm start` dans `Toolkit\app` pour voir le message d'erreur. |
| `npm` n'est pas reconnu | Node.js n'est pas installé : lance `npm run verifier` pour obtenir la marche à suivre. |
| Après une modification par Claude, Toolkit ne démarre plus | Dans `Toolkit\app`, tape `git log` pour voir les derniers changements, puis demande à Claude de les annuler. |

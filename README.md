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

Patiente jusqu'à la fin (une à quelques minutes, une connexion internet est nécessaire :
environ 100 Mo sont téléchargés). À la fin, le fichier `Lancer Toolkit.vbs` apparaît dans
le dossier `Toolkit`.

## 3. Lancer Toolkit

- **Normalement :** double-clique sur `Lancer Toolkit.vbs` dans le dossier `Toolkit`.
  Aucune fenêtre noire ne s'ouvre, seulement Toolkit.
- **Pour voir les messages techniques** (utile en cas de problème) : dans PowerShell, dans
  `Toolkit\app`, tape `npm start`.

**Fermer et quitter :** fermer la fenêtre (la croix) ne quitte pas Toolkit : il reste
disponible via son icône près de l'horloge (clic pour rouvrir). Pour le quitter vraiment :
clic droit sur cette icône > **Quitter Toolkit**.

## 4. Utiliser un outil HTML

- **Ouvrir :** double-clic sur l'outil, ou bouton **Ouvrir** dans le panneau de droite.
  L'outil s'ouvre dans un onglet de Toolkit ; tu peux en ouvrir plusieurs.
- **Ses données** (textes saisis, réglages…) sont conservées quand tu le fermes.
- **Sauvegarder ses données :** bouton **Exporter les données** au-dessus de l'outil
  (crée un fichier `.json`). **Importer les données** remet les données d'un tel fichier
  (elles remplacent les données actuelles).
- **Raccourcis :** F5 recharge l'outil, F12 ouvre les outils de développement,
  Ctrl+W ferme l'onglet, Ctrl+Tab passe à l'onglet suivant.

## 5. Ouvrir un projet dans un éditeur

- **Ouvrir dans …** (panneau de droite, ou double-clic sur un projet qui n'est pas un
  outil HTML) : ouvre le projet dans son éditeur par défaut.
- **Ouvrir avec…** : choisir un autre éditeur (VS Code, Android Studio, Notepad++,
  Explorateur Windows).
- L'**éditeur par défaut** d'un projet se choisit dans le panneau de droite.
- Toolkit trouve tout seul les éditeurs installés. Si l'un d'eux n'est pas trouvé :
  **Réglages** (en bas à gauche) > **Choisir le programme…**, puis sélectionne son
  fichier `.exe`.

## 6. Lancer les scripts d'un projet (actions)

Les boutons de la rubrique **Actions** (panneau de droite) lancent les scripts du projet.
- S'il faut choisir des fichiers, un dossier ou des options, un petit formulaire s'ouvre
  (tes derniers choix sont repris la fois suivante).
- Une **console** affiche ce que fait le script, en direct ; les messages d'erreur sont en
  orange. **Arrêter** interrompt le script ; **Relancer** le recommence.
- À la fin, si le script produit des fichiers, **Ouvrir dans l'Explorateur** montre le
  dossier de sortie.
- Les boutons d'un projet se définissent dans son `projet.json` (champ `actions`) : le plus
  simple est de demander à Claude d'en ajouter.
- Si Python, Node.js ou Java manquent, Toolkit explique comment les installer
  (**Réglages** > Programmes pour les scripts).

## 7. Claude Code dans Toolkit

Tout passe par **ta** commande `claude` (ton abonnement Claude Pro), dans un terminal
intégré à Toolkit. Aucune clé API n'est utilisée.

- **Modifier avec Claude** (panneau d'un projet) : Toolkit fait d'abord une **sauvegarde
  Git** du projet (pour pouvoir revenir en arrière), puis ouvre Claude dans son dossier.
- **Nouvel outil** (bouton bleu en haut de la bibliothèque) : donne un nom, un type, une
  catégorie et décris ce que l'outil doit faire. Toolkit crée le projet puis Claude le
  construit.
- **Modifier Toolkit avec Claude** (entrée « Toolkit » en bas à gauche) : même principe sur
  le code de l'application. Ensuite, **Redémarrer Toolkit** applique les changements.
- **Terminal PowerShell** (en bas à gauche, ou « Ouvrir avec… » > Terminal PowerShell ici).
- La première fois que Claude ouvre un dossier, il demande s'il peut lui faire confiance :
  choisis « Yes, I trust this folder » (flèche bas, puis Entrée).
- Dans un terminal : sélectionner du texte puis **Ctrl+C** le copie, **Ctrl+V** colle,
  clic droit copie la sélection ou colle.

## 8. Comment sont rangés les dossiers

```
Toolkit\
├── app\                  le code de l'application (ne pas y mettre tes projets)
├── projets\              tous tes projets, un dossier par projet
├── templates\            (facultatif) tes propres modèles pour « Nouvel outil »
├── donnees\              tes réglages et les données de tes outils
└── Lancer Toolkit.vbs    le raccourci pour lancer l'application
```

Chaque projet contient une **fiche** `projet.json` (nom, description, catégorie, boutons…)
et un fichier `CLAUDE.md` qui explique le projet à Claude Code. Le format de la fiche est
expliqué dans [docs/projet-json.md](docs/projet-json.md).

## 9. Déplacer le dossier Toolkit

Tu peux déplacer le dossier `Toolkit` entier où tu veux (autre disque, autre dossier) :

1. Quitte Toolkit (clic droit sur son icône près de l'horloge > Quitter).
2. Déplace le dossier `Toolkit` complet.
3. Relance avec `Lancer Toolkit.vbs`.

Tout suit automatiquement : projets, réglages, données des outils, démarrage avec Windows.

## 10. Sauvegardes

- Chaque projet peut avoir son propre historique Git et son propre repo GitHub.
- Le dossier `donnees\` contient tes réglages et les données de tes outils : il n'est
  envoyé sur GitHub nulle part. Pour le sauvegarder, copie-le simplement ailleurs.
- Le code de l'application (`app\`) a son propre repo Git : en le récupérant ailleurs, on
  obtient un Toolkit vide, sans tes projets.

## 11. En cas de problème

| Problème | Solution |
|---|---|
| Rien ne se passe au double-clic sur `Lancer Toolkit.vbs` | Toolkit est peut-être déjà ouvert : regarde près de l'horloge (flèche ^ si l'icône est cachée). Sinon, lance `npm start` dans `Toolkit\app` pour voir le message d'erreur. |
| Un projet affiche un triangle jaune | Sa fiche `projet.json` a un problème : clique dessus, le panneau de droite explique lequel. |
| « Claude Code introuvable » | Suis les étapes affichées (installation puis `claude` une fois dans PowerShell pour te connecter), puis redémarre Toolkit. |
| Une erreur s'est produite | Les détails techniques sont notés dans `donnees\journal.log`. |
| `npm` n'est pas reconnu | Node.js n'est pas installé : lance `npm run verifier` pour obtenir la marche à suivre. |
| Après une modification par Claude, Toolkit ne démarre plus | Dans `Toolkit\app`, tape `git log` pour voir les derniers changements, puis demande à Claude de les annuler. |

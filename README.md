# Toolkit

Toolkit est une application pour Windows qui rassemble **tous tes projets** au même endroit :
outils HTML, scripts Python ou Node, mods Minecraft, application Android…
Tu peux les ouvrir, les lancer, les compiler, les rechercher, les sauvegarder sur GitHub et
les modifier avec Claude Code, sans quitter l'application.

**Sommaire**

1. [Installer Toolkit](#1-installer-toolkit)
2. [Lancer et quitter Toolkit](#2-lancer-et-quitter-toolkit)
3. [Tour rapide](#3-tour-rapide)
4. [Utiliser un outil HTML](#4-utiliser-un-outil-html)
5. [Ouvrir un projet dans un éditeur](#5-ouvrir-un-projet-dans-un-éditeur)
6. [Lancer les scripts d'un projet (actions) et compiler](#6-lancer-les-scripts-dun-projet-actions-et-compiler)
7. [Claude Code dans Toolkit](#7-claude-code-dans-toolkit)
8. [Importer un projet existant](#8-importer-un-projet-existant)
9. [Git et GitHub](#9-git-et-github)
10. [Rechercher et prendre des notes](#10-rechercher-et-prendre-des-notes)
11. [Réglages](#11-réglages)
12. [Comment sont rangés les dossiers](#12-comment-sont-rangés-les-dossiers)
13. [Déplacer le dossier Toolkit](#13-déplacer-le-dossier-toolkit)
14. [Sauvegardes](#14-sauvegardes)
15. [En cas de problème](#15-en-cas-de-problème)

---

## 1. Installer Toolkit

### Ce qu'il faut installer avant

| Logiciel | À quoi il sert | Obligatoire ? |
|---|---|---|
| Node.js (version 20 ou plus) | fait tourner Toolkit | oui |
| Git | sauvegarde l'historique de tes projets | oui |
| Claude Code (`claude`) | modifie et crée des outils | oui |
| GitHub CLI (`gh`) | envoie tes projets sur GitHub | seulement pour GitHub |
| Python | lance les scripts Python | seulement pour ces scripts |
| Java (JDK 17 ou 21) | compile les mods et les applis Android | seulement pour compiler |

**Pour vérifier ce qui est installé :**

1. Ouvre le dossier `Toolkit\app` dans l'Explorateur.
2. Clique dans la barre d'adresse en haut, tape `powershell` puis appuie sur Entrée.
   Une fenêtre bleue ou noire s'ouvre directement dans le bon dossier.
3. Tape cette commande puis Entrée :
   ```
   npm run verifier
   ```
4. Chaque ligne affiche `[OK]` ou explique exactement quoi faire.

### Installer (une seule fois)

Dans la même fenêtre PowerShell, dans le dossier `Toolkit\app` :

```
npm install
```

Patiente jusqu'à la fin (une à quelques minutes, une connexion Internet est nécessaire :
environ 100 Mo sont téléchargés). À la fin, le fichier `Lancer Toolkit.vbs` apparaît dans
le dossier `Toolkit`.

## 2. Lancer et quitter Toolkit

- **Lancer :** double-clique sur `Lancer Toolkit.vbs` dans le dossier `Toolkit`.
  Aucune fenêtre noire ne s'ouvre, seulement Toolkit. (Astuce : clic droit sur ce fichier >
  « Créer un raccourci », puis place le raccourci sur ton Bureau.)
- **Fermer la fenêtre** (la croix) ne quitte pas Toolkit : il reste disponible via son
  icône bleue « T » près de l'horloge (clic pour rouvrir). Il n'utilise alors presque rien.
  Si Claude ou un script travaille encore, il continue en arrière-plan.
- **Quitter vraiment :** clic droit sur l'icône près de l'horloge > **Quitter Toolkit**.
- **Démarrer avec Windows :** voir [Réglages](#11-réglages).
- **Pour voir les messages techniques** (utile en cas de problème) : dans PowerShell, dans
  `Toolkit\app`, tape `npm start`.

## 3. Tour rapide

- À gauche : **Rechercher** (Ctrl+K), tes projets par **catégorie**, **favori** ou **tag**,
  puis en bas **Git et GitHub**, **Terminal PowerShell**, **Réglages** et **Toolkit**
  (l'application elle-même).
- Au centre : tes projets, en grille ou en liste. **Importer** ramène un projet existant ;
  **Nouvel outil** en crée un avec Claude.
- Clique sur un projet : le panneau de droite montre sa description, ses boutons
  (Ouvrir, Ouvrir avec…, Modifier avec Claude, actions), sa catégorie, ses tags, ses notes
  et son état Git. L'étoile ☆ le met en favori.
- Double-clic sur un projet : l'ouvre (outil HTML dans un onglet, sinon dans son éditeur).
- Les outils, terminaux, consoles et notes s'ouvrent en **onglets** en haut. **Ctrl+Tab**
  passe à l'onglet suivant, **Ctrl+W** ferme l'onglet d'un outil.

## 4. Utiliser un outil HTML

- **Ouvrir :** double-clic sur l'outil, ou bouton **Ouvrir** dans le panneau de droite.
  L'outil s'ouvre dans un onglet de Toolkit ; tu peux en ouvrir plusieurs.
- **Ses données** (textes saisis, réglages…) sont conservées quand tu le fermes.
- **Sauvegarder ses données :** bouton **Exporter les données** au-dessus de l'outil
  (crée un fichier `.json`). **Importer les données** remet les données d'un tel fichier
  (elles remplacent les données actuelles). À faire avant de renommer le dossier d'un outil.
- **Outils liés :** les pages HTML rangées à l'intérieur d'un autre projet (par exemple dans
  les `assets` d'une appli Android) s'ouvrent aussi dans Toolkit, sans être copiées.
- **Raccourcis :** F5 recharge l'outil, F12 ouvre les outils de développement.

## 5. Ouvrir un projet dans un éditeur

- **Ouvrir dans …** (panneau de droite, ou double-clic sur un projet qui n'est pas un
  outil HTML) : ouvre le projet dans son éditeur par défaut.
- **Ouvrir avec…** : choisir un autre éditeur (VS Code, Android Studio, Notepad++,
  Explorateur Windows) ou un **terminal PowerShell** dans le dossier du projet.
- L'**éditeur par défaut** d'un projet se choisit dans le panneau de droite.
- Toolkit trouve tout seul les éditeurs installés. Si l'un d'eux n'est pas trouvé :
  **Réglages** > **Choisir le programme…**, puis sélectionne son fichier `.exe`.

## 6. Lancer les scripts d'un projet (actions) et compiler

Les boutons de la rubrique **Actions** (panneau de droite) lancent les scripts du projet.
- S'il faut choisir des fichiers, un dossier ou des options, un petit formulaire s'ouvre
  (tes derniers choix sont repris la fois suivante).
- Une **console** affiche ce que fait le script, en direct ; les messages d'erreur sont en
  orange. **Arrêter** interrompt le script ; **Relancer** le recommence.
- À la fin, si le script produit des fichiers, **Afficher dans l'Explorateur** montre le
  résultat.
- En cas d'erreur, un résumé s'affiche ; **Demander à Claude de corriger** lui transmet
  l'erreur.
- Les boutons d'un projet se définissent dans son `projet.json` (champ `actions`) : le plus
  simple est de demander à Claude d'en ajouter.
- Si Python, Node.js ou Java manquent, Toolkit explique comment les installer
  (**Réglages** > Programmes pour les scripts).

**Compiler un mod Minecraft ou l'APK de debug d'une appli Android**

- Les projets de type mod ou Android ont un bouton **Compiler le mod** ou **Compiler l'APK
  de debug** (ajouté automatiquement s'ils contiennent `gradlew.bat`).
- Toolkit choisit tout seul la bonne version de Java. La première compilation peut prendre
  plusieurs minutes.
- La version **signée** (release) d'une appli Android se fait toujours dans Android Studio :
  Toolkit ne touche jamais à ta keystore.

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
- Quand Claude a terminé, **Reprendre la conversation** le relance là où il en était.
- La première fois que Claude ouvre un dossier, il demande s'il peut lui faire confiance :
  choisis « Yes, I trust this folder » (flèche bas, puis Entrée).
- Dans un terminal : sélectionner du texte puis **Ctrl+C** le copie, **Ctrl+V** colle,
  clic droit copie la sélection ou colle.

## 8. Importer un projet existant

Bouton **Importer** en haut de la bibliothèque.
1. Choisis le dossier du projet sur ton PC, ou colle l'adresse d'un dépôt GitHub.
2. Toolkit analyse le projet **sans rien modifier** et affiche un rapport : type détecté,
   points d'attention, dossiers inutiles à copier, outils HTML trouvés, Git / GitHub.
3. Ajuste si besoin, puis clique sur **Importer**. Le projet est copié dans `projets\`, la
   copie est vérifiée fichier par fichier, puis l'original part à la **Corbeille** (tu peux
   cocher « Garder aussi l'original »).

Avant d'importer, ferme les programmes qui utilisent le projet (Android Studio, VS Code…).
Si un point est en rouge, règle-le puis clique sur **Analyser à nouveau**.

## 9. Git et GitHub

**Git et GitHub** (en bas à gauche) montre l'état de Toolkit et de chaque projet :
- **Commit** : enregistre une version des fichiers dans l'historique, sur ce PC ;
- **Push** : envoie ces versions sur GitHub (les commits faits par Claude apparaissent
  ici comme « commits à envoyer ») ;
- **Pull** : récupère les versions présentes sur GitHub ;
- **Vérifier en ligne** : demande à GitHub s'il y a des changements à récupérer ;
- **Tout envoyer** : envoie chaque projet vers son propre dépôt, après confirmation ;
- menu **⋯** : activer Git, créer un dépôt GitHub **privé**, ouvrir sur GitHub, protéger
  les fichiers sensibles (clés, keystores, `.env`).

Toolkit utilise ta connexion GitHub existante (commande `gh`) et ne stocke jamais de mot
de passe. Si GitHub n'est pas connecté, le panneau explique comment faire.

## 10. Rechercher et prendre des notes

- **Ctrl+K** (ou « Rechercher… » en haut à gauche) cherche dans tous tes projets et dans
  toutes les notes `.md` (README, CLAUDE.md, tes notes…). Les accents et majuscules ne
  comptent pas. ↑ ↓ pour choisir, Entrée pour ouvrir.
- Une note s'ouvre dans un onglet, joliment mise en forme. **Modifier** permet de l'éditer
  (Ctrl+S pour enregistrer).
- Dans une note, `[[nom-du-projet]]` ou `[[nom-de-note]]` crée un lien cliquable. Un lien
  rouge pointillé ne mène nulle part (nom mal écrit ?).
- Le panneau d'un projet liste ses notes, propose **Nouvelle note**, et montre les notes
  qui le citent (« Cité dans »).

## 11. Réglages

**Réglages** (en bas à gauche) :
- **Démarrer Toolkit avec Windows** : Toolkit s'ouvre discrètement près de l'horloge à
  chaque démarrage du PC.
- **Dossier des projets** : par défaut `projets`, à l'intérieur du dossier Toolkit. Tu peux
  en choisir un autre (sur le même disque) ; il sera utilisé après un redémarrage, et les
  projets existants ne sont pas déplacés automatiquement.
- **Éditeurs** et **Programmes pour les scripts** : ce que Toolkit a trouvé sur ton PC.
- **Ouvrir le journal des erreurs** : les détails techniques des problèmes rencontrés.

## 12. Comment sont rangés les dossiers

```
Toolkit\
├── app\                  le code de l'application (ne pas y mettre tes projets)
├── projets\              tous tes projets, un dossier par projet
├── templates\            (facultatif) tes propres modèles pour « Nouvel outil »
├── donnees\              tes réglages, les données de tes outils, le journal des erreurs
└── Lancer Toolkit.vbs    le raccourci pour lancer l'application
```

Chaque projet contient une **fiche** `projet.json` (nom, description, catégorie, boutons…)
et un fichier `CLAUDE.md` qui explique le projet à Claude Code. Le format de la fiche est
expliqué dans [docs/projet-json.md](docs/projet-json.md).

## 13. Déplacer le dossier Toolkit

Tu peux déplacer le dossier `Toolkit` entier où tu veux (autre disque, autre dossier) :

1. Quitte Toolkit (clic droit sur son icône près de l'horloge > Quitter Toolkit).
2. Déplace le dossier `Toolkit` complet.
3. Relance avec `Lancer Toolkit.vbs`.

Tout suit automatiquement : projets, réglages, données des outils, démarrage avec Windows.
(Si tu avais créé un raccourci vers `Lancer Toolkit.vbs`, recrée-le.)

## 14. Sauvegardes

- Chaque projet peut avoir son propre historique Git et son propre dépôt GitHub privé.
- Le dossier `donnees\` contient tes réglages et les données de tes outils : il n'est
  envoyé sur GitHub nulle part. Pour le sauvegarder, copie-le simplement ailleurs.
- Le code de l'application (`app\`) a son propre dépôt Git : en le récupérant ailleurs
  (puis `npm install`), on obtient un Toolkit vide, sans tes projets.

## 15. En cas de problème

| Problème | Solution |
|---|---|
| Rien ne se passe au double-clic sur `Lancer Toolkit.vbs` | Toolkit est peut-être déjà ouvert : regarde près de l'horloge (flèche ^ si l'icône est cachée). Sinon, lance `npm start` dans `Toolkit\app` pour voir le message d'erreur. |
| « Toolkit n'est pas encore installé » | Dans PowerShell, dans `Toolkit\app`, tape `npm install`. |
| Un projet affiche un triangle jaune | Sa fiche `projet.json` a un problème : clique dessus, le panneau de droite explique lequel. |
| L'interface semble bloquée | Appuie sur **F5** (recharge l'interface sans perdre tes projets). |
| « Claude Code introuvable » | Suis les étapes affichées (installation, puis `claude` une fois dans PowerShell pour te connecter), puis redémarre Toolkit. |
| Une erreur s'est produite | **Réglages > Ouvrir le journal des erreurs** : tu peux copier ce texte à Claude. |
| `npm` n'est pas reconnu | Node.js n'est pas installé : lance `npm run verifier` pour obtenir la marche à suivre. |
| Après une modification par Claude, Toolkit ne démarre plus | Ouvre PowerShell dans `Toolkit\app` (barre d'adresse > `powershell`), tape `claude`, puis demande-lui : « Toolkit ne démarre plus depuis ta dernière modification : regarde `git log` et corrige ou annule-la. » Chaque modification de Toolkit par Claude est précédée d'une sauvegarde Git : on peut toujours revenir en arrière. |

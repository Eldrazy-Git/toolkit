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
16. [Limites, sécurité et licence](#16-limites-sécurité-et-licence)

---

## 1. Installer Toolkit

### Avec l'installateur (le plus simple)

1. Télécharge **`Installer-Toolkit-<version>.exe`** (page GitHub du projet > **Releases**)
   et double-clique dessus. Windows peut afficher « Windows a protégé votre ordinateur »
   (l'installateur n'est pas signé) : clique sur **Informations complémentaires** >
   **Exécuter quand même**.
2. Suis l'assistant : dossier d'installation, raccourcis, logiciels à installer (cases
   cochées pour toi), puis **Installer** et **Terminer**.
3. Au premier lancement, Toolkit t'accueille : connexion à ton compte Claude (et GitHub si
   tu veux), préférences, consignes pour Claude, puis ton premier projet.
4. Pour le désinstaller : Paramètres Windows > **Applications** > Toolkit. Tes projets et
   tes réglages sont gardés (sauf si tu demandes de les supprimer : ils vont alors à la
   Corbeille).

Toolkit est installé **sous forme de sources** : il reste modifiable à tout moment (avec
« Modifier Toolkit avec Claude » ou dans ton éditeur), sans rien réinstaller.

### À la main (depuis le code)

Pour les personnes qui préfèrent partir du code : crée un dossier `Toolkit`, et place le
code dedans sous le nom `app` (`git clone` du dépôt, ou bouton vert **Code** > **Download
ZIP** puis décompresser). Les dossiers `projets` et `donnees` sont créés au premier
lancement.

#### Ce qu'il faut installer avant

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

#### Installer (une seule fois)

Dans la même fenêtre PowerShell, dans le dossier `Toolkit\app` :

```
npm install
```

Patiente jusqu'à la fin (une à quelques minutes, une connexion Internet est nécessaire :
environ 100 Mo sont téléchargés). À la fin, le fichier `Lancer Toolkit.vbs` apparaît dans
le dossier `Toolkit`.

Pour utiliser Claude : ouvre PowerShell, tape `claude` une fois et connecte-toi avec
**ton** compte Claude (abonnement Pro, Max…).

## 2. Lancer et quitter Toolkit

- **Lancer :** raccourci **Toolkit** du Bureau ou du menu Démarrer (installation avec
  l'installateur), ou double-clic sur `Lancer Toolkit.vbs` dans le dossier `Toolkit`
  (installation à la main). Aucune fenêtre noire ne s'ouvre, seulement Toolkit. (Astuce :
  clic droit sur ce fichier > « Créer un raccourci », puis place le raccourci sur ton Bureau.)
- **Fermer la fenêtre** (la croix) ne quitte pas Toolkit : il reste disponible via son
  icône bleue « T » près de l'horloge (clic pour rouvrir). Il n'utilise alors presque rien.
  Si Claude ou un script travaille encore, il continue en arrière-plan.
- **Quitter vraiment :** clic droit sur l'icône près de l'horloge > **Quitter Toolkit**.
- **Démarrer avec Windows :** voir [Réglages](#11-réglages).
- **Pour voir les messages techniques** (utile en cas de problème) : dans PowerShell, dans
  `Toolkit\app`, tape `npm start`.

## 3. Tour rapide

- Tout en haut à gauche, **Récents** : tes dernières ouvertures (outils, projets ouverts dans
  un éditeur, fichiers de l'onglet « Code », notes, sessions Claude). Un clic rouvre la même
  chose ; pour Claude, la dernière conversation reprend (après une sauvegarde Git). Clic sur
  le titre « Récents » pour replier ; × ou clic droit pour retirer une ligne.
- À gauche : **Rechercher** (Ctrl+K), tes projets par **catégorie**, **favori** ou **tag**,
  tes **projets épinglés** (juste sous « Favoris »), puis en bas **Git et GitHub**,
  **Terminal PowerShell**, **Réglages** et **Toolkit** (l'application elle-même).
- Au centre : tes projets, en grille ou en liste. **Trier par** les classe par nom, date de
  modification, date d'ajout, type ou catégorie. **Importer** ramène un projet existant ;
  **Nouvel outil** en crée un avec Claude.
- Clique sur un projet : le panneau de droite montre sa description, ses boutons
  (Ouvrir, Ouvrir avec…, Modifier avec Claude, actions), sa catégorie, ses tags, ses notes
  et son état Git. L'étoile ☆ le met en favori, l'épingle 📌 l'ajoute à la barre latérale.
- **Changer l'icône d'un projet** : clique sur son icône en haut du panneau de droite,
  puis « Choisir une image… » (une image prise ailleurs est copiée dans le projet ; une
  image déjà dans le projet est simplement utilisée).
- **Clic droit** sur un projet (bibliothèque ou barre latérale) : ouvrir, Claude, favori,
  épingler, groupes, icône, **supprimer**.
- **Supprimer un projet** : clic droit > « Supprimer le projet… », ou le bouton tout en bas du
  panneau de droite. Il faut retaper le nom du projet. Le dossier part à la **Corbeille de
  Windows** (récupérable tant qu'elle n'est pas vidée) ; son dépôt GitHub n'est jamais
  supprimé.
- **Groupes** (barre latérale) : rassemble des projets qui vont ensemble, par exemple une
  application et ses outils annexes. Les groupes peuvent contenir des sous-groupes, et un
  projet peut être dans plusieurs groupes. Les dossiers des projets ne bougent jamais.
  - créer : bouton 📁+ à droite du titre « Groupes » ;
  - remplir : glisse un projet de la bibliothèque sur un groupe, ou clic droit sur le
    projet > **Groupes…** ;
  - ranger un groupe dans un autre : glisse-le dessus (sur le titre « Groupes » pour le
    remettre au premier niveau), ou clic droit > **Déplacer dans…** ;
  - un projet glissé d'un groupe vers un autre y est déplacé (avec **Ctrl** : ajouté aux deux) ;
  - clic sur un groupe : ses projets (sous-groupes compris) s'affichent au centre ; la petite
    flèche le déplie ou le replie ;
  - supprimer un groupe ne supprime aucun projet.
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
- **Vue smartphone / tablette :** les boutons 🖥 📱 au-dessus de l'outil l'affichent comme
  sur un ordinateur, un smartphone (390 × 844) ou une tablette (820 × 1180) ; le bouton
  ⟳ à côté pivote en paysage. L'outil se comporte comme sur un vrai téléphone (largeur
  d'écran, adaptation aux petits écrans) et reste utilisable à la souris. Changer de vue ne
  recharge pas l'outil, et la vue choisie est retenue pour chaque outil.
- **Raccourcis :** F5 recharge l'outil, F12 ouvre les outils de développement.

## 5. Ouvrir un projet dans un éditeur

- **Ouvrir dans …** (panneau de droite, ou double-clic sur un projet qui n'est pas un
  outil HTML) : ouvre le projet dans son éditeur par défaut.
- **Ouvrir avec…** : choisir un autre éditeur (VS Code, Android Studio, Notepad++,
  Explorateur Windows) ou un **terminal PowerShell** dans le dossier du projet.
- L'**éditeur par défaut** d'un projet se choisit dans le panneau de droite.
- Toolkit trouve tout seul les éditeurs installés. Si l'un d'eux n'est pas trouvé :
  **Réglages** > **Choisir le programme…**, puis sélectionne son fichier `.exe`.

### L'éditeur de code intégré (bouton « Code »)

Bouton **Code** du panneau de droite (ou clic droit > **Explorer le code**) : un onglet
s'ouvre avec les fichiers du projet à gauche et l'éditeur de VS Code (Monaco) à droite.
Il marche aussi pour Toolkit lui-même (bouton **Code** de l'entrée « Toolkit »).

- **Clic** sur un fichier : il s'ouvre dans un onglet. Les images s'affichent.
- **Clic droit** dans l'arborescence : nouveau fichier, nouveau dossier, renommer (**F2**),
  mettre à la Corbeille (**Suppr**, toujours avec confirmation ; rien n'est effacé
  définitivement), copier le chemin.
- **Ctrl+S** enregistre, **Ctrl+W** ferme le fichier, **Ctrl+P** va à un fichier par son
  nom, **Ctrl+F** / **Ctrl+H** cherche / remplace, **F1** affiche toutes les commandes.
- **Rechercher dans tous les fichiers** : onglet **Rechercher** en haut à gauche, ou
  **Ctrl+Maj+F**. Options : **Aa** (majuscules), **ab|** (mot entier), **.\*** (expression
  régulière). Clic sur un résultat : le fichier s'ouvre à cet endroit. **Tout remplacer**
  remplace dans tous les fichiers trouvés, après confirmation et une sauvegarde Git (annulable
  avec l'historique). Les dossiers de compilation (node_modules, build…) sont ignorés.
- Un point ● signale un fichier pas encore enregistré. Fermer un fichier, l'onglet ou
  quitter Toolkit demande confirmation s'il reste des modifications.
- **L'éditeur comprend le code :**
  - **Python** : erreurs soulignées (en français), suggestions (**Ctrl+Espace**),
    documentation au survol, aller à la définition (**F12** ou **Ctrl+clic**), références
    (**Maj+F12**). C'est Pyright, le moteur Python de VS Code, inclus dans Toolkit.
  - **JavaScript, TypeScript, HTML, CSS, JSON** : la même aide, y compris d'un fichier à
    l'autre du projet.
  - **Kotlin, Java, Gradle, Markdown, .bat…** : couleurs et suggestions de mots. Pour la
    vraie compréhension du Kotlin/Java d'un projet Android, Android Studio reste l'outil.
- **Aperçu** (bouton « Aperçu » au-dessus de l'éditeur, panneau à droite) pour ce qui peut
  s'afficher : page **HTML** (avec ses CSS, images et scripts ; mise à jour à chaque
  enregistrement), **Markdown** et **SVG** (en direct pendant la frappe), tableaux **CSV**,
  et XML Android : **layouts** dessinés dans un téléphone (textes de `strings.xml`, couleurs,
  icônes vectorielles, `tools:listitem`, `<include>`…), **icônes vectorielles**, **formes**,
  fichiers de **couleurs / textes**. L'aperçu des layouts est simplifié : Android Studio
  reste la référence.
- Si Claude (ou un autre programme) modifie un fichier ouvert, l'éditeur le recharge.
  Si tu avais aussi des changements en cours, Toolkit te demande quelle version garder.
- Pour que double-cliquer un projet ouvre cet éditeur : **Éditeur par défaut** >
  « Éditeur de Toolkit » dans le panneau de droite.

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

Tout passe par **ta** commande `claude` (ton propre compte Claude : abonnement Pro, Max…), dans un terminal
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

### Ce que Claude sait de tes autres projets

- **Tous les projets** : Toolkit tient à jour `projets/CLAUDE.md`, un catalogue de tous tes
  projets (nom, dossier, type, description, liens, groupes). Claude Code le lit
  automatiquement quel que soit le projet sur lequel il travaille. Pense à donner une bonne
  **description** à chaque projet : clique sur la description dans le panneau de droite.
- **Projets liés** : dans le panneau de droite, section **Projets liés** > « Lier à un
  projet », choisis l'autre projet et explique en une ou deux phrases comment ils sont liés
  (ex. « ce script met à jour les icônes et l'index du catalogue de l'appli »). Toolkit ajoute
  alors une section « Projets liés » dans le CLAUDE.md de **chaque** projet concerné, y
  compris ceux liés **indirectement** (A ↔ B ↔ C), avec la consigne de vérifier l'impact sur
  les autres avant une mise à jour.
- Quand Toolkit lance Claude sur un projet, Claude a aussi **accès aux dossiers des projets
  liés** pour les lire. Il ne modifie un autre projet que si tu le lui demandes.
- Ces sections sont mises à jour toutes seules ; le reste des CLAUDE.md n'est jamais touché.
  « Voir le CLAUDE.md » ouvre celui du projet dans l'éditeur.

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

**Voir le détail** : clique sur une pastille colorée (dans ce panneau ou dans la section
Git d'un projet) :
- jaune « modifications non enregistrées » : la liste des fichiers modifiés, nouveaux ou
  supprimés ; clique sur un fichier pour voir ce qui a changé dedans (vert = ajouté,
  rouge = retiré), puis **Commit…** pour les enregistrer ;
- bleue « commits à envoyer » : chaque commit (message, date, auteur, fichiers), puis
  **Envoyer sur GitHub (Push)** ;
- violette « commits à récupérer » : ce qui est sur GitHub et pas encore sur ce PC, puis
  **Récupérer (Pull)**.

**Historique et retour en arrière** : bouton 🕘 de la section Git d'un projet (ou clic droit
> **Historique des versions…**, ou clic droit sur un fichier dans l'onglet « Code » >
**Historique de ce fichier…**). Chaque version est listée ; celles marquées
**« Avant une modification par Claude »** sont les sauvegardes faites avant que Claude
travaille. Choisis une version pour voir ce qu'elle a changé, ou les **différences avec
maintenant**, puis **Remettre** (un fichier) ou **Remettre tout le projet comme à cette
version…**. Rien n'est perdu : tes modifications en cours sont sauvegardées d'abord, et le
retour en arrière devient lui-même une version que tu peux annuler de la même façon.

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

**Réglages** (en bas à gauche, ou Ctrl+,) : sept onglets.

**Général** :
- **Démarrer Toolkit avec Windows** : Toolkit s'ouvre discrètement près de l'horloge à
  chaque démarrage du PC.
- **Dossier des projets** : par défaut `projets`, à l'intérieur du dossier Toolkit. Tu peux
  en choisir un autre (sur le même disque) ; il sera utilisé après un redémarrage, et les
  projets existants ne sont pas déplacés automatiquement.
- **Éditeurs** et **Programmes pour les scripts** : ce que Toolkit a trouvé sur ton PC.
- **Ouvrir le journal des erreurs** : les détails techniques des problèmes rencontrés.

**Comptes** : le compte Claude et le(s) compte(s) GitHub utilisés. « Se connecter » ou
« Changer de compte » ouvre un onglet où l'outil officiel lance ton navigateur (ton mot de
passe est saisi sur le site de Claude ou de GitHub, jamais dans Toolkit). Pour GitHub,
plusieurs comptes peuvent être connectés : « Utiliser ce compte » choisit celui de Toolkit.

**Claude** :
- **Tes consignes pour Claude** : ce que tu écris ici s'applique à TOUS tes projets et à
  Toolkit (Toolkit l'écrit dans `Toolkit/CLAUDE.md`, que Claude Code lit tout seul, même
  lancé depuis VS Code). Exemple : « commente le code en français », « demande avant de
  supprimer un fichier ».
- **Modèle** (Fable, Opus, Sonnet, Haiku) et **Autonomie** (demander avant chaque
  modification, modifier les fichiers sans demander, automatique, plan d'abord) quand
  Toolkit lance Claude.
- **Me prévenir quand Claude a fini ou attend une réponse** : si tu regardes ailleurs,
  une notification Windows apparaît (clic = retour sur l'onglet de Claude), le bouton de
  Toolkit clignote dans la barre des tâches et l'onglet de Claude porte un point orange.

**Éditeur** : taille et police du texte, retour à la ligne, enregistrement automatique (une
seconde après la frappe, ou en quittant le fichier ; un fichier modifié ailleurs n'est
jamais écrasé), indentation, mini-carte, aperçu affiché ou non par défaut.

**Interface** : taille de toute l'interface (aussi Ctrl+= / Ctrl+- / Ctrl+0), **rouvrir les
onglets de la dernière fois** au démarrage (outils, onglets « Code » avec leurs fichiers,
notes), sections affichées dans la barre latérale.

**Raccourcis** : tous les raccourcis clavier, modifiables (« Modifier », puis appuie sur la
nouvelle combinaison) ; ↺ remet celui par défaut.

### Palette de commandes (Ctrl+Maj+P)

Tape ce que tu veux faire : « code catalogue », « commit mon-projet », « réglages »,
« claude », « historique »… puis Entrée. Elle contient toutes les commandes de Toolkit et,
pour chaque projet : ouvrir, afficher, code, Claude, historique, commit, push, et ses
actions (boutons de projet.json).

### Mises à jour

**Nouvelle version de Toolkit** : en haut de **Réglages > Mises à jour** (et par une
notification, une fois par semaine), Toolkit indique quand une nouvelle version existe, avec
ses nouveautés. « Installer la mise à jour… » montre d'abord ce qui va se passer, puis installe
et redémarre. **Tes projets et tes réglages ne sont jamais touchés**, et ce que tu as
toi-même ajouté ou modifié dans Toolkit est **gardé** : s'il a aussi changé dans la nouvelle
version, les deux sont combinés ; quand ce n'est pas possible, ta version est gardée et
Claude te propose d'y intégrer les nouveautés. Une sauvegarde est faite avant : tout reste
annulable avec l'historique (panneau Git, ligne Toolkit).

*Pour publier une nouvelle version (si c'est toi qui fais évoluer Toolkit) : suis
l'aide-mémoire pas à pas [docs/PROTOCOLE-MISE-A-JOUR.md](docs/PROTOCOLE-MISE-A-JOUR.md).*

**Réglages > Mises à jour** : « Vérifier maintenant » (et automatiquement une fois par
semaine au démarrage, désactivable).
- **Bibliothèques de Toolkit** : les mises à jour sûres (même version majeure, publiées depuis
  au moins 7 jours) sont cochées ; « Installer … et redémarrer » ferme Toolkit, une fenêtre
  noire installe (une à deux minutes), puis Toolkit se relance tout seul. Une sauvegarde Git
  du code de Toolkit est faite avant. Une **version majeure** se fait avec Claude (bouton
  « Faire avec Claude » : il lit les notes de version et adapte le code si besoin).
- **Failles de sécurité connues** (npm audit), avec une explication quand le risque est nul
  pour Toolkit.
- **Programmes du PC** (Claude Code, Git, GitHub CLI, Node.js) : la commande de mise à jour
  est affichée, à copier dans PowerShell (Toolkit n'installe rien sur le PC lui-même).

## 12. Comment sont rangés les dossiers

```
Toolkit\
├── app\                  le code de l'application (ne pas y mettre tes projets)
├── projets\              tous tes projets, un dossier par projet
├── templates\            (facultatif) tes propres modèles pour « Nouvel outil »
├── donnees\              tes réglages, les données de tes outils, le journal des erreurs
├── Toolkit.exe           lance l'application (créé par l'installateur, cible des raccourcis)
└── Lancer Toolkit.vbs    lance aussi l'application (créé automatiquement ; sert à la relancer après une mise à jour)
```

Chaque projet contient une **fiche** `projet.json` (nom, description, catégorie, boutons…)
et un fichier `CLAUDE.md` qui explique le projet à Claude Code. Le format de la fiche est
expliqué dans [docs/projet-json.md](docs/projet-json.md).

## 13. Déplacer le dossier Toolkit

Tu peux déplacer le dossier `Toolkit` entier où tu veux (autre disque, autre dossier) :

1. Quitte Toolkit (clic droit sur son icône près de l'horloge > Quitter Toolkit).
2. Déplace le dossier `Toolkit` complet.
3. Relance avec `Toolkit.exe` (ou `Lancer Toolkit.vbs`) dans le nouveau dossier.

Tout suit automatiquement : projets, réglages, données des outils, démarrage avec Windows.
Les raccourcis du Bureau et du menu Démarrer pointent encore vers l'ancien emplacement :
supprime-les et recrée-en un (clic droit sur `Toolkit.exe` > « Créer un raccourci »).

## 14. Sauvegardes

- Chaque projet peut avoir son propre historique Git et son propre dépôt GitHub privé.
- Le dossier `donnees\` contient tes réglages et les données de tes outils : il n'est
  envoyé sur GitHub nulle part. Pour le sauvegarder, copie-le simplement ailleurs.
- Le code de l'application (`app\`) a son propre dépôt Git : en le récupérant ailleurs
  (puis `npm install`), on obtient un Toolkit vide, sans tes projets.
- Une copie installée avec l'installateur n'est reliée à aucun dépôt GitHub : tes
  modifications de Toolkit restent chez toi. Pour les sauvegarder sur GitHub : panneau Git >
  ligne Toolkit > ⋯ (activer Git, puis créer ton propre dépôt privé).

## 15. En cas de problème

| Problème | Solution |
|---|---|
| Rien ne se passe au lancement de Toolkit | Toolkit est peut-être déjà ouvert : regarde près de l'horloge (flèche ^ si l'icône est cachée). Sinon, lance `npm start` dans `Toolkit\app` pour voir le message d'erreur. |
| « Toolkit n'est pas encore installé » | Dans PowerShell, dans `Toolkit\app`, tape `npm install`. |
| Un projet affiche un triangle jaune | Sa fiche `projet.json` a un problème : clique dessus, le panneau de droite explique lequel. |
| L'interface semble bloquée | Appuie sur **F5** (recharge l'interface sans perdre tes projets). |
| « Claude Code introuvable » | Suis les étapes affichées (installation, puis `claude` une fois dans PowerShell pour te connecter), puis redémarre Toolkit. |
| Une erreur s'est produite | **Réglages > Ouvrir le journal des erreurs** : tu peux copier ce texte à Claude. |
| `npm` n'est pas reconnu | Node.js n'est pas installé : lance `npm run verifier` pour obtenir la marche à suivre. |
| Après une modification par Claude, Toolkit ne démarre plus | Ouvre PowerShell dans `Toolkit\app` (barre d'adresse > `powershell`), tape `claude`, puis demande-lui : « Toolkit ne démarre plus depuis ta dernière modification : regarde `git log` et corrige ou annule-la. » Chaque modification de Toolkit par Claude est précédée d'une sauvegarde Git : on peut toujours revenir en arrière. |

## 16. Limites, sécurité et licence

- **Windows uniquement**, interface en **français**.
- **Claude** : Toolkit n'est pas un produit d'Anthropic. Il lance simplement la commande
  `claude` (Claude Code) installée sur le PC, connectée au compte Claude de chaque
  utilisateur. Toolkit ne contient et ne stocke aucune clé, aucun mot de passe ni jeton.
- **GitHub** : Toolkit utilise la commande `gh` connectée au compte de chacun ; les dépôts
  qu'il crée sont toujours privés et il n'envoie jamais rien sans qu'on le demande.
- **Alerte `npm audit`** pendant l'installation (DOMPurify, « critical ») : elle concerne une
  copie de DOMPurify incluse dans l'éditeur Monaco, utilisée d'une façon que ces failles ne
  touchent pas ; le risque est quasi nul pour Toolkit, et une prochaine version de Monaco la
  corrigera (Réglages > Mises à jour). Ne lance pas `npm audit fix --force` : il installerait
  une version plus ancienne de l'éditeur.
- **Licence** : Toolkit est un logiciel libre sous licence **GNU GPL version 3 ou
  ultérieure** (fichier `LICENSE`). Tu peux l'utiliser, l'étudier, le modifier et le
  redistribuer ; si tu distribues une version modifiée, elle doit rester sous la même
  licence, avec son code source. Copyright © 2026 Eldrazy-Git.
- Bibliothèques utilisées (licences libres compatibles) : Electron, Monaco Editor, Pyright,
  xterm.js, node-pty, markdown-it et MiniSearch (MIT) ; leurs licences sont fournies avec
  elles dans `node_modules`.

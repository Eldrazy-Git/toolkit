# Toolkit — contexte pour modifier l'application

Toolkit est une application de bureau Windows (Electron) qui centralise les projets de
l'utilisateur (outils HTML, scripts Python/Node, mods Minecraft, application Android) et
intègre Claude Code. Ce dossier `app/` contient **uniquement le code de l'application**.
Le cahier des charges complet est dans `../CAHIER_DES_CHARGES.md`.

## L'utilisateur

- Il ne sait pas coder. Parle-lui **en français**, simplement.
- Quand il doit agir lui-même, donne-lui les étapes exactes (commande à copier, où cliquer,
  ce qu'il doit voir).
- **Demande confirmation** avant toute action risquée : déplacement ou suppression de
  fichiers, push ou toute opération sur un repo distant, installation globale.
- Ne supprime jamais un projet ou un fichier de projet sans son accord explicite.
- Abonnement Claude Pro : **aucune clé API Anthropic**. Toute intégration Claude passe par
  la CLI `claude` lancée dans un terminal.

## Emplacement des dossiers

```
Toolkit/                  ← racine (déplaçable n'importe où)
├── app/                  ← CE dossier : code de l'appli, seul repo Git de l'appli
├── projets/              ← projets de l'utilisateur (un repo Git par projet, hors repo appli)
├── templates/            ← (facultatif) modèles personnels de l'utilisateur
├── donnees/              ← réglages + données des outils (jamais versionné)
└── Lancer Toolkit.vbs    ← généré automatiquement, lance l'appli sans console
```

## Règles absolues

1. **Aucun chemin absolu stocké** (réglages, projet.json, fichiers générés). Tout est
   relatif à la racine de Toolkit. Les chemins sont calculés au lancement par
   `src/main/chemins.js` : c'est le seul endroit qui sait où se trouve la racine.
   Exceptions : les chemins des éditeurs choisis à la main (hors de Toolkit), et l'entrée
   « démarrage avec Windows » du registre, réécrite à chaque lancement avec les chemins actuels.
2. **Sécurité Electron** : `contextIsolation: true`, `nodeIntegration: false`,
   `sandbox: true` pour les outils HTML. L'interface n'accède au système **que** via
   `src/preload/preload.js` et l'IPC.
3. **Légèreté** : pas de polling, pas de tâche de fond quand la fenêtre est fermée,
   surveillance de fichiers seulement quand la fenêtre est ouverte, indexation paresseuse.
4. **Robustesse** : un outil ou un script qui plante ne doit jamais faire planter Toolkit.
   Toute erreur montrée à l'utilisateur est en français compréhensible, sans trace technique
   (la trace va dans `donnees/journal.log`, ouvrable depuis Réglages).
5. **Pas de framework front ni d'étape de compilation** : HTML, CSS et JavaScript simples
   (modules ES dans l'interface, CommonJS dans le processus principal). Une modification
   est appliquée en redémarrant l'appli.
6. **Exécution de commandes** : jamais de concaténation de chaînes passée à un shell avec
   des valeurs fournies par l'utilisateur. Découper la commande en arguments et mettre les
   chemins entre guillemets correctement.
7. **Secrets** : Toolkit ne stocke jamais de mot de passe ni de token, et ne manipule jamais
   les keystores Android.

## Architecture

```
app/
├── package.json
├── assets/                  icône de Toolkit (générée par scripts/generer-icones.js)
├── docs/projet-json.md      format complet de la fiche projet.json
├── scripts/                 vérification des prérequis, création du lanceur, icônes
├── templates/               modèles fournis pour « Nouvel outil »
└── src/
    ├── main/                processus principal (Node) : disque, processus, Git…
    │   ├── main.js              démarrage, fenêtre, fermeture vers la zone de notification
    │   ├── chemins.js           tous les chemins, calculés depuis la racine
    │   ├── fichiers.js          lecture/écriture JSON sûre (écriture atomique)
    │   ├── journal.js           erreurs techniques -> donnees/journal.log
    │   ├── reglages.js          donnees/reglages.json
    │   ├── projets.js           lecture, normalisation, modification, surveillance des fiches
    │   ├── activite.js          compteur de tâches en cours (fenêtre cachée au lieu de détruite)
    │   ├── lanceur.js           (re)crée « Lancer Toolkit.vbs »
    │   ├── processus.js         lancer un programme (environnement nettoyé), lire une sortie
    │   ├── terminal.js          terminaux node-pty (Claude Code, PowerShell)
    │   ├── executions.js        actions de projet.json : commande, programme, sortie, arrêt
    │   ├── java.js              JDK et SDK Android pour Gradle (choix automatique)
    │   ├── actions-auto.js      boutons de compilation ajoutés selon le type (mod, Android)
    │   ├── cibles.js            résout une « cible » ({ type: 'projet', id } / toolkit / racine) en dossier
    │   ├── git.js               Git : état d'un dépôt, commit, push, pull, fetch, .gitignore, clone
    │   ├── github.js            GitHub via « gh » (état de connexion, dépôt privé)
    │   ├── import.js            assistant d'import : analyse, détection, copie vérifiée
    │   ├── recherche.js         index MiniSearch (projets + .md), liens [[…]], rétroliens
    │   ├── notes.js             notes .md : rendu markdown-it (HTML brut désactivé), lecture, écriture
    │   ├── modeles.js           modèles de « Nouvel outil » et création du projet
    │   ├── claude-md.js         génération du CLAUDE.md d'un projet
    │   ├── editeurs.js          détection des éditeurs + « Ouvrir avec… »
    │   ├── outils-html.js       protocole toolkit-outil://, partitions, sécurité des <webview>
    │   ├── outils-donnees.js    export / import localStorage + IndexedDB en JSON
    │   ├── zone-notification.js icône près de l'horloge
    │   ├── demarrage-windows.js démarrage avec Windows (réduit dans la zone de notification)
    │   └── ipc/
    │       ├── gerer.js         enregistre un canal et renvoie les erreurs proprement
    │       │                    ({ avecEmetteur: true } : reçoit le webContents appelant)
    │       └── <domaine>.js     canaux IPC d'un domaine
    ├── preload/preload.js   expose `window.toolkit.<domaine>.<fonction>()` à l'interface
    └── renderer/            interface (modules ES, sans compilation)
        ├── index.html, renderer.js (point d'entrée)
        ├── styles/          theme.css (couleurs) et app.css (mise en page)
        └── composants/
            ├── etat.js          état partagé + abonnements (tout changement redessine)
            ├── actions.js       actions de l'interface (appels à window.toolkit)
            ├── dom.js           el() pour construire le HTML sans innerHTML
            ├── icones.js        icônes SVG
            ├── dialogue.js      demanderTexte(), confirmer(), choisir(), formulaire(), fenetre(), cocher()
            ├── groupes.js       groupes de projets de la barre latérale (données, menus, glisser-déposer)
            ├── notifications.js notifier(message, type)
            ├── onglets.js       barre d'onglets + panneaux des outils (<webview>)
            ├── apercu-appareil.js aperçu ordinateur / smartphone / tablette d'un outil
            ├── reglages.js      onglet « Réglages »
            ├── terminal.js      panneau de terminal (xterm.js), copier/coller, relance
            ├── console.js       panneau d'exécution d'une action (sortie en direct)
            ├── import.js        onglet « Importer un projet » (assistant en étapes)
            ├── git.js           onglet « Git et GitHub » + pastilles/boutons réutilisés dans les détails
            ├── actions-git.js   actions Git (commit, push, pull, tout envoyer, dépôt GitHub privé)
            ├── details-git.js   fenêtres de détail : fichiers modifiés + différences, commits
            ├── recherche.js     palette de recherche Ctrl+K
            ├── note.js          onglet d'une note : lecture, liens, rétroliens, modification
            ├── menu.js          ouvrirMenu(bouton, elements) : menu déroulant
            └── barre-laterale.js, bibliotheque.js, details.js, icone-projet.js
```

Les fiches `projet.json` : format dans `docs/projet-json.md`. `projets.js` normalise une
fiche pour l'interface sans jamais la réécrire ; une modification ne touche que les champs
concernés et conserve les autres.

Bibliothèque : chaque projet chargé porte aussi `dateAjout` (création du dossier) et
`dateModification` (fichier le plus récent sur 2 niveaux, dossiers générés ignorés) pour
le tri. Préférences d'affichage dans `reglages.interface` : `vue`, `tri`, `epingles`
(ids des projets épinglés, dans l'ordre ; pas dans projet.json), `groupes` (voir
`composants/groupes.js` : `{ id, nom, parent, projets, replie }`, imbricables, un projet
peut être dans plusieurs groupes ; nettoyés au chargement par `groupes.nettoyer()` ; filtre
de bibliothèque `{ type: 'groupe', valeur: id }` = projets du groupe et de ses sous-groupes ;
glisser-déposer par `groupes.glissable()` / `groupes.deposable()`). Icône : `changerIcone()`
référence une image déjà dans le projet, sinon la copie en `icone.<ext>` (ou
`icone-toolkit.<ext>` si ce nom est déjà pris) ; une image n'est jamais supprimée.

### Bibliothèques

| Besoin | Bibliothèque |
|---|---|
| Application | electron |
| Terminal | @xterm/xterm + @xterm/addon-fit, node-pty 1.1.0 (binaires Windows précompilés, pas besoin de Visual Studio Build Tools) |
| Recherche | minisearch (dans le processus principal) |
| Markdown | markdown-it (dans le processus principal, + règle maison pour `[[liens]]`) |
| Git / GitHub | commandes `git` et `gh` du système (child_process) |

N'ajoute une dépendance que si elle est vraiment utile, et privilégie les bibliothèques
légères sans compilation native.

### Outils HTML

Voir `src/main/outils-html.js` (explications en tête du fichier) et
`src/main/outils-donnees.js` (export / import).

- Protocole `toolkit-outil://<hote>/...` : `<hote>` est stable (nom du dossier du projet +
  empreinte), donc localStorage et IndexedDB sont conservés. Racine servie = dossier du
  projet ; tout chemin qui en sort reçoit une erreur 403.
- Une partition persistante par outil (`persist:outil-<hote>`), stockée dans
  `donnees/electron/Partitions/`. Renommer le dossier d'un projet change l'hôte, donc le
  stockage : passer par Exporter / Importer.
- Affichage dans des `<webview>` (choisies plutôt que `WebContentsView` car ce sont des
  éléments du DOM : nos boîtes de dialogue et notifications passent par-dessus).
  Sécurité imposée dans `will-attach-webview` (pas de Node, pas de preload, sandbox).
- Les touches pressées dans un outil n'atteignent pas l'interface : les raccourcis (F12,
  F5, Ctrl+W) sont interceptés dans `before-input-event` du processus principal.
- Liens vers Internet : ouverts dans le navigateur par défaut.
- Import : l'outil est remplacé par une page vide de même origine (pour fermer ses bases
  IndexedDB), les données sont restaurées, puis l'outil est rechargé.
- Aperçu smartphone / tablette (`composants/apercu-appareil.js`) : la webview est dans un
  cadre de la taille de l'appareil, réduit par `transform: scale()` si la place manque
  (les clics restent justes : vérifié) ; `outils:emulation` active
  `enableDeviceEmulation({ screenPosition: 'mobile' })` (viewport respecté, `screen` à la
  taille de l'appareil), réappliqué à chaque `dom-ready`. Mode retenu par outil dans le
  localStorage de l'interface (`toolkit:apercu:<id>`).

Les données d'Electron (`userData`) sont redirigées vers `donnees/electron/`.

### Terminal intégré et Claude Code

- `src/main/terminal.js` (node-pty) + `composants/terminal.js` (xterm.js, chargé depuis
  `node_modules` en module ES). Frappes et redimensionnement : `ipcRenderer.send` ;
  sortie regroupée toutes les 8 ms (`terminal:donnees`), fin (`terminal:fin`).
- L'interface ne transmet jamais de chemin : une « cible » (`{ type: 'projet', id }`,
  `{ type: 'toolkit' }`, `{ type: 'racine' }`) est résolue dans `ipc/claude.js`.
- Claude est lancé **directement** via `claude.exe` (trouvé à partir de `claude.cmd` ou de
  `~/.local/bin`), jamais via `cmd.exe` : la demande initiale peut contenir guillemets et
  symboles. Aucune clé API : c'est la CLI de l'utilisateur, avec sa connexion.
- « Modifier avec Claude » / « Modifier Toolkit avec Claude » : commit de sauvegarde
  (`sauvegarde:faire`, propose d'activer Git si besoin), puis onglet Claude. Une session
  Claude déjà en cours sur le même dossier est réutilisée. « Reprendre la conversation »
  relance avec `claude --continue`.
- « Nouvel outil » : `modeles.js` copie un modèle (`app/templates/*/modele.json`),
  génère `projet.json` + `CLAUDE.md` (`claude-md.js`), `git init` + premier commit, puis
  Claude est lancé avec la description comme demande initiale.
- Chaque terminal compte dans `activite.js` : tant qu'il tourne, fermer la fenêtre la cache
  au lieu de la détruire. Tous les terminaux sont arrêtés quand Toolkit quitte.

### Actions et scripts

`src/main/executions.js` + `composants/console.js`. Règles de construction de la commande
dans `docs/projet-json.md`. Points clés :
- jamais de shell : la commande est découpée en arguments puis `spawn(programme, args)` ;
  les `.bat` / `.cmd` passent par `cmd.exe /d /s /c` avec des guillemets (refus de `"` et `%`) ;
- programme cherché dans le dossier de l'action puis sur le PC (`where`) ; `python` est
  vérifié (le faux raccourci du Microsoft Store est ignoré, repli sur `py`) ;
- sortie décodée en UTF-8 (repli windows-1252), Python forcé en UTF-8 sans tampon ;
  stdin fermé (un script qui attend une saisie ne bloque pas) ;
- « Arrêter » = `taskkill /T /F` (arbre de processus, ex. Java lancé par Gradle) ;
- onglet de genre `console` ; recliquer l'action relance dans le même onglet
  (`onglet.lancement` incrémenté, lu par `mettreAJour()` du panneau).

### Assistant d'import

`src/main/import.js` (explications en tête du fichier) + `composants/import.js`.
- `analyser()` ne modifie RIEN : type de projet (`detecter()`), dossiers régénérables
  (exclus par défaut sauf s'ils sont suivis par Git), fichiers verrouillés (bloquant),
  chemins absolus vers le projet, liens symboliques, fichiers > 100 Mo, secrets suivis par
  Git, outils HTML des `assets` Android (proposés en `outils_lies`), boutons d'action.
- `executer()` : copie -> vérification (taille + SHA-1 jusqu'à 20 Mo) -> projet.json
  (jamais écrasé s'il existe) -> CLAUDE.md (section ajoutée s'il existe) -> .gitignore
  complété -> Git -> **Corbeille** (`shell.trashItem`, jamais de suppression définitive)
  -> GitHub privé (facultatif, via `gh`). Échec de copie = copie supprimée, original intact.
- Clone : dans `donnees/import-temp/`, rangé dans `projets/` à la confirmation (réessais :
  Windows bloque souvent un dossier juste cloné), supprimé si l'utilisateur annule.
- Dossiers refusés : disque, dossier personnel, Bureau, Documents, Windows, Program Files,
  Toolkit lui-même ou un dossier qui le contient.

### Git et GitHub

`src/main/git.js` + `ipc/git.js` + `composants/git.js` / `actions-git.js`.
- État d'un dépôt lu en une commande (`git status --porcelain=v2 --branch`) : branche,
  modifications, commits en avance / en retard (le retard n'est à jour qu'après « Vérifier
  en ligne » = `git fetch`), fichiers sensibles suivis ou non protégés.
- Commandes réseau (`gitReseau`) : identification par `gh auth git-credential` passée en
  `-c` pour CETTE commande seulement (rien n'est stocké, la config Git de l'utilisateur
  n'est pas modifiée), `GIT_TERMINAL_PROMPT=0` (jamais de question bloquante), délai 2 min.
- Pull = `--ff-only` : jamais de fusion automatique ; en cas de divergence, le message
  oriente vers Claude.
- « Tout envoyer » : chaque dépôt vers SON remote, après confirmation listant les projets.
- Dépôt GitHub : toujours PRIVÉ (`gh repo create --private`), refusé si des secrets sont
  suivis par Git ; l'adresse est notée dans `projet.json` (`git.remote`).
- Le repo de l'application ne contient que `app/` : un clone donne un Toolkit vierge.
- Détail (`composants/details-git.js`, ouvert par les pastilles cliquables) :
  `git.listerCommits(dossier, 'envoyer' | 'recuperer')` (`@{u}..HEAD`, `HEAD..@{u}`, ou
  `HEAD --not --remotes` pour une branche jamais envoyée) et `git.differences(dossier,
  chemin, hash?)` (`git diff HEAD` / `git show <hash>` ; fichier nouveau = contenu affiché
  comme ajouté ; binaire détecté ; 300 Ko au plus). `core.quotepath=off` pour les accents.

### Recherche et notes

`src/main/recherche.js` + `src/main/notes.js` + `composants/recherche.js` / `note.js`.
- Index **paresseux** : construit à la première recherche (Ctrl+K), puis seuls les
  fichiers dont la date a changé sont relus (au plus toutes les 2 s). Dossiers ignorés :
  node_modules, .git, build… Accents et majuscules ignorés, recherche par début de mot et
  approximative.
- Liens `[[cible]]`, `[[cible|libellé]]` : cible = id ou nom d'un projet, nom ou chemin
  d'une note. Les rétroliens (« Cité dans ») sont recalculés à chaque mise à jour.
- Rendu Markdown dans le processus principal, HTML brut désactivé ; liens transformés en
  `data-projet` / `data-note` / `data-externe` et gérés par `actions.suivreLien()`.
- Lecture et écriture limitées aux `.md` de `projets/` et `app/`. L'enregistrement est
  refusé si le fichier a changé depuis l'ouverture (sauf confirmation) ; les fins de ligne
  Windows d'origine sont conservées.

### Compilation (mods Minecraft, APK de debug)

- Les boutons sont des **actions** de projet.json (`gradlew build` -> `build/libs`,
  `gradlew assembleDebug` -> `<module>/build/outputs/apk/debug`), ajoutées à l'import, à la
  création, et au démarrage par `actions-auto.js` pour les projets qui ont un `gradlew`.
  Ce qui a déjà été proposé est noté dans `reglages.actionsAuto` : un bouton supprimé par
  l'utilisateur n'est pas rajouté.
- Lancement d'un `gradlew` (`executions.js`) : `java.environnementGradle()` lit la version
  minimale de Java dans build.gradle, garde `JAVA_HOME` s'il convient, sinon prend le plus
  petit JDK installé qui convient ; ajoute `ANDROID_HOME` si le SDK n'est configuré nulle
  part ; démon Gradle limité à 10 min d'inactivité.
- Fin : fichiers produits dans le dossier de sortie (le .jar / .apk principal d'abord),
  « Afficher dans l'Explorateur » sélectionne le fichier. Échec : résumé (section « What
  went wrong » + erreurs du compilateur), conseil pour les cas courants, et bouton
  « Demander à Claude de corriger » (Claude reçoit l'erreur comme demande initiale).
- Jamais de compilation release ni de keystore : cela reste dans Android Studio.

### Éditeurs (« Ouvrir avec… »)

`src/main/editeurs.js`. Un chemin choisi dans les Réglages (`reglages.editeurs.<id>`) est
prioritaire ; sinon détection automatique à chaque session (registre Windows, `where`,
emplacements habituels), jamais enregistrée : elle se refait d'elle-même sur un autre PC.
« Ouvrir » utilise `ouvrir_avec` de la fiche, sinon Android Studio pour un projet
`android` et VS Code pour les autres. Tout programme externe se lance via
`processus.js` (`lancerDetache`, `environnementPropre`).

## Comment ajouter une fonctionnalité

Exemple : un bouton qui affiche le nombre de fichiers d'un projet.

1. **Logique** dans `src/main/<domaine>.js` : une fonction claire, qui lance
   `new Error('message en français')` en cas de problème prévu (ce message est montré tel
   quel à l'utilisateur ; un bug imprévu donne un message générique + la trace au journal).
2. **Canal IPC** dans `src/main/ipc/<domaine>.js` avec `gerer('<domaine>:<action>', fonction)`
   (voir `ipc/gerer.js`). Nommage : `domaine:action` en kebab-case, ex.
   `projets:compter-fichiers`. Un nouveau fichier `ipc/` s'enregistre dans `main.js`
   (`demarrer()`). L'interface ne transmet jamais de chemin : utiliser une « cible »
   (`cibles.js`) ou un identifiant de projet.
3. **Pont** dans `src/preload/preload.js` : ajouter la fonction sous
   `window.toolkit.<domaine>` (avec `appeler(...)`).
4. **Interface** : une action dans `composants/actions.js` (avec `essayer()` pour afficher
   les erreurs), puis le bouton dans le composant concerné (`details.js`, `reglages.js`…),
   construit avec `el()`. Les données partagées vont dans `etat.js`.
5. Vérifier la syntaxe (`node --check …`, voir « Pièges connus »), puis **Redémarrer
   Toolkit** (entrée « Toolkit » > Redémarrer Toolkit) pour tester.

Pour ajouter un bouton à **un seul projet**, inutile de toucher au code : ajouter une
entrée dans `actions` de son `projet.json`.

## Conventions

- Noms de fichiers, fonctions, variables et commentaires **en français**, sans accents dans
  les identifiants (`chargerProjets`, `cheminRacine`). Texte de l'interface en français.
- Indentation 2 espaces, guillemets simples, point-virgule.
- Commentaires courts qui expliquent le *pourquoi*, en tête de chaque fichier une ligne
  qui décrit son rôle.
- Fonctions asynchrones (`async/await`, `fs/promises`) dans le processus principal pour ne
  jamais bloquer l'interface.

## Git

- Ce repo ne contient que `app/`. `projets/` et `donnees/` sont en dehors : un clone donne
  une application vierge de tout projet.
- Commits locaux réguliers avec des messages clairs en français. **Jamais de push sans
  l'accord de l'utilisateur.**

## Lancer et tester

```
npm install        (une seule fois, ou après ajout d'une dépendance)
npm start          lance Toolkit avec les sources
npm run verifier   vérifie les prérequis
npm run icones     régénère assets/icone.png et assets/icone.ico
```

**Tests automatiques** (méthode utilisée pendant la construction) : un petit script
Electron qui neutralise le verrou d'instance unique et redirige `userData` vers un dossier
temporaire, fait `require('src/main/main.js')`, puis pilote l'interface avec
`webContents.executeJavaScript()` (clics, lecture du DOM), `sendInputEvent()` (frappes) et
`capturePage()` (captures d'écran à regarder). Les boîtes de dialogue système se
remplacent par des fonctions (`dialog.showOpenDialog = async () => …`). Lancer avec
`env -u ELECTRON_RUN_AS_NODE node_modules/electron/dist/electron.exe test.js`.
Une fenêtre de test cachée (réduite ou entièrement recouverte par une autre fenêtre) n'est
pas dessinée par Chromium : un terminal xterm y reste vide (rendu en `requestAnimationFrame`)
alors que PowerShell a bien répondu. Ce n'est pas un bug ; pour un test fiable, garder la
fenêtre visible (`w.show(); w.focus()`) ou vérifier les données côté processus principal.
Pour simuler de vrais clics souris (y compris dans une `<webview>`) : donner le focus
(`w.show(); w.focus(); w.webContents.focus()`) puis passer par le protocole de débogage
(`w.webContents.debugger.sendCommand('Input.dispatchMouseEvent', …)`).
Règles : ne jamais modifier les vrais projets de l'utilisateur (créer un projet `zz-…`
temporaire et le supprimer), ne jamais envoyer de demande à Claude (quota de
l'utilisateur), ne jamais créer de dépôt GitHub ni pousser (tester avec un dépôt distant
local `git init --bare`).

## Performances (mesurées à la phase 10)

- Démarrage : fenêtre affichée ~0,2 s après le lancement ; index de recherche construit en
  ~0,1 s à la première recherche.
- Mémoire : ~370 Mo fenêtre ouverte, ~270 Mo une fois la fenêtre fermée, ~200 Mo en
  démarrage discret avec Windows (processus principal + processus graphique + réseau
  d'Electron : c'est le minimum d'une application Electron). Le processus graphique est
  gardé (le désactiver ralentirait les outils 3D).
- Aucune tâche périodique : seule la surveillance des projets (`fs.watch`, non récursive)
  existe, et uniquement quand la fenêtre est ouverte.

## Pièges connus

- **Electron 44 ne télécharge plus son exécutable pendant `npm install`** (il le fait au
  premier `npm start`). Le `postinstall` de `package.json` lance donc
  `node_modules/electron/install.js` lui-même, car `Lancer Toolkit.vbs` appelle
  directement `electron.exe`.
- **`ELECTRON_RUN_AS_NODE`** : si cette variable est définie (c'est le cas dans les
  processus lancés par l'extension VS Code), `electron.exe` se comporte comme Node et
  `require('electron')` échoue. Pour tester depuis un tel environnement :
  `env -u ELECTRON_RUN_AS_NODE npm start`. Toolkit doit retirer cette variable de
  l'environnement des processus qu'il lance (terminaux, scripts).
- **npm et les scripts d'installation** : npm 11 demande d'approuver les scripts
  d'installation des dépendances (`allowScripts` dans package.json, via
  `npm approve-scripts <paquet>`). node-pty en a besoin (il vérifie ses fichiers
  précompilés). node-pty 1.1.0 fournit des binaires Windows précompilés (N-API) : pas de
  compilation ni de Visual Studio Build Tools.
- **Écrire du code avec des antislashs** (`\n`, `\'`) : ne pas passer par un script
  Python dans un heredoc bash, qui transforme `\n` en vrai retour à la ligne. Utiliser
  l'outil Edit, puis vérifier la syntaxe :
  `node --check --input-type=module < fichier.js` (interface) ou `node --check fichier.js`.
- **Ne jamais modifier l'état pendant un rendu** : un composant créé pendant `rendre()`
  (ex. panneau de terminal) qui appelle `etat.modifier()` relance le rendu en plein milieu
  (création en double). Différer avec `queueMicrotask()`.
- **Tester pendant que Toolkit de l'utilisateur est ouvert** : le verrou d'instance unique
  ferme aussitôt toute 2ᵉ copie. Pour un test automatique, utiliser un autre dossier
  `userData` et neutraliser `app.requestSingleInstanceLock` dans le script de test.
- `prompt()`, `alert()` et `confirm()` n'existent pas dans Electron : utiliser
  `composants/dialogue.js`.
- La politique de sécurité (CSP) de `index.html` interdit les scripts en ligne. Les styles
  en ligne sont autorisés uniquement parce que `<webview>` en a besoin en interne : dans
  notre code, préférer les classes CSS ou `element.style.setProperty()`.
- `new URL('toolkit-outil://x/').origin` vaut `"null"` dans Node (protocole non standard
  pour Node) : reconstruire l'origine avec `${SCHEMA}://${url.host}`.
- `element.replaceChildren(...)` et `append(...)` ne déplient pas les tableaux : utiliser
  `...liste` (sinon on obtient « [object HTMLDivElement] »). `el()` les déplie, lui.

## Phases

Construction par phases ; à la fin de chacune : commit, explication simple, liste de tests
pour l'utilisateur, attente de sa validation.

- [x] 0. Mise en place (structure, prérequis, documentation)
- [x] 1. Coquille (fenêtre, thème, bibliothèque, détails, zone de notification)
- [x] 2. Outils HTML (protocole, onglets, stockage persistant, export/import)
- [x] 3. Ouvrir avec… et réglages des éditeurs
- [x] 4. Terminal intégré et Claude Code
- [x] 5. Actions et scripts
- [x] 6. Assistant d'import
- [x] 7. Git et GitHub
- [x] 8. Recherche et Markdown
- [x] 9. Compilation des mods et de l'APK
- [x] 10. Finitions (démarrage avec Windows, dossier des projets, erreurs, documentation)

### Décisions prises avec l'utilisateur

- Modèles fournis dans `app/templates/` (versionnés) ; `Toolkit/templates/` facultatif pour
  ses modèles personnels. `Lancer Toolkit.vbs` est généré automatiquement.
- Import : après copie vérifiée, l'original part **à la Corbeille** (pas de suppression
  définitive).
- Fermer la fenêtre détruit la fenêtre pour libérer la mémoire (seule l'icône de la zone de
  notification reste), **sauf** si un script ou un terminal tourne : la fenêtre est alors
  seulement cachée.
- Thème sombre uniquement.
- Repo GitHub de l'application : à créer par l'utilisateur lui-même depuis le panneau Git
  (ligne « Toolkit », menu ⋯ > Créer un dépôt GitHub privé), quand il le souhaite.
- Electron 44.9.3 (dernière de la série 44). Electron 45 était trop récent à la fin de la
  construction (4 jours, aucun correctif). Pour passer à la 45 quand une 45.1 ou plus sera
  sortie : `npm install --save electron@^45`, `npm install`, puis tester les outils HTML
  (webview), les terminaux (node-pty) et la recherche, et vérifier le journal.

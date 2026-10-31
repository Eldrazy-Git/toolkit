# Toolkit — contexte pour modifier l'application

Toolkit est une application de bureau Windows (Electron) qui centralise les projets de
l'utilisateur (outils HTML, scripts Python/Node, projets Java/Gradle, applications Android) et
fonctionne avec Claude Code. Ce dossier `app/` contient **uniquement le code de l'application**.
Ce fichier est la référence complète pour modifier l'application.

## Principes de conception

1. **Simple et minimaliste** : interface sombre inspirée de VS Code / Android Studio, sans
   fioritures. L'utilisateur ne doit jamais se perdre (peu de boutons visibles à la fois,
   textes clairs, une seule façon évidente de faire chaque chose).
2. **Portable** : le dossier Toolkit se déplace n'importe où (voir « Règles absolues »).
3. **Léger** : démarrage discret possible avec Windows, aucune tâche de fond fenêtre fermée.
4. **Modifiable par Claude** : code clair, modulaire et documenté (voir « Comment ajouter une
   fonctionnalité »).
5. **Robuste** : un outil ou un script qui plante ne fait jamais planter Toolkit ; erreurs
   compréhensibles par un non-développeur.

## L'utilisateur

- Parle-lui **en français**, simplement.
- Quand il doit agir lui-même, donne-lui les étapes exactes (commande à copier, où cliquer,
  ce qu'il doit voir).
- **Demande confirmation** avant toute action risquée : déplacement ou suppression de
  fichiers, push ou toute opération sur un repo distant, installation globale.
- Ne supprime jamais un projet ou un fichier de projet sans son accord explicite.
- Abonnement Claude (Pro, Max…) de chaque utilisateur : **aucune clé API Anthropic**. Toute intégration Claude passe par
  la CLI `claude` lancée dans un terminal.

## Emplacement des dossiers

```
Toolkit/                  ← racine (déplaçable n'importe où)
├── app/                  ← CE dossier : code de l'appli, seul repo Git de l'appli
├── projets/              ← projets de l'utilisateur (un repo Git par projet, hors repo appli)
├── templates/            ← (facultatif) modèles personnels de l'utilisateur
├── donnees/              ← réglages + données des outils (jamais versionné)
├── Toolkit.exe           ← lanceur créé par l'installateur (cible des raccourcis)
└── Lancer Toolkit.vbs    ← généré automatiquement (lanceur.js), lance l'appli sans console
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
├── docs/
│   ├── projet-json.md           format complet de la fiche projet.json
│   ├── PROTOCOLE-MISE-A-JOUR.md procédure pour publier une nouvelle version (local, non versionné)
│   └── notes-de-version/        nouveautés de chaque version (<version>.md, montrées aux utilisateurs)
├── installateur/Installateur.cs installateur graphique / lanceur Toolkit.exe / désinstallateur
├── scripts/                 prérequis, lanceur, icônes, construction de l'installateur, publication
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
    │   ├── actions-auto.js      boutons de compilation ajoutés selon le type (Java, Android)
    │   ├── cibles.js            résout une « cible » ({ type: 'projet', id } / toolkit / racine) en dossier
    │   ├── git.js               Git : état d'un dépôt, commit, push, pull, fetch, .gitignore, clone
    │   ├── github.js            GitHub via « gh » (état de connexion, dépôt privé)
│   ├── depot-partage.js     dépôt GitHub partagé : plusieurs projets, un dossier chacun
    │   ├── import.js            assistant d'import : analyse, détection, copie vérifiée
    │   ├── recherche.js         index MiniSearch (projets + .md), liens [[…]], rétroliens
    │   ├── notes.js             notes .md : rendu markdown-it (HTML brut désactivé), lecture, écriture
    │   ├── modeles.js           modèles de « Nouvel outil » et création du projet
    │   ├── claude-md.js         génération du CLAUDE.md d'un projet
    │   ├── comptes.js           comptes Claude / GitHub : état, changement, déconnexion
    │   ├── proprietaires-raccourcis.js quel programme (AMD, PowerToys) a réservé un raccourci
    │   ├── mise-a-jour-toolkit.js nouvelle version de Toolkit : vérification, fusion à 3 versions
    │   ├── publication.js       « Publier une nouvelle version » (copie de développement seulement)
    │   ├── mises-a-jour.js      versions (registre npm, npm audit, programmes) et script d'installation
    │   ├── contexte-claude.js   catalogue projets/CLAUDE.md + sections « Projets liés » + --add-dir
    │   ├── sessions-claude.js   conversations Claude Code d'un dossier (~/.claude/projects, lecture seule)
    │   ├── editeurs.js          détection des éditeurs + « Ouvrir avec… »
    │   ├── logiciels.js         barre de raccourcis vers des logiciels du PC (reglages.logiciels)
    │   ├── explorateur.js       onglet « Code » : lister, lire, écrire, créer, renommer, Corbeille, surveiller
    │   ├── lsp-python.js        Pyright (aide Python) : processus, messages LSP, traduction des adresses
    │   ├── outils-html.js       protocole toolkit-outil://, partitions, sécurité des <webview>
    │   ├── outils-donnees.js    export / import localStorage + IndexedDB en JSON
    │   ├── remise-a-zero.js     « Repartir de zéro » : hors Git -> Corbeille, données des outils effacées
    │   ├── simulation-tactile.js la souris agit comme un doigt dans une page HTML (et seulement elle)
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
            ├── notifications.js notifier(message, type)
            ├── onglets.js       barre d'onglets + panneaux des outils (<webview>)
            ├── logiciels.js     barre de raccourcis vers des logiciels (au-dessus des onglets)
            ├── discussion.js    bouton « Discuter » : parler avec Claude de Toolkit et des projets
            ├── apercu-appareil.js aperçu ordinateur / smartphone / tablette d'un outil
            ├── simulation-tactile.js bouton « Simuler le tactile » (outil + aperçu HTML du Code)
            ├── reglages.js      onglet « Réglages »
            ├── terminal.js      panneau de terminal (xterm.js), copier/coller, relance
            ├── console.js       panneau d'exécution d'une action (sortie en direct)
            ├── import.js        onglet « Importer un projet » (assistant en étapes)
            ├── git.js           onglet « Git et GitHub » + pastilles/boutons réutilisés dans les détails
            ├── actions-git.js   actions Git (commit, push, pull, tout envoyer, dépôt GitHub privé)
            ├── details-git.js   fenêtres de détail : fichiers modifiés + différences, commits
            ├── historique.js    historique des versions et retour arrière (projet ou fichier)
            ├── recherche.js     palette de recherche Ctrl+K
            ├── code.js          onglet « Code » : arborescence + éditeur Monaco + onglets de fichiers
            ├── apercu-code.js   aperçu à côté de l'éditeur (HTML, Markdown, SVG, CSV, XML Android)
            ├── apercu-android.js layouts / vecteurs / formes / ressources Android dessinés
            ├── monaco.js        chargement de Monaco (AMD « min »), langages, options
            ├── lsp-python.js    client LSP minimal (Pyright -> complétion, survol, définition…)
            ├── groupes.js       groupes de projets de la barre latérale
            ├── recents.js       « Récents » : dernières ouvertures (réglages interface.recents)
            ├── preferences.js   préférences (reglages.preferences) + événement « toolkit:preferences »
            ├── preferences-ui.js pages Claude / Éditeur / Interface / Raccourcis des Réglages
            ├── raccourcis.js    liste des raccourcis, touches par défaut / choisies, combinaison()
            ├── commandes.js     exécution des raccourcis + liste de la palette
            ├── palette.js       palette de commandes (Ctrl+Maj+P)
            ├── session.js       onglets de la dernière fois (interface.session)
            ├── comptes-ui.js    page Réglages > Comptes (Claude, GitHub)
            ├── bienvenue.js     écran de bienvenue (premier lancement)
            ├── note.js          onglet d'une note : lecture, liens, rétroliens, modification
            ├── menu.js          ouvrirMenu(bouton, elements) : menu déroulant
            └── barre-laterale.js, bibliotheque.js, details.js, icone-projet.js
```

Les fiches `projet.json` : format dans `docs/projet-json.md`. `projets.js` normalise une
fiche pour l'interface sans jamais la réécrire ; une modification ne touche que les champs
concernés et conserve les autres.

Action par défaut (`projet.json > action_par_defaut`, voir `docs/projet-json.md`) : lancée
par le double-clic, le bouton principal des détails, « Ouvrir » du clic droit et la palette
(`actions.ouvrirProjet` -> `actionParDefaut()`, choix dans `choixActionsParDefaut()`, même
liste que `projets.js > actionParDefautExiste`). Actions modifiables depuis les détails
(« Ajouter une action », menu `…`) : `projets:modifier-actions` = `projets.modifierActions()`
(ajouter / modifier / supprimer / déplacer ; index = position dans `fiche.actions`, les actions
invalides du JSON sont gardées ; seuls nom, commande, description, dossier sont écrits ;
l'action par défaut suit un renommage). Action « fichier » (`fichier` sans `commande`,
`genre: 'fichier'` dans la fiche normalisée) : `actions.ouvrirFichierAction` (HTML -> outil,
`outils:preparer` l'accepte comme un outil lié ; texte/code/images -> onglet Code ; sinon
`projets:ouvrir-fichier` = `shell.openPath`) ; fichier choisi par `projets:choisir-fichier`
(chemin relatif, refusé hors du projet). Les consoles ouvertes sont recalées
(`recalerConsoles`, elles désignent leur action par sa position).

Clic droit sur un onglet (`actions.elementsMenuOnglet`) : si l'onglet parle d'un projet ou de
Toolkit (`cibleOnglet`), ouvrir l'outil, explorer le code, ouvrir avec…, modifier avec Claude,
historique, afficher dans la bibliothèque (sans ce qui ferait doublon avec l'onglet lui-même) ;
pour tous : fermer, fermer les autres, fermer à droite (chaque onglet garde sa confirmation).

Suppression d'un projet (`actions.supprimerProjet`) : refusée si un onglet du projet tourne
ou n'est pas enregistré ; confirmation en retapant le nom ; onglets du projet fermés (libère
le dossier), puis `projets:supprimer` = `shell.trashItem` (Corbeille, jamais d'effacement
définitif) ; épingles, groupes et récents nettoyés.

Repartir de zéro (`actions.repartirDeZero`, menu clic droit) : voir le projet comme un
nouvel utilisateur (clone neuf). `src/main/remise-a-zero.js` : `analyser()` ne modifie rien
(`git status --ignored=matching` : ignorés = cochés, non suivis = décochés ; projet.json,
CLAUDE.md et l'icône exclus ; Git obligatoire) ; `executer()` -> `shell.trashItem` (seulement
des chemins redonnés par `analyser()`) + `clearStorageData()` des partitions des pages HTML du
projet (`outils-html.calculerHote`). Fichiers suivis par Git jamais touchés. Refusé si un
onglet du projet tourne ; onglets Code (et outils si données effacées) fermés avant.

Renommer un projet (`actions.renommerProjet`, clic sur le nom dans les détails ou menu
clic droit) : change seulement `nom` dans projet.json (`modifierFiche`). Le dossier (= id)
ne change pas : il porte le stockage des outils HTML, les liens, groupes, épingles et
conversations de Claude. Pour le changer, action à part `actions.renommerDossier` (clic sur
« Dossier » dans les détails ou menu « Renommer le dossier… ») : refusée si un onglet du
projet tourne ou n'est pas enregistré ; onglets fermés ; `projets:renommer-dossier` =
`projets.renommerDossier()` (surveillants fermés le temps du `rename`, liens des autres
projets, ligne « Emplacement » du CLAUDE.md) + `reglages.actionsAuto` +
`sessions-claude.deplacer()` (dossier `~/.claude/projects/<encodé>`) ; l'interface met à jour
épingles, groupes et récents. Les données des outils HTML ne suivent PAS (origine différente) :
la boîte le dit et renvoie vers Exporter / Importer.

Bibliothèque : chaque projet chargé porte aussi `dateAjout` (création du dossier) et
`dateModification` (fichier le plus récent sur 2 niveaux, dossiers générés ignorés) pour
le tri. Préférences d'affichage dans `reglages.interface` : `vue`, `tri`, `couleursCategories`
(nom -> `#rrggbb` choisi par clic sur la pastille d'une catégorie ; `null` = couleur automatique
tirée du nom, voir `icone-projet.js > couleurCategorie`), `epingles`
(ids des projets épinglés, dans l'ordre ; pas dans projet.json), `recents` (voir
`composants/recents.js` : 15 dernières ouvertures, notées par `recents.noter()` dans
`ouvrirOutil`, `ouvrirAvec`, `ouvrirNote`, `lancerClaude` et `code.js > ouvrirFichier`),
`groupes` (voir
`composants/groupes.js` : `{ id, nom, parent, projets, replie }`, imbricables, un projet
peut être dans plusieurs groupes ; nettoyés au chargement par `groupes.nettoyer()` ; filtre
de bibliothèque `{ type: 'groupe', valeur: id }` = projets du groupe et de ses sous-groupes,
affichés en une section par sous-groupe s'il en a (`groupes.repartition()`, titre cliquable) ;
glisser-déposer par `groupes.glissable()` / `groupes.deposable()`). Icône : `changerIcone()`
référence une image déjà dans le projet, sinon la copie en `icone.<ext>` (ou
`icone-toolkit.<ext>` si ce nom est déjà pris) ; une image n'est jamais supprimée.

### Bibliothèques

| Besoin | Bibliothèque |
|---|---|
| Application | electron |
| Terminal | @xterm/xterm + @xterm/addon-fit + @xterm/addon-unicode11, node-pty 1.1.0 (binaires Windows précompilés, pas besoin de Visual Studio Build Tools) |
| Recherche | minisearch (dans le processus principal) |
| Markdown | markdown-it (dans le processus principal, + règle maison pour `[[liens]]`) |
| Git / GitHub | commandes `git` et `gh` du système (child_process) |
| Éditeur de code | monaco-editor (build AMD `min`, sans compilation), pyright (aide Python) |

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
- Réinitialiser (`outils:reinitialiser`) : même page vide, puis `clearStorageData()` +
  `clearCache()` de la partition de l'outil (propre à lui), puis rechargement. L'interface
  propose d'exporter d'abord.
- Aperçu smartphone / tablette (`composants/apercu-appareil.js`) : la webview est dans un
  cadre de la taille de l'appareil, réduit par `transform: scale()` si la place manque
  (les clics restent justes : vérifié) ; `outils:emulation` active
  `enableDeviceEmulation({ screenPosition: 'mobile' })` (viewport respecté, `screen` à la
  taille de l'appareil), réappliqué à chaque `dom-ready`. Mode retenu par outil dans le
  localStorage de l'interface (`toolkit:apercu:<id>`).
- Simulation du tactile (`composants/simulation-tactile.js`, bouton « doigt » de la barre de
  l'outil et de l'en-tête de l'aperçu HTML de l'onglet Code) : `outils:tactile` ->
  `src/main/simulation-tactile.js` (explications en tête). JAMAIS
  `Emulation.setEmitTouchEventsForMouse` : il convertit la souris de toute la fenêtre
  (interface comprise). À la place : script dans la page qui arrête la souris et transmet
  les appuis (binding), touchers envoyés par `Input.dispatchTouchEvent` à la FENÊTRE aux
  coordonnées de la webview (envoyés à la page, le tap ne cliquait pas). Réappliqué à chaque
  `dom-ready`, retenu par page (`toolkit:tactile:<id>` / `code:<cle>`).

Les données d'Electron (`userData`) sont redirigées vers `donnees/electron/`.

### Terminal intégré et Claude Code

- `src/main/terminal.js` (node-pty) + `composants/terminal.js` (xterm.js, chargé depuis
  `node_modules` en module ES). Frappes et redimensionnement : `ipcRenderer.send` ;
  sortie regroupée toutes les 8 ms (`terminal:donnees`), fin (`terminal:fin`).
- L'interface ne transmet jamais de chemin : une « cible » (`{ type: 'projet', id }`,
  `{ type: 'toolkit' }`, `{ type: 'racine' }`) est résolue dans `ipc/claude.js`.
- Affichage (`composants/terminal.js`) : xterm est ouvert dans `.hote-terminal`, SANS marge
  intérieure (FitAddon mesure le parent marges comprises avec `box-sizing: border-box` : une
  marge donnait une colonne / ligne de trop, cachée, et la saisie de Claude débordait sur les
  traits du cadre) ; Unicode 11 (largeur des symboles comme Claude Code) ;
  `windowsPty: { backend: 'conpty', buildNumber }` (ConPTY redessine lui-même au
  redimensionnement : xterm ne réorganise pas les lignes) ; taille transmise au pty après
  60 ms de stabilité. Maj+Entrée = retour à la ligne dans la demande (Échap + Entrée).
- Barre du terminal Claude : bouton **modèle · effort** (pour cet onglet : `--model` /
  `--effort` ; défauts dans Réglages > Claude) et **Conversations** (`terminal:sessions` =
  `sessions-claude.lister()` : 15 dernières, titre « custom-title » / « ai-title » / première
  demande). Changer de modèle, d'effort ou de conversation = arrêter Claude puis le relancer
  dans le même onglet (`--resume <id>`), après confirmation s'il tourne. Chaque onglet connaît
  sa conversation : nouvelle = `--session-id <uuid>` choisi par Toolkit ; « Reprendre » =
  `--resume` de la plus récente du dossier (`--continue` si aucune) ; une conversation encore
  vide (pas de .jsonl) est recommencée avec le même id (Claude refuserait de la reprendre).
- `processus.environnementPropre()` retire aussi les marqueurs d'une session Claude parente
  (`CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_EFFORT`…) : Toolkit lancé depuis Claude
  ne doit pas les transmettre (conversations non enregistrées, effort imposé).
- Claude est lancé **directement** via `claude.exe` (trouvé à partir de `claude.cmd` ou de
  `~/.local/bin`), jamais via `cmd.exe` : la demande initiale peut contenir guillemets et
  symboles. Aucune clé API : c'est la CLI de l'utilisateur, avec sa connexion.
- Contexte des autres projets (`src/main/contexte-claude.js`) : `projets/CLAUDE.md`
  (catalogue : tous les projets, liens, groupes ; Claude Code lit les CLAUDE.md des dossiers
  parents) et, dans le CLAUDE.md de chaque projet relié, une section « Projets liés » (liens
  directs et indirects, parcours en largeur). Sections entre marqueurs `<!-- toolkit:… -->`,
  réécrites seulement si elles changent (fins de ligne conservées, fichier créé si absent).
  Mise à jour au démarrage, après `projets:modifier`, une suppression ou un changement dans
  `projets/`. Liens dans `projet.json > liens`. Au lancement de Claude sur un projet :
  `--add-dir` avec les dossiers des projets reliés (placé APRÈS la demande initiale, car
  l'option prend tous les arguments qui la suivent).
- « Modifier avec Claude » / « Modifier Toolkit avec Claude » : commit de sauvegarde
  (`sauvegarde:faire`, propose d'activer Git si besoin), puis onglet Claude. Une session
  Claude déjà en cours sur le même dossier est réutilisée. « Reprendre la conversation »
  relance avec `claude --continue`.
- « Discuter » (`composants/discussion.js`, à gauche de la barre des logiciels, palette, raccourci
  au choix) : Claude à la racine de Toolkit (cible `racine` + mode `claude` = discussion, voir
  `ipc/claude.js`), EN LECTURE SEULE (`--tools Read,Glob,Grep,WebSearch,WebFetch
  --strict-mcp-config` : pas de commit de sauvegarde, la racine n'a pas de dépôt Git). Contexte :
  `contexte-claude.preparerDiscussion()` réécrit à chaque lancement `donnees/discussion-claude.md`
  (rôle, où lire, catalogue des projets), passé par `--append-system-prompt-file`. Un onglet par
  sujet (`onglet.idSession`, noté par `actions.noterSessionTerminal`) ; menu du bouton = nouvelle
  discussion + conversations récentes de la racine. Pour agir : Claude renvoie vers « Modifier avec
  Claude » avec une demande prête à copier.
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
- « Arrêter » = `taskkill /T /F` (tout l'arbre de processus) ;
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
  -> GitHub (facultatif, via `gh`) : dépôt privé à lui, OU dossier d'un dépôt partagé
  (`choix.partage`, même fonction que le panneau Git : `depot-partage.rejoindre()`).
  Échec de copie = copie supprimée, original intact.
- Fichier seul (page HTML autonome, script…) : `analyser()` reconnaît un fichier (mode
  `fichier`) ; seul ce fichier est analysé (racine = son dossier, voisins jamais lus sauf pour
  signaler ceux qu'une page HTML utilise), puis `executer()` crée un NOUVEAU dossier de projet
  et y copie le fichier sous son nom (un dossier par projet). Raccourcis `.lnk`/`.url` refusés.
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
- « Tout commit » : commit de chaque projet modifié avec le message proposé d'après ses
  fichiers changés (`messageCommitPropose`), après confirmation listant projets et messages.
- « Tout envoyer » : chaque dépôt vers SON remote, après confirmation listant les projets.
- Dépôt GitHub : toujours PRIVÉ (`gh repo create --private`), refusé si des secrets sont
  suivis par Git ; l'adresse est notée dans `projet.json` (`git.remote`).
- Dépôt PARTAGÉ (`src/main/depot-partage.js`, explications en tête) : plusieurs petits projets
  dans UN dépôt GitHub, un dossier chacun (`projet.json > git.partage = { remote, dossier }`).
  Chaque projet garde SON dépôt local (historique, retour arrière) et n'a pas de remote. Cache
  « bare » dans `donnees/depots-partages/` ; Push = `mktree` + `commit-tree` qui remplacent
  seulement le dossier du projet ; Pull = commit « Récupéré depuis GitHub » fabriqué dans le cache
  puis `merge --ff-only` ; `refs/toolkit/partage` (dans le dépôt du projet) = dernier état
  synchronisé, pour savoir qui a changé (les deux = refus, comme pour un pull qui diverge).
  `ipc/git.js` aiguille push / pull / état / commits vers ce module quand la fiche a `git.partage`.
  Limite : pas d'import depuis un dépôt partagé sur un autre PC (l'assistant clone un dépôt entier).
- Le repo de l'application ne contient que `app/` : un clone donne un Toolkit vierge.
- Détail (`composants/details-git.js`, ouvert par les pastilles cliquables) :
  `git.listerCommits(dossier, 'envoyer' | 'recuperer')` (`@{u}..HEAD`, `HEAD..@{u}`, ou
  `HEAD --not --remotes` pour une branche jamais envoyée) et `git.differences(dossier,
  chemin, hash?)` (`git diff HEAD` / `git show <hash>` ; fichier nouveau = contenu affiché
  comme ajouté ; binaire détecté ; 300 Ko au plus). `core.quotepath=off` pour les accents.
- Historique (`composants/historique.js`) : `git.historique()` (commits, sauvegardes
  « avant Claude » repérées par leur message), `fichiersDifferentsDepuis()` /
  `differencesDepuis()` (version -> état actuel) et `restaurer(dossier, hash, chemins?)` :
  commit de sauvegarde des modifications en cours, puis `git restore --source=<hash>
  --staged --worktree` (projet entier `:/`, ou fichier ; absent de la version = `git rm`),
  puis un NOUVEAU commit « Retour … ». L'historique n'est jamais réécrit (pas de reset).

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

### Éditeur de code (onglet « Code »)

`src/main/explorateur.js` + `src/main/lsp-python.js` + `ipc/code.js` + `composants/code.js`
/ `monaco.js` / `lsp-python.js`. Ouvert par `actions.ouvrirCode(cible, nom, fichier?)`
(onglet de genre `code`, id `code:<cle>`, cle = `p-<id>` ou `toolkit`).
- Chemins relatifs au dossier de la cible, validés (insensible à la casse) ; `.git` caché et
  refusé. Suppression = `shell.trashItem` après confirmation. Lecture : 5 Mo au plus,
  binaire détecté (octet nul), images renvoyées en `data:`. Encodage conservé à
  l'enregistrement (UTF-8, UTF-8 avec BOM, Windows-1252) ; fins de ligne conservées par
  Monaco. Enregistrement refusé si le fichier a changé depuis la lecture
  (`{ modifieAilleurs: true }`) sauf choix « écraser ».
- Surveillance `fs.watch` récursive tant que l'onglet est ouvert (dossiers de
  compilation ignorés) : fichiers ouverts sans modification rechargés (avec
  `pushEditOperations` : Ctrl+Z reste possible).
- Monaco : build AMD `min/vs` de monaco-editor, chargé à la première ouverture (textes
  français : `nls/lang/fr.js` chargé AVANT `loader.js`, ce n'est pas un module AMD).
  Workers en `blob:` (CSP `worker-src 'self' blob:`). Modèles d'URI
  `file:///<cle>/<chemin>` ; les `.js/.ts` du projet sont chargés en modèles (aide entre
  fichiers). `registerEditorOpener` ouvre la cible d'une définition dans l'onglet.
- Pyright : `node_modules/pyright/langserver.index.js --stdio`, lancé avec
  `process.execPath` + `ELECTRON_RUN_AS_NODE=1`, un par onglet, au premier `.py` ouvert,
  arrêté à la fermeture de l'onglet / de la fenêtre. Textes en français
  (`VSCODE_NLS_CONFIG`). `processId` de Toolkit transmis à `initialize` (Pyright s'arrête
  si Toolkit disparaît). Le processus principal traduit les adresses virtuelles <-> vrais
  chemins et répond lui-même aux questions de Pyright (`workspace/configuration` :
  `pythonPath` = vrai python.exe, pas `py.exe`).
- Recherche dans tous les fichiers : `explorateur.rechercher()` / `remplacer()` (fichiers
  de `listerTout`, 2 Mo et texte seulement, 2000 résultats au plus, encodage et fins de
  ligne conservés) ; `code:remplacer` fait d'abord un commit de sauvegarde si Git. Refusé
  dans l'interface si un fichier concerné a des modifications non enregistrées.
- Aperçu (`composants/apercu-code.js`, `apercu-android.js`) : HTML dans une `<webview>`
  servie par `outils-html.preparerApercu()` (racine = dossier de la cible, partition
  NON persistante `apercu-…`, acceptée par `will-attach-webview`), rechargée par la
  surveillance de fichiers ; Markdown via `code:rendre-markdown` (= `notes.rendre`, HTML
  brut désactivé) ; SVG en `<img>` data: (aucun script exécuté) ; CSV en tableau ; XML
  Android dessiné avec `el()` (layout approché, `<vector>` -> SVG, `<shape>`, `<resources>`),
  ressources lues dans le `res/` du module (cache vidé quand un fichier de `res/` change).
  `.svg` est lu comme du texte (modifiable), plus comme une image.
- Modifications non enregistrées (onglets `nonEnregistre`) signalées au processus
  principal (`application:non-enregistre`) : la fenêtre est alors cachée au lieu d'être
  détruite, et « Quitter » demande confirmation.

### Compilation (projets Java / Gradle, APK de debug)

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

Raccourcis vers des logiciels (barre au-dessus des onglets) : `src/main/logiciels.js` +
`ipc/logiciels.js` + `composants/logiciels.js`. `reglages.logiciels = [{ id, nom, chemin }]`
(ordre d'affichage) ; chemin absolu hors de Toolkit (même exception que les éditeurs), relatif
à la racine s'il est dedans. L'interface ne connaît que les ids. « + » = choix du fichier
(.exe, .lnk, .url, .bat…) puis du nom ; clic = lancer (.exe via `lancerDetache`, le reste via
`shell.openPath`) ; clic droit = renommer, autre emplacement, Explorateur, déplacer, retirer ;
glisser-déposer = ordre. Icône = `app.getFileIcon` (cible du .lnk), gardée en mémoire.

## Comment ajouter une fonctionnalité

1. **Logique** dans `src/main/<domaine>.js` : une fonction claire, qui lance
   `new Error('message en français')` en cas de problème prévu (ce message est montré tel
   quel à l'utilisateur ; un bug imprévu donne un message générique + la trace au journal).
2. **Canal IPC** dans `src/main/ipc/<domaine>.js` avec `gerer('<domaine>:<action>', fonction)`
   (voir `ipc/gerer.js`). Nommage : `domaine:action` en kebab-case. Un nouveau fichier `ipc/` s'enregistre dans `main.js`
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

## Installateur et diffusion

- Licence GPL-3.0-or-later (`LICENSE`, `package.json`). Toolkit est diffusé SOUS FORME DE
  SOURCES (pas d'electron-builder / asar) : il doit rester modifiable par Claude.
- **Installateur graphique** `Installer-Toolkit-<version>.exe` : `installateur/Installateur.cs` (WinForms, C# 5),
  fabriqué par `npm run installateur` (`scripts/construire-installateur.js`) avec le
  compilateur C# de Windows (.NET Framework 4, rien à installer) ; sources = `git archive
  HEAD` (le DERNIER COMMIT) incluses en ressource `app.zip` ; sortie `dist/` (ignoré par Git,
  à publier dans les Releases). Étapes : bienvenue, dossier + raccourcis (+ nom Git si
  absent), logiciels (winget / installateur officiel de Claude ; Node.js et Git cochés s'ils
  manquent, Claude Code décoché par défaut), installation
  (journal), fin. Inscrit Toolkit dans « Applications installées » (HKCU), copie de lui-même
  en « Désinstaller Toolkit.exe » (`/desinstaller` : app + lanceur + raccourcis à la
  Corbeille, projets et donnees GARDÉS sauf case cochée). Le même exe a 3 rôles selon son
  NOM de fichier : installateur, `Toolkit.exe` (lanceur à la racine : lance
  `app\node_modules\electron\dist\electron.exe app`, cible des raccourcis) et
  `Désinstaller Toolkit.exe` (désinstallation, même sans argument). `/auto <dossier> <journal>` :
  installation sans clic (tests). Non signé : avertissement SmartScreen.
- Premier lancement : `composants/bienvenue.js` (si aucun projet et
  `preferences.interface.bienvenueVue` faux) : comptes, préférences, consignes, premier projet.
- Comptes : `src/main/comptes.js` (`claude auth status --json` / `logout`, `gh auth status /
  switch / logout`). Connexion Claude : terminal de mode `connexion` (`claude auth login
  --claudeai`). Connexion GitHub : SANS terminal (`gh auth login --web` lancé sans console ne
  pose aucune question) : fenêtre avec le code à usage unique et le bouton vers
  github.com/login/device ; fermer la fenêtre arrête gh. node-pty exige le CHEMIN COMPLET du
  programme (`where gh`), sinon « File not found » ; page Réglages > Comptes
  (`composants/comptes-ui.js`). Toolkit ne lit jamais de mot de passe ni de jeton.
- Une installation par l'installateur n'a pas de dépôt Git : il est créé à la première
  sauvegarde (activation de Git ou mise à jour de Toolkit), sans remote.
- Rien de personnel dans le dépôt (vérifier avant publication : `git grep` de son nom,
  e-mail, chemins). Les textes parlent du « compte Claude » de l'utilisateur, jamais d'un
  compte précis.

## Lancer et tester

```
npm install        (une seule fois, ou après ajout d'une dépendance)
npm start          lance Toolkit avec les sources
npm run verifier   vérifie les prérequis
npm run icones     régénère assets/icone.png et assets/icone.ico
```

**Tests automatiques** : un petit script
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

## Mise à jour de Toolkit lui-même

`src/main/mise-a-jour-toolkit.js` + Réglages > Mises à jour (bloc « Toolkit »).
- Versions = Releases GitHub du dépôt de `package.json > repository` (étiquettes vX.Y.Z) ;
  API GitHub sans compte (dépôt public), sinon `gh api` (dépôt privé de son propriétaire).
  Tests : `TOOLKIT_SOURCE_MAJ=<dossier>` (releases.json + <tag>.zip).
- Fusion à TROIS versions, fichier par fichier : base = sources de la version INSTALLÉE
  (téléchargées par son étiquette : chaque version publiée doit le rester), sienne = app/,
  nouvelle = sources de la dernière Release. Non modifié par l'utilisateur -> nouvelle
  version ; modifié par lui seul -> gardé ; des deux côtés -> `git merge-file`, sinon SA
  version gardée + fichier signalé (Claude finit la fusion, versions officielles dans
  `app/.mise-a-jour/<version>/{base,nouveau}`, ignoré par Git, la recherche et l'onglet Code ;
  supprimé après une mise à jour sans conflit et au début de la suivante) ; ses fichiers ajoutés ou
  supprimés : respectés. `package.json` : nouvelle version + ses ajouts (dépendances,
  scripts) ; `package-lock.json` : nouvelle version (npm install le recalcule).
- Application : commit de sauvegarde (dépôt créé si besoin, identité « Toolkit » par défaut),
  écriture, commit « Mise à jour de Toolkit … ». Puis redémarrage, ou `npm install` Toolkit
  fermé si les dépendances changent (script de mises-a-jour.js). `donnees/` et `projets/`
  ne sont jamais touchés.
- Point à côté du nom dans la barre latérale (`barre-laterale.js > pointMiseAJour`, état
  `majToolkit`) : vert = à jour, orange = nouvelle version, gris = inconnu. `toolkit-maj:etat`
  = `mise-a-jour-toolkit.etat()` (une requête, résultat gardé 6 h ; demandé 3 s après le
  démarrage et après chaque vérification complète). Clic = Réglages > Mises à jour.
- Notes de version : bouton « Notes de version » des détails de Toolkit (fenêtre, la plus
  récente dépliée, `toolkit-maj:notes-version`) ; exclues de la section « Notes »
  (`recherche.notesDe`), mais toujours trouvées par Ctrl+K.
- Procédure complète pour l'utilisateur (et pour toi s'il demande de « préparer une version ») :
  `docs/PROTOCOLE-MISE-A-JOUR.md` (fichier personnel, ignoré par Git : il n'existe que sur
  le PC de la personne qui publie). Tu prépares (numéro, notes, commit) ; c'est lui qui lance
  la publication (`npm run publier`, envoi sur GitHub).
- Publication : `npm run publier` (scripts/publier-version.js) : vérifie, fabrique
  l'installateur, puis APRÈS CONFIRMATION pousse, crée l'étiquette et la Release (notes :
  `docs/notes-de-version/<version>.md`, installateur joint).
- Même chose depuis Toolkit : Réglages > Mises à jour > « Publier une nouvelle version… »
  (`src/main/publication.js`), visible seulement sur la copie de DÉVELOPPEMENT (`origin` = dépôt
  de `package.json > repository` ; droit d'écriture vérifié par `gh api`). `preparer()` ne
  modifie rien : commits depuis la dernière étiquette, numéro conseillé (nouveautés, fichiers
  ajoutés dans `src/`/`templates/` ou nouvelle dépendance -> 2ᵉ chiffre ; sinon 3ᵉ ; le 1ᵉʳ
  seulement si choisi), brouillon des notes. `publier()` : version dans package.json + notes ->
  commit « Version X » -> installateur -> push -> étiquette -> Release. Étiquette sans Release
  (publication interrompue) : proposée à la reprise.

## Préférences, raccourcis, palette, notifications

- `reglages.preferences` = { claude, editeur, interface, raccourcis } (défauts dans
  `composants/preferences.js`, toujours lus fusionnés). `preferences.modifier(groupe, …)`
  enregistre et émet `toolkit:preferences` (l'éditeur applique `updateOptions` en direct).
- Claude : consignes -> section `<!-- toolkit:consignes -->` de `Toolkit/CLAUDE.md` (racine,
  donc lue pour app/ et pour projets/ ; fichier supprimé si la section est vide) ; modèle
  (`--model`), effort (`--effort`) et autonomie (`--permission-mode`, jamais bypassPermissions) ajoutés par
  `terminal.creer`.
- Raccourcis : TOUJOURS passer par `raccourcis.js` (`commandeDe`, `correspond`). Nom d'une
  touche : une LETTRE = la lettre tapée (`e.key`) ; un signe = caractère écrit SANS Maj sur
  le clavier de l'utilisateur (`navigator.keyboard.getLayoutMap()`) ; chiffres d'après la position de la
  touche, sauf « - » et « = ». Disposition transmise au
  processus principal (`application:disposition`).
- Un raccourci réservé par un AUTRE programme du PC (Radeon Software, PowerToys…) n'arrive
  jamais à Toolkit : `raccourcis:pris` le détecte (tentative de `globalShortcut.register`
  aussitôt annulée) ; signalé au démarrage (une fois), dans Réglages > Raccourcis et au
  moment d'en choisir un. Les tests de Toolkit par événements simulés ne le voient pas.
  Windows ne dit pas QUI l'a réservé : `proprietaires-raccourcis.js` cherche (lecture seule)
  dans les réglages d'AMD Radeon Software (registre `HKCU\Software\AMD\DVR` et
  `%LOCALAPPDATA%\AMD\CN\Analytics\RadeonAnalytics_BugTool.JSON`) et de PowerToys
  (`settings.json` des modules). Les touches pressées dans un
  outil (webview) sont captées par `outils-html.js` (`RACCOURCIS_DANS_OUTILS`, mêmes règles).
  Commandes de zone « editeur » envoyées au panneau Code par l'événement DOM `commande`.
- Notification Claude : `terminal.js > suivreClaude()` (sortie continue ≥ 3 s puis silence de
  4 s, écho de frappe et 6 premières secondes ignorés, BEL hors séquences OSC) ->
  `terminal:claude-attend` ; l'interface marque l'onglet (`attention`) si on regarde ailleurs
  et demande `terminal:notifier-claude` (Notification + `flashFrame`).
- Zoom : `webContents.setZoomFactor` au chargement et à chaque changement.

## Mises à jour (Réglages > Mises à jour)

`src/main/mises-a-jour.js` + `composants/mises-a-jour.js`. Versions lues sur le registre npm
(dates de publication), « sûre » = même majeure (0.x : même mineure) ET publiée depuis 7 jours
ou plus ; une majeure est confiée à Claude (il modifie package.json et le code, sans lancer
npm install). Installation Toolkit FERMÉ (electron.exe et node-pty verrouillés sinon) :
commit de sauvegarde de app/, puis `donnees/mise-a-jour-toolkit.cmd` (chemins relatifs au
script) attend la fin du processus de Toolkit (PID en argument), lance `npm install --save
paquet@version`, `node node_modules/electron/install.js`, puis relance `Lancer Toolkit.vbs`.
Vérification automatique au démarrage si la dernière a plus de 7 jours
(`reglages.misesAJour`). Programmes du PC : commande affichée seulement (installation
globale = action de l'utilisateur).

## Performances (mesurées)

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
  qui appelle `etat.modifier()` relance le rendu en plein milieu
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
- **`npm audit` signale DOMPurify (critique) via monaco-editor 0.57** : Monaco embarque sa
  propre copie de DOMPurify dans `min/vs/editor-*.js` (le paquet npm `dompurify` n'est pas
  celui qui s'exécute) et ne l'utilise qu'en mode `RETURN_DOM_FRAGMENT`, pas dans les modes
  touchés (IN_PLACE, SAFE_FOR_TEMPLATES, XHTML). Ne PAS lancer `npm audit fix --force` (il
  rétrograde Monaco) ni ajouter d'« overrides » (cela masquerait l'alerte sans changer le code
  exécuté). Corriger en passant à une version de monaco-editor qui embarque DOMPurify ≥ 3.4.17,
  puis tester l'onglet « Code ».
- **`fs.watch` signale aussi les simples lectures** (date de dernier accès, activée sur
  Windows 11) : une page de l'aperçu qui lit ses JSON / images se rechargeait en boucle.
  `explorateur.surveiller()` ne transmet donc que les vrais changements (date de
  modification, taille, création, suppression). Garder ce filtre pour toute surveillance.
- `element.replaceChildren(...)` et `append(...)` ne déplient pas les tableaux : utiliser
  `...liste` (sinon on obtient « [object HTMLDivElement] »). `el()` les déplie, lui.

## Choix de conception

- Modèles fournis dans `app/templates/` (versionnés) ; `Toolkit/templates/` facultatif pour
  les modèles personnels.
- Import : après copie vérifiée, l'original part **à la Corbeille** (pas de suppression
  définitive).
- Fermer la fenêtre détruit la fenêtre pour libérer la mémoire (seule l'icône de la zone de
  notification reste), **sauf** si un script ou un terminal tourne : la fenêtre est alors
  seulement cachée.
- Thème sombre uniquement.
- Electron 44.9.3 (dernière de la série 44). Pour passer à la 45 quand une 45.1 ou plus sera
  sortie : `npm install --save electron@^45`, `npm install`, puis tester les outils HTML
  (webview), les terminaux (node-pty) et la recherche, et vérifier le journal.

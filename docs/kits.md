# Kits et skills réutilisables

Toolkit fournit seulement l'utilitaire : aucun kit ni skill n'est livré avec l'application. Ils
appartiennent à chaque utilisateur et vivent dans `Toolkit/kits/`, hors du dépôt de l'application.

## Règles pour Claude

1. **Consulte le catalogue avant de coder** : `kits/CATALOGUE.md`. Absent ou vide : aucun kit pour
   l'instant, continue normalement.
2. **Utilise les kits existants** quand ils conviennent, avec la commande ci-dessous. Ne copie pas
   leurs fichiers à la main : la commande vérifie, remplace les variables et note le kit dans
   `projet.json`.
3. **Ne recode jamais ce qu'un kit fournit.** S'il manque quelque chose, dis-le à l'utilisateur.
4. **Kit à adapter** : si la commande annonce une adaptation, termine le travail en suivant le guide
   du kit (`kits/<kit>/guide.md`).
5. **Ne modifie pas `kits/` depuis un projet**, sauf si l'utilisateur le demande. Claude a techniquement
   le droit d'y écrire (`--add-dir`) : cette règle est la seule barrière. Seule exception :
   déposer une proposition (voir ci-dessous). N'utilise jamais ce qui se trouve dans `kits/propositions/`.
6. **Ne mets à jour aucun kit dans un projet sans demande** : aucune mise à jour n'est automatique.
   Quand c'est demandé : compare le projet avec `kits/<kit>/`, reporte les changements en gardant ce
   qui a été adapté au projet, puis mets à jour la version dans `projet.json` et la section
   `toolkit:kit=<kit>=` du `CLAUDE.md` du projet.

## Proposer un kit ou un skill

Quel que soit le type du projet, tu peux déposer dans `kits/propositions/<nom>/` ce que tu viens d'écrire.

**Seulement si** c'est réutilisable tel quel dans un autre projet, sans rien de propre à celui-ci : pas de
nom de projet, de chemin de ce PC, de réglage, de texte ou de donnée du projet, aucun secret. En cas de
doute, ne propose rien. Vérifie d'abord le catalogue (déjà fourni par un kit ?) et
`kits/propositions/REFUS.md` (déjà refusé ? ne le repropose pas).

Le dossier, à un seul niveau, porte le nom du kit ou du skill (minuscules, chiffres, tirets) :

- **Kit** : le format complet d'un kit (`kit.json`, `guide.md`, `fichiers/`…), voir ci-dessous.
- **Skill** : `SKILL.md` directement dans le dossier, jamais de dossier `.claude` : Claude Code pourrait le
  charger avant qu'il soit accepté.
- **Toujours** : `proposition.md`, deux ou trois lignes : le projet d'origine et pourquoi c'est réutilisable
  (ce fichier est le seul à pouvoir nommer le projet ; il est retiré à l'acceptation).

Vérifie avec `node ../../app/scripts/kit.js propositions`, puis dis à l'utilisateur ce que tu as déposé.
Il décide dans l'onglet « Kits et skills » (Accepter / Refuser).

**Une proposition n'est jamais utilisée avant d'être acceptée** : ne la copie pas dans un projet, n'en dépends
pas, ne la déplace pas toi-même vers la bibliothèque. Elle n'est ni dans le catalogue, ni ajoutable, ni
envoyée sur GitHub (dossier ignoré par Git). Accepter la fait entrer dans la bibliothèque et son
historique ; refuser l'envoie à la Corbeille.

## Commande

Depuis un projet (`../../` = la racine de Toolkit) :

```
node ../../app/scripts/kit.js lister [--type <type>] [--langage <langage>] [--projet <dossier>]
node ../../app/scripts/kit.js ajouter <kit> [--projet <dossier>] [--var nom=valeur]... [--essai]
```

`--essai` montre ce qui serait fait sans rien écrire. La commande ne pose aucune question : une valeur
manquante est signalée avec le `--var` à ajouter.

`ajouter` vérifie **tout avant la première copie** : type et langage du projet, kits nécessaires,
destinations à l'intérieur du projet et non ignorées par Git, fichiers déjà présents (jamais écrasés).
Au moindre problème, rien n'est écrit. Sinon : copie, variables remplacées, kits nécessaires ajoutés,
section du kit dans le `CLAUDE.md` du projet, kit et version notés dans `projet.json` (champ `kits`, voir
`projet-json.md`).

## Organisation de `Toolkit/kits/`

```
kits/
├── .git/                    dépôt Git local, séparé de celui de l'application
├── .gitignore               propositions/, CATALOGUE.md et CLAUDE.md sont ignorés
├── .claude/skills/<nom>/SKILL.md   skills de l'utilisateur (format standard de Claude Code)
├── CATALOGUE.md             généré par Toolkit à partir des kit.json
├── CLAUDE.md                généré : consignes quand Claude travaille DANS la bibliothèque
├── propositions/            attend la décision de l'utilisateur (jamais utilisé avant), REFUS.md
└── <kit>/                   le nom du dossier est l'identifiant (a-z, 0-9, tirets)
    ├── kit.json
    ├── guide.md             guide court
    ├── regles.md            règles propres au kit (facultatif)
    └── fichiers/            le code à copier (kit de code seulement)
```

La bibliothèque est créée au premier lancement de Claude sur un projet, ou depuis l'onglet « Kits et
skills ». Claude reçoit le dossier en `--add-dir` (chemin calculé au lancement) : Claude Code charge
alors les skills de `.claude/skills/`, mais pas le `CLAUDE.md` de `kits/` : les règles passent par la
section « Kits et skills réutilisables » de `projets/CLAUDE.md`, écrite par Toolkit.

## Dans Toolkit

- **Onglet « Kits et skills »** : liste avec filtre par type de projet, projets qui utilisent chaque
  kit, créer un kit ou un skill, créer un kit depuis un projet (fichiers choisis un par un ; le projet
  n'est pas modifié), « Améliorer avec Claude » (sauvegarde Git de la bibliothèque avant), propositions
  de Claude avec Accepter / Refuser.
- **Détails d'un projet** : version de chaque kit et signal si la bibliothèque en a une plus récente.
  Rien n'est mis à jour tout seul : le bouton lance Claude sur le projet, à la demande.
- **Onglet « Git et GitHub »** : la bibliothèque a sa ligne, comme un projet. Un seul dépôt GitHub PRIVÉ
  normal (`toolkit-kits`), créé seulement à la demande, et envoyé seulement par Push ou « Tout envoyer ».
- **Autre PC** : « Récupérer depuis GitHub » copie ce dépôt dans `Toolkit/kits/`. Une bibliothèque vide
  part à la Corbeille ; une bibliothèque qui contient quelque chose n'est jamais remplacée.
- **« Vérifier les projets »** (onglet « Kits et skills ») : compare les projets choisis à la bibliothèque,
  sans Claude et sans rien modifier, puis liste les ajustements. Voir ci-dessous.

## Vérifier les projets

Toolkit cherche, dans chaque projet choisi :

- un kit du projet qui a une version plus récente dans la bibliothèque, ou qui n'y est plus ;
- du code très proche d'un kit que le projet ne déclare pas (au moins 35 % de ses lignes significatives). Un kit
  qui écrit à la racine du projet est un point de départ pour un nouveau projet : il n'entre pas dans ce contrôle ;
- ce que les skills et les kits demandent de vérifier, avec leur fichier `verification.json`.

Pour chaque ajustement :

- **Faire** : sauvegarde Git, puis Claude s'ouvre dans le projet avec la demande. Il explique ce qu'il compte faire avant de modifier.
- **Ignorer** : retire la ligne du rapport. La prochaine vérification la retrouve.
- **Exception** : ne plus la détecter dans ce projet. Notée dans `projet.json` (champ `exceptions_verification`, lu par
  la vérification) et dans le `CLAUDE.md` du projet (section `toolkit:exceptions`, lue par Claude). Le rapport la liste, et elle se retire de là.

### Format de `verification.json`

À placer dans le dossier d'un skill (`.claude/skills/<nom>/`) ou d'un kit. Une erreur dans ce fichier est signalée dans le rapport
et n'empêche pas le reste. Une proposition n'est jamais lue tant qu'elle n'est pas acceptée.

```json
{
  "schema": 1,
  "regles": [
    {
      "id": "alarmes-sans-redemarrage",
      "titre": "Les alarmes ne sont pas reprogrammées après un redémarrage",
      "detail": "Android perd les alarmes quand le téléphone redémarre.",
      "gravite": "important",
      "types": ["android"],
      "si": [
        { "fichiers": "**/*.{kt,java}", "contient": "setExact" },
        { "fichiers": "**/AndroidManifest.xml", "ne_contient_pas": "BOOT_COMPLETED" }
      ],
      "demande": "Suis le skill `android-rappels-fiables` pour {{fichiers}}."
    }
  ],
  "script": {
    "chemin": "scripts/mon-controle.cjs",
    "arguments": ["--json"],
    "types": ["html"],
    "demande": "Point à traiter : {{titre}} ({{detail}})."
  }
}
```

- `id` (minuscules, chiffres, tirets) et `titre` sont obligatoires. `id` ne doit plus changer : les exceptions s'en servent.
- `gravite` : `important`, ou `conseil` par défaut. `types` : facultatif, les types de projets concernés.
- `si` : toutes les conditions doivent être vraies. `fichiers` est un motif (`*`, `**/`, `{a,b}`), avec au choix :
  `contient` et `ne_contient_pas` (expression régulière, multiligne), `existe` (`true` ou `false`), `taille_min_ko`.
  Les fichiers sensibles, binaires ou de plus de 2 Mo ne sont jamais lus.
- `demande` : ce que Claude reçoit avec « Faire ». Variables : `{{fichiers}}`, `{{titre}}`, `{{detail}}`. Sans `demande`, Toolkit en écrit une
  qui renvoie au skill ou au guide. Toolkit ajoute toujours : expliquer d'abord, attendre l'accord, commit local sans push.
- `script` : facultatif, pour ce qu'une expression ne peut pas vérifier. Il est lancé avec le Node intégré à Toolkit, avec le dossier du
  projet en premier argument, et doit **ne rien modifier**. Il écrit sur sa sortie :
  `{ "ajustements": [{ "cle": "stable", "titre": "…", "detail": "…", "fichiers": ["…"], "gravite": "conseil" }] }`.
  Aucune valeur secrète ne doit apparaître, ni dans la sortie ni dans `cle`. Durée maximale : 3 minutes par projet.
  Seul ton dossier `kits/` contient ces scripts : n'accepte que des skills que tu as relus.

## Format de `kit.json`

| Champ | Obligatoire | Rôle |
|---|---|---|
| `schema` | oui | Toujours `1`. |
| `nom`, `description` | oui | Nom affiché ; une ligne de description, reprise dans le catalogue. |
| `version` | oui | `X.Y.Z`. |
| `genre` | oui | `code` ou `regles` (aucun fichier copié). |
| `types` | oui | `"tous"` ou une liste parmi `html`, `script`, `java`, `android`, `autre`. |
| `langages` | non | Liste parmi `python`, `node`, `java`, `kotlin`. Absent = tous. Le projet doit contenir un fichier de ce langage. |
| `fichiers` | si `code` | `[{ "source": "<dossier du kit>", "vers": <destination> }]`. `vers` est un dossier du projet, ou un objet par type de projet, avec `"*"` pour les autres types. |
| `variables` | non | `[{ "id", "libelle", "genre": "texte" ou "package", "defaut", "types" }]`. `types` (facultatif) : seulement pour ces types de projets (ex. un package pour `java`). |
| `necessite` | non | `[{ "kit": "<id>", "version_min": "X.Y.Z" }]` : ajoutés en même temps s'ils manquent. |
| `adaptation` | non | `true` : la copie ne suffit pas, Claude termine en suivant le guide. |
| `guide` | oui | Chemin du guide dans le kit. |
| `regles` | si `regles` | Chemin des règles dans le kit. Copiées dans le `CLAUDE.md` du projet à l'ajout. |

### Variables

`{{id}}` est remplacé dans les noms de fichiers, les destinations, les règles et les fichiers texte en
UTF-8. Seules les variables déclarées sont remplacées : un autre `{{…}}` reste intact, et un fichier
binaire est copié tel quel.

- Toujours disponibles : `{{nom_projet}}` et `{{id_projet}}`.
- Une variable de genre `package` fournit aussi `{{<id>_chemin}}` (`fr/exemple/outil`). Sa valeur est
  détectée s'il n'y a pas de doute (`namespace` de Gradle, début commun à toutes les sources,
  `gradle.properties`) ; sinon `--var` est obligatoire.
- Ordre de priorité : `--var`, détection, `defaut`.

### Exemple

```json
{
  "schema": 1,
  "nom": "Configuration JSON",
  "description": "Charge et enregistre un fichier de configuration JSON.",
  "version": "1.0.0",
  "genre": "code",
  "types": ["java"],
  "langages": ["java"],
  "variables": [{ "id": "package", "libelle": "Package Java", "genre": "package" }],
  "fichiers": [
    { "source": "fichiers/java", "vers": "src/main/java/{{package_chemin}}/kit/config" },
    { "source": "fichiers/ressources", "vers": "src/main/resources/{{id_projet}}" }
  ],
  "adaptation": true,
  "guide": "guide.md"
}
```

Destinations différentes selon le type : `"vers": { "html": "kit/x", "android": "{{module}}/src/main/assets/kit/x" }`.

Un kit qui gère Python et Node à la fois n'existe pas : le code diffère, ce sont deux kits.

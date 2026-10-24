# Modèles de projets

Chaque sous-dossier qui contient un fichier `modele.json` est un modèle proposé par le
bouton « Nouvel outil ». Toolkit copie le dossier du modèle dans
`projets/<nom-du-nouvel-outil>/`, génère `projet.json` et `CLAUDE.md`, initialise Git,
fait un premier commit, puis lance Claude Code avec la description de l'outil.

- Modèles fournis avec l'application : ici, dans `app/templates/` (`html`, `python`, `node`).
- Modèles personnels : dans `Toolkit/templates/` (à côté de `app/`), même format.
  Ils s'ajoutent à ceux-ci et ne sont pas versionnés avec l'application.

## `modele.json`

| Champ | Rôle |
|---|---|
| `nom` | Nom affiché dans la liste « Type ». |
| `description` | Explication courte du modèle. |
| `ordre` | Position dans la liste (plus petit = plus haut). |
| `type`, `point_entree`, `ouvrir_avec`, `actions` | Recopiés dans le `projet.json` du nouveau projet (voir `docs/projet-json.md`). |
| `technologies` | Texte placé dans la section « Technologies » du `CLAUDE.md` généré. |
| `lancer` | Texte placé dans la section « Lancer ou compiler » du `CLAUDE.md` généré. |

## Variables

Dans les fichiers texte du modèle (html, css, js, py, json, md…), ces variables sont
remplacées à la création :

- `{{nom}}` : nom de l'outil ;
- `{{description}}` : description saisie ;
- `{{identifiant}}` : nom du dossier créé (sans espace ni accent).

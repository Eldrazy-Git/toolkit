# Modèles de projets

Chaque sous-dossier de `templates/` est un modèle utilisé par le bouton « Nouvel outil »
(par exemple `html/`, `python/`, `node/`). Toolkit copie le dossier du modèle dans
`projets/<nom-du-nouvel-outil>/`, puis génère `projet.json` et `CLAUDE.md`.

Les modèles fournis avec l'application sont rangés ici, dans `app/templates/`.
Tu peux aussi créer tes propres modèles dans `Toolkit/templates/` (à côté de `app/`) :
ils s'ajoutent à ceux-ci et ne sont pas versionnés avec l'application.

Les modèles seront ajoutés en phase 4.

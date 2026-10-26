# Installateur de Toolkit pour Windows (lancé par « Installer Toolkit.cmd »).
#
# - Vérifie les logiciels nécessaires (Node.js, Git) et utiles (Claude Code, GitHub CLI,
#   Python) ; propose d'installer ceux qui manquent (winget), en demandant à chaque fois.
# - Installe Toolkit SOUS FORME DE SOURCES (pas un programme figé) : il reste modifiable
#   avec Claude ou n'importe quel éditeur, sans rien réinstaller.
# - Crée le dossier Toolkit (app, projets, donnees), installe les bibliothèques (npm),
#   puis les raccourcis du Bureau et du menu Démarrer.
# - La copie installée n'est PAS reliée au dépôt GitHub d'origine pour les envois :
#   l'adresse d'origine est gardée sous le nom « officiel », en lecture seule.
param(
  [string]$Destination = (Join-Path $env:USERPROFILE 'Toolkit'),
  [switch]$SansRaccourcis,
  [switch]$NePasLancer,
  [switch]$SansQuestions # répond « non » à toutes les installations (tests)
)

$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $PSScriptRoot

function Titre($texte) { Write-Host ''; Write-Host "== $texte ==" -ForegroundColor Cyan }
function Ok($texte) { Write-Host "  [OK]       $texte" -ForegroundColor Green }
function Manque($texte) { Write-Host "  [MANQUANT] $texte" -ForegroundColor Yellow }
function Erreur($texte) { Write-Host ''; Write-Host $texte -ForegroundColor Red; exit 1 }

function Demander($question) {
  if ($SansQuestions) { return $false }
  $reponse = Read-Host "$question (O/N)"
  return $reponse -match '^\s*[oOyY]'
}

# Les programmes installés par winget ne sont visibles qu'après relecture du PATH.
function RelirePath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

# Version d'un programme, ou $null s'il est absent (ou s'il s'agit du faux raccourci du Microsoft Store).
function Version($commande, $motif) {
  if (-not (Get-Command $commande -ErrorAction SilentlyContinue)) { return $null }
  try {
    $sortie = (& $commande --version 2>&1 | Out-String).Trim()
    if ($sortie -match $motif) { return $Matches[0] }
  } catch { }
  return $null
}

function InstallerWinget($nom, $id) {
  Write-Host "  Installation de $nom (winget install $id)…"
  & winget install --id $id --exact --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { Write-Host "  L'installation de $nom a échoué (code $LASTEXITCODE)." -ForegroundColor Yellow }
  RelirePath
}

Write-Host 'Installation de Toolkit' -ForegroundColor Cyan
Write-Host "Dossier d'installation : $Destination"
Write-Host 'Tu peux fermer cette fenêtre à tout moment pour annuler.'

# --- 1. Logiciels nécessaires ----------------------------------------------------------------
Titre 'Logiciels nécessaires'
$winget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
if (-not $winget) {
  Write-Host "  winget (installateur de Windows) est introuvable : installe « App Installer » depuis le Microsoft Store, puis relance cet installateur. Sans lui, installe les logiciels manquants toi-même (liens ci-dessous)." -ForegroundColor Yellow
}

$logiciels = @(
  @{ Nom = 'Node.js 20 ou plus'; Commande = 'node'; Motif = 'v?(\d+)\.\d+\.\d+'; Id = 'OpenJS.NodeJS.LTS'; Obligatoire = $true; Role = 'fait tourner Toolkit'; Lien = 'https://nodejs.org' },
  @{ Nom = 'Git'; Commande = 'git'; Motif = '\d+\.\d+\.\d+'; Id = 'Git.Git'; Obligatoire = $true; Role = 'historique et sauvegarde des projets'; Lien = 'https://git-scm.com' },
  @{ Nom = 'GitHub CLI (gh)'; Commande = 'gh'; Motif = '\d+\.\d+\.\d+'; Id = 'GitHub.cli'; Obligatoire = $false; Role = 'envoyer ses projets sur GitHub'; Lien = 'https://cli.github.com' },
  @{ Nom = 'Python'; Commande = 'python'; Motif = 'Python 3\.\d+\.\d+'; Id = 'Python.Python.3.13'; Obligatoire = $false; Role = 'lancer les scripts Python'; Lien = 'https://www.python.org' }
)
foreach ($l in $logiciels) {
  $version = Version $l.Commande $l.Motif
  if ($version -and $l.Commande -eq 'node' -and [int](($version -replace '^v', '').Split('.')[0]) -lt 20) {
    Manque "$($l.Nom) : version $version trop ancienne"
    $version = $null
  }
  if ($version) { Ok "$($l.Nom) ($version)"; continue }
  if (-not $l.Obligatoire) { Manque "$($l.Nom) (facultatif : $($l.Role))" } else { Manque "$($l.Nom) ($($l.Role))" }
  if ($winget -and (Demander "    Installer $($l.Nom) maintenant ?")) {
    InstallerWinget $l.Nom $l.Id
    $version = Version $l.Commande $l.Motif
    if ($version) { Ok "$($l.Nom) ($version)" }
  }
  if (-not $version -and $l.Obligatoire) {
    Erreur "$($l.Nom) est nécessaire. Installe-le (winget install --id $($l.Id), ou $($l.Lien)), puis relance cet installateur."
  }
}

# Claude Code : installateur officiel d'Anthropic (chaque utilisateur se connecte avec SON compte).
$claude = Version 'claude' '\d+\.\d+\.\d+'
if ($claude) {
  Ok "Claude Code ($claude)"
} else {
  Manque "Claude Code (modifier et créer des outils avec Claude ; nécessite un compte Claude Pro ou Max)"
  if (Demander '    Installer Claude Code maintenant (installateur officiel claude.ai) ?') {
    Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
    RelirePath
    if (Version 'claude' '\d+\.\d+\.\d+') {
      Ok 'Claude Code installé. Pour te connecter : ouvre PowerShell, tape « claude » et suis les instructions.'
    }
  }
}

# --- 2. Copie de Toolkit ---------------------------------------------------------------------
Titre 'Installation de Toolkit'
$app = Join-Path $Destination 'app'
$dejaEnPlace = (Resolve-Path $source).Path.TrimEnd('\') -ieq [IO.Path]::GetFullPath($app).TrimEnd('\')
if ($dejaEnPlace) {
  Ok "Toolkit est déjà à sa place ($app)"
} else {
  if (Test-Path (Join-Path $app 'package.json')) {
    Erreur "Toolkit est déjà installé dans $Destination. Pour le réinstaller, déplace ou renomme d'abord ce dossier (tes projets sont dans $Destination\projets)."
  }
  New-Item -ItemType Directory -Force $app | Out-Null
  # Copie des sources (sans node_modules, réinstallé juste après).
  & robocopy $source $app /E /XD node_modules /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { Erreur "La copie des fichiers a échoué (robocopy, code $LASTEXITCODE)." }
  Ok "Fichiers copiés dans $app"
}
New-Item -ItemType Directory -Force (Join-Path $Destination 'projets'), (Join-Path $Destination 'donnees') | Out-Null

# Dépôt Git d'origine : gardé sous le nom « officiel » (pour lire les nouveautés), jamais
# utilisé pour envoyer. L'utilisateur peut créer SON dépôt depuis Toolkit (panneau Git).
if (Test-Path (Join-Path $app '.git')) {
  $remotes = & git -C $app remote
  if ($remotes -contains 'origin' -and $remotes -notcontains 'officiel') {
    & git -C $app remote rename origin officiel
    & git -C $app remote set-url --push officiel 'envoi-desactive'
    Ok 'Copie détachée du dépôt GitHub d''origine (gardé en lecture seule sous le nom « officiel »)'
  }
}

# --- 3. Bibliothèques --------------------------------------------------------------------------
Titre 'Bibliothèques (npm install, une à quelques minutes)'
Push-Location $app
try {
  & npm.cmd install --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { Erreur 'npm install a échoué : vérifie ta connexion Internet, puis relance cet installateur.' }
} finally {
  Pop-Location
}
$lanceur = Join-Path $Destination 'Lancer Toolkit.vbs'
if (-not (Test-Path $lanceur)) { Erreur 'Le lanceur « Lancer Toolkit.vbs » n''a pas été créé.' }
Ok 'Bibliothèques installées'

# --- 4. Raccourcis -----------------------------------------------------------------------------
if (-not $SansRaccourcis) {
  Titre 'Raccourcis'
  $shell = New-Object -ComObject WScript.Shell
  $emplacements = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('Programs')) ''))
  foreach ($dossier in $emplacements) {
    $raccourci = $shell.CreateShortcut((Join-Path $dossier 'Toolkit.lnk'))
    $raccourci.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
    $raccourci.Arguments = '"' + $lanceur + '"'
    $raccourci.WorkingDirectory = $Destination
    $raccourci.IconLocation = (Join-Path $app 'assets\icone.ico')
    $raccourci.Description = 'Toolkit'
    $raccourci.Save()
  }
  Ok 'Raccourci « Toolkit » sur le Bureau et dans le menu Démarrer'
}

Titre 'Terminé'
Write-Host "Toolkit est installé dans $Destination"
Write-Host 'Tes projets iront dans le dossier « projets ». Toolkit reste modifiable : demande à Claude'
Write-Host '(bouton « Modifier Toolkit avec Claude ») ou ouvre le dossier « app » dans ton éditeur.'
if (-not $NePasLancer -and (Demander 'Lancer Toolkit maintenant ?')) { Start-Process wscript.exe -ArgumentList ('"' + $lanceur + '"') }

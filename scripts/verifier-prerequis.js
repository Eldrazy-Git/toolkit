// Vérifie que les logiciels nécessaires à Toolkit sont installés et configurés.
// Usage : npm run verifier   (ou : node scripts/verifier-prerequis.js)
// Aucune dépendance : ce script doit fonctionner avant même « npm install ».
'use strict';

const { spawnSync } = require('node:child_process');

const VERSION_NODE_MINIMALE = 20;

function executer(commande) {
  const r = spawnSync(commande, { shell: true, encoding: 'utf8', timeout: 30000, windowsHide: true });
  return {
    ok: r.status === 0,
    sortie: `${r.stdout || ''}${r.stderr || ''}`.trim(),
  };
}

function premiereLigne(texte) {
  return texte.split(/\r?\n/)[0];
}

// Chaque vérification renvoie { ok, detail, solution }.
// « obligatoire: false » = utile pour certaines fonctions seulement.
const verifications = [
  {
    nom: 'Node.js',
    obligatoire: true,
    verifier() {
      const majeure = Number(process.versions.node.split('.')[0]);
      return {
        ok: majeure >= VERSION_NODE_MINIMALE,
        detail: `version ${process.version}`,
        solution: `Installe Node.js ${VERSION_NODE_MINIMALE} ou plus récent. Dans PowerShell :\n    winget install OpenJS.NodeJS.LTS`,
      };
    },
  },
  {
    nom: 'npm',
    obligatoire: true,
    verifier() {
      const r = executer('npm --version');
      return {
        ok: r.ok,
        detail: r.ok ? `version ${r.sortie}` : 'introuvable',
        solution: 'npm est fourni avec Node.js : réinstalle Node.js (voir ci-dessus).',
      };
    },
  },
  {
    nom: 'Git',
    obligatoire: true,
    verifier() {
      const r = executer('git --version');
      return {
        ok: r.ok,
        detail: r.ok ? premiereLigne(r.sortie) : 'introuvable',
        solution: 'Installe Git. Dans PowerShell :\n    winget install Git.Git\n  Puis ferme et rouvre le terminal.',
      };
    },
  },
  {
    nom: 'Identité Git (nom et e-mail des commits)',
    obligatoire: true,
    verifier() {
      const nom = executer('git config --global user.name');
      const email = executer('git config --global user.email');
      return {
        ok: nom.ok && email.ok && nom.sortie !== '' && email.sortie !== '',
        detail: nom.ok ? `${nom.sortie} <${email.sortie}>` : 'non configurée',
        solution: 'Dans PowerShell, remplace par tes informations :\n    git config --global user.name "Ton nom"\n    git config --global user.email "ton-email@exemple.fr"',
      };
    },
  },
  {
    nom: 'Claude Code (commande « claude »)',
    obligatoire: false,
    verifier() {
      const r = executer('claude --version');
      return {
        ok: r.ok,
        detail: r.ok ? premiereLigne(r.sortie) : 'introuvable (nécessaire seulement pour les fonctions Claude)',
        solution: 'Installe Claude Code. Dans PowerShell :\n    irm https://claude.ai/install.ps1 | iex\n  Puis tape « claude » une fois pour te connecter avec ton compte Claude (abonnement Pro, Max…).',
      };
    },
  },
  {
    nom: 'GitHub CLI (commande « gh »)',
    obligatoire: false,
    verifier() {
      const r = executer('gh --version');
      if (!r.ok) {
        return {
          ok: false,
          detail: 'introuvable (nécessaire seulement pour créer des repos GitHub)',
          solution: 'Installe GitHub CLI. Dans PowerShell :\n    winget install GitHub.cli\n  Puis connecte-toi :\n    gh auth login',
        };
      }
      const auth = executer('gh auth status');
      return {
        ok: auth.ok,
        detail: auth.ok ? `${premiereLigne(r.sortie)}, connecté` : `${premiereLigne(r.sortie)}, NON connecté`,
        solution: 'Connecte-toi à GitHub. Dans PowerShell :\n    gh auth login\n  Choisis : GitHub.com > HTTPS > Login with a web browser.',
      };
    },
  },
  {
    nom: 'Python',
    obligatoire: false,
    verifier() {
      const r = executer('python --version');
      const r2 = r.ok ? r : executer('py --version');
      return {
        ok: r2.ok,
        detail: r2.ok ? premiereLigne(r2.sortie) : 'introuvable (nécessaire seulement pour les scripts Python)',
        solution: 'Installe Python. Dans PowerShell :\n    winget install Python.Python.3.13',
      };
    },
  },
];

console.log('\nToolkit : vérification des prérequis\n');

let manqueObligatoire = false;
let manqueOptionnel = false;

for (const v of verifications) {
  const res = v.verifier();
  if (res.ok) {
    console.log(`  [OK]        ${v.nom} : ${res.detail}`);
    continue;
  }
  const etiquette = v.obligatoire ? '[MANQUANT] ' : '[ATTENTION]';
  console.log(`  ${etiquette} ${v.nom} : ${res.detail}`);
  console.log(`  -> ${res.solution}\n`);
  if (v.obligatoire) manqueObligatoire = true;
  else manqueOptionnel = true;
}

console.log('');
if (manqueObligatoire) {
  console.log('Il manque quelque chose d\'indispensable. Suis les instructions ci-dessus, puis relance : npm run verifier');
  process.exitCode = 1;
} else if (manqueOptionnel) {
  console.log('L\'essentiel est prêt. Certaines fonctions seront indisponibles tant que les éléments [ATTENTION] ne sont pas réglés.');
} else {
  console.log('Tout est prêt.');
}

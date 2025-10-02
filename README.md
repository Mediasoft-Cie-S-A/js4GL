# js4GL

Mini interpréteur JavaScript pour un sous-ensemble du langage OpenEdge/Progress 4GL.

## Tester dans le navigateur

Une page de démonstration est disponible dans [`index.html`](./index.html). Ouvrez-la dans un navigateur web moderne (ou servez le dossier via `npm start`, `npx serve` ou `python -m http.server`) pour profiter de :

- Un éditeur intégré avec un exemple de programme 4GL.
- Un bouton **Run** pour exécuter le code et afficher la sortie en direct.
- Un bouton **Save** pour télécharger le contenu courant de l'éditeur sous forme de fichier `.4gl`.
- Un bouton **Générer les données** pour réinitialiser la base SQLite de démonstration via l'API `/api/seed` (servie par `npm start`).
- Une sauvegarde automatique locale (LocalStorage) du dernier programme édité.


```bash
npm start
```

```bash
npx serve
```

```bash
python -m http.server
```


## Tests

Utilisez toujours la page [`index.html`](./index.html) comme base pour vos tests et vos vérifications manuelles. Elle charge automatiquement l'interpréteur (`mini4GL.js`) et propose l'interface interactive (éditeur, sortie, statut, etc.).

Pour automatiser des scénarios de test, servez simplement le dépôt (via `npm start`, `npx serve`, `python -m http.server`, ...) puis faites pointer vos outils vers `http://localhost:<port>/index.html`.

## Sauvegarder la base de démonstration

L'intégration Prisma s'appuie sur une base SQLite (`prisma/sport2000.db`). Pour en réaliser une sauvegarde ponctuelle, assurez-vous d'abord d'avoir installé les dépendances du projet (`npm install`) puis exécutez :

```bash
mkdir -p backups
sqlite3 prisma/sport2000.db ".backup 'backups/sport2000-$(date +%Y%m%d%H%M%S).db'"
```

La commande crée un répertoire `backups/` (s'il n'existe pas) et y stocke une copie horodatée de la base. Vous pouvez ensuite restaurer la sauvegarde souhaitée avec `sqlite3` si nécessaire.

### Configuration Prisma

Le fichier [`prisma/schema.prisma`](./prisma/schema.prisma) est configuré pour utiliser SQLite par défaut :

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./sport2000.db"
}
```

Le champ `provider` doit impérativement rester une chaîne de caractères littérale pour que `npx prisma generate` fonctionne (`Error code: P1012` dans le cas contraire). Si vous souhaitez utiliser un autre SGBD, remplacez simplement `"sqlite"` par le fournisseur approprié (`"postgresql"`, `"mysql"`, etc.) au lieu d'essayer de lister plusieurs options.

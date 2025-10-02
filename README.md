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


## Utilisation Node.js

```bash
node test.js
```

Le script lit un exemple de programme, l'exécute avec l'interpréteur et affiche les résultats dans la console.

## Sauvegarder la base de démonstration

L'intégration Prisma s'appuie sur une base SQLite (`prisma/sport2000.db`). Pour en réaliser une sauvegarde ponctuelle, assurez-vous d'abord d'avoir installé les dépendances du projet (`npm install`) puis exécutez :

```bash
mkdir -p backups
sqlite3 prisma/sport2000.db ".backup 'backups/sport2000-$(date +%Y%m%d%H%M%S).db'"
```

La commande crée un répertoire `backups/` (s'il n'existe pas) et y stocke une copie horodatée de la base. Vous pouvez ensuite restaurer la sauvegarde souhaitée avec `sqlite3` si nécessaire.

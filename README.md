# js4GL

Mini interpréteur JavaScript pour un sous-ensemble du langage OpenEdge/Progress 4GL.

## Tester dans le navigateur

Une page de démonstration est disponible dans [`index.html`](./index.html). Ouvrez-la dans un navigateur web moderne (ou servez le dossier via `npx serve` / `python -m http.server`) pour profiter de :

- Un éditeur intégré avec un exemple de programme 4GL.
- Un bouton **Run** pour exécuter le code et afficher la sortie en direct.
- Un bouton **Save** pour télécharger le contenu courant de l'éditeur sous forme de fichier `.4gl`.
- Une sauvegarde automatique locale (LocalStorage) du dernier programme édité.

## Utilisation Node.js

```bash
node test.js
```

Le script lit un exemple de programme, l'exécute avec l'interpréteur et affiche les résultats dans la console.

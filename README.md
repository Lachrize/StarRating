# StarRating - Plugin Jellyfin

StarRating ajoute des notes, commentaires, statistiques et exports/imports JSON/CSV dans Jellyfin.

## Installation

Dans Jellyfin : `Tableau de bord` -> `Plugins` -> `Depots` -> ajouter :

```text
https://raw.githubusercontent.com/Lachrize/StarRating/main/manifest.json
```

Si le catalogue affiche encore l'ancienne version, supprimer le depot, puis le rajouter.

Ensuite, installer `StarRating` **version 1.0.5** (ou plus recente) depuis le catalogue des plugins, puis redemarrer Jellyfin.

Le plugin charge automatiquement son interface web. Rien d'autre a copier.

## Ou sont stockees vos notes ?

Le **depot** Jellyfin sert uniquement a **installer ou mettre a jour** le plugin (fichiers du plugin). Il ne contient pas vos notes.

Vos notes et avis sont enregistres dans la base SQLite du serveur :

```text
<dossier de donnees Jellyfin>/starrating.db
```

Sur macOS, en general :

```text
~/Library/Application Support/jellyfin/data/starrating.db
```

**Supprimer puis rajouter le depot ne remet pas les notes a zero.** Pour repartir de zero :

1. Desinstaller le plugin StarRating dans Jellyfin.
2. Supprimer le fichier `starrating.db` (ou le renommer en sauvegarde).
3. Redemarrer Jellyfin, puis reinstaller le plugin depuis le depot.

Vous pouvez aussi exporter vos notes (onglet StarRating → Outils) avant toute suppression.

## Fonctions

- Noter films et series de 0.5 a 5 etoiles.
- Ajouter, modifier ou supprimer un commentaire.
- Voir la moyenne sur les fiches et les affiches.
- Retrouver tous ses medias notes dans l'onglet StarRating.
- Importer/exporter ses notes en JSON ou CSV.

## Developpement

Prerequis : SDK .NET 9 et Jellyfin 10.11+.

```bash
dotnet build -c Release
```

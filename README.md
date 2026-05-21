# StarRating - Plugin Jellyfin

StarRating ajoute des notes, commentaires, statistiques et exports/imports JSON/CSV dans Jellyfin.

## Installation

Dans Jellyfin : `Tableau de bord` -> `Plugins` -> `Depots` -> ajouter :

```text
https://raw.githubusercontent.com/Lachrize/StarRating/main/manifest.json
```

Ensuite, installer `StarRating` depuis le catalogue des plugins, puis redemarrer Jellyfin.

Le plugin charge automatiquement son interface web. Rien d'autre a copier.

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

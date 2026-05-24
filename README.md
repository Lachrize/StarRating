# StarRating - Plugin Jellyfin

StarRating ajoute des notes, commentaires, statistiques et exports/imports JSON/CSV dans Jellyfin.

[![Latest release](https://img.shields.io/github/v/release/Lachrize/StarRating?label=version)](https://github.com/Lachrize/StarRating/releases/latest)
[![Releases](https://img.shields.io/github/release-date/Lachrize/StarRating?label=dernière%20release)](https://github.com/Lachrize/StarRating/releases)

## Installation

Dans Jellyfin : `Tableau de bord` → `Plugins` → `Dépôts` → ajouter :

```text
https://raw.githubusercontent.com/Lachrize/StarRating/main/manifest.json
```

Puis installer **StarRating** depuis le catalogue des plugins et redémarrer Jellyfin.

Le plugin charge automatiquement son interface web. Rien d'autre à copier.

L'interface s'adapte aux variables de thème Jellyfin (compatible ElegantFin et autres CSS perso) et est responsive (mobile, tablette, TV, desktop).

## Désinstallation

Désinstaller depuis l'interface Jellyfin → redémarrer Jellyfin. Le plugin retire ses propres traces de l'interface web (`index.html`) au shutdown : il ne reste rien.

Vos notes restent dans `<dossier de données Jellyfin>/starrating.db`. Pour repartir de zéro : supprimer ce fichier après désinstallation.

## Fonctions

- Noter films et séries de 0,5 à 5 étoiles (demi-étoiles).
- Ajouter, modifier ou supprimer un avis (texte facultatif).
- Voir la moyenne sur les fiches et badges sur les affiches.
- Onglet StarRating regroupant tous les médias notés (filtres, statistiques, tri).
- Importer/exporter ses notes en JSON ou CSV.

## Versions et release notes

Voir [Releases sur GitHub](https://github.com/Lachrize/StarRating/releases) ou [CHANGELOG.md](CHANGELOG.md).

## Développement

Prérequis : SDK .NET 9 et Jellyfin 10.11+.

### Build local

```bash
dotnet build -c Release
```

### Publier une nouvelle release

```bash
./scripts/release.sh 1.0.8
```

Le script :
1. Bumpe la version dans `StarRating.csproj` et `Services/WebAssetInjectionService.cs`.
2. Promeut la section `## [Unreleased]` du `CHANGELOG.md` en `## [1.0.8] - DATE`.
3. Commit, tag `v1.0.8`, et push.
4. Le push du tag déclenche [le workflow GitHub Actions](.github/workflows/release.yml) qui :
   - builde le plugin,
   - crée la GitHub Release avec le `.zip` attaché,
   - met à jour `manifest.json` pour pointer vers la nouvelle release.

Avant de release, ajouter les notes sous `## [Unreleased]` dans `CHANGELOG.md`.

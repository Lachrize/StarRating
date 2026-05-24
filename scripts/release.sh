#!/usr/bin/env bash
#
# Bump version, met à jour CHANGELOG.md, commit, tag, push.
# Le push du tag déclenche le workflow GitHub Actions qui builde + publie la release.
#
# Usage : ./scripts/release.sh <version>
#   ex : ./scripts/release.sh 1.0.8

set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo "Usage : $0 <version> (ex: 1.0.8)" >&2
    exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Erreur : version invalide '$VERSION' (attendu : X.Y.Z)" >&2
    exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── Vérifs préalables ────────────────────────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
    echo "Erreur : working tree pas propre. Commit ou stash d'abord." >&2
    git status --short
    exit 1
fi

if git rev-parse "v$VERSION" >/dev/null 2>&1; then
    echo "Erreur : le tag v$VERSION existe déjà." >&2
    exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "⚠️  Tu n'es pas sur main (branche actuelle : $CURRENT_BRANCH)." >&2
    read -p "Continuer quand même ? [y/N] " ANSWER
    [ "$ANSWER" = "y" ] || exit 1
fi

# ── Vérifie qu'une section CHANGELOG existe pour cette version ───────────────
if ! grep -q "^## \[$VERSION\]" CHANGELOG.md; then
    echo ""
    echo "⚠️  Aucune section '## [$VERSION]' trouvée dans CHANGELOG.md."
    echo "    Le contenu de '## [Unreleased]' va être promu en '## [$VERSION] - $(date +%Y-%m-%d)'."
    read -p "OK ? [y/N] " ANSWER
    [ "$ANSWER" = "y" ] || exit 1

    # Remplace '## [Unreleased]' par '## [VERSION] - DATE' et ajoute un nouveau Unreleased vide
    DATE=$(date +%Y-%m-%d)
    python3 - <<PY
import pathlib
path = pathlib.Path('CHANGELOG.md')
content = path.read_text()
new_header = f"## [Unreleased]\n\n## [$VERSION] - $DATE"
content = content.replace("## [Unreleased]", new_header, 1)
path.write_text(content)
PY
fi

# ── Met à jour la version dans StarRating.csproj ─────────────────────────────
sed -i.bak "s|<AssemblyVersion>.*</AssemblyVersion>|<AssemblyVersion>${VERSION}.0</AssemblyVersion>|" StarRating.csproj
sed -i.bak "s|<FileVersion>.*</FileVersion>|<FileVersion>${VERSION}.0</FileVersion>|" StarRating.csproj
rm -f StarRating.csproj.bak

# ── Met à jour la version dans WebAssetInjectionService.cs (cache-busting) ───
sed -i.bak "s|private const string AssetVersion = \".*\";|private const string AssetVersion = \"${VERSION}\";|" Services/WebAssetInjectionService.cs
rm -f Services/WebAssetInjectionService.cs.bak

# ── Commit, tag, push ────────────────────────────────────────────────────────
echo ""
echo "→ Version bumpée à $VERSION dans :"
echo "    StarRating.csproj"
echo "    Services/WebAssetInjectionService.cs"
echo "    CHANGELOG.md"
echo ""

git diff --stat
echo ""
read -p "Commit + tag + push ? [y/N] " ANSWER
[ "$ANSWER" = "y" ] || { echo "Abandonné. Modifications laissées en place."; exit 0; }

git add StarRating.csproj Services/WebAssetInjectionService.cs CHANGELOG.md
git commit -m "Release ${VERSION}"
git tag -a "v${VERSION}" -m "Release ${VERSION}"
git push origin "$CURRENT_BRANCH"
git push origin "v${VERSION}"

echo ""
echo "✅ Release v${VERSION} pushée."
echo "   → Suivre le workflow : https://github.com/Lachrize/StarRating/actions"
echo "   → La GitHub Release apparaîtra après build."

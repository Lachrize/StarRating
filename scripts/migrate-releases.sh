#!/usr/bin/env bash
#
# Migration des anciens .zip de dist/ vers GitHub Releases.
#
# Prérequis : `gh` CLI installé et authentifié (`brew install gh && gh auth login`).
#
# Action :
#   1. Pour chaque dist/StarRating_X.Y.Z.zip :
#      - Crée un tag git vX.Y.Z sur le commit "Release X.Y.Z" (ou HEAD si introuvable).
#      - Crée une GitHub Release vX.Y.Z avec le zip attaché.
#      - Récupère le changelog depuis CHANGELOG.md si présent.
#   2. Met à jour manifest.json pour pointer sur les nouvelles URLs GitHub Releases.
#   3. Affiche ce qui reste à faire (supprimer dist/*.zip, commit, push).
#
# Usage : ./scripts/migrate-releases.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
    echo "Erreur : gh CLI manquant. Installe avec 'brew install gh' puis 'gh auth login'." >&2
    exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
    echo "Erreur : non authentifié. Lance 'gh auth login'." >&2
    exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "→ Repo cible : $REPO"

echo ""
echo "Versions trouvées dans dist/ :"
ls dist/StarRating_*.zip 2>/dev/null | sort -V || { echo "Aucun zip dans dist/"; exit 0; }
echo ""
read -p "Créer une GitHub Release par version ? [y/N] " ANSWER
[ "$ANSWER" = "y" ] || exit 0

for ZIP in $(ls dist/StarRating_*.zip 2>/dev/null | sort -V); do
    VERSION=$(basename "$ZIP" .zip | sed 's/^StarRating_//')
    TAG="v$VERSION"

    echo ""
    echo "── $TAG ──────────────────────────────────"

    # Skip si la release existe déjà
    if gh release view "$TAG" >/dev/null 2>&1; then
        echo "✓ Release $TAG existe déjà, skip."
        continue
    fi

    # Trouve le commit "Release X.Y.Z" ou "Initial StarRating plugin release"
    if [ "$VERSION" = "1.0.0" ]; then
        COMMIT=$(git log --pretty=%H --grep="Initial StarRating plugin release" -n 1 || echo "")
    else
        COMMIT=$(git log --pretty=%H --grep="^Release $VERSION" -n 1 || echo "")
    fi
    [ -z "$COMMIT" ] && COMMIT=$(git rev-list --max-parents=0 HEAD)

    # Crée le tag s'il n'existe pas
    if ! git rev-parse "$TAG" >/dev/null 2>&1; then
        git tag -a "$TAG" "$COMMIT" -m "Release $VERSION"
        git push origin "$TAG"
        echo "  Tag $TAG créé sur $COMMIT"
    fi

    # Extrait le changelog
    CHANGELOG=""
    if [ -f CHANGELOG.md ]; then
        CHANGELOG=$(awk -v v="$VERSION" '
            $0 ~ "^## \\["v"\\]" {flag=1; next}
            flag && /^## \[/ {flag=0}
            flag {print}
        ' CHANGELOG.md | sed '/^$/N;/\n$/D')
    fi
    [ -z "$CHANGELOG" ] && CHANGELOG="Release $VERSION"

    CHECKSUM=$(md5 -q "$ZIP" 2>/dev/null || md5sum "$ZIP" | awk '{print $1}')

    BODY=$(cat <<EOF
$CHANGELOG

---
**MD5** : \`$CHECKSUM\`
EOF
)

    gh release create "$TAG" "$ZIP" \
        --repo "$REPO" \
        --title "StarRating $VERSION" \
        --notes "$BODY"

    echo "  ✓ Release $TAG publiée."
done

echo ""
echo "── Mise à jour de manifest.json ──"
python3 - <<PY
import json, hashlib, pathlib, os

repo = os.environ.get('GH_REPO') or "$REPO"
path = pathlib.Path('manifest.json')
data = json.loads(path.read_text())
entry = data[0] if isinstance(data, list) else data
versions = entry.get('versions', [])

# Réécrit chaque sourceUrl pour pointer sur GitHub Releases
for v in versions:
    ver = v['version']
    tag = f"v{ver}"
    v['sourceUrl'] = f"https://github.com/{repo}/releases/download/{tag}/StarRating_{ver}.zip"

path.write_text(json.dumps(data, indent=2) + "\n")
print("manifest.json mis à jour.")
PY

echo ""
echo "✅ Migration terminée."
echo ""
echo "Prochaines étapes (manuelles) :"
echo "  1. git rm dist/StarRating_*.zip dist/staging_*    # libère le repo"
echo "  2. git add manifest.json CHANGELOG.md"
echo "  3. git commit -m 'Migrate releases to GitHub Releases'"
echo "  4. git push"

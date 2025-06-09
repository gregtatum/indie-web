#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node --print "require('./src/server/package.json').version")
IMAGE="tatumcreative/floppy-disk.link"
TAG="v$VERSION"
IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION"

# Check if tag already exists on origin
if git ls-remote --tags origin | grep -q "refs/tags/$TAG$"; then
  echo "Git tag $TAG already exists on origin."
else
  echo "Git tag $TAG does not exist on origin."

  # Get the current commit and the origin/main commit
  CURRENT_COMMIT=$(git rev-parse HEAD)
  MAIN_COMMIT=$(git rev-parse origin/main)

  if [[ "$CURRENT_COMMIT" == "$MAIN_COMMIT" ]]; then
    echo "Current commit matches origin/main. Tagging and pushing $TAG..."
    git tag -a "$TAG" -m "Release version $VERSION"
    git push origin "$TAG"
  else
    echo "Error: Current commit does not match origin/main. Refusing to tag." >&2
    exit 1
  fi
fi

echo "Building image: $IMAGE:$VERSION"

# Add --progress=plain to debug.
docker build \
  --file src/server/docker/Dockerfile.prod \
  --tag "$IMAGE:$VERSION" \
  --build-arg VERSION="$VERSION" \
  --build-arg TAG="$TAG" \
  .

# # Apply tag aliases
docker tag "$IMAGE:$VERSION" "$IMAGE:$MAJOR.$MINOR"
docker tag "$IMAGE:$VERSION" "$IMAGE:$MAJOR"
docker tag "$IMAGE:$VERSION" "$IMAGE:latest"

echo "Pushing Docker tags..."
docker push "$IMAGE:$VERSION"
docker push "$IMAGE:$MAJOR.$MINOR"
docker push "$IMAGE:$MAJOR"
docker push "$IMAGE:latest"

echo "Published:"
echo "  $IMAGE:$VERSION"
echo "  $IMAGE:$MAJOR.$MINOR"
echo "  $IMAGE:$MAJOR"
echo "  $IMAGE:latest"

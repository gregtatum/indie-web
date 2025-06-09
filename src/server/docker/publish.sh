#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node --print "require('./src/server/package.json').version")
IMAGE="gregtatum/floppy-disk"

echo "Building image: $IMAGE:$VERSION"

docker build --file src/server/docker/Dockerfile.prod --tag "$IMAGE:$VERSION" . --progress=plain
# docker tag "$IMAGE:$VERSION" "$IMAGE:latest"

# echo "Pushing tags to Docker Hub..."
# docker push "$IMAGE:$VERSION"
# docker push "$IMAGE:latest"

# echo "Published $IMAGE:$VERSION and :latest"

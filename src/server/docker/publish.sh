#!/usr/bin/env bash
set -euo pipefail

node ./src/server/docker/publish.mjs "$@"

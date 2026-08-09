# Indie Web Server

This server exposes local files to the browser app through `/file-store` and
music-library routes through `/music`.

## Local Development

Run the server directly from the repo:

```shell
task start-server
```

By default the server listens on port `6543` and serves the repo's `mount`
folder. Set `PORT` or `MOUNT_PATH` to override those defaults.

## Docker

For local Docker development, run:

```shell
task docker-server
```

This builds `src/server/docker/Dockerfile.dev`, live-mounts `src/`, keeps
container `node_modules` isolated, and serves the repo's `mount` folder at
`/app/mount`.

For a deployed server, use the published image in a `docker-compose.yml`:

```yaml
services:
  floppydisk:
    image: tatumcreative/floppydisk.link:latest
    container_name: floppydisk
    restart: unless-stopped
    ports:
      - "6543:6543"
    volumes:
      - ./mount:/app/mount
```

Start it with:

```shell
docker compose up --detach
```

The host path on the left side of the volume is the folder to serve. The
container path on the right must be `/app/mount` unless `MOUNT_PATH` is set.

## Publishing The Docker Image

Use the Taskfile entrypoint:

```shell
task docker-publish -- patch --dry-run
task docker-publish -- patch
task docker-publish -- minor
task docker-publish -- major
```

The positional argument controls the next server version from
`src/server/package.json`:

- `patch`: `1.2.3` becomes `1.2.4`
- `minor`: `1.2.3` becomes `1.3.0`
- `major`: `1.2.3` becomes `2.0.0`

The publish command requires:

- Docker is running and authenticated for `tatumcreative/floppydisk.link`.
- The current branch is `main`.
- The working tree is clean, including untracked files.
- Local `main` matches `origin/main`.
- The target git tag does not already exist locally or on `origin`.

`--dry-run` performs validation and prints the planned version, git tag, Docker
tags, and commands. It does not edit files, commit, tag, build, or push.

A real publish:

1. Bumps `src/server/package.json` and `src/server/package-lock.json`.
2. Commits the bump as `Release server vX.Y.Z`.
3. Builds and pushes a multi-platform (`linux/amd64`, `linux/arm64`) image
   from `src/server/docker/Dockerfile.prod`, tagged `X.Y.Z`, `X.Y`, `X`, and
   `latest`.
4. Creates annotated git tag `vX.Y.Z`.
5. Pushes `main` and pushes the git tag.

Because multi-platform images can't be built locally without pushing, the
Docker build+push happens before the git tag and push. If it fails, fix the
problem and rerun the same publish command. Nothing has been pushed to git
yet, and re-pushing the same Docker tags is safe. If a step after that fails
(git tag or push), rerun the command after confirming local state matches the
intended release, following the recovery instructions the command prints.

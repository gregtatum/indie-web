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

For a deployed server, use the published `tatumcreative/floppydisk.link`
image. See [`docker/example/README.md`](./docker/example/README.md) for a
`docker-compose.yml` to copy, including notes on running it on a Synology NAS
and tunneling it privately with Tailscale.

## Publishing The Docker Image

```shell
task docker-publish -- patch --dry-run
task docker-publish -- patch
```

Bumps the server version, builds and pushes a multi-platform Docker image to
Docker Hub, and tags the release in git. Failed publishes are safe to retry.

Before publishing, add an entry under `## [Unreleased]` in
[`CHANGELOG.md`](./CHANGELOG.md) — publishing refuses to run otherwise.

Run `task docker-publish -- --help` for the full set of flags.

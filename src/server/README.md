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

It builds and pushes a multi-platform (`linux/amd64`, `linux/arm64`) image to
Docker Hub, tagged `X.Y.Z`, `X.Y`, `X`, and `latest`, then commits, tags, and
pushes the release in git. This requires Docker (with `buildx`) and a clean,
`main`-synced working tree.

`--dry-run` prints the planned version, git tag, Docker tags, and commands
without changing anything.

If a publish fails partway, just fix the problem and rerun the exact same
command — it detects an unfinished release and resumes it rather than
bumping the version again. See `src/server/docker/publish.mjs` for exactly
what it checks and what counts as "unfinished."

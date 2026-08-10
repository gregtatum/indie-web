# Changelog

All notable changes to the Indie Web Server are documented here. The npm
package (`@tatumcreative/indie-web`) and its Docker image share one version number
and are published together — see
[Publishing The Docker Image](./README.md#publishing-the-docker-image).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Multi-platform Docker builds (`linux/amd64`, `linux/arm64`) via `docker buildx`.
- Support for publishing through [colima](https://github.com/abiosoft/colima)
  as a lighter-weight alternative to Docker Desktop. `task docker-publish`
  detects it and prints setup steps when Docker isn't available.
- A resumable publish flow: a failed release can be safely rerun and picks up
  where it left off instead of bumping the version again.
- Colored, easier-to-read `--dry-run` output.

### Fixed

- A music library scan no longer crashes the whole server when it hits a
  corrupt or malformed audio file. `music-metadata`/`strtok3` can throw from
  a detached background read that escapes the per-file error handling; a
  crash guard installed only for the duration of a scan now catches this
  instead of taking down every connected client.

## [2.0.0] - 2026-06-12

### Fixed

- Re-published as v2.0.0 after v1.0.0's Docker image failed to push.

## [1.0.0] - 2026-06-12

### Added

- First tagged release of the server, including a `docker-publish` command
  for building and pushing the Docker image.

## [0.0.1] - 2025-06-09

### Added

- Initial Docker support for running the server in a container.

[unreleased]: https://github.com/gregtatum/indie-web/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/gregtatum/indie-web/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/gregtatum/indie-web/compare/v0.0.1...v1.0.0
[0.0.1]: https://github.com/gregtatum/indie-web/releases/tag/v0.0.1

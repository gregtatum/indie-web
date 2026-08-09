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

### Changed

- The published Docker image is now only tagged `X.Y.Z` and `latest`,
  dropping the `X` and `X.Y` floating tags. Nothing referenced them, and
  they conflicted with marking exact version tags immutable on Docker Hub.

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

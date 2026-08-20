# Changelog

All notable changes to the Indie Web Server are documented here. The npm
package (`@tatumcreative/indie-web`) and its Docker image share one version number
and are published together — see
[Publishing The Docker Image](./README.md#publishing-the-docker-image).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- A "Show in Finder" option on tracks that reveals the file in the server's
  native file manager (Finder, Explorer, ...) when running locally.
- The music and file-store API roots now report a `maxMusicIndexVersion` and
  `revealLabel` respectively, so the client can detect what the connected
  server supports.

### Changed

- Track listings are now sorted after a scan instead of left in scan order.
- Tag values are resolved across a file's embedded tag blocks instead of
  only the primary one, so a value present in one block but missing from
  another is no longer treated as absent.
- Legacy tag fields are migrated into ID3v2.3 on write.
- The trailing ID3v1 tag is regenerated from the file's post-write ID3v2.3
  fields on every track-tag write, instead of going stale and later
  resurrecting a cleared ID3v2.3 field via the format-priority fallback.
- Renamed `TrackTagsResponse.native` to `blocks` to describe what the field
  holds without leaning on `music-metadata`'s internal naming.

### Fixed

- Non-numeric track/disc/year/BPM values are now rejected instead of being
  silently written into the tag.

## [3.5.0] - 2026-08-10

### Added

- `task docker-image-size` to build the production Docker image and report
  its size, for measuring the impact of image-size changes.

### Changed

- Shrunk the production Docker image (~1.7GB to ~255MB) by switching to a
  multi-stage `node:24-alpine` build that installs only production
  dependencies (`npm ci --omit=dev`), instead of the full `node:24` image
  with its build toolchain.
- Added a root `.dockerignore` so local build artifacts like `node_modules`
  no longer leak into the image alongside the ones installed by `npm ci`.

### Fixed

- A throttled `/music-index/scan` progress stream could still write an event
  to the response after the scan had already finished and the response
  ended; the stream now stops sending once the scan is done.

## [3.4.0] - 2026-08-09

### Fixed

- A music library scan no longer crashes the whole server when it hits a
  corrupt or malformed audio file. `music-metadata`/`strtok3` can throw from
  a detached background read that escapes the per-file error handling; a
  crash guard installed only for the duration of a scan now catches this
  instead of taking down every connected client.

## [3.0.0] - 2026-08-09

### Added

- Multi-platform Docker builds (`linux/amd64`, `linux/arm64`) via `docker buildx`.
- Support for publishing through [colima](https://github.com/abiosoft/colima)
  as a lighter-weight alternative to Docker Desktop. `task docker-publish`
  detects it and prints setup steps when Docker isn't available.
- A resumable publish flow: a failed release can be safely rerun and picks up
  where it left off instead of bumping the version again.
- Colored, easier-to-read `--dry-run` output.

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

[unreleased]: https://github.com/gregtatum/indie-web/compare/v3.5.0...HEAD
[3.5.0]: https://github.com/gregtatum/indie-web/compare/v3.4.0...v3.5.0
[3.5.0]: https://github.com/gregtatum/indie-web/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/gregtatum/indie-web/compare/v3.0.0...v3.4.0
[3.0.0]: https://github.com/gregtatum/indie-web/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/gregtatum/indie-web/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/gregtatum/indie-web/compare/v0.0.1...v1.0.0
[0.0.1]: https://github.com/gregtatum/indie-web/releases/tag/v0.0.1

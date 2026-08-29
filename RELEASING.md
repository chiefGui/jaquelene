# Releasing Jaquelene

Stable releases are prepared by Release Please and published through GitHub Actions. They are intentionally separate from ordinary merges to `main`.

## Prepare a release

Use plain-language Conventional Commit titles for pull requests. Because this repository uses squash merges, the pull request title becomes the commit Release Please evaluates.

- `fix(scope): description` requests a patch release.
- `feat(scope): description` requests a minor release.
- `type(scope)!: description`, `type!: description`, or a `BREAKING CHANGE` footer requests a breaking release. Before `1.0.0`, breaking releases increment the minor version.
- `docs`, `refactor`, `test`, `build`, `ci`, `chore`, and `style` changes do not request releases by themselves and stay out of the public changelog.

After a releasable change reaches `main`, Release Please opens or updates one Release PR. Review its version and changelog, then merge it only when that version is ready to publish.

## Publish a release

Merging the Release PR creates a `v<version>` tag and a draft GitHub Release. The **Release: Stable** workflow checks out that tag, builds and verifies the Windows x64 package, uploads the installer, block map, and update metadata, then publishes the draft as the latest release.

If packaging or upload fails, the release remains a draft. Fix the cause, then run **Release: Stable** manually with the existing draft tag to retry publication from the same tagged source.

The current Windows artifacts are unsigned. Signing and automatic updates are separate release milestones.

## Repository setup

GitHub Actions must be allowed to create pull requests under **Settings → Actions → General → Workflow permissions**. The workflow uses the repository-scoped `GITHUB_TOKEN`; no personal access token is required.

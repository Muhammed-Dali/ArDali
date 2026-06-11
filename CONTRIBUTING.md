# Contributing to ArDali WebMedia

Thank you for helping improve ArDali WebMedia. This project combines a React frontend, a Tauri/Rust desktop core, native audio, WebKit web platforms, and a projectM visualizer, so small focused changes are easiest to review.

## Ways to Contribute

- Report bugs with clear reproduction steps.
- Suggest features or UX improvements.
- Improve documentation, translations, packaging, or accessibility.
- Fix issues in the React UI, Rust/Tauri commands, WebKit integration, native audio, or projectM visualizer.

## Development Setup

Install the usual Tauri Linux dependencies, Node.js/npm, Rust, CMake, and a C++ compiler.

```bash
git clone https://github.com/Muhammed-Dali/ArDali.git
cd ArDali
npm install
npm run tauri:dev
```

Useful checks:

```bash
npm run frontend:build
npm run check:rust
```

Native projectM visualizer changes may also need:

```bash
npm run visualizer:build
```

## Branch and Pull Request Flow

Use a branch name that describes the work:

```bash
git checkout -b fix/web-platform-loading
```

Before opening a pull request:

- Keep the change focused.
- Avoid unrelated formatting or refactors.
- Run the relevant checks.
- Update docs or translations if user-facing behavior changed.
- Add screenshots or short screen recordings for UI changes when useful.

Pull requests should target `main`. Maintainers may request changes before merge.

## Code Style

- Follow existing React, TypeScript, Rust, and CSS patterns in the repo.
- Prefer existing helpers and project structure over new abstractions.
- Keep comments short and useful.
- Do not commit generated build output unless the repo already tracks that generated file.
- Do not commit local secrets, API keys, tokens, AppImages, or downloaded release assets.

## Areas That Need Extra Care

Web platform changes:

- Test YouTube and YouTube Music when possible.
- Check loading, reload/retry behavior, and WebKit error reporting.
- Avoid weakening plugin isolation or exposing Tauri APIs to web content.

projectM changes:

- Verify the native visualizer starts from development and packaged builds.
- Check resource paths and executable permissions on Linux.
- Confirm presets are found.

Audio changes:

- Test local playback start, pause, seek, volume, and DSP state.
- Avoid clipping or sudden volume jumps.

Packaging changes:

- Keep `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and lockfiles in sync when bumping versions.
- For AUR `ardali-bin`, update `pkgver`, `.SRCINFO`, and the AppImage checksum from the GitHub release asset.

## Reporting Security Issues

Please do not open a public issue for secrets, token exposure, plugin sandbox bypasses, or arbitrary command execution problems. Contact the maintainer privately first.


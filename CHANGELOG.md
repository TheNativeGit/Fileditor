# Changelog

All notable changes to **Fileditor** will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2026-11-26

### Fixed
- **Markdown Bidirectional Line Sync**: Preserved exact original editor line numbers (`data-line` / heading anchors) when a Markdown document starts with a YAML frontmatter block (`--- ... ---`), eliminating line-highlighting and click-to-jump offsets in both directions.

## [1.0.2] - 2026-11-26

### Fixed
- **Software-Updates Window & Footer Layout**: Converted the update dialog into a dedicated native desktop window (consistent with *About Fileditor* and *Settings*) and fixed the footer layout so the startup reminder checkbox and action buttons wrap cleanly without clipping.

## [1.0.1] - 2026-11-26

### Changed
- **First-Run Welcome Experience**: Removed localized sample files (`Beispiel.json`, `Beispiel.xml`, `Beispiel.md`) and replaced them with a single English `Welcome.md` (*"Thanks for Downloading Fileditor!"* + latest changelog highlights) shown **only on the very first launch**.

### Documentation
- Added the **SignPath Foundation** open-source code signing attribution and Code Signing Policy to `README.md` and `SECURITY.md`.

## [1.0.0] - 2026-11-26

### Added
- **Visual JSON & XML Workspace**: Interactive Miller Columns, Tree View, and Table View with live two-way synchronization and Monaco code editing.
- **Multi-Schema Validation Engine**:
  - JSON Schema **Draft-04**, **Draft-06**, **Draft-07**, **Draft 2019-09**, **Draft 2020-12**, and **JSON Type Definition (JTD / RFC 8927)** with automatic `$schema` detection, resizable Schema panel, and drag-and-drop schema loading.
  - Native Rust XML validation for **W3C XSD 1.0 / 1.1**, **DTD** (external & inline `<!DOCTYPE>`), **RelaxNG XML (`.rng`)**, and **ISO Schematron (`.sch`)**.
- **Markdown Live Preview & Vector PDF Export**: Bidirectional scroll/line sync, Docusaurus callouts (`:::tip`, `:::info`, `:::warning`, `:::danger`, `<details>`), LaTeX math symbols, Discord/custom date badges, fullscreen reader mode with Table of Contents, and selectable vector PDF export.
- **Structured ToDo Workspaces (`.todo`)**: Multi-list notebooks, hierarchical subtasks, priority indicators, `#HASHTAG` color filtering, and interactive file links.
- **2D Document Graph View**: Force-directed knowledge graph visualizing open documents, orbiting ToDo sub-lists, and cross-file links.
- **App-Wide Drag & Drop & Multi-Window Tab Support**: Open any supported file type directly by dragging it onto the application window, reorder or tear off tabs across windows, and restore open sessions cleanly.
- **Built-in Cryptographic Auto-Updater & Offline Changelog**: Check for new GitHub releases, read formatted release notes directly inside Fileditor, skip specific versions, or view the bundled changelog offline.
- **100% Offline & Privacy-First Architecture**: Locally bundled fonts and Monaco Editor workers with strict Content Security Policy (CSP), DOMPurify HTML sanitization, and zero telemetry or external CDN requests.

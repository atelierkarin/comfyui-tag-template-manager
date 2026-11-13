# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-13

### Added

- Import and export individual template JSON files in the editor, with validation and an option to import under a new ID when an ID already exists.
- Backups before template updates and deletions, and an editor action to restore a selected backup.
- Detection of conflicting editor changes, with options to reload the saved version or save a draft as a new template.
- Snapshot mode to save a template and its selection in a workflow independently of later library changes.

### Changed

- Report invalid template files while continuing to list valid templates.
- Preserve Live mode for existing workflows and allow switching between Live and Snapshot modes.
- The previous unversioned template update and delete API endpoints now require clients to use the revision-aware editor API.

### Known limitations

- Only ComfyUI's single-user mode is supported.
- Backups are not automatically removed, and external file edits cannot be protected against all concurrent changes.
- Editor import/export is limited to 1 MiB per file; copy the library directory to move larger templates.
- Snapshot workflows contain template contents and cannot be used by older versions of the plugin.
- Exclusion and deduplication are limited to safely handled plain tags; complex prompt expressions are not interpreted.

## [0.1.0] - 2026-11-13

### Added

- `Tag Template` node for selecting templates, presets, and individual blocks, with bundle and positive/negative string outputs.
- `Tag Main` node for combining up to eight template bundles with free text, optional deduplication, temporary tag exclusion, and a manually refreshed preview.
- Template library editor for creating, editing, duplicating, searching, and deleting templates, blocks, and presets.
- Channel-specific exclusive groups and independent block selections for each node instance.
- Local JSON storage, validation, and restoration of node selections from workflows.
- Live template loading, output whitespace normalization, and errors for missing or invalid templates.
- Japanese and English documentation.

### Known limitations

- Only ComfyUI's single-user mode is supported. Snapshot mode and import/export through the editor are not yet available.
- Concurrent edits to the same template are not detected.
- Exclusion and deduplication are limited to safely handled plain tags; complex prompt expressions are not interpreted.

[0.2.0]: https://github.com/atelierkarin/comfyui-tag-template-manager/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/atelierkarin/comfyui-tag-template-manager/releases/tag/v0.1.0

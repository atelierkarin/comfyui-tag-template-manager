# Development guide

For the latest handoff and candidate next-phase work, see [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).

## Project

ComfyUI custom node with a Python backend and JavaScript frontend. Python 3.10+ is required; ComfyUI supplies `aiohttp` for the HTTP API. The core services use the standard library. ComfyUI 0.22.0 and Python 3.13 have been used for integration testing.

- `__init__.py`: ComfyUI node and web-extension registration.
- `nodes.py`: `Tag Template`, `Tag Template Bundler`, and single-channel text and encoding `Tag Main` node definitions.
- `services/schema.py`: schema validation and IDs; `template_store.py`: per-template JSON storage; `prompt_builder.py`: selection and prompt composition; `node_service.py`: node state and shared operations.
- `api/routes.py`: template CRUD and preview routes.
- `web/index.js`: node controls and preview; `web/editor.js`: editor; `web/state.mjs` and `web/editor-state.mjs`: state helpers.
- `tests/`: Python unit tests and Node.js tests, including lightweight DOM simulations.
- `docs/`: original design documents and implementation plans. They record earlier decisions and may describe behavior that has since changed; verify current code and user-facing documentation when they differ.

## Run checks

From the repository root, using a Python environment with ComfyUI's dependencies installed:

```bash
python -m unittest discover -s tests -v
node tests/test_state.mjs
node tests/test_editor.mjs
node tests/test_editor_ui.mjs
node tests/test_template_ui.mjs
```

On Windows portable installations, use the ComfyUI `python_embeded/python.exe` instead of `python` if needed. Node.js is needed only for JavaScript tests. The DOM simulations do not replace a browser check: for UI changes, verify node creation, editor interactions, workflow save/reload, and preview in the target ComfyUI version when available. Report unverified manual checks.

## Release preparation

1. Check the release branch against `main`, its working tree, existing tags and open PRs. Review the change and record breaking changes and any manual checks that remain unverified.
2. Align `pyproject.toml` and `CHANGELOG.md` with the release version and release date. Keep the Japanese and English READMEs consistent with the shipped behavior and document any workflow migration.
3. Run all checks above on the release commit. Verify the target ComfyUI environment when available; do not modify an installed node or user data without authorization.
4. Commit the release preparation, push the branch, and open a PR against `main` with a summary, migration notes, and test results. Do not merge without authorization.
5. Create the requested `vX.Y.Z` tag on the intended release commit only after its contents are final; check that the tag does not already exist locally or remotely, then push it. A tag pushed on the release branch points to that commit, which may not be the eventual merge commit. Do not move or overwrite an existing release tag.
6. The `Release tests` workflow runs on `vX.Y.Z` tag pushes and can also be run manually. Check all Python and JavaScript jobs on the tag and report results or any inability to verify them. Creating a tag does not itself publish a GitHub Release; do that only when requested.

## Implementation constraints

- Keep core services independent of a running ComfyUI process and retain single-user mode checks for nodes and API routes. Do not assume multi-user isolation is implemented.
- Store templates under the configured ComfyUI user directory via the existing store; never write user data into the plugin installation directory. Preserve validation, path checks, atomic replacement, and create-without-overwrite behavior.
- Preserve template, block, and preset IDs and the versioned serialized node state. Keep existing node type identifiers and output ordering compatible with saved workflows unless a migration is explicitly designed.
- Keep selection independent per node. Exclusive groups apply separately to each channel. When reconciling edits, preserve existing selections and handle new blocks without introducing conflicts.
- Use the shared prompt builder for node output and server-side preview. Preserve ordering and positive/negative separation; avoid corrupting escaped, bracketed, weighted, or malformed expressions. Exclusion is case-insensitive exact matching for safely identified plain tags.
- Templates currently use Live mode; changes must not cause ComfyUI to reuse stale results. `Tag Template` deliberately requests re-execution.
- Do not silently replace missing, corrupt, or invalid templates with empty output. Preserve clear errors for the caller.
- Keep README.md and README.en.md consistent when user-facing behavior changes. Do not describe planned features as available.

## Development and runtime locations

The repository can live outside ComfyUI's `custom_nodes` directory. ComfyUI loads the installed copy, so changes in a separate checkout do not take effect until that copy is updated. Avoid overwriting a user's installed node or data without an explicit request.

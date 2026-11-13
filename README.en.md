# ComfyUI Tag Template Manager

English | [日本語](README.md)

A ComfyUI custom node for managing reusable tag templates locally. Organize character, outfit, background, and quality tags into blocks, then select and combine them in each workflow.

## Features

- Create, edit, duplicate, reorder, and delete templates and blocks
- Enable or disable blocks and apply named presets of block selections
- Manage positive and negative tags separately, with channel-specific exclusive groups
- Combine templates with free text, temporarily exclude tags, and preview the result
- Output strings directly from `Tag Template` and save selections in workflows

## Installation

Clone this repository into the ComfyUI `custom_nodes` directory:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/atelierkarin/comfyui-tag-template-manager.git
```

Restart ComfyUI and reload the browser. The nodes appear in the `Tag Template Manager` category.

The node has been tested with ComfyUI 0.22.0 and requires Python 3.10 or later. No additional Python packages are required. Currently, only ComfyUI's single-user mode is supported.

## Getting started

1. Add a `Tag Template` node and open **Edit library**.
2. Select **New**, add a name and tag blocks, and select **Save**. You can also create presets.
3. Select the template and check the blocks you want to use. You can change individual blocks after applying a preset. Each node's selection is saved in the workflow.
4. To use a template directly, connect its `positive` or `negative` output to a STRING input, such as CLIP Text Encode.
5. To combine multiple templates with free text, connect their `bundle` outputs to `Tag Main`. Choose `positive` or `negative` for `channel` and add any extra tags in `text`. Use a separate `Tag Main` for each channel when you need both.

Select **Update preview** on `Tag Main` to inspect the combined text. Update it again after changing inputs, connections, or templates. The preview supports connections from `Tag Template` and standard Reroute nodes; it cannot evaluate free-text or other widgets connected to external nodes.

### Blocks and presets

Each block has a positive or negative channel, a default on/off state, and an optional exclusive group. Only one block in the same group and channel can be enabled at a time. Positive and negative channels are considered separately.

When you first select a template, the blocks' default states are used. Presets are optional. In the editor, select a block heading to expand or collapse it.

### Temporarily excluding tags

Enter plain tags in `Tag Main`'s `exclude` field, separated by commas or newlines. This does not modify the template.

For example, `ribbon` removes a `ribbon` tag regardless of case. Only whole tags match: `hair ribbon` and `(ribbon:1.2)` remain. Expressions containing brackets or escapes are handled conservatively.

## Storage and reproducibility

Templates are stored as individual JSON files under `default/tag_templates/` in the ComfyUI user directory. With the default configuration, this is `ComfyUI/user/default/tag_templates/`. Copy that directory to back up the entire library.

Use **Export saved** in the editor to download a saved template as JSON, and **Import** to load a UTF-8 JSON file up to 1 MiB. Copy the library folder to move templates larger than 1 MiB. Unsaved edits are not exported. If the ID already exists, choose a different ID or cancel; existing templates are not overwritten and workflows keep referencing their original IDs.

Before saving or deleting a template, the editor keeps its previous contents in `tag_templates/.backups/`. Use **Restore backup** to select a template ID and a backup by time and name. Backups are not automatically deleted; include them in your library backups and manage disk usage as needed. On an edit conflict, the draft remains available: use **Save As / Duplicate** to save it under a new ID or **Reload saved** to discard it and load the current version. Concurrent edits by external tools cannot be prevented completely.

The default is **Live mode**: workflows read the latest template at execution time, so editing a library can change the output of an existing workflow. Missing or corrupt templates produce an error rather than silently returning empty text. **Create snapshot** saves the template and selection in the workflow, independently of later library changes or removal. **Update snapshot** copies the current library version, and **Switch to Live** returns to Live mode. A snapshot shares template contents with anyone receiving the workflow and cannot be used by older versions of the plugin.

After a template is edited, existing block selections are retained and new blocks use their defaults. A new block is disabled if its default would conflict with an existing selection in the same channel and exclusive group.

## Current limitations

- Multi-user mode is not supported yet.
- Detection of concurrent changes by external tools has limitations.
- Output whitespace and separators are tidied, but complex prompt syntax is not interpreted. Deduplication is limited to plain tags that can be handled safely.

See [AGENTS.md](AGENTS.md) for development and testing information and [docs](docs/) for design documents.

## License

[MIT License](LICENSE)

# ComfyUI Tag Template Manager

English | [日本語](README.md)

A ComfyUI custom node for managing reusable tag templates locally. Organize character, outfit, background, and quality tags into blocks, then select and combine them in each workflow.

## Features

- Create, edit, duplicate, reorder, and delete templates and blocks
- Enable or disable blocks and apply named presets of block selections
- Manage positive and negative tags separately, with channel-specific exclusive groups
- Combine templates with free text, temporarily exclude tags, and preview the result
- Output strings directly from `Tag Template` and save selections in workflows
- Collect template inputs with a bundler and output conditioning using CLIP

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
5. Connect each template's `bundle` output to `Tag Template Bundler`, then connect its `bundles` output to `Tag Main (Encode)`. The bundler combines up to eight inputs in numbered order.
6. Connect the model's CLIP to `Tag Main (Encode)` and choose a `channel` and optional free `text`. The node outputs `text` and `conditioning`. For both positive and negative, connect the same bundler to two Main nodes. Free text also works without a bundler.

For text-only output, use `Tag Main` instead of `Tag Main (Encode)` and connect the Bundler's `bundles` output. The eight Bundle inputs on `Tag Main` from v0.3.0 and earlier have been removed. Add a Bundler to existing workflows, reconnect the templates through it, and check the preview and output; connections are not migrated automatically.

**Update preview** displays the combined text without encoding it. Update it again after changing inputs, connections, or templates. Preview supports `Tag Template`, Bundler and standard Reroute nodes; it cannot evaluate free-text or other widgets connected to external nodes. Workflows containing the new nodes cannot be used with older plugin versions.

### Direct selection in Main

Use **Add template preset** on either Main to add up to eight Template/Preset pairs. Reorder rows with the arrows or remove them with **Remove**. The same pair can appear more than once. Use `Tag Template` for individual block selection or a Template without a Preset.

Each Live row uses the latest Preset at execution. **Create snapshot** saves the current Template and Preset in the workflow; **Update snapshot** and **Switch to Live** update or switch it. Missing or corrupt Templates or Presets and incomplete rows produce an error. After library changes, use **Refresh library** and update the preview again.

When used with a Bundler, direct rows are combined in their displayed order, followed by Bundler inputs and free text. Each Main has independent selections, so configure both nodes when needed for positive and negative. Older plugin versions are not guaranteed to reproduce workflows with direct selections.

### Blocks and presets

Each block has a positive or negative channel, a default on/off state, and an optional exclusive group. Only one block in the same group and channel can be enabled at a time. Positive and negative channels are considered separately.

When you first select a template, the blocks' default states are used. Presets are optional. In the editor, choose a block under **Block** to edit, reorder, duplicate, or delete it. Switching blocks keeps edits in the draft; select **Save** to save the whole template.

**Format tags** tidies the selected block's top-level comma spacing and excess whitespace in plain tags. It handles bracketed and escaped expressions conservatively and leaves malformed syntax unchanged. Select **Save** to save the formatted draft.

### Temporarily excluding tags

Enter plain tags in `Tag Main`'s `exclude` field, separated by commas or newlines. This does not modify the template.

For example, `ribbon` removes a `ribbon` tag regardless of case. Only whole tags match: `hair ribbon` and `(ribbon:1.2)` remain. Expressions containing brackets or escapes are handled conservatively.

## Storage and reproducibility

Templates are stored as individual JSON files under `default/tag_templates/` in the ComfyUI user directory. With the default configuration, this is `ComfyUI/user/default/tag_templates/`. Copy that directory to back up the entire library.

Use **Export saved** in the editor to download a saved template as JSON, and **Import** to load a UTF-8 JSON file up to 1 MiB. Tag formatting is applied to each imported block and to the exported copy. Export does not alter the saved template or include unsaved edits. Any remaining newlines inside JSON strings are represented as `\n` according to the JSON format. Copy the library folder to move templates larger than 1 MiB. If the ID already exists, choose a different ID or cancel; existing templates are not overwritten and workflows keep referencing their original IDs.

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

// Pure state helpers shared by the node UI and its tests.
export function defaults(template) {
    return Object.fromEntries(template.blocks.map(block => [block.id, block.default_enabled]));
}

export function presetSelection(template, preset) {
    const enabled = new Set(preset.enabled_block_ids);
    return Object.fromEntries(template.blocks.map(block => [block.id, enabled.has(block.id)]));
}

export function toggleBlock(template, previous, id, enabled) {
    const result = { ...previous };
    const block = template.blocks.find(item => item.id === id);
    if (!block) throw new Error(`Unknown block: ${id}`);
    if (enabled && block.exclusive_group != null) {
        for (const item of template.blocks) {
            if (item.exclusive_group === block.exclusive_group && item.channel === block.channel) result[item.id] = false;
        }
    }
    result[id] = enabled;
    return result;
}

export function stateError(template, state) {
    if (!state || state.version !== 1 || state.template_id !== template.id ||
        !state.blocks || typeof state.blocks !== 'object' || Array.isArray(state.blocks)) return 'Invalid saved selection.';
    const expected = template.blocks.map(block => block.id).sort();
    const actual = Object.keys(state.blocks).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) return 'Blocks changed. Reset or apply a preset.';
    const groups = new Set();
    for (const block of template.blocks) {
        if (typeof state.blocks[block.id] !== 'boolean') return 'Invalid block selection.';
        if (state.blocks[block.id] && block.exclusive_group != null) {
            const key = JSON.stringify([block.channel, block.exclusive_group]);
            if (groups.has(key)) return 'Exclusive group conflict. Reset or apply a preset.';
            groups.add(key);
        }
    }
    return null;
}

// Preserve existing choices; add new blocks using defaults unless they would
// conflict with an already selected block in the same channel and group.
export function reconcileSelection(template, state) {
    if (!state || state.version !== 1 || state.template_id !== template.id ||
        !state.blocks || typeof state.blocks !== 'object' || Array.isArray(state.blocks) ||
        Object.values(state.blocks).some(value => typeof value !== 'boolean')) return null;
    const blocks = {};
    const occupied = new Set();
    for (const block of template.blocks) {
        if (Object.hasOwn(state.blocks, block.id)) {
            blocks[block.id] = state.blocks[block.id];
            if (blocks[block.id] && block.exclusive_group != null) occupied.add(JSON.stringify([block.channel, block.exclusive_group]));
        }
    }
    for (const block of template.blocks) {
        if (Object.hasOwn(blocks, block.id)) continue;
        const key = JSON.stringify([block.channel, block.exclusive_group]);
        blocks[block.id] = block.default_enabled && (block.exclusive_group == null || !occupied.has(key));
        if (blocks[block.id] && block.exclusive_group != null) occupied.add(key);
    }
    return { ...state, blocks, preset_id: template.presets.some(preset => preset.id === state.preset_id) ? state.preset_id : null };
}

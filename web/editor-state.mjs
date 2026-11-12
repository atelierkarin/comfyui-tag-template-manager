const copy = value => structuredClone(value);

export function newTemplate(id) {
    return { schema_version: 1, id, name: '', category: '', description: '', blocks: [], presets: [] };
}

export function duplicateBlock(template, blockId, newId) {
    const result = copy(template);
    const index = result.blocks.findIndex(block => block.id === blockId);
    if (index < 0 || result.blocks.some(block => block.id === newId)) throw new Error('Invalid block ID');
    const block = copy(result.blocks[index]);
    block.id = newId;
    block.name += ' (copy)';
    block.default_enabled = false;
    result.blocks.splice(index + 1, 0, block);
    return result;
}

export function removeBlock(template, blockId) {
    const result = copy(template);
    result.blocks = result.blocks.filter(block => block.id !== blockId);
    for (const preset of result.presets) preset.enabled_block_ids = preset.enabled_block_ids.filter(id => id !== blockId);
    return result;
}

export function moveBlock(template, blockId, delta) {
    const result = copy(template);
    const index = result.blocks.findIndex(block => block.id === blockId);
    const target = index + delta;
    if (index >= 0 && target >= 0 && target < result.blocks.length) {
        [result.blocks[index], result.blocks[target]] = [result.blocks[target], result.blocks[index]];
    }
    return result;
}

export function togglePresetBlock(template, presetId, blockId, enabled) {
    const result = copy(template);
    const preset = result.presets.find(item => item.id === presetId);
    const block = result.blocks.find(item => item.id === blockId);
    if (!preset || !block) throw new Error('Unknown preset or block');
    let ids = preset.enabled_block_ids.filter(id => id !== blockId);
    if (enabled) {
        if (block.exclusive_group != null) {
            const group = new Set(result.blocks.filter(item => item.exclusive_group === block.exclusive_group && item.channel === block.channel).map(item => item.id));
            ids = ids.filter(id => !group.has(id));
        }
        ids.push(blockId);
    }
    preset.enabled_block_ids = ids;
    return result;
}

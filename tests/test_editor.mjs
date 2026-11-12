import assert from 'node:assert/strict';
import { newTemplate, duplicateBlock, removeBlock, moveBlock, togglePresetBlock } from '../web/editor-state.mjs';

const template = newTemplate('test');
template.blocks = [
    { id: 'a', name: 'A', channel: 'positive', default_enabled: true, exclusive_group: 'outfit', tags: 'a' },
    { id: 'b', name: 'B', channel: 'negative', default_enabled: false, exclusive_group: 'outfit', tags: 'b' },
];
template.presets = [{ id: 'p', name: 'P', enabled_block_ids: ['a'] }];
const duplicate = duplicateBlock(template, 'a', 'c');
assert.equal(duplicate.blocks[1].id, 'c');
assert.equal(duplicate.blocks[1].default_enabled, false);
assert.equal(template.blocks.length, 2);
const reordered = moveBlock(duplicate, 'c', 1);
assert.deepEqual(reordered.blocks.map(x => x.id), ['a', 'b', 'c']);
const selected = togglePresetBlock(template, 'p', 'b', true);
assert.deepEqual(selected.presets[0].enabled_block_ids, ['a', 'b']);
assert.deepEqual(template.presets[0].enabled_block_ids, ['a']);
assert.deepEqual(removeBlock(template, 'a').presets[0].enabled_block_ids, []);

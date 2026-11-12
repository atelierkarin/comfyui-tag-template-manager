import assert from 'node:assert/strict';
import { defaults, presetSelection, toggleBlock, stateError, reconcileSelection } from '../web/state.mjs';

const template = { id: 't', blocks: [
    { id: 'a', default_enabled: true, exclusive_group: 'outfit' },
    { id: 'b', default_enabled: false, exclusive_group: 'outfit' },
] };
const first = defaults(template);
const second = toggleBlock(template, first, 'b', true);
assert.deepEqual(first, { a: true, b: false });
assert.deepEqual(second, { a: false, b: true });
assert.deepEqual(presetSelection(template, { enabled_block_ids: ['b'] }), second);
assert.equal(stateError(template, { version: 1, template_id: 't', blocks: second }), null);
assert.ok(stateError(template, { version: 1, template_id: 't', blocks: { a: true } }));
assert.ok(stateError(template, { version: 1, template_id: 't', blocks: { a: true, b: true } }));
const cross = { id: 't', blocks: [
    { id: 'a', channel: 'positive', exclusive_group: 'outfit', default_enabled: true },
    { id: 'b', channel: 'negative', exclusive_group: 'outfit', default_enabled: true },
    { id: 'c', channel: 'positive', exclusive_group: 'outfit', default_enabled: true },
], presets: [] };
const old = { version: 1, template_id: 't', preset_id: null, blocks: { a: true, b: true, removed: true } };
const reconciled = reconcileSelection(cross, old);
assert.deepEqual(reconciled.blocks, { a: true, b: true, c: false });
assert.equal(stateError(cross, reconciled), null);
assert.equal(toggleBlock(cross, { a: true, b: true, c: false }, 'c', true).b, true);

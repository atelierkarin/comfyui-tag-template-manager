import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.value = ''; this.textContent = ''; }
    append(...items) { this.children.push(...items); }
    add(item) { this.children.push(item); }
    replaceChildren(...items) { this.children = items; }
}
globalThis.window = { confirm: () => true };
globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => text };
globalThis.Option = class { constructor(text, value) { this.textContent = text; this.value = value; } };
const template = { id: 'template_verylonginternalid', name: 'Character', blocks: [
    { id: 'a', name: 'A', channel: 'positive', default_enabled: true, exclusive_group: null },
    { id: 'b', name: 'B', channel: 'negative', default_enabled: false, exclusive_group: null },
], presets: [] };
let extension;
globalThis.testApp = { registerExtension(value) { extension = value; } };
globalThis.testApi = { async fetchApi(path) { return { ok: true, async json() {
    return path.endsWith('/templates') ? { templates: [template] } : template;
} }; } };
let source = await readFile('web/index.js', 'utf8');
source = source.replace("import { app } from '../../scripts/app.js';", 'const app = globalThis.testApp;')
    .replace("import { api } from '../../scripts/api.js';", 'const api = globalThis.testApi;')
    .replace("'./state.mjs'", `'${pathToFileURL(resolve('web/state.mjs')).href}'`)
    .replace("import { openEditor } from './editor.js';", 'const openEditor = () => {};');
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class TemplateNode {
    constructor() { this.widgets = [{ name: 'state', value: '', inputEl: { style: {} }, draw() {} }]; this.size = [300, 200]; }
    addDOMWidget(name, type, element) { this.panel = element; }
    setSize(size) { this.size = size; }
}
await extension.beforeRegisterNodeDef(TemplateNode, { name: 'TagTemplateManagerTemplate' });
const node = new TemplateNode(); node.onNodeCreated();
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(node.widgets[0].inputEl.style.display, 'none');
const selector = node.panel.children.find(child => child.tagName === 'select');
assert.equal(selector.children[1].textContent, 'Character');
selector.value = template.id; selector.onchange();
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(node.panel.children[0].textContent, 'Character — Live');
const preset = node.panel.children.filter(child => child.tagName === 'select')[1];
assert.equal(preset.disabled, true);
assert.equal(preset.children[0].textContent, 'No presets');
assert.deepEqual(JSON.parse(node.widgets[0].value).blocks, { a: true, b: false });
assert.equal(JSON.parse(node.widgets[0].value).preset_id, null);
// Saving an edited template adds/removes blocks without hiding the controls.
template.blocks = [template.blocks[1], { id: 'c', name: 'C', channel: 'positive', default_enabled: true, exclusive_group: null }];
template.presets = [{ id: 'p', name: 'Preset', enabled_block_ids: ['c'] }];
await node._tagTemplateRefresh();
assert.deepEqual(JSON.parse(node.widgets[0].value).blocks, { b: false, c: true });
assert.equal(preset.disabled, false);
assert.equal(preset.children[1].textContent, 'Preset');
assert.equal(node.panel.children.at(-1).children.length, 2);
const snapshotButton = node.panel.children.find(child => child.tagName === 'button' && child.textContent === 'Create snapshot');
assert.ok(snapshotButton);
let releaseLoad;
let readCount = 0;
const latest = { ...template, name: 'Changed externally' };
globalThis.testApi.fetchApi = async path => {
    if (path.endsWith('/templates')) return { ok: true, async json() { return { templates: [template] }; } };
    if (++readCount === 1) return await new Promise(resolve => { releaseLoad = resolve; });
    return { ok: true, async json() { return latest; } };
};
const pendingRefresh = node._tagTemplateRefresh();
await new Promise(resolve => setTimeout(resolve, 0));
await snapshotButton.onclick();
assert.equal(JSON.parse(node.widgets[0].value).version, 2);
assert.equal(JSON.parse(node.widgets[0].value).template.name, 'Changed externally', 'snapshot uses the current library content');
const replacement = { ...template, blocks: [] };
releaseLoad({ ok: true, async json() { return replacement; } });
await pendingRefresh;
assert.deepEqual(JSON.parse(node.widgets[0].value).blocks, { b: false, c: true }, 'late Live response cannot change snapshot selections');
const savedSnapshot = JSON.parse(node.widgets[0].value).template;
let releaseUpdate;
globalThis.testApi.fetchApi = async () => await new Promise(resolve => { releaseUpdate = resolve; });
const update = node.panel.children.find(child => child.textContent === 'Update snapshot');
const pendingUpdate = update.onclick();
const checkbox = node.panel.children.at(-1).children[0].children[0];
checkbox.checked = true; checkbox.onchange();
releaseUpdate({ ok: true, async json() { return replacement; } });
await pendingUpdate;
assert.equal(JSON.parse(node.widgets[0].value).blocks.b, true, 'late snapshot update cannot discard a newer selection');
template.blocks = [];
globalThis.testApi.fetchApi = async () => { throw new Error('library unavailable'); };
await node._tagTemplateRefresh();
assert.match(node.panel.children[0].textContent, /Snapshot/);
assert.deepEqual(JSON.parse(node.widgets[0].value).template, savedSnapshot);
assert.equal(node.panel.children.at(-1).children.length, 2);
const reloaded = new TemplateNode();
reloaded.widgets[0].value = node.widgets[0].value;
reloaded.onNodeCreated();
await reloaded._tagTemplateRefresh();
assert.match(reloaded.panel.children[0].textContent, /Snapshot/);
const malformed = new TemplateNode();
malformed.widgets[0].value = JSON.stringify({ version: 2, template_id: 'bad', blocks: {}, preset_id: null, template: {} });
malformed.onNodeCreated();
await malformed._tagTemplateRefresh();
assert.match(malformed.panel.children[0].textContent, /Invalid/);
assert.doesNotThrow(() => malformed.panel.children.find(child => child.textContent === 'Create snapshot').onclick());
malformed.widgets[0].value = JSON.stringify({ version: 2, template_id: 'bad', blocks: {}, preset_id: null, template: null });
await malformed._tagTemplateRefresh();
assert.match(malformed.panel.children[0].textContent, /Invalid/);
globalThis.testApi.fetchApi = async () => ({ ok: true, async json() { return replacement; } });
selector.value = replacement.id; selector.onchange();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(JSON.parse(node.widgets[0].value).version, 1, 'choosing a template can leave Snapshot mode');
let previewBody;
globalThis.testApi.fetchApi = async (path, options) => {
    assert.equal(path, '/tag-template-manager/preview-single');
    previewBody = JSON.parse(options.body);
    return { ok: true, async json() { return { text: 'bad, custom' }; } };
};
class MainNode {
    constructor() {
        this.widgets = [{ name: 'channel', value: 'negative' }, { name: 'text', value: 'custom' },
            { name: 'deduplicate', value: false }];
        this.inputs = []; this.size = [300, 200];
    }
    addDOMWidget(name, type, element) { this.panel = element; }
    setSize(size) { this.size = size; }
}
await extension.beforeRegisterNodeDef(MainNode, { name: 'TagTemplateManagerSingleMain' });
const main = new MainNode(); main.onNodeCreated();
await main.panel.children[0].onclick();
assert.equal(previewBody.channel, 'negative');
assert.equal(previewBody.text, 'custom');
assert.equal(main.panel.children[3].textContent, 'bad, custom');
class EncodedMainNode {
    constructor() {
        this.widgets = [{ name: 'channel', value: 'negative' }, { name: 'text', value: 'custom' },
            { name: 'deduplicate', value: false }];
        this.inputs = []; this.size = [300, 200];
    }
    addDOMWidget(name, type, element) { this.panel = element; }
    setSize(size) { this.size = size; }
}
await extension.beforeRegisterNodeDef(EncodedMainNode, { name: 'TagTemplateManagerEncodedMain' });
const encoded = new EncodedMainNode(); encoded.onNodeCreated();
const stateA = { version: 1, template_id: 'a', preset_id: null, blocks: {} };
const stateB = { version: 1, template_id: 'b', preset_id: null, blocks: {} };
const sourceA = { type: 'TagTemplateManagerTemplate', widgets: [{ name: 'state', value: JSON.stringify(stateA) }] };
const sourceB = { type: 'TagTemplateManagerTemplate', widgets: [{ name: 'state', value: JSON.stringify(stateB) }] };
const bundler = { type: 'TagTemplateManagerBundler', inputs: [{ name: 'bundle_3', link: 3 }, { name: 'bundle_1', link: 1 }] };
const reroute = { type: 'Reroute', inputs: [{ link: 4 }] };
const nodes = { 1: sourceA, 2: sourceB, 3: bundler, 4: reroute };
testApp.graph = { links: { 1: { origin_id: 1 }, 3: { origin_id: 2 }, 4: { origin_id: 3 }, 5: { origin_id: 4 } }, getNodeById: id => nodes[id] };
encoded.inputs = [{ name: 'bundles', link: 5 }];
await encoded.panel.children[0].onclick();
assert.deepEqual(previewBody.states, [stateA, stateB]);
main.inputs = [{ name: 'bundles', link: 5 }];
await main.panel.children[0].onclick();
assert.deepEqual(previewBody.states, [stateA, stateB], 'text Main previews the Bundler in input order');
bundler.inputs[0].link = 5;
await encoded.panel.children[0].onclick();
assert.match(encoded.panel.children[1].textContent, /Cycle|supports/);
console.log('Template UI: OK');

// Direct selection survives workflow serialization and is included in preview.
class DirectMainNode extends MainNode {
    constructor() { super(); this.widgets.push({ name: 'direct_state', value: '' }); }
}
await extension.beforeRegisterNodeDef(DirectMainNode, { name: 'TagTemplateManagerSingleMain' });
const directMain = new DirectMainNode(); directMain.onNodeCreated();
globalThis.testApi.fetchApi = async (path, options) => {
    if (path.endsWith('/templates')) return { ok: true, json: async () => ({ templates: [template], problems: [] }) };
    if (path.includes('/templates/')) return { ok: true, json: async () => template };
    previewBody = JSON.parse(options.body); return { ok: true, json: async () => ({ text: 'result' }) };
};
await directMain._tagDirectRefresh();
const add = directMain.panel.children.find(child => child.textContent === 'Add template preset');
assert.ok(add);
add.onclick();
let directState = JSON.parse(directMain.widgets.find(w => w.name === 'direct_state').value);
assert.equal(directState.items.length, 1);
const rows = directMain.panel.children.find(child => child.directRows);
let row = rows.children[0];
row.children[0].value = template.id; await row.children[0].onchange();
row = rows.children[0]; row.children[1].value = 'p'; row.children[1].onchange();
directState = JSON.parse(directMain.widgets.find(w => w.name === 'direct_state').value);
assert.equal(directState.items[0].preset_id, 'p');
await directMain.panel.children[0].onclick();
assert.equal(JSON.parse(previewBody.direct_state).items[0].preset_id, 'p');
let releasePreview;
globalThis.testApi.fetchApi = async () => await new Promise(resolve => { releasePreview = resolve; });
const pendingDirectPreview = directMain.panel.children[0].onclick();
directMain.widgets.find(w => w.name === 'text').value = 'changed while loading';
releasePreview({ ok: true, json: async () => ({ text: 'old result' }) });
await pendingDirectPreview;
assert.notEqual(directMain.panel.children[3].textContent, 'old result');
globalThis.testApi.fetchApi = async (path, options) => {
    if (path.endsWith('/templates')) return { ok: true, json: async () => ({ templates: [template], problems: [] }) };
    if (path.includes('/templates/')) return { ok: true, json: async () => template };
    previewBody = JSON.parse(options.body); return { ok: true, json: async () => ({ text: 'result' }) };
};
row = rows.children[0]; await row.children[2].onclick();
assert.equal(JSON.parse(directMain.widgets.find(w => w.name === 'direct_state').value).items[0].mode, 'snapshot');
const restored = new DirectMainNode();
restored.widgets.find(w => w.name === 'direct_state').value = directMain.widgets.find(w => w.name === 'direct_state').value;
restored.onNodeCreated(); await restored._tagDirectRefresh();
assert.equal(restored.panel.children.find(child => child.directRows).children[0].children[2].textContent, 'Switch to Live');
row = rows.children[0]; row.children[6].onclick();
assert.equal(JSON.parse(directMain.widgets.find(w => w.name === 'direct_state').value).items.length, 0);
const invalidDirect = new DirectMainNode();
invalidDirect.widgets.find(w => w.name === 'direct_state').value = '{"version":1,"items":[null]}';
assert.doesNotThrow(() => invalidDirect.onNodeCreated());
assert.match(invalidDirect.panel.children.find(child => child.textContent === 'Invalid direct selection state.').textContent, /Invalid/);

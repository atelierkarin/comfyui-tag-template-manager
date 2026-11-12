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
console.log('Template UI: OK');

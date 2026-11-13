import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

class Element {
    constructor(tag, text = '') { this.tagName = tag; this.textContent = text; this.children = []; this.style = {}; this.value = ''; }
    append(...items) { this.children.push(...items); }
    add(item) { this.children.push(item); }
    replaceChildren(...items) { this.children = items; }
    setAttribute() {}
    addEventListener(name, callback) { this[`event_${name}`] = callback; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    remove() { this.removed = true; }
    click() { this.clicked = true; }
}
globalThis.document = { body: new Element('body'), createElement: tag => new Element(tag), createTextNode: text => text };
globalThis.Option = class extends Element { constructor(text, value) { super('option', text); this.value = value; } };
let confirmResult = true;
let promptResult = 'copy_id';
let promptQueue = [];
let problems = [];
let downloaded = null;
globalThis.URL.createObjectURL = blob => { downloaded = blob; return 'blob:test'; };
globalThis.URL.revokeObjectURL = () => {};
globalThis.window = { addEventListener() {}, removeEventListener() {}, confirm: () => confirmResult, prompt: () => promptQueue.length ? promptQueue.shift() : promptResult };
const modulePath = pathToFileURL(resolve('web/editor-state.mjs')).href;
const source = (await readFile('web/editor.js', 'utf8')).replace("'./editor-state.mjs'", `'${modulePath}'`);
const { openEditor } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
let store = new Map(), changes = 0;
async function request(path, options = {}) {
    if (path === '/templates' && !options.method) return { templates: [...store.values()].map(({ id, name, category }) => ({ id, name, category })), problems };
    if (path.startsWith('/backups/')) {
        const id = decodeURIComponent(path.split('/').pop());
        if (!options.method) return { backups: [{ id: 'backup123', created: '2026-11-13T00:00:00Z', name: 'Restored' }], revision: 'before' };
        const body = JSON.parse(options.body);
        assert.equal(body.revision, 'before'); assert.equal(body.backup_id, 'backup123');
        const value = structuredClone(store.get(id)); value.name = 'Restored'; store.set(id, value); return { restored: id };
    }
    if (path === '/import' && options.method === 'POST') {
        const value = JSON.parse(new TextDecoder().decode(options.body));
        if (options.headers['X-Template-ID']) value.id = options.headers['X-Template-ID'];
        if (store.has(value.id)) { const error = new Error('collision'); error.status = 409; throw error; }
        store.set(value.id, value); return value;
    }
    if (path === '/templates' && options.method === 'POST') {
        const value = JSON.parse(options.body);
        if (store.has(value.id)) throw new Error('Template ID already exists');
        store.set(value.id, structuredClone(value)); return value;
    }
    const id = decodeURIComponent(path.split('/').pop());
    if (path.startsWith('/editor/')) {
        if (!store.has(id)) throw new Error('not found');
        const current = JSON.stringify(store.get(id));
        if (!options.method) return { template: structuredClone(store.get(id)), revision: current };
        const body = JSON.parse(options.body);
        if (body.revision !== current) { const error = new Error('conflict'); error.status = 409; throw error; }
        if (options.method === 'DELETE') { store.delete(id); return { deleted: id }; }
        store.set(id, structuredClone(body.template));
        return { template: body.template, revision: JSON.stringify(body.template) };
    }
    if (options.method === 'PUT') { const value = JSON.parse(options.body); store.set(id, value); return value; }
    if (options.method === 'DELETE') { store.delete(id); return { deleted: id }; }
    if (!store.has(id)) throw new Error('not found');
    return structuredClone(store.get(id));
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function all(root) { return [root, ...(root.children || []).flatMap(child => typeof child === 'object' ? all(child) : [])]; }
const find = (tag, text) => all(document.body).find(x => x.tagName === tag && (text === undefined || x.textContent === text));
const click = text => { const target = find('button', text); assert.ok(target, `button ${text}`); target.onclick(); };
problems = ['broken'];
openEditor({ request, onChanged: () => changes++ });
await tick();
assert.ok(all(document.body).some(x => x.textContent?.includes('broken')), 'corrupt file is visible');
click('New');
const nameLabel = find('span', 'Name: ');
const nameRow = all(document.body).find(x => x.children?.includes(nameLabel));
const nameInput = nameRow.children.find(x => x.tagName === 'input');
nameInput.value = 'Character'; nameInput.oninput();
click('Add block');
const blockDetails = find('details');
assert.ok(blockDetails, 'blocks can be collapsed');
assert.ok(blockDetails.open, 'new block starts expanded');
blockDetails.open = false; blockDetails.event_toggle();
click('Add preset');
assert.equal(find('details').open, false, 'collapse state survives editor re-render');
confirmResult = false; click('Close');
assert.equal(find('dialog').open, true);
confirmResult = true;
click('Save'); await tick();
assert.equal(store.size, 1);
assert.equal([...store.values()][0].blocks.length, 1);
assert.equal([...store.values()][0].presets.length, 1);
const saved = [...store.values()][0];
saved.description = 'x'.repeat(1024 * 1024);
click('Export saved'); await tick();
assert.equal(downloaded, null, 'oversized export is rejected before download');
saved.description = '';
const changedOutside = [...store.values()][0]; changedOutside.description = 'external';
nameInput.value = 'My draft'; nameInput.oninput();
click('Save'); await tick();
assert.equal(changedOutside.description, 'external');
assert.equal(nameInput.value, 'My draft', 'conflict preserves the draft');
click('Reload saved'); await tick();
assert.ok(all(document.body).some(x => x.tagName === 'textarea' && x.value === 'external'), 'reload fetches the current saved version');
changedOutside.description = '';
click('Export saved'); await tick();
assert.equal(JSON.parse(await downloaded.text()).name, 'Character');
click('Import');
const fileInput = all(document.body).find(x => x.tagName === 'input' && x.type === 'file');
const activeName = all(document.body).find(x => x.tagName === 'input' && x.value === 'Character');
activeName.value = 'Unsaved'; activeName.oninput();
promptResult = null;
fileInput.files = [{ size: downloaded.size, arrayBuffer: () => downloaded.arrayBuffer() }];
fileInput.onchange(); await tick(); await tick();
assert.equal(activeName.value, 'Unsaved', 'cancelled collision keeps the draft');
assert.equal(store.size, 1);
promptResult = 'copy_id';
fileInput.files = [{ size: downloaded.size, arrayBuffer: () => downloaded.arrayBuffer() }];
fileInput.onchange(); await tick(); await tick();
assert.equal(store.has('copy_id'), true, 'collision imports under a new ID');
click('Delete'); await tick();
const list = find('select'); list.value = [...store.keys()][0]; list.onchange(); await tick();
click('Save As / Duplicate'); await tick();
assert.equal(store.size, 2);
click('Delete'); await tick();
assert.equal(store.size, 1);
assert.equal(changes, 5);
click('Close');
assert.equal(find('dialog').removed, true);
document.body = new Element('body');
const restoreId = [...store.keys()][0];
openEditor({ request, selectedId: restoreId, onChanged: () => changes++ }); await tick();
promptQueue = [restoreId, '1'];
click('Restore backup'); await tick(); await tick();
assert.equal(store.get(restoreId).name, 'Restored', 'selected backup is restored');
assert.equal(changes, 6);
console.log('Editor interaction flow: OK');

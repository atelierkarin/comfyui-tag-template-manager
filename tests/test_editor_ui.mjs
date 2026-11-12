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
}
globalThis.document = { body: new Element('body'), createElement: tag => new Element(tag), createTextNode: text => text };
globalThis.Option = class extends Element { constructor(text, value) { super('option', text); this.value = value; } };
let confirmResult = true;
globalThis.window = { addEventListener() {}, removeEventListener() {}, confirm: () => confirmResult, prompt: () => 'copy_id' };
const modulePath = pathToFileURL(resolve('web/editor-state.mjs')).href;
const source = (await readFile('web/editor.js', 'utf8')).replace("'./editor-state.mjs'", `'${modulePath}'`);
const { openEditor } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
let store = new Map(), changes = 0;
async function request(path, options = {}) {
    if (path === '/templates' && !options.method) return { templates: [...store.values()].map(({ id, name, category }) => ({ id, name, category })) };
    if (path === '/templates' && options.method === 'POST') {
        const value = JSON.parse(options.body);
        if (store.has(value.id)) throw new Error('Template ID already exists');
        store.set(value.id, structuredClone(value)); return value;
    }
    const id = decodeURIComponent(path.split('/').pop());
    if (options.method === 'PUT') { const value = JSON.parse(options.body); store.set(id, value); return value; }
    if (options.method === 'DELETE') { store.delete(id); return { deleted: id }; }
    if (!store.has(id)) throw new Error('not found');
    return structuredClone(store.get(id));
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function all(root) { return [root, ...(root.children || []).flatMap(child => typeof child === 'object' ? all(child) : [])]; }
const find = (tag, text) => all(document.body).find(x => x.tagName === tag && (text === undefined || x.textContent === text));
const click = text => { const target = find('button', text); assert.ok(target, `button ${text}`); target.onclick(); };
openEditor({ request, onChanged: () => changes++ });
await tick();
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
click('Save As / Duplicate'); await tick();
assert.equal(store.size, 2);
click('Delete'); await tick();
assert.equal(store.size, 1);
assert.equal(changes, 3);
click('Close');
assert.equal(find('dialog').removed, true);
console.log('Editor interaction flow: OK');

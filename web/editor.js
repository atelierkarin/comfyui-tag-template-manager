import { newTemplate, duplicateBlock, removeBlock, moveBlock, togglePresetBlock } from './editor-state.mjs';

const el = (tag, text) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    return node;
};
const generateId = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.().replaceAll('-', '') || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

export function openEditor({ request, selectedId, onChanged }) {
    const dialog = el('dialog');
    Object.assign(dialog.style, { width: 'min(1000px, 92vw)', maxWidth: 'none', maxHeight: '90vh',
        background: '#252525', color: '#eee', border: '1px solid #777', borderRadius: '8px', padding: '16px' });
    const fieldset = el('fieldset');
    Object.assign(fieldset.style, { border: '0', margin: '0', padding: '0' });
    const heading = el('h2', 'Tag Template Editor');
    const status = el('div', '');
    status.setAttribute('role', 'status');
    const controls = el('div');
    const search = el('input'); search.placeholder = 'Search name, ID, category'; search.type = 'search';
    const list = el('select');
    const body = el('div');
    Object.assign(body.style, { overflowY: 'auto', maxHeight: '60vh', marginTop: '12px' });
    const form = el('div'); body.append(form);
    const buttons = el('div');
    Object.assign(buttons.style, { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' });
    const button = (label, callback, parent = buttons) => {
        const item = el('button', label); item.type = 'button'; item.onclick = callback; parent.append(item); return item;
    };
    controls.append(search, list);
    fieldset.append(heading, status, controls, buttons, body);
    dialog.append(fieldset); document.body.append(dialog);
    let templates = [], draft = null, savedId = null, dirty = false, busy = false;
    const expandedBlocks = new Set();
    const beforeUnload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);

    function report(message, error = false) {
        status.textContent = message;
        status.style.color = error ? '#ff9999' : '#bde1bd';
    }
    function markDirty() { dirty = true; report('Unsaved changes'); }
    function confirmDiscard() { return !dirty || window.confirm('Discard unsaved changes?'); }
    function close() {
        if (busy || !confirmDiscard()) return;
        window.removeEventListener('beforeunload', beforeUnload);
        dialog.close(); dialog.remove();
    }
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    async function run(action) {
        if (busy) return;
        busy = true; fieldset.disabled = true;
        try { await action(); } catch (error) { report(error.message || String(error), true); }
        finally { busy = false; fieldset.disabled = false; }
    }
    function refreshOptions() {
        const query = search.value.toLocaleLowerCase().trim();
        list.replaceChildren(new Option('Select template…', ''));
        for (const item of templates) {
            if ([item.name, item.id, item.category].some(value => value.toLocaleLowerCase().includes(query))) {
                list.add(new Option(`${item.name} (${item.id})${item.category ? ` — ${item.category}` : ''}`, item.id));
            }
        }
        list.value = templates.some(item => item.id === savedId) ? savedId : '';
    }
    async function refreshList() {
        templates = (await request('/templates')).templates;
        refreshOptions();
    }
    function changeDraft(value, id = null, isDirty = false) {
        if (savedId !== id) expandedBlocks.clear();
        draft = value; savedId = id; dirty = isDirty; render(); refreshOptions();
        report(isDirty ? 'Unsaved changes' : id ? `Editing ${id}` : 'Select or create a template.');
    }
    async function load(id) {
        const data = await request(`/templates/${encodeURIComponent(id)}`);
        changeDraft(data, id);
    }
    search.oninput = refreshOptions;
    list.onchange = () => {
        const id = list.value;
        if (!id || id === savedId) return;
        if (!confirmDiscard()) { refreshOptions(); return; }
        run(() => load(id));
    };
    button('New', () => {
        if (confirmDiscard()) changeDraft(newTemplate(generateId('template')), null, true);
    });
    button('Save', () => run(async () => {
        if (!draft) throw new Error('Create or select a template first.');
        const data = await request(savedId ? `/templates/${encodeURIComponent(savedId)}` : '/templates', {
            method: savedId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
        });
        changeDraft(data, data.id);
        onChanged?.(); await refreshList(); report('Saved.');
    }));
    button('Save As / Duplicate', () => {
        if (!draft) { report('Create or select a template first.', true); return; }
        const nextId = window.prompt('New template ID (letters, digits, _ or -):', generateId('template'));
        if (nextId == null) return;
        run(async () => {
            const duplicate = structuredClone(draft); duplicate.id = nextId;
            const data = await request('/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(duplicate) });
            changeDraft(data, data.id);
            onChanged?.(); await refreshList(); report('Saved as a new template.');
        });
    });
    button('Delete', () => {
        if (!savedId) { report('Select a saved template first.', true); return; }
        if (!confirmDiscard() || !window.confirm(`Delete template ${savedId}? This cannot be undone.`)) return;
        run(async () => {
            await request(`/templates/${encodeURIComponent(savedId)}`, { method: 'DELETE' });
            changeDraft(null); onChanged?.(); await refreshList(); report('Deleted.');
        });
    });
    button('Close', close);

    function textField(parent, label, value, change, options = {}) {
        const row = el('label'); row.style.display = 'block'; row.style.margin = '6px 0';
        row.append(el('span', `${label}: `));
        const input = el(options.multiline ? 'textarea' : 'input');
        input.value = value; input.disabled = !!options.disabled;
        input.style.width = options.multiline ? '95%' : 'min(420px, 80%)';
        if (options.multiline) { input.rows = options.rows || 3; input.style.display = 'block'; }
        input.oninput = () => { change(input.value); markDirty(); };
        row.append(input); parent.append(row); return input;
    }
    function checkbox(parent, label, value, change) {
        const row = el('label'); row.style.display = 'block';
        const input = el('input'); input.type = 'checkbox'; input.checked = value;
        input.onchange = () => { change(input.checked); markDirty(); };
        row.append(input, document.createTextNode(` ${label}`)); parent.append(row);
    }
    function render() {
        form.replaceChildren();
        if (!draft) return;
        textField(form, 'ID', draft.id, value => { draft.id = value; }, { disabled: !!savedId });
        textField(form, 'Name', draft.name, value => { draft.name = value; });
        textField(form, 'Category', draft.category, value => { draft.category = value; });
        textField(form, 'Description', draft.description, value => { draft.description = value; }, { multiline: true });
        form.append(el('h3', 'Blocks'));
        button('Add block', () => {
            const id = generateId('block');
            draft.blocks.push({ id, name: 'New block', channel: 'positive', default_enabled: false, exclusive_group: null, tags: '' });
            expandedBlocks.add(id);
            markDirty(); render();
        }, form);
        for (const block of draft.blocks) {
            const section = el('details'); section.style.margin = '10px 0';
            section.open = expandedBlocks.has(block.id);
            section.addEventListener('toggle', () => {
                if (section.open) expandedBlocks.add(block.id); else expandedBlocks.delete(block.id);
            });
            const summary = el('summary', `${block.name} (${block.id})`);
            section.append(summary);
            textField(section, 'Name', block.name, value => { block.name = value; summary.textContent = `${value} (${block.id})`; });
            const channel = el('select');
            channel.add(new Option('Positive', 'positive')); channel.add(new Option('Negative', 'negative')); channel.value = block.channel;
            channel.onchange = () => { block.channel = channel.value; markDirty(); };
            section.append(el('span', 'Channel: '), channel);
            textField(section, 'Exclusive group', block.exclusive_group || '', value => { block.exclusive_group = value.trim() || null; });
            checkbox(section, 'Enabled by default', block.default_enabled, value => { block.default_enabled = value; });
            textField(section, 'Tags', block.tags, value => { block.tags = value; }, { multiline: true });
            const actions = el('div'); section.append(actions);
            button('↑', () => { draft = moveBlock(draft, block.id, -1); markDirty(); render(); }, actions);
            button('↓', () => { draft = moveBlock(draft, block.id, 1); markDirty(); render(); }, actions);
            button('Duplicate', () => { const id = generateId('block'); draft = duplicateBlock(draft, block.id, id); expandedBlocks.add(id); markDirty(); render(); }, actions);
            button('Delete block', () => {
                if (window.confirm(`Delete block ${block.name} and remove it from presets?`)) {
                    draft = removeBlock(draft, block.id); markDirty(); render();
                }
            }, actions);
            form.append(section);
        }
        form.append(el('h3', 'Presets'));
        button('Add preset', () => {
            draft.presets.push({ id: generateId('preset'), name: 'New preset', enabled_block_ids: [] });
            markDirty(); render();
        }, form);
        for (const preset of draft.presets) {
            const section = el('fieldset'); section.style.margin = '10px 0';
            section.append(el('legend', `${preset.name} (${preset.id})`));
            textField(section, 'Name', preset.name, value => { preset.name = value; });
            for (const block of draft.blocks) {
                checkbox(section, `${block.name} (${block.id})`, preset.enabled_block_ids.includes(block.id), value => {
                    draft = togglePresetBlock(draft, preset.id, block.id, value); render();
                });
            }
            button('Delete preset', () => {
                if (window.confirm(`Delete preset ${preset.name}?`)) {
                    draft.presets = draft.presets.filter(item => item.id !== preset.id); markDirty(); render();
                }
            }, section);
            form.append(section);
        }
    }
    dialog.showModal();
    run(async () => {
        await refreshList();
        if (selectedId) await load(selectedId);
        else report('Select or create a template.');
    });
}

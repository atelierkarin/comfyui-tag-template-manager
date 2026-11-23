import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';
import { defaults, presetSelection, toggleBlock, stateError, reconcileSelection } from './state.mjs';
import { openEditor } from './editor.js';

const prefix = '/tag-template-manager';
const widget = (node, name) => node.widgets?.find(item => item.name === name);

async function request(path, options) {
    const response = await api.fetchApi(prefix + path, options);
    let data;
    try { data = await response.json(); } catch { throw new Error(`Server error (${response.status})`); }
    if (!response.ok) { const error = new Error(data.error || `Server error (${response.status})`); error.status = response.status; throw error; }
    return data;
}

function element(tag, text) {
    const result = document.createElement(tag);
    if (text != null) result.textContent = text;
    return result;
}

function panel(node, name) {
    const div = element('div');
    Object.assign(div.style, { background: '#222', color: '#eee', padding: '8px', overflow: 'auto',
        boxSizing: 'border-box', fontSize: '12px', width: '100%', height: '100%' });
    node.addDOMWidget(name, 'tag-template-manager', div, { serialize: false, hideOnZoom: false });
    return div;
}

function readState(node) {
    const value = widget(node, 'state')?.value;
    if (!value) return null;
    try { return JSON.parse(value); } catch { throw new Error('Invalid saved state.'); }
}

function installTemplate(node) {
    const stateWidget = widget(node, 'state');
    if (!stateWidget) return;
    stateWidget.type = 'hidden';
    stateWidget.computeSize = () => [0, -4];
    // Keep the value for workflow serialization and execution, but hide both
    // the canvas widget and any DOM input supplied by different frontends.
    stateWidget.draw = () => {};
    if (stateWidget.inputEl) stateWidget.inputEl.style.display = 'none';
    if (stateWidget.element) stateWidget.element.style.display = 'none';
    const root = panel(node, 'template_controls');
    let template = null;
    let list = [];
    let requestId = 0;
    const status = element('div', 'Loading library…');
    const libraryWarning = element('div', ''); libraryWarning.style.color = '#ff9999';
    const selector = element('select');
    const preset = element('select');
    const blocks = element('div');
    const refresh = element('button', 'Refresh');
    const edit = element('button', 'Edit library');
    const reset = element('button', 'Reset to defaults');
    const mode = element('button', 'Create snapshot');
    const updateSnapshot = element('button', 'Update snapshot');
    for (const control of [selector, preset]) Object.assign(control.style, { display: 'block', width: '100%', margin: '4px 0' });
    root.append(status, libraryWarning, selector, refresh, edit, reset, mode, updateSnapshot, preset, blocks);

    function save(state) {
        stateWidget.value = JSON.stringify(state);
        node.setDirtyCanvas?.(true, true);
    }
    function selectedState() { return readState(node); }
    function render() {
        blocks.replaceChildren();
        let saved;
        try { saved = selectedState(); } catch { saved = null; }
        if ((saved?.version === 2 && !template) || (template && (!Array.isArray(template.blocks) || !Array.isArray(template.presets) || typeof template.id !== 'string' || template.blocks.some(item => !item || typeof item.id !== 'string') || template.presets.some(item => !item || typeof item.id !== 'string')))) {
            preset.replaceChildren(); preset.disabled = true; status.textContent = 'Invalid saved snapshot.'; return;
        }
        preset.replaceChildren(new Option(template?.presets.length ? 'Choose preset…' : 'No presets', ''));
        preset.disabled = !template?.presets.length;
        if (!template) return;
        for (const item of template.presets) preset.add(new Option(item.name, item.id));
        let state;
        try { state = selectedState(); } catch (error) { status.textContent = error.message; return; }
        const error = stateError(template, state);
        if (error) { status.textContent = error; return; }
        status.textContent = `${template.name} \u2014 ${state.version === 2 ? 'Snapshot' : 'Live'}`;
        mode.textContent = state.version === 2 ? 'Switch to Live' : 'Create snapshot';
        updateSnapshot.disabled = state.version !== 2;
        preset.value = state.preset_id || '';
        for (const block of template.blocks) {
            const line = element('label');
            line.style.display = 'block';
            const box = element('input'); box.type = 'checkbox'; box.checked = state.blocks[block.id];
            box.onchange = () => {
                const current = selectedState();
                current.blocks = toggleBlock(template, current.blocks, block.id, box.checked);
                save(current); render();
            };
            line.append(box, document.createTextNode(` ${block.name} [${block.channel}]${block.exclusive_group ? ` (${block.exclusive_group})` : ''}`));
            blocks.append(line);
        }
    }
    async function load(id, initialize = false) {
        const initialState = stateWidget.value;
        const token = ++requestId;
        try {
            const result = await request(`/templates/${encodeURIComponent(id)}`);
            if (token !== requestId || (initialize && stateWidget.value !== initialState) || (!initialize && selectedState()?.version === 2)) return;
            template = result;
            if (initialize) save({ version: 1, template_id: id, preset_id: null, blocks: defaults(result) });
            else {
                const old = selectedState();
                const reconciled = reconcileSelection(result, old);
                if (reconciled && !stateError(result, reconciled) && JSON.stringify(old) !== JSON.stringify(reconciled)) save(reconciled);
            }
            render();
        } catch (error) {
            if (token !== requestId || stateWidget.value !== initialState) return;
            template = null; blocks.replaceChildren(); status.textContent = error.message;
        }
    }
    async function refreshList() {
        const token = ++requestId;
        let snapshot = null;
        try { const state = selectedState(); if (state?.version === 2) snapshot = state; } catch {}
        if (snapshot) { template = snapshot.template; render(); }
        try {
            const result = await request('/templates');
            if (token !== requestId) return;
            list = result.templates;
            libraryWarning.textContent = result.problems?.length ? `Cannot read template files: ${result.problems.join(', ')}. Open the editor to restore a backup.` : '';
            selector.replaceChildren(new Option(list.length ? 'Select template…' : 'Library is empty', ''));
            const counts = new Map();
            for (const item of list) counts.set(item.name, (counts.get(item.name) || 0) + 1);
            const seen = new Map();
            for (const item of list) {
                const ordinal = (seen.get(item.name) || 0) + 1;
                seen.set(item.name, ordinal);
                selector.add(new Option(counts.get(item.name) > 1 ? `${item.name} (${ordinal})` : item.name, item.id));
            }
            let state;
            try { state = selectedState(); } catch (error) { status.textContent = error.message; return; }
            if (state?.version === 2) { snapshot = state; template = state.template; render(); }
            if (state?.template_id) {
                if (!list.some(item => item.id === state.template_id)) selector.add(new Option(`Missing: ${state.template_id}`, state.template_id));
                selector.value = state.template_id;
                if (!snapshot) await load(state.template_id);
            } else { template = null; blocks.replaceChildren(); status.textContent = list.length ? 'Select a template.' : 'Library is empty.'; }
        } catch (error) { if (token === requestId) { if (snapshot) libraryWarning.textContent = `Library unavailable: ${error.message}`; else status.textContent = error.message; } }
    }
    selector.onchange = () => {
        const old = selectedState();
        if (old?.version === 2 && !window.confirm('Leave this snapshot and select a Live template?')) { selector.value = old.template_id; return; }
        if (selector.value) load(selector.value, true);
        else { ++requestId; template = null; stateWidget.value = ''; blocks.replaceChildren(); status.textContent = 'Select a template.'; }
    };
    refresh.onclick = refreshList;
    edit.onclick = () => {
        let state;
        try { state = selectedState(); } catch { state = null; }
        openEditor({ request, selectedId: state?.template_id, onChanged: refreshList });
    };
    reset.onclick = () => {
        if (!template) return;
        save({ ...selectedState(), preset_id: null, blocks: defaults(template) }); render();
    };
    preset.onchange = () => {
        const selected = template?.presets.find(item => item.id === preset.value);
        if (selected) { save({ ...selectedState(), preset_id: selected.id, blocks: presetSelection(template, selected) }); render(); }
    };
    mode.onclick = async () => {
        const current = selectedState();
        if (!template || !current || stateError(template, current)) return;
        const token = ++requestId;
        const original = JSON.stringify(current);
        try {
            const live = await request(`/templates/${encodeURIComponent(current.template_id)}`);
            if (token !== requestId || JSON.stringify(selectedState()) !== original) return;
            if (current.version === 1) {
                const error = stateError(live, current);
                if (error) throw new Error(`Cannot create snapshot: ${error} Refresh the template first.`);
                const changed = JSON.stringify(live) !== JSON.stringify(template);
                if (!window.confirm(`Save the current library template and selection as a snapshot? ${changed ? 'The library template changed since it was displayed.' : ''}`)) return;
                template = live;
                save({ ...current, version: 2, template: structuredClone(live) }); render(); return;
            }
            const changed = JSON.stringify(live) !== JSON.stringify(current.template);
            if (!window.confirm(`Switch to Live? ${changed ? 'The library template differs from this snapshot.' : 'The library template matches this snapshot.'}`)) return;
            const { template: ignored, ...old } = current;
            const next = reconcileSelection(live, { ...old, version: 1 });
            if (!next || stateError(live, next)) throw new Error('Cannot reconcile the current selection with the Live template.');
            template = live; save(next); render();
        } catch (error) { status.textContent = error.message; }
    };
    updateSnapshot.onclick = async () => {
        const current = selectedState();
        if (current?.version !== 2) return;
        const token = ++requestId;
        const original = JSON.stringify(current);
        try {
            const live = await request(`/templates/${encodeURIComponent(current.template_id)}`);
            if (token !== requestId || JSON.stringify(selectedState()) !== original) return;
            if (!window.confirm('Replace this snapshot with the current library template?')) return;
            const next = reconcileSelection(live, { ...current, template: live });
            if (!next || stateError(live, next)) throw new Error('Cannot reconcile the current selection with the library template.');
            template = live; save(next); render();
        } catch (error) { status.textContent = error.message; }
    };
    node._tagTemplateRefresh = refreshList;
    setTimeout(refreshList, 0);
}

function upstreamTemplate(node, input) {
    let linkId = input?.link;
    const visited = new Set();
    while (linkId != null) {
        if (visited.has(linkId)) throw new Error('Cycle in bundle connection.');
        visited.add(linkId);
        const links = app.graph.links;
        const link = links?.get ? links.get(linkId) : links?.[linkId];
        const source = link && app.graph.getNodeById(link.origin_id);
        if (!source) throw new Error('Bundle source not found.');
        if (source.comfyClass === 'TagTemplateManagerTemplate' || source.type === 'TagTemplateManagerTemplate') {
            const state = readState(source);
            if (!state) throw new Error('A connected template is not selected.');
            return state;
        }
        if (source.type === 'Reroute' || source.comfyClass === 'Reroute') {
            linkId = source.inputs?.[0]?.link;
            continue;
        }
        throw new Error('Preview supports Template nodes and reroutes only.');
    }
    throw new Error('Bundle source is disconnected.');
}

function upstreamBundler(input) {
    let linkId = input?.link;
    const visited = new Set();
    while (linkId != null) {
        if (visited.has(linkId)) throw new Error('Cycle in bundle connection.');
        visited.add(linkId);
        const links = app.graph.links;
        const link = links?.get ? links.get(linkId) : links?.[linkId];
        const source = link && app.graph.getNodeById(link.origin_id);
        if (!source) throw new Error('Bundle source not found.');
        if (source.comfyClass === 'TagTemplateManagerBundler' || source.type === 'TagTemplateManagerBundler') return source;
        if (source.type === 'Reroute' || source.comfyClass === 'Reroute') {
            linkId = source.inputs?.[0]?.link;
            continue;
        }
        throw new Error('Preview supports Bundler nodes and reroutes only.');
    }
    throw new Error('Bundle source is disconnected.');
}

function installMain(node) {
    const root = panel(node, 'prompt_preview');
    const button = element('button', 'Update preview');
    const status = element('div', 'Preview is manual; update after edits or library changes.');
    const output = element('pre');
    Object.assign(output.style, { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
    let sequence = 0;
    const directWidget = widget(node, 'direct_state');
    if (directWidget) {
        directWidget.type = 'hidden'; directWidget.computeSize = () => [0, -4]; directWidget.draw = () => {};
        if (directWidget.inputEl) directWidget.inputEl.style.display = 'none';
        if (directWidget.element) directWidget.element.style.display = 'none';
        const heading = element('strong', 'Direct template presets');
        const message = element('div', '');
        const rows = element('div'); rows.directRows = true;
        const add = element('button', 'Add template preset');
        const refresh = element('button', 'Refresh library');
        const manage = element('button', 'Template (0)');
        manage.type = 'button';
        root.append(manage);
        let dialog = null;
        function closeDialog() {
            if (!dialog) return;
            const current = dialog; dialog = null;
            current.close(); current.remove();
        }
        manage.onclick = () => {
            if (dialog) return;
            dialog = element('dialog');
            Object.assign(dialog.style, { width: 'min(900px, 92vw)', maxWidth: 'none', maxHeight: '85vh', overflow: 'auto',
                background: '#252525', color: '#eee', border: '1px solid #777', borderRadius: '8px', padding: '16px' });
            dialog.setAttribute('aria-label', 'Template presets');
            const close = element('button', 'Close'); close.type = 'button'; close.onclick = closeDialog;
            dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
            dialog.append(heading, message, add, refresh, rows, close);
            document.body.append(dialog); dialog.showModal();
            refreshLibrary();
        };
        const removed = node.onRemoved;
        node.onRemoved = function (...args) { ++generation; closeDialog(); return removed?.apply(this, args); };
        let list = [], cache = new Map(), generation = 0;
        function read() {
            if (!directWidget.value) return { version: 1, items: [] };
            const state = JSON.parse(directWidget.value);
            if (!state || state.version !== 1 || !Array.isArray(state.items) || state.items.length > 8 || state.items.some(item =>
                !item || !['live', 'snapshot'].includes(item.mode) || typeof item.template_id !== 'string' ||
                typeof item.preset_id !== 'string' || (item.mode === 'snapshot' &&
                    (!item.template || !Array.isArray(item.template.presets))))) throw new Error('Invalid direct selection state.');
            return state;
        }
        function save(state) {
            ++generation; ++sequence;
            directWidget.value = JSON.stringify(state);
            output.textContent = ''; status.textContent = 'Selection changed; update preview.';
            node.setDirtyCanvas?.(true, true); render();
        }
        function render() {
            rows.replaceChildren();
            let state;
            try { state = read(); } catch (error) { manage.textContent = 'Template (?)'; message.textContent = error.message; add.disabled = true; return; }
            manage.textContent = `Template (${state.items.filter(item => item.template_id).length})`;
            add.disabled = state.items.length >= 8;
            state.items.forEach((item, index) => {
                const row = element('div');
                const select = element('select');
                select.add(new Option('Select template…', ''));
                for (const entry of list) select.add(new Option(`${entry.name} (${entry.id})`, entry.id));
                if (item.template_id && !list.some(entry => entry.id === item.template_id)) select.add(new Option(`Missing: ${item.template_id}`, item.template_id));
                select.value = item.template_id || '';
                const preset = element('select'); preset.add(new Option('Select preset…', ''));
                const template = item.mode === 'snapshot' ? item.template : cache.get(item.template_id);
                for (const entry of template?.presets || []) preset.add(new Option(`${entry.name} (${entry.id})`, entry.id));
                if (item.preset_id && !template?.presets?.some(entry => entry.id === item.preset_id)) preset.add(new Option(`Missing: ${item.preset_id}`, item.preset_id));
                preset.value = item.preset_id || '';
                select.onchange = async () => {
                    if (item.mode === 'snapshot' && !window.confirm('Leave this snapshot and choose a Live template?')) { render(); return; }
                    state.items[index] = { mode: 'live', template_id: select.value, preset_id: '' }; save(state);
                    if (select.value) await loadTemplate(select.value);
                };
                preset.onchange = () => { state.items[index].preset_id = preset.value; save(state); };
                const mode = element('button', item.mode === 'snapshot' ? 'Switch to Live' : 'Create snapshot');
                mode.onclick = async () => {
                    const token = ++generation, original = directWidget.value;
                    try {
                        if (!item.template_id || !item.preset_id) throw new Error('Select a template and preset first.');
                        const live = await request(`/templates/${encodeURIComponent(item.template_id)}`);
                        if (token !== generation || original !== directWidget.value) return;
                        if (!live.presets?.some(p => p.id === item.preset_id)) throw new Error('Preset not found in library.');
                        if (!window.confirm(item.mode === 'snapshot' ? 'Switch to Live? Output may change.' : 'Create a snapshot from the current library template?')) return;
                        cache.set(item.template_id, live);
                        state.items[index] = item.mode === 'snapshot' ? { mode: 'live', template_id: item.template_id, preset_id: item.preset_id } : { ...item, mode: 'snapshot', template: structuredClone(live) };
                        save(state);
                    } catch (error) { if (token === generation) message.textContent = error.message; }
                };
                const update = element('button', 'Update snapshot'); update.disabled = item.mode !== 'snapshot';
                update.onclick = async () => {
                    const token = ++generation, original = directWidget.value;
                    try {
                        const live = await request(`/templates/${encodeURIComponent(item.template_id)}`);
                        if (token !== generation || original !== directWidget.value) return;
                        if (!live.presets?.some(p => p.id === item.preset_id)) throw new Error('Preset not found in library.');
                        if (!window.confirm('Replace this snapshot with the current library template?')) return;
                        state.items[index] = { ...item, template: structuredClone(live) }; save(state);
                    } catch (error) { if (token === generation) message.textContent = error.message; }
                };
                const up = element('button', '↑'); up.disabled = index === 0;
                up.onclick = () => { [state.items[index - 1], state.items[index]] = [state.items[index], state.items[index - 1]]; save(state); };
                const down = element('button', '↓'); down.disabled = index === state.items.length - 1;
                down.onclick = () => { [state.items[index + 1], state.items[index]] = [state.items[index], state.items[index + 1]]; save(state); };
                const remove = element('button', 'Remove'); remove.onclick = () => { state.items.splice(index, 1); save(state); };
                row.append(select, preset, mode, update, up, down, remove); rows.append(row);
            });
        }
        async function loadTemplate(id) {
            const token = ++generation;
            try {
                const template = await request(`/templates/${encodeURIComponent(id)}`);
                if (token !== generation) return;
                cache.set(id, template); message.textContent = ''; render();
            } catch (error) { if (token === generation) { cache.delete(id); message.textContent = error.message; render(); } }
        }
        async function refreshLibrary() {
            const token = ++generation;
            try {
                const result = await request('/templates');
                const state = read();
                const ids = [...new Set(state.items.filter(item => item.mode === 'live' && item.template_id).map(item => item.template_id))];
                const loaded = await Promise.all(ids.map(async id => { try { return [id, await request(`/templates/${encodeURIComponent(id)}`)]; } catch { return [id, null]; } }));
                if (token !== generation) return;
                list = result.templates; cache = new Map(loaded.filter(([, value]) => value));
                message.textContent = result.problems?.length ? `Cannot read template files: ${result.problems.join(', ')}` : '';
                render();
            } catch (error) { if (token === generation) { message.textContent = error.message; render(); } }
        }
        add.onclick = () => { try { const state = read(); if (state.items.length < 8) { state.items.push({ mode: 'live', template_id: '', preset_id: '' }); save(state); } } catch (error) { message.textContent = error.message; } };
        refresh.onclick = refreshLibrary;
        node._tagDirectRefresh = refreshLibrary;
        render(); setTimeout(refreshLibrary, 0);
    }
    root.append(button, status, element('strong', 'Preview'), output);
    button.onclick = async () => {
        const current = ++sequence;
        output.textContent = ''; status.textContent = 'Loading…';
        try {
            for (const name of ['channel', 'text', 'deduplicate', 'exclude']) {
                if (node.inputs?.some(input => input.name === name && input.link != null)) throw new Error(`Preview cannot evaluate connected ${name} input.`);
            }
            const states = [];
            const bundleInput = node.inputs?.find(item => item.name === 'bundles');
            const bundleSource = bundleInput?.link != null ? upstreamBundler(bundleInput) : null;
            for (let i = 1; i <= 8; i++) {
                const input = bundleSource?.inputs?.find(item => item.name === `bundle_${i}`);
                if (input?.link != null) states.push(upstreamTemplate(bundleSource, input));
            }
            const body = { states, channel: widget(node, 'channel')?.value ?? 'positive', text: widget(node, 'text')?.value ?? '', deduplicate: widget(node, 'deduplicate')?.value ?? false, exclude: widget(node, 'exclude')?.value ?? '' };
            if (directWidget) body.direct_state = directWidget.value || '';
            const result = await request('/preview-single', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (current !== sequence) return;
            if (['channel', 'text', 'deduplicate', 'exclude'].some(name => (widget(node, name)?.value ?? (name === 'channel' ? 'positive' : name === 'deduplicate' ? false : '')) !== body[name]) || (directWidget && (directWidget.value || '') !== body.direct_state)) {
                status.textContent = 'Inputs changed; update preview.'; return;
            }
            output.textContent = result.text;
            status.textContent = 'Preview at last update. Refresh after edits or library changes.';
        } catch (error) { if (current === sequence) status.textContent = error.message; }
    };
}

app.registerExtension({
    name: 'tag-template-manager.nodes',
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!['TagTemplateManagerTemplate', 'TagTemplateManagerSingleMain', 'TagTemplateManagerEncodedMain'].includes(nodeData.name)) return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = created?.apply(this, args);
            if (nodeData.name === 'TagTemplateManagerTemplate') installTemplate(this);
            else installMain(this);
            const minHeight = nodeData.name === 'TagTemplateManagerTemplate' ? 300 : 520;
            this.setSize?.([Math.max(this.size?.[0] || 0, 340), Math.max(this.size?.[1] || 0, minHeight)]);
            return result;
        };
        if (nodeData.name === 'TagTemplateManagerTemplate' || nodeData.name === 'TagTemplateManagerSingleMain' || nodeData.name === 'TagTemplateManagerEncodedMain') {
            const configured = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (...args) {
                const result = configured?.apply(this, args);
                if (nodeData.name !== 'TagTemplateManagerTemplate') {
                    this.setSize?.([Math.max(this.size?.[0] || 0, 340), Math.max(this.size?.[1] || 0, 520)]);
                }
                setTimeout(() => this._tagTemplateRefresh?.(), 0);
                setTimeout(() => this._tagDirectRefresh?.(), 0);
                return result;
            };
        }
    },
});

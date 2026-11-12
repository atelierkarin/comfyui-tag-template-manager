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
    if (!response.ok) throw new Error(data.error || `Server error (${response.status})`);
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
    const selector = element('select');
    const preset = element('select');
    const blocks = element('div');
    const refresh = element('button', 'Refresh');
    const edit = element('button', 'Edit library');
    const reset = element('button', 'Reset to defaults');
    for (const control of [selector, preset]) Object.assign(control.style, { display: 'block', width: '100%', margin: '4px 0' });
    root.append(status, selector, refresh, edit, reset, preset, blocks);

    function save(state) {
        stateWidget.value = JSON.stringify(state);
        node.setDirtyCanvas?.(true, true);
    }
    function selectedState() { return readState(node); }
    function render() {
        blocks.replaceChildren();
        preset.replaceChildren(new Option(template?.presets.length ? 'Choose preset…' : 'No presets', ''));
        preset.disabled = !template?.presets.length;
        if (!template) return;
        for (const item of template.presets) preset.add(new Option(item.name, item.id));
        let state;
        try { state = selectedState(); } catch (error) { status.textContent = error.message; return; }
        const error = stateError(template, state);
        if (error) { status.textContent = error; return; }
        status.textContent = `${template.name} — Live`;
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
        const token = ++requestId;
        try {
            const result = await request(`/templates/${encodeURIComponent(id)}`);
            if (token !== requestId) return;
            template = result;
            if (initialize) save({ version: 1, template_id: id, preset_id: null, blocks: defaults(result) });
            else {
                const old = selectedState();
                const reconciled = reconcileSelection(result, old);
                if (reconciled && !stateError(result, reconciled) && JSON.stringify(old) !== JSON.stringify(reconciled)) save(reconciled);
            }
            render();
        } catch (error) {
            if (token !== requestId) return;
            template = null; blocks.replaceChildren(); status.textContent = error.message;
        }
    }
    async function refreshList() {
        const token = ++requestId;
        try {
            const result = await request('/templates');
            if (token !== requestId) return;
            list = result.templates;
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
            if (state?.template_id) {
                if (!list.some(item => item.id === state.template_id)) selector.add(new Option(`Missing: ${state.template_id}`, state.template_id));
                selector.value = state.template_id;
                await load(state.template_id);
            } else { template = null; blocks.replaceChildren(); status.textContent = list.length ? 'Select a template.' : 'Library is empty.'; }
        } catch (error) { if (token === requestId) status.textContent = error.message; }
    }
    selector.onchange = () => {
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
        save({ version: 1, template_id: template.id, preset_id: null, blocks: defaults(template) }); render();
    };
    preset.onchange = () => {
        const selected = template?.presets.find(item => item.id === preset.value);
        if (selected) { save({ version: 1, template_id: template.id, preset_id: selected.id, blocks: presetSelection(template, selected) }); render(); }
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

function installMain(node) {
    const root = panel(node, 'prompt_preview');
    const button = element('button', 'Update preview');
    const status = element('div', 'Preview is manual; update after edits or library changes.');
    const output = element('pre');
    Object.assign(output.style, { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
    root.append(button, status, element('strong', 'Preview'), output);
    let sequence = 0;
    button.onclick = async () => {
        const current = ++sequence;
        output.textContent = ''; status.textContent = 'Loading…';
        try {
            for (const name of ['channel', 'text', 'deduplicate', 'exclude']) {
                if (node.inputs?.some(input => input.name === name && input.link != null)) throw new Error(`Preview cannot evaluate connected ${name} input.`);
            }
            const states = [];
            for (let i = 1; i <= 8; i++) {
                const input = node.inputs?.find(item => item.name === `bundle_${i}`);
                if (input?.link != null) states.push(upstreamTemplate(node, input));
            }
            const body = { states, channel: widget(node, 'channel')?.value ?? 'positive', text: widget(node, 'text')?.value ?? '', deduplicate: widget(node, 'deduplicate')?.value ?? false, exclude: widget(node, 'exclude')?.value ?? '' };
            const result = await request('/preview-single', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (current !== sequence) return;
            output.textContent = result.text;
            status.textContent = 'Preview at last update. Refresh after edits or library changes.';
        } catch (error) { if (current === sequence) status.textContent = error.message; }
    };
}

app.registerExtension({
    name: 'tag-template-manager.nodes',
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!['TagTemplateManagerTemplate', 'TagTemplateManagerSingleMain'].includes(nodeData.name)) return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = created?.apply(this, args);
            if (nodeData.name === 'TagTemplateManagerTemplate') installTemplate(this);
            else installMain(this);
            this.setSize?.([Math.max(this.size?.[0] || 0, 340), Math.max(this.size?.[1] || 0, 300)]);
            return result;
        };
        if (nodeData.name === 'TagTemplateManagerTemplate') {
            const configured = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (...args) {
                const result = configured?.apply(this, args);
                setTimeout(() => this._tagTemplateRefresh?.(), 0);
                return result;
            };
        }
    },
});

"""Pure selection and prompt composition functions."""

import re

from .schema import ValidationError, _groups, validate_template


def _selection(template, selection):
    if not isinstance(selection, dict): raise ValidationError('selection: expected object')
    ids = {block['id'] for block in template['blocks']}
    if selection.keys() != ids: raise ValidationError('selection: missing or unknown block ID')
    if any(type(value) is not bool for value in selection.values()):
        raise ValidationError('selection: expected boolean values')
    _groups(template['blocks'], {key for key, enabled in selection.items() if enabled}, 'selection')
    return dict(selection)


def default_selection(template):
    template = validate_template(template)
    return {block['id']: block['default_enabled'] for block in template['blocks']}


def apply_preset(template, preset_id):
    template = validate_template(template)
    for preset in template['presets']:
        if preset['id'] == preset_id:
            return {block['id']: block['id'] in preset['enabled_block_ids'] for block in template['blocks']}
    raise ValidationError(f'preset: unknown ID {preset_id!r}')


def set_block(template, selection, block_id, enabled):
    template = validate_template(template)
    result = _selection(template, selection)
    if type(enabled) is not bool: raise ValidationError('enabled: expected boolean')
    blocks = {block['id']: block for block in template['blocks']}
    if block_id not in blocks: raise ValidationError(f'block: unknown ID {block_id!r}')
    group = blocks[block_id]['exclusive_group']
    if enabled and group is not None:
        for block in template['blocks']:
            if block['exclusive_group'] == group and block['channel'] == blocks[block_id]['channel']:
                result[block['id']] = False
    result[block_id] = enabled
    return result


def _split_fragment(fragment):
    """Split top-level commas without altering escaped or bracketed syntax."""
    stack, pieces, start, escaped = [], [], 0, False
    pairs = {')': '(', ']': '[', '}': '{'}
    for index, char in enumerate(fragment):
        if escaped:
            escaped = False
        elif char == '\\':
            escaped = True
        elif char in '([{':
            stack.append(char)
        elif char in ')]}':
            if not stack or stack.pop() != pairs[char]:
                return None
        elif char == ',' and not stack:
            pieces.append(fragment[start:index])
            start = index + 1
    if stack or escaped:
        return None
    pieces.append(fragment[start:])
    return pieces


def _plain_tag(text):
    return bool(re.fullmatch(r'[\w\s-]+', text, flags=re.UNICODE)) and text != 'BREAK'


def _join(fragments, deduplicate, exclude=''):
    parts, seen = [], set()
    excluded = set()
    for entry in re.split(r'[,\r\n]+', exclude):
        entry = ' '.join(entry.split())
        if entry and _plain_tag(entry):
            excluded.add(entry.casefold())
    for fragment in fragments:
        fragment = fragment.strip(' \t\r\n,')
        if not fragment: continue
        items = _split_fragment(fragment)
        if items is None:
            parts.append(fragment)
            continue
        safe_dedupe = deduplicate and re.fullmatch(r'[A-Za-z0-9_ ,\t\r\n-]+', fragment) and not re.search(r'\bBREAK\b', fragment)
        for item in items:
            item = item.strip()
            if not item: continue
            plain = _plain_tag(item)
            if plain:
                item = ' '.join(item.split())
                if item.casefold() in excluded: continue
            if safe_dedupe and item in seen: continue
            if safe_dedupe: seen.add(item)
            parts.append(item)
    return ', '.join(parts)


def build_prompts(selections, positive='', negative='', deduplicate=False, exclude=''):
    if not isinstance(positive, str) or not isinstance(negative, str) or not isinstance(exclude, str) or type(deduplicate) is not bool:
        raise ValidationError('prompt inputs: expected strings and boolean')
    channels = {'positive': [], 'negative': []}
    for template, selection in selections:
        template = validate_template(template)
        selection = _selection(template, selection)
        for block in template['blocks']:
            if selection[block['id']]: channels[block['channel']].append(block['tags'])
    channels['positive'].append(positive)
    channels['negative'].append(negative)
    return _join(channels['positive'], deduplicate, exclude), _join(channels['negative'], deduplicate, exclude)

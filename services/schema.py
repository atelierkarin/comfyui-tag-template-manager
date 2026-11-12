"""Validation of version 1 template data."""

import copy
import json
import re


class ValidationError(ValueError):
    """Invalid template or selection, with a field path and reason."""


def validate_id(value, path="id"):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
        raise ValidationError(f"{path}: invalid ID")
    # Windows treats these names as devices even with a .json extension.
    if value.upper() in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}:
        raise ValidationError(f"{path}: reserved filename")
    return value


def _object(value, fields, path):
    if not isinstance(value, dict):
        raise ValidationError(f"{path}: expected object")
    missing, extra = fields - value.keys(), value.keys() - fields
    if missing or extra:
        raise ValidationError(f"{path}: missing {sorted(missing)}, unknown {sorted(extra)}")


def _string(value, path, nonempty=False):
    if not isinstance(value, str) or (nonempty and not value.strip()):
        raise ValidationError(f"{path}: expected {'nonempty ' if nonempty else ''}string")


def _groups(blocks, enabled, path):
    seen = set()
    for block in blocks:
        group = (block['channel'], block['exclusive_group']) if block['exclusive_group'] is not None else None
        if block['id'] in enabled and group is not None:
            if group in seen:
                raise ValidationError(f"{path}: exclusive group {group!r} has multiple enabled blocks")
            seen.add(group)


def validate_template(data):
    _object(data, {'schema_version', 'id', 'name', 'category', 'description', 'blocks', 'presets'}, '$')
    if type(data['schema_version']) is not int or data['schema_version'] != 1:
        raise ValidationError('$.schema_version: unsupported version')
    validate_id(data['id'], '$.id')
    for key in ('name', 'category', 'description'):
        _string(data[key], '$.' + key, key == 'name')
    for key in ('blocks', 'presets'):
        if not isinstance(data[key], list):
            raise ValidationError(f'$.{key}: expected array')
    ids = set()
    for i, block in enumerate(data['blocks']):
        path = f'$.blocks[{i}]'
        _object(block, {'id', 'name', 'channel', 'default_enabled', 'exclusive_group', 'tags'}, path)
        validate_id(block['id'], path + '.id')
        if block['id'] in ids: raise ValidationError(f'{path}.id: duplicate')
        ids.add(block['id'])
        _string(block['name'], path + '.name', True)
        if block['channel'] not in ('positive', 'negative'): raise ValidationError(f'{path}.channel: invalid channel')
        if type(block['default_enabled']) is not bool: raise ValidationError(f'{path}.default_enabled: expected boolean')
        if block['exclusive_group'] is not None: _string(block['exclusive_group'], path + '.exclusive_group', True)
        _string(block['tags'], path + '.tags')
    _groups(data['blocks'], {b['id'] for b in data['blocks'] if b['default_enabled']}, '$.blocks')
    preset_ids = set()
    for i, preset in enumerate(data['presets']):
        path = f'$.presets[{i}]'
        _object(preset, {'id', 'name', 'enabled_block_ids'}, path)
        validate_id(preset['id'], path + '.id')
        if preset['id'] in preset_ids: raise ValidationError(f'{path}.id: duplicate')
        preset_ids.add(preset['id'])
        _string(preset['name'], path + '.name', True)
        enabled = preset['enabled_block_ids']
        if not isinstance(enabled, list): raise ValidationError(f'{path}.enabled_block_ids: expected array')
        for j, item in enumerate(enabled): validate_id(item, f'{path}.enabled_block_ids[{j}]')
        if len(set(enabled)) != len(enabled) or not set(enabled) <= ids:
            raise ValidationError(f'{path}.enabled_block_ids: duplicate or unknown ID')
        _groups(data['blocks'], set(enabled), path)
    return copy.deepcopy(data)


def parse_template(text):
    def no_duplicates(pairs):
        result = {}
        for key, value in pairs:
            if key in result: raise ValidationError(f'JSON: duplicate key {key!r}')
            result[key] = value
        return result
    try:
        return validate_template(json.loads(text, object_pairs_hook=no_duplicates))
    except json.JSONDecodeError as exc:
        raise ValidationError(f'JSON: {exc}') from exc

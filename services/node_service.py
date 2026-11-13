"""Shared workflow-state and prompt operations for nodes and HTTP routes."""

import copy
import json
from pathlib import Path

from .prompt_builder import build_prompts
from .schema import ValidationError, validate_id, validate_template
from .template_store import TemplateStore


class UnsupportedModeError(RuntimeError):
    """The current ComfyUI user mode is unsupported."""


def store_for_user(user_directory, multi_user):
    if multi_user:
        raise UnsupportedModeError('Multi-user mode is not supported by Tag Template Manager.')
    return TemplateStore(Path(user_directory) / 'default' / 'tag_templates')


def decode_state(text):
    def unique(pairs):
        obj = {}
        for key, value in pairs:
            if key in obj:
                raise ValidationError(f'state: duplicate key {key!r}')
            obj[key] = value
        return obj
    try:
        state = json.loads(text, object_pairs_hook=unique)
    except (ValueError, TypeError) as exc:
        raise ValidationError('State is not valid JSON; select a template.') from exc
    if not isinstance(state, dict) or type(state.get('version')) is not int or state['version'] not in (1, 2):
        raise ValidationError('Unsupported state version; restore a compatible workflow.')
    fields = {'version', 'template_id', 'preset_id', 'blocks'}
    if state['version'] == 2:
        fields.add('template')
    if set(state) != fields:
        raise ValidationError('State is invalid; select a template or restore its state.')
    validate_id(state['template_id'], 'template_id')
    if state['preset_id'] is not None:
        validate_id(state['preset_id'], 'preset_id')
    if not isinstance(state['blocks'], dict):
        raise ValidationError('blocks: expected a block selection object')
    return state


def make_bundle(store, state):
    state = decode_state(json.dumps(state))
    if state['version'] == 2:
        template = validate_template(state['template'])
        if template['id'] != state['template_id']:
            raise ValidationError('Snapshot template ID does not match state.')
    else:
        template = store.load(state['template_id'])
    expected = {b['id'] for b in template['blocks']}
    actual = set(state['blocks'])
    if expected != actual:
        raise ValidationError(f"Template {state['template_id']}: blocks changed; "
                              f"added={sorted(expected - actual)}, removed={sorted(actual - expected)}. "
                              'Reset the selection or apply a preset.')
    build_prompts([(template, state['blocks'])])
    return {'template_id': state['template_id'], 'template': template, 'blocks': copy.deepcopy(state['blocks'])}


def compose(bundles, positive='', negative='', deduplicate=False, exclude=''):
    return build_prompts([(bundle['template'], bundle['blocks']) for bundle in bundles],
                         positive, negative, deduplicate, exclude)


def compose_single(bundles, channel, text='', deduplicate=False, exclude=''):
    if channel not in ('positive', 'negative'):
        raise ValidationError('channel: choose positive or negative')
    positive, negative = compose(bundles, text if channel == 'positive' else '',
                                 text if channel == 'negative' else '', deduplicate, exclude)
    return positive if channel == 'positive' else negative

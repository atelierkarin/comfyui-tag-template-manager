import copy
import json
from contextlib import contextmanager
import shutil
import uuid
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.schema import ValidationError, validate_template, parse_template
from services.template_store import TemplateStore, StoreError, AlreadyExistsError, NotFoundError
from services.prompt_builder import default_selection, apply_preset, set_block, build_prompts


@contextmanager
def temporary_directory():
    # Inherit the workspace ACL; Windows Python 3.13 creates mode-0700
    # TemporaryDirectory folders that the restricted test process cannot write.
    path = Path(__file__).resolve().parent / ('work-' + uuid.uuid4().hex)
    path.mkdir()
    try:
        yield path
    finally:
        shutil.rmtree(path)


def sample():
    return {"schema_version": 1, "id": "test", "name": "日本語", "category": "", "description": "",
            "blocks": [
                {"id": "a", "name": "A", "channel": "positive", "default_enabled": True, "exclusive_group": "outfit", "tags": " cat, dog "},
                {"id": "b", "name": "B", "channel": "positive", "default_enabled": False, "exclusive_group": "outfit", "tags": "(x, y), cat"},
                {"id": "n", "name": "N", "channel": "negative", "default_enabled": True, "exclusive_group": None, "tags": "bad"}],
            "presets": [{"id": "p", "name": "P", "enabled_block_ids": ["b", "n"]}]}


class SchemaTests(unittest.TestCase):
    def test_valid_and_copy(self):
        data = sample()
        result = validate_template(data)
        self.assertEqual(result, data)
        result['blocks'][0]['tags'] = 'changed'
        self.assertNotEqual(result, data)

    def test_invalid_data(self):
        cases = []
        for mutate in (lambda d: d.update(id='../bad'), lambda d: d.update(schema_version=True),
                       lambda d: d.update(extra=1), lambda d: d.pop('name'),
                       lambda d: d['blocks'].append(copy.deepcopy(d['blocks'][0])),
                       lambda d: d['blocks'][1].update(default_enabled=True),
                       lambda d: d['presets'][0].update(enabled_block_ids=['missing']),
                       lambda d: d['presets'][0].update(enabled_block_ids=['a', 'b'])):
            d = sample(); mutate(d); cases.append(d)
        for data in cases:
            with self.subTest(data=data), self.assertRaises(ValidationError): validate_template(data)
        with self.assertRaises(ValidationError): parse_template('{"id": 1, "id": 2}')


class StoreTests(unittest.TestCase):
    def test_lifecycle_and_errors(self):
        with temporary_directory() as root:
            store = TemplateStore(root); data = sample()
            store.create(data)
            self.assertEqual(store.load('test'), data)
            self.assertEqual(store.list(), [data])
            with self.assertRaises(AlreadyExistsError): store.create(data)
            data['name'] = '新しい名前'; store.update(data)
            self.assertEqual(store.load('test'), data)
            with self.assertRaises(ValidationError): store.load('../outside')
            store.delete('test')
            with self.assertRaises(NotFoundError): store.load('test')
            with self.assertRaises(NotFoundError): store.update(data)

    def test_corruption_and_failed_update(self):
        with temporary_directory() as root:
            store = TemplateStore(root); data = sample(); store.create(data)
            with patch('services.template_store.os.replace', side_effect=OSError('failed')):
                with self.assertRaises(StoreError): store.update(data)
            self.assertEqual(store.load('test'), data)
            Path(root, 'bad.json').write_text('{invalid', encoding='utf-8')
            with self.assertRaises(StoreError): store.list()

    def test_mismatched_file_id_and_missing_delete(self):
        with temporary_directory() as root:
            store = TemplateStore(root)
            Path(root, 'other.json').write_text(json.dumps(sample()), encoding='utf-8')
            with self.assertRaises(StoreError): store.load('other')
            with self.assertRaises(NotFoundError): store.delete('missing')

    def test_create_is_non_destructive(self):
        with temporary_directory() as root:
            store = TemplateStore(root)
            data = sample(); store.create(data)
            changed = sample(); changed['name'] = '別名'
            with self.assertRaises(AlreadyExistsError): store.create(changed)
            self.assertEqual(store.load('test'), data)


class BuilderTests(unittest.TestCase):
    def test_channel_specific_exclusive_groups(self):
        data = sample()
        data['blocks'][1]['channel'] = 'negative'
        data['blocks'][1]['default_enabled'] = True
        data['presets'][0]['enabled_block_ids'] = ['a', 'b']
        validate_template(data)
        selection = default_selection(data)
        self.assertTrue(selection['a'] and selection['b'])
        selection = set_block(data, selection, 'a', True)
        self.assertTrue(selection['b'])
        self.assertEqual(apply_preset(data, 'p')['a'], True)

    def test_normalize_and_exclude_simple_exact_tags(self):
        data = sample()
        data['blocks'][0]['tags'] = ' cat,  ribbon ,\n red   dress, (long, hair), [x, y], hair ribbon, RIBBON '
        selection = default_selection(data)
        self.assertEqual(build_prompts([(data, selection)], ' extra  tag, ribbon ', exclude='ribbon')[0],
                         'cat, red dress, (long, hair), [x, y], hair ribbon, extra tag')
        self.assertEqual(build_prompts([], 'cat, (ribbon, bow), ribbon', exclude='ribbon')[0],
                         'cat, (ribbon, bow)')
        self.assertEqual(build_prompts([], 'cat, (ribbon, bow', exclude='cat')[0], 'cat, (ribbon, bow')
        self.assertEqual(build_prompts([], ' cat, \\,, ribbon, (tag: 1.2), [a, b] ', exclude='ribbon')[0],
                         'cat, \\,, (tag: 1.2), [a, b]')
        self.assertEqual(build_prompts([], '', 'bad,\n  blurry  image')[1], 'bad, blurry image')

    def test_same_channel_still_exclusive(self):
        data = sample()
        data['blocks'][1]['default_enabled'] = True
        with self.assertRaises(ValidationError): validate_template(data)

    def test_selection_and_build(self):
        data = sample(); initial = default_selection(data)
        other = set_block(data, initial, 'b', True)
        self.assertTrue(initial['a']); self.assertFalse(other['a']); self.assertTrue(other['b'])
        self.assertEqual(other, apply_preset(data, 'p'))
        self.assertEqual(build_prompts([(data, initial), (data, other)], 'cat, cat', 'bad', True),
                         ('cat, dog, (x, y), cat', 'bad'))
        self.assertEqual(build_prompts([(data, initial)], ' cat ', '', False), ('cat, dog, cat', 'bad'))
        with self.assertRaises(ValidationError): build_prompts([(data, {'a': True})])

    def test_special_fragments_are_preserved(self):
        self.assertEqual(build_prompts([], 'cat, BREAK, cat', '(bad, ugly)', True),
                         ('cat, BREAK, cat', '(bad, ugly)'))
        self.assertEqual(build_prompts([], '猫, 猫', 'bad, bad', True), ('猫, 猫', 'bad'))

    def test_invalid_selections_and_preset(self):
        data = sample()
        for state in ({'a': True, 'b': True, 'n': False},
                      {'a': 1, 'b': False, 'n': False},
                      {'a': True, 'b': False, 'extra': False}):
            with self.subTest(state=state), self.assertRaises(ValidationError):
                build_prompts([(data, state)])
        with self.assertRaises(ValidationError): apply_preset(data, 'missing')


if __name__ == '__main__': unittest.main()

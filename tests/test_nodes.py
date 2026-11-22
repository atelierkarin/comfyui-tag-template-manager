import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from services.node_service import decode_state, make_bundle, compose, UnsupportedModeError, store_for_user
from services.schema import ValidationError
from services.template_store import TemplateStore, NotFoundError
from test_core import sample, temporary_directory


def state(selection=None):
    return json.dumps({"version": 1, "template_id": "test", "preset_id": None,
                       "blocks": selection or {"a": True, "b": False, "n": True}})


class NodeServiceTests(unittest.TestCase):
    def test_direct_live_snapshot_order_and_validation(self):
        from services.node_service import resolve_direct
        with temporary_directory() as root:
            store = TemplateStore(root); template = sample(); store.create(template)
            live = {'mode': 'live', 'template_id': 'test', 'preset_id': 'p'}
            snap = dict(live, mode='snapshot', template=template)
            encode = lambda items: json.dumps({'version': 1, 'items': items})
            self.assertEqual(compose(resolve_direct(store, encode([live, snap])))[0], '(x, y), cat, (x, y), cat')
            changed = sample(); changed['blocks'][1]['tags'] = 'new'; store.update(changed)
            self.assertEqual(compose(resolve_direct(store, encode([live, snap])))[0], 'new, (x, y), cat')
            store.delete('test')
            self.assertEqual(compose(resolve_direct(store, encode([snap])))[0], '(x, y), cat')
            for bad in ([live], [dict(snap, preset_id='missing')], [dict(snap, template_id='wrong')], [snap] * 9, [{}]):
                with self.subTest(bad=bad), self.assertRaises((ValueError, NotFoundError)):
                    resolve_direct(store, encode(bad))
            with self.assertRaises(ValueError): resolve_direct(store, '{"version":1,"version":1,"items":[]}')

    def test_state_validation(self):
        self.assertEqual(decode_state(state())["template_id"], "test")
        for value in ('', '{}', '{', '{"version": 2}', state({"a": True})):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                parsed = decode_state(value)
                with temporary_directory() as root:
                    store = TemplateStore(root); store.create(sample()); make_bundle(store, parsed)

    def test_bundle_and_compose(self):
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            first = make_bundle(store, decode_state(state()))
            second = make_bundle(store, decode_state(state({"a": False, "b": True, "n": True})))
            self.assertEqual(compose([first, second], 'cat', 'bad', True),
                             ('cat, dog, (x, y), cat', 'bad'))
            updated = sample(); updated['blocks'][0]['tags'] = 'changed'; store.update(updated)
            self.assertIn('changed', compose([make_bundle(store, decode_state(state()))])[0])
            store.delete('test')
            with self.assertRaises(NotFoundError): make_bundle(store, decode_state(state()))

    def test_snapshot_remains_usable_when_library_changes_or_disappears(self):
        with temporary_directory() as root:
            store = TemplateStore(root); template = sample(); store.create(template)
            saved = json.loads(state())
            saved.update(version=2, template=template)
            decoded = decode_state(json.dumps(saved))
            store.delete('test')
            bundle = make_bundle(store, decoded)
            self.assertEqual(compose([bundle]), ('cat, dog', 'bad'))
            invalid = dict(saved); invalid['template'] = dict(template, id='wrong')
            with self.assertRaises(ValueError): make_bundle(store, invalid)

    def test_multiplayer_rejected(self):
        with temporary_directory() as root:
            with self.assertRaises(UnsupportedModeError): store_for_user(root, True)
            self.assertEqual(store_for_user(root, False).root, Path(root, 'default', 'tag_templates').resolve())


if __name__ == '__main__': unittest.main()

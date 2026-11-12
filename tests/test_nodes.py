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

    def test_multiplayer_rejected(self):
        with temporary_directory() as root:
            with self.assertRaises(UnsupportedModeError): store_for_user(root, True)
            self.assertEqual(store_for_user(root, False).root, Path(root, 'default', 'tag_templates').resolve())


if __name__ == '__main__': unittest.main()

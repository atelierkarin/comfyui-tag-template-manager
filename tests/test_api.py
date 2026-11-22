import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from test_core import sample, temporary_directory

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('tag_api_test', root / '__init__.py', submodule_search_locations=[str(root)])
package = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = package
spec.loader.exec_module(package)
from tag_api_test.api import routes
from tag_api_test.services.template_store import TemplateStore
from tag_api_test.nodes import TagSingleMainNode, TagTemplateNode


class Request:
    def __init__(self, body=None, template_id='test'):
        self.body = body
        self.match_info = {'template_id': template_id}
    async def json(self): return self.body


class ApiTests(unittest.TestCase):
    def test_direct_preview_matches_execution_with_bundler(self):
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            state = {'version': 1, 'template_id': 'test', 'preset_id': None,
                     'blocks': {'a': True, 'b': False, 'n': True}}
            direct = json.dumps({'version': 1, 'items': [{'mode': 'live', 'template_id': 'test', 'preset_id': 'p'}]})
            body = {'states': [state], 'channel': 'positive', 'text': 'extra', 'deduplicate': False, 'direct_state': direct}
            with patch('tag_api_test.nodes.current_store', return_value=store), patch.object(routes, 'current_store', return_value=store):
                bundle = TagTemplateNode().execute(json.dumps(state))[0]
                expected = TagSingleMainNode().execute('positive', 'extra', False, bundles=[bundle], direct_state=direct)[0]
                response = asyncio.run(routes.preview_single(Request(body)))
                self.assertEqual(json.loads(response.text)['text'], expected)
                self.assertEqual(expected, '(x, y), cat, cat, dog, extra')
                body['direct_state'] = '{}'
                self.assertEqual(asyncio.run(routes.preview_single(Request(body))).status, 400)
                store.delete('test')
                body['direct_state'] = direct; body['states'] = []
                response = asyncio.run(routes.preview_single(Request(body)))
                self.assertIn('Direct selection 1', json.loads(response.text)['error'])

    def test_single_main_accepts_bundle_list(self):
        from tag_api_test import nodes
        self.assertEqual(TagSingleMainNode.INPUT_TYPES()['optional']['bundles'], ('TAG_BUNDLE_LIST',))
        self.assertNotIn('bundle_1', TagSingleMainNode.INPUT_TYPES()['optional'])
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            state = json.dumps({'version': 1, 'template_id': 'test', 'preset_id': None,
                                'blocks': {'a': True, 'b': False, 'n': True}})
            with patch.object(nodes, 'current_store', return_value=store):
                bundle = TagTemplateNode().execute(state)[0]
                bundles = nodes.TagTemplateBundlerNode().execute(bundle_1=bundle, bundle_3=bundle)[0]
                self.assertEqual(TagSingleMainNode().execute('positive', 'extra', False, bundles=bundles),
                                 ('cat, dog, cat, dog, extra',))
                self.assertEqual(TagSingleMainNode().execute('positive', 'free', False), ('free',))

    def test_bundler_and_encoded_main(self):
        from tag_api_test import nodes
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            state = json.dumps({'version': 1, 'template_id': 'test', 'preset_id': None,
                                'blocks': {'a': True, 'b': False, 'n': True}})
            class Clip:
                def tokenize(self, text): return ('tokens', text)
                def encode_from_tokens_scheduled(self, tokens): return [('conditioning', tokens)]
            with patch.object(nodes, 'current_store', return_value=store):
                bundle = TagTemplateNode().execute(state)[0]
                bundler = nodes.TagTemplateBundlerNode()
                bundles = bundler.execute(bundle_3=bundle, bundle_1=bundle)[0]
                self.assertEqual(bundles, [bundle, bundle])
                self.assertEqual(bundler.execute(), ([],))
                node = nodes.TagEncodedMainNode()
                self.assertEqual(node.RETURN_TYPES, ('STRING', 'CONDITIONING'))
                self.assertIn('clip', node.INPUT_TYPES()['required'])
                text, conditioning = node.execute(Clip(), 'positive', 'extra', False, bundles=bundles)
                self.assertEqual(text, 'cat, dog, cat, dog, extra')
                self.assertEqual(conditioning, [('conditioning', ('tokens', text))])
                self.assertEqual(node.execute(Clip(), 'negative', '', False), ('', [('conditioning', ('tokens', ''))]))
                self.assertEqual(node.execute(Clip(), 'negative', 'bad', True, bundles=bundles)[0], 'bad')
                self.assertEqual(node.execute(Clip(), 'positive', 'extra', False, bundles=bundles, exclude='cat')[0], 'dog, dog, extra')
            with patch.object(nodes, 'current_store', side_effect=routes.UnsupportedModeError('unsupported')):
                with self.assertRaises(routes.UnsupportedModeError): bundler.execute()
                with self.assertRaises(routes.UnsupportedModeError): node.execute(Clip(), 'positive', '', False)

    def test_format_tags_endpoint(self):
        with patch.object(routes, 'current_store', return_value=object()):
            response = asyncio.run(routes.format_tag_list(Request({'tags': ['  cat,\n dog ', '(bad,  tag']})))
            self.assertEqual(response.status, 200)
            self.assertEqual(json.loads(response.text)['tags'], ['cat, dog', '(bad,  tag'])
            self.assertEqual(asyncio.run(routes.format_tag_list(Request({'tags': [1]}))).status, 400)

    def test_template_outputs_selected_blocks_as_strings(self):
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            def state(blocks, preset=None):
                return json.dumps({'version': 1, 'template_id': 'test', 'preset_id': preset, 'blocks': blocks})
            node = TagTemplateNode()
            self.assertEqual(node.RETURN_TYPES, ('TAG_BUNDLE', 'STRING', 'STRING'))
            with patch('tag_api_test.nodes.current_store', return_value=store):
                bundle, positive, negative = node.execute(state({'a': True, 'b': False, 'n': True}))
                self.assertEqual(bundle['template_id'], 'test')
                self.assertEqual((positive, negative), ('cat, dog', 'bad'))
                _, positive, negative = node.execute(state({'a': False, 'b': True, 'n': False}, 'p'))
                self.assertEqual((positive, negative), ('(x, y), cat', ''))
                _, positive, negative = node.execute(state({'a': False, 'b': False, 'n': False}))
                self.assertEqual((positive, negative), ('', ''))

    def test_single_main_filters_channels_and_combines_free_text(self):
        with temporary_directory() as root:
            store = TemplateStore(root)
            template = sample(); template['presets'] = []; store.create(template)
            state = json.dumps({'version': 1, 'template_id': 'test', 'preset_id': None,
                                'blocks': {'a': True, 'b': False, 'n': True}})
            with patch('tag_api_test.nodes.current_store', return_value=store):
                bundle = TagTemplateNode().execute(state)[0]
                node = TagSingleMainNode()
                self.assertEqual(node.execute('positive', 'extra', False, bundles=[bundle]), ('cat, dog, extra',))
                self.assertEqual(node.execute('negative', 'other', False, bundles=[bundle]), ('bad, other',))
                self.assertEqual(node.execute('negative', 'bad', True, bundles=[bundle]), ('bad',))
                self.assertEqual(node.execute('positive', 'free', False), ('free',))
                with self.assertRaises(ValueError): node.execute('invalid', '', False)

    def test_single_main_preview_matches_node(self):
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            state = {'version': 1, 'template_id': 'test', 'preset_id': None,
                     'blocks': {'a': True, 'b': False, 'n': True}}
            with patch.object(routes, 'current_store', return_value=store):
                result = asyncio.run(routes.preview_single(Request({'states': [state], 'channel': 'negative',
                                                                    'text': 'extra', 'deduplicate': False})))
                self.assertEqual(json.loads(result.text)['text'], 'bad, extra')
                result = asyncio.run(routes.preview_single(Request({'states': [], 'channel': 'invalid',
                                                                    'text': '', 'deduplicate': False})))
                self.assertEqual(result.status, 400)

    def test_exclusion_in_node_and_preview(self):
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            state = {'version': 1, 'template_id': 'test', 'preset_id': None,
                     'blocks': {'a': True, 'b': False, 'n': True}}
            with patch('tag_api_test.nodes.current_store', return_value=store), patch.object(routes, 'current_store', return_value=store):
                bundle = TagTemplateNode().execute(json.dumps(state))[0]
                self.assertEqual(TagSingleMainNode().execute('positive', 'extra, cat', False, exclude='cat', bundles=[bundle]), ('dog, extra',))
                body = {'states': [state], 'channel': 'positive', 'text': 'extra, cat', 'deduplicate': False, 'exclude': 'cat'}
                response = asyncio.run(routes.preview_single(Request(body)))
                self.assertEqual(json.loads(response.text)['text'], 'dog, extra')
    def test_node_execution_and_port_order(self):
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            state = json.dumps({'version': 1, 'template_id': 'test', 'preset_id': None,
                                'blocks': {'a': True, 'b': False, 'n': True}})
            with patch('tag_api_test.nodes.current_store', return_value=store):
                bundle = TagTemplateNode().execute(state)[0]
                result = TagSingleMainNode().execute('positive', 'extra', False, bundles=[bundle])
                self.assertEqual(result, ('cat, dog, extra',))
            with patch('tag_api_test.nodes.current_store', side_effect=routes.UnsupportedModeError('unsupported')):
                with self.assertRaises(routes.UnsupportedModeError):
                    TagSingleMainNode().execute('positive', '', False)

    def test_read_and_preview(self):
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            with patch.object(routes, 'current_store', return_value=store):
                response = asyncio.run(routes.list_templates(Request()))
                self.assertEqual(json.loads(response.text)['templates'][0]['id'], 'test')
                state = {'version': 1, 'template_id': 'test', 'preset_id': None,
                         'blocks': {'a': True, 'b': False, 'n': True}}
                response = asyncio.run(routes.preview_single(Request({'states': [state], 'channel': 'positive', 'text': 'cat', 'deduplicate': True})))
                self.assertEqual(json.loads(response.text)['text'], 'cat, dog')
                self.assertEqual(asyncio.run(routes.get_template(Request(template_id='missing'))).status, 404)

    def test_invalid_and_unsupported(self):
        with temporary_directory() as root:
            with patch.object(routes, 'current_store', return_value=TemplateStore(root)):
                self.assertEqual(asyncio.run(routes.preview_single(Request({'states': 'bad'}))).status, 400)
            with patch.object(routes, 'current_store', side_effect=routes.UnsupportedModeError('unsupported')):
                self.assertEqual(asyncio.run(routes.list_templates(Request())).status, 403)

    def test_editor_create_update_delete(self):
        with temporary_directory() as root:
            store = TemplateStore(root)
            with patch.object(routes, 'current_store', return_value=store):
                self.assertEqual(asyncio.run(routes.create_template(Request(sample()))).status, 201)
                self.assertEqual(asyncio.run(routes.create_template(Request(sample()))).status, 409)
                revision = json.loads(asyncio.run(routes.get_editable(Request())).text)['revision']
                changed = sample(); changed['name'] = 'Changed'
                updated = asyncio.run(routes.save_editable(Request({'template': changed, 'revision': revision})))
                self.assertEqual(updated.status, 200)
                revision = json.loads(updated.text)['revision']
                self.assertEqual(store.load('test')['name'], 'Changed')
                self.assertEqual(asyncio.run(routes.save_editable(Request({'template': changed, 'revision': revision}, 'other'))).status, 400)
                invalid = sample(); invalid['name'] = ''
                self.assertEqual(asyncio.run(routes.save_editable(Request({'template': invalid, 'revision': revision}))).status, 400)
                self.assertEqual(store.load('test')['name'], 'Changed')
                self.assertEqual(asyncio.run(routes.delete_editable(Request({'revision': revision}))).status, 200)
                self.assertEqual(asyncio.run(routes.delete_editable(Request({'revision': revision}))).status, 404)

    def test_import_rejects_bad_data_and_preserves_existing(self):
        class RawRequest:
            def __init__(self, raw, replacement=None, format_tags=False):
                self.raw = raw
                self.headers = {'X-Template-ID': replacement} if replacement else {}
                if format_tags: self.headers['X-Format-Tags'] = '1'
                self.content = self
            async def read(self, size):
                chunk, self.raw = self.raw[:size], self.raw[size:]
                return chunk
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            raw = json.dumps(sample(), ensure_ascii=False).encode('utf-8')
            with patch.object(routes, 'current_store', return_value=store):
                self.assertEqual(asyncio.run(routes.import_template(RawRequest(raw))).status, 409)
                for bad in (b'\xff', b'{"id":1,"id":2}', b'x' * (1024 * 1024 + 1)):
                    self.assertEqual(asyncio.run(routes.import_template(RawRequest(bad))).status, 400)
                result = asyncio.run(routes.import_template(RawRequest(raw, 'copy')))
                self.assertEqual(result.status, 201)
                self.assertEqual(store.load('copy')['blocks'], sample()['blocks'])
                self.assertEqual(store.load('test'), sample())
                response = asyncio.run(routes.import_template(RawRequest(raw, 'formatted', True)))
                self.assertEqual(response.status, 201)
                self.assertEqual(store.load('formatted')['blocks'][0]['tags'], 'cat, dog')

    def test_editor_version_conflict_preserves_newer_change(self):
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            with patch.object(routes, 'current_store', return_value=store):
                loaded = json.loads(asyncio.run(routes.get_editable(Request())).text)
                changed = sample(); changed['name'] = 'first'
                result = asyncio.run(routes.save_editable(Request({'template': changed, 'revision': loaded['revision']})))
                self.assertEqual(result.status, 200)
                stale = sample(); stale['name'] = 'stale'
                result = asyncio.run(routes.save_editable(Request({'template': stale, 'revision': loaded['revision']})))
                self.assertEqual(result.status, 409)
                self.assertEqual(store.load('test')['name'], 'first')

    def test_library_reports_corruption_and_restore_checks_revision(self):
        with temporary_directory() as root:
            store = TemplateStore(root); store.create(sample())
            _, revision = store.load_versioned('test')
            changed = sample(); changed['name'] = 'changed'
            store.update_guarded(changed, revision)
            (Path(root) / 'test.json').write_bytes(b'{broken')
            with patch.object(routes, 'current_store', return_value=store):
                listing = json.loads(asyncio.run(routes.list_templates(Request())).text)
                self.assertEqual(listing['templates'], [])
                self.assertEqual(listing['problems'], ['test'])
                backups = json.loads(asyncio.run(routes.get_backups(Request())).text)
                self.assertEqual(backups['backups'][0]['name'], sample()['name'])
                self.assertTrue(backups['backups'][0]['created'])
                body = {'backup_id': backups['backups'][0]['id'], 'revision': revision}
                self.assertEqual(asyncio.run(routes.restore_backup(Request(body))).status, 409)
                body['revision'] = backups['revision']
                self.assertEqual(asyncio.run(routes.restore_backup(Request(body))).status, 200)
                self.assertEqual(store.load('test')['name'], sample()['name'])

    def test_snapshot_preview_matches_node_without_library_template(self):
        with temporary_directory() as root:
            store = TemplateStore(root)
            state = {'version': 2, 'template_id': 'test', 'preset_id': None,
                     'blocks': {'a': True, 'b': False, 'n': True}, 'template': sample()}
            with patch('tag_api_test.nodes.current_store', return_value=store), patch.object(routes, 'current_store', return_value=store):
                bundle = TagTemplateNode().execute(json.dumps(state))[0]
                expected = TagSingleMainNode().execute('positive', 'extra', False, bundles=[bundle])[0]
                response = asyncio.run(routes.preview_single(Request({'states': [state], 'channel': 'positive', 'text': 'extra', 'deduplicate': False})))
                self.assertEqual(json.loads(response.text)['text'], expected)
                self.assertEqual(expected, 'cat, dog, extra')

    def test_editor_rejects_multi_user(self):
        with patch.object(routes, 'current_store', side_effect=routes.UnsupportedModeError('unsupported')):
            for handler in (routes.create_template, routes.update_template, routes.delete_template, routes.import_template):
                self.assertEqual(asyncio.run(handler(Request(sample()))).status, 403)


if __name__ == '__main__': unittest.main()

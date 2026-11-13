"""Read-only template and prompt-preview endpoints."""

import logging

from aiohttp import web

from ..nodes import current_store as node_store
from ..services.node_service import UnsupportedModeError, compose_single, decode_state, make_bundle
from ..services.schema import ValidationError, parse_template, validate_id
from ..services.template_store import AlreadyExistsError, ConflictError, NotFoundError, StoreError

log = logging.getLogger(__name__)


def current_store(request):
    from server import PromptServer
    # Resolve the request's user through ComfyUI, without accepting a path.
    store = node_store()  # rejects --multi-user before any access
    PromptServer.instance.user_manager.get_request_user_id(request)
    return store


def errors(handler):
    async def wrapped(request):
        try:
            return await handler(request)
        except UnsupportedModeError as exc:
            return web.json_response({'error': str(exc)}, status=403)
        except KeyError:
            return web.json_response({'error': 'Unknown ComfyUI user.'}, status=403)
        except NotFoundError:
            return web.json_response({'error': 'Template not found. Refresh the library or restore the template.'}, status=404)
        except ConflictError:
            return web.json_response({'error': 'Template changed. Reload or save your draft as a new template.'}, status=409)
        except AlreadyExistsError:
            return web.json_response({'error': 'Template ID already exists; choose a different ID.'}, status=409)
        except ValidationError as exc:
            return web.json_response({'error': str(exc)}, status=400)
        except (ValueError, TypeError):
            return web.json_response({'error': 'Invalid request.'}, status=400)
        except StoreError:
            log.exception('Tag template library read failed')
            return web.json_response({'error': 'Could not read template library. Check the server log and template JSON.'}, status=500)
    return wrapped


@errors
async def list_templates(request):
    templates, problems = current_store(request).list_report()
    if problems:
        log.warning('Invalid template files: %s', problems)
    return web.json_response({'templates': [{'id': t['id'], 'name': t['name'], 'category': t['category']} for t in templates], 'problems': problems})


@errors
async def get_template(request):
    return web.json_response(current_store(request).load(request.match_info['template_id']))


@errors
async def create_template(request):
    store = current_store(request)
    data = await request.json()
    store.create(data)
    return web.json_response(data, status=201)


@errors
async def import_template(request):
    store = current_store(request)
    limit = 1024 * 1024
    content = bytearray()
    while len(content) <= limit:
        chunk = await request.content.read(min(65536, limit + 1 - len(content)))
        if not chunk:
            break
        content.extend(chunk)
    if len(content) > limit:
        raise ValidationError('Import file exceeds 1 MiB.')
    try:
        data = parse_template(content.decode('utf-8'))
    except UnicodeDecodeError as exc:
        raise ValidationError('Import file must be UTF-8.') from exc
    replacement = request.headers.get('X-Template-ID')
    if replacement is not None:
        data['id'] = validate_id(replacement, '$.id')
    store.create(data)
    return web.json_response(data, status=201)


@errors
async def get_editable(request):
    template, revision = current_store(request).load_versioned(request.match_info['template_id'])
    return web.json_response({'template': template, 'revision': revision})


@errors
async def save_editable(request):
    body = await request.json()
    if not isinstance(body, dict) or set(body) != {'template', 'revision'} or not isinstance(body['revision'], str):
        raise ValidationError('Template and revision are required.')
    data = body['template']
    if not isinstance(data, dict) or data.get('id') != request.match_info['template_id']:
        raise ValidationError('Template ID must match the requested ID.')
    store = current_store(request)
    store.update_guarded(data, body['revision'])
    # A subsequent load also detects externally corrupted data.
    saved, revision = store.load_versioned(data['id'])
    return web.json_response({'template': saved, 'revision': revision})


@errors
async def delete_editable(request):
    body = await request.json()
    if not isinstance(body, dict) or set(body) != {'revision'} or not isinstance(body['revision'], str):
        raise ValidationError('Revision is required.')
    current_store(request).delete_guarded(request.match_info['template_id'], body['revision'])
    return web.json_response({'deleted': request.match_info['template_id']})


@errors
async def get_backups(request):
    store = current_store(request)
    template_id = request.match_info['template_id']
    return web.json_response({'backups': store.backup_details(template_id), 'revision': store.current_revision(template_id)})


@errors
async def restore_backup(request):
    store = current_store(request)
    body = await request.json()
    if not isinstance(body, dict) or set(body) != {'backup_id', 'revision'} or not (body['revision'] is None or isinstance(body['revision'], str)):
        raise ValidationError('Backup ID and current revision are required.')
    template_id = request.match_info['template_id']
    store.restore_backup(template_id, body['backup_id'], body['revision'])
    return web.json_response({'restored': template_id})


@errors
async def update_template(request):
    current_store(request)
    return web.json_response({'error': 'Use the editor API with a revision.'}, status=428)


@errors
async def delete_template(request):
    current_store(request)
    return web.json_response({'error': 'Use the editor API with a revision.'}, status=428)


@errors
async def preview_single(request):
    store = current_store(request)
    body = await request.json()
    if not isinstance(body, dict) or set(body) not in ({'states', 'channel', 'text', 'deduplicate'}, {'states', 'channel', 'text', 'deduplicate', 'exclude'}):
        raise ValidationError('Invalid preview request.')
    if not isinstance(body['states'], list) or len(body['states']) > 8:
        raise ValidationError('Preview requires at most eight template states.')
    import json
    bundles = [make_bundle(store, decode_state(json.dumps(state))) for state in body['states']]
    return web.json_response({'text': compose_single(bundles, body['channel'], body['text'], body['deduplicate'], body.get('exclude', ''))})


def register_routes(routes):
    routes.get('/tag-template-manager/templates')(list_templates)
    routes.get('/tag-template-manager/templates/{template_id}')(get_template)
    routes.post('/tag-template-manager/templates')(create_template)
    routes.post('/tag-template-manager/import')(import_template)
    routes.get('/tag-template-manager/editor/{template_id}')(get_editable)
    routes.put('/tag-template-manager/editor/{template_id}')(save_editable)
    routes.delete('/tag-template-manager/editor/{template_id}')(delete_editable)
    routes.get('/tag-template-manager/backups/{template_id}')(get_backups)
    routes.post('/tag-template-manager/backups/{template_id}')(restore_backup)
    routes.put('/tag-template-manager/templates/{template_id}')(update_template)
    routes.delete('/tag-template-manager/templates/{template_id}')(delete_template)
    routes.post('/tag-template-manager/preview-single')(preview_single)

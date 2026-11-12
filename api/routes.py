"""Read-only template and prompt-preview endpoints."""

import logging

from aiohttp import web

from ..nodes import current_store as node_store
from ..services.node_service import UnsupportedModeError, compose_single, decode_state, make_bundle
from ..services.schema import ValidationError
from ..services.template_store import AlreadyExistsError, NotFoundError, StoreError

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
    templates = current_store(request).list()
    return web.json_response({'templates': [{'id': t['id'], 'name': t['name'], 'category': t['category']} for t in templates]})


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
async def update_template(request):
    store = current_store(request)
    data = await request.json()
    if not isinstance(data, dict) or data.get('id') != request.match_info['template_id']:
        raise ValidationError('Template ID must match the requested ID.')
    store.update(data)
    return web.json_response(data)


@errors
async def delete_template(request):
    current_store(request).delete(request.match_info['template_id'])
    return web.json_response({'deleted': request.match_info['template_id']})


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
    routes.put('/tag-template-manager/templates/{template_id}')(update_template)
    routes.delete('/tag-template-manager/templates/{template_id}')(delete_template)
    routes.post('/tag-template-manager/preview-single')(preview_single)

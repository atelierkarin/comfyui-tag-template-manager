"""ComfyUI custom-node entry point."""

import sys
from .nodes import TagEncodedMainNode, TagSingleMainNode, TagTemplateBundlerNode, TagTemplateNode

NODE_CLASS_MAPPINGS = {
    'TagTemplateManagerTemplate': TagTemplateNode,
    'TagTemplateManagerSingleMain': TagSingleMainNode,
    'TagTemplateManagerBundler': TagTemplateBundlerNode,
    'TagTemplateManagerEncodedMain': TagEncodedMainNode,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    'TagTemplateManagerTemplate': 'Tag Template',
    'TagTemplateManagerSingleMain': 'Tag Main',
    'TagTemplateManagerBundler': 'Tag Template Bundler',
    'TagTemplateManagerEncodedMain': 'Tag Main (Encode)',
}
WEB_DIRECTORY = './web'

# ComfyUI loads custom nodes after creating PromptServer. Standalone imports
# remain usable for tests without importing the heavy ComfyUI server module.
server = sys.modules.get('server')
if server is not None and getattr(getattr(server, 'PromptServer', None), 'instance', None):
    from .api.routes import register_routes
    register_routes(server.PromptServer.instance.routes)

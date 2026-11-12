"""ComfyUI nodes for selecting and composing tag templates."""

from .services.node_service import compose, compose_single, decode_state, make_bundle, store_for_user


def current_store():
    import folder_paths
    from comfy.cli_args import args
    return store_for_user(folder_paths.get_user_directory(), args.multi_user)


class TagTemplateNode:
    CATEGORY = 'Tag Template Manager'
    RETURN_TYPES = ('TAG_BUNDLE', 'STRING', 'STRING')
    RETURN_NAMES = ('bundle', 'positive', 'negative')
    FUNCTION = 'execute'

    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'state': ('STRING', {'default': '', 'multiline': False})}}

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Reading and cache key evaluation are separate operations; always rerun.
        return float('nan')

    def execute(self, state):
        bundle = make_bundle(current_store(), decode_state(state))
        positive, negative = compose([bundle])
        return bundle, positive, negative


class TagSingleMainNode:
    CATEGORY = 'Tag Template Manager'
    RETURN_TYPES = ('STRING',)
    RETURN_NAMES = ('text',)
    FUNCTION = 'execute'

    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {
            'channel': (['positive', 'negative'],),
            'text': ('STRING', {'default': '', 'multiline': True}),
            'deduplicate': ('BOOLEAN', {'default': False}),
        }, 'optional': {**{f'bundle_{i}': ('TAG_BUNDLE',) for i in range(1, 9)},
                        'exclude': ('STRING', {'default': '', 'multiline': True})}}

    def execute(self, channel, text, deduplicate, exclude='', **kwargs):
        current_store()
        bundles = [kwargs[f'bundle_{i}'] for i in range(1, 9) if f'bundle_{i}' in kwargs]
        return (compose_single(bundles, channel, text, deduplicate, exclude),)

"""Smoke checks for the custom-node entry point."""

import importlib.util
from pathlib import Path
import sys
import unittest


class EntrypointTests(unittest.TestCase):
    def test_entrypoint_exposes_node_mappings(self):
        root = Path(__file__).resolve().parent.parent
        spec = importlib.util.spec_from_file_location(
            "tag_template_manager", root / "__init__.py", submodule_search_locations=[str(root)]
        )
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        try:
            spec.loader.exec_module(module)
        finally:
            sys.modules.pop(spec.name, None)

        self.assertIsInstance(module.NODE_CLASS_MAPPINGS, dict)
        self.assertIsInstance(module.NODE_DISPLAY_NAME_MAPPINGS, dict)
        self.assertIn('TagTemplateManagerTemplate', module.NODE_CLASS_MAPPINGS)
        self.assertNotIn('TagTemplateManagerMain', module.NODE_CLASS_MAPPINGS)
        self.assertIn('TagTemplateManagerSingleMain', module.NODE_CLASS_MAPPINGS)


if __name__ == "__main__":
    unittest.main()

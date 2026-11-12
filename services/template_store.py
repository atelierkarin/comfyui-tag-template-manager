"""JSON storage rooted in a caller-supplied directory."""

import json
import os
from pathlib import Path
import stat
import tempfile

from .schema import ValidationError, parse_template, validate_id, validate_template


class StoreError(Exception):
    """A storage operation failed."""


class AlreadyExistsError(StoreError):
    pass


class NotFoundError(StoreError):
    pass


class TemplateStore:
    def __init__(self, root):
        try:
            self.root = Path(root).resolve()
            self.root.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise StoreError(f'{root}: {exc}') from exc

    def _path(self, template_id):
        validate_id(template_id)
        return self.root / (template_id + '.json')

    def _regular(self, path):
        try:
            info = path.lstat()
        except FileNotFoundError as exc:
            raise NotFoundError(f'{path}: not found') from exc
        except OSError as exc:
            raise StoreError(f'{path}: {exc}') from exc
        if not stat.S_ISREG(info.st_mode) or path.is_symlink():
            raise StoreError(f'{path}: not a regular file')

    def load(self, template_id):
        path = self._path(template_id)
        self._regular(path)
        try:
            data = parse_template(path.read_text(encoding='utf-8'))
            if data['id'] != template_id:
                raise ValidationError('$.id: does not match filename')
            return data
        except (OSError, UnicodeError, ValidationError) as exc:
            raise StoreError(f'{path}: {exc}') from exc

    def list(self):
        try:
            paths = sorted(self.root.glob('*.json'), key=lambda p: p.stem)
            result = []
            for path in paths:
                try:
                    result.append(self.load(path.stem))
                except ValidationError as exc:
                    raise StoreError(f'{path}: {exc}') from exc
            return result
        except OSError as exc:
            raise StoreError(f'{self.root}: {exc}') from exc

    def _write(self, data, create):
        data = validate_template(data)
        path = self._path(data['id'])
        if not create:
            self._regular(path)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=self.root,
                                             prefix='.template-', suffix='.tmp', delete=False) as handle:
                temporary = Path(handle.name)
                json.dump(data, handle, ensure_ascii=False, indent=2)
                handle.write('\n')
                handle.flush()
                os.fsync(handle.fileno())
            if create:
                # Linking a complete file into place is atomic and never overwrites.
                try:
                    os.link(temporary, path)
                except FileExistsError as exc:
                    raise AlreadyExistsError(f'{path}: already exists') from exc
            else:
                self._regular(path)
                os.replace(temporary, path)
        except OSError as exc:
            raise StoreError(f'{path}: {exc}') from exc
        finally:
            if temporary is not None:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    pass

    def create(self, data):
        self._write(data, True)

    def update(self, data):
        self._write(data, False)

    def delete(self, template_id):
        path = self._path(template_id)
        self._regular(path)
        try:
            path.unlink()
        except FileNotFoundError as exc:
            raise NotFoundError(f'{path}: not found') from exc
        except OSError as exc:
            raise StoreError(f'{path}: {exc}') from exc

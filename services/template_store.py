"""JSON storage rooted in a caller-supplied directory."""

import json
import logging
import hashlib
import threading
import uuid
from datetime import datetime, timezone
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


class ConflictError(StoreError):
    pass


log = logging.getLogger(__name__)
_store_lock = threading.RLock()


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

    def list_report(self):
        try:
            paths = sorted(self.root.glob('*.json'), key=lambda p: p.stem)
            valid, problems = [], []
            for path in paths:
                try:
                    valid.append(self.load(path.stem))
                except (StoreError, ValidationError):
                    log.exception('Cannot load template %s', path.name)
                    problems.append(path.stem)
            return valid, problems
        except OSError as exc:
            raise StoreError(f'{self.root}: {exc}') from exc

    def _raw(self, template_id):
        path = self._path(template_id)
        self._regular(path)
        try:
            return path.read_bytes()
        except OSError as exc:
            raise StoreError(f'{path}: {exc}') from exc

    @staticmethod
    def _revision(raw):
        return hashlib.sha256(raw).hexdigest()

    def load_versioned(self, template_id):
        with _store_lock:
            raw = self._raw(template_id)
            try:
                data = parse_template(raw.decode('utf-8'))
                if data['id'] != template_id:
                    raise ValidationError('$.id: does not match filename')
            except (UnicodeError, ValidationError) as exc:
                raise StoreError(f'{template_id}: {exc}') from exc
            return data, self._revision(raw)

    def _backup_dir(self):
        path = self.root / '.backups'
        try:
            path.mkdir(exist_ok=True)
            if path.is_symlink() or not path.is_dir():
                raise StoreError(f'{path}: not a regular directory')
        except OSError as exc:
            raise StoreError(f'{path}: {exc}') from exc
        return path

    def _backup(self, template_id, raw):
        directory = self._backup_dir()
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='wb', dir=directory, prefix='.backup-', suffix='.tmp', delete=False) as out:
                temporary = Path(out.name)
                out.write(raw)
                out.flush()
                os.fsync(out.fileno())
            os.link(temporary, directory / (template_id + '.' + uuid.uuid4().hex + '.bak'))
        except OSError as exc:
            raise StoreError(f'Backup failed: {exc}') from exc
        finally:
            if temporary is not None:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    pass

    def list_backups(self, template_id):
        validate_id(template_id)
        try:
            return sorted(p.name[len(template_id) + 1:-4] for p in self._backup_dir().glob(template_id + '.*.bak')
                          if len(p.name[len(template_id) + 1:-4]) == 32 and
                          all(c in '0123456789abcdef' for c in p.name[len(template_id) + 1:-4]))
        except OSError as exc:
            raise StoreError(f'Backup listing failed: {exc}') from exc

    def load_backup(self, template_id, backup_id):
        validate_id(template_id)
        if not isinstance(backup_id, str) or len(backup_id) != 32 or any(c not in '0123456789abcdef' for c in backup_id):
            raise ValidationError('Invalid backup ID')
        path = self._backup_dir() / (template_id + '.' + backup_id + '.bak')
        self._regular(path)
        try:
            data = parse_template(path.read_text(encoding='utf-8'))
            if data['id'] != template_id:
                raise ValidationError('Backup ID does not match template')
            return data
        except (OSError, UnicodeError, ValidationError) as exc:
            raise StoreError(f'Cannot read backup: {exc}') from exc

    def backup_details(self, template_id):
        result = []
        directory = self._backup_dir()
        for backup_id in self.list_backups(template_id):
            path = directory / (template_id + '.' + backup_id + '.bak')
            self._regular(path)
            try:
                created = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
                try:
                    name = self.load_backup(template_id, backup_id)['name']
                except StoreError:
                    name = None
                result.append({'id': backup_id, 'created': created, 'name': name})
            except OSError as exc:
                raise StoreError(f'Cannot inspect backup: {exc}') from exc
        return sorted(result, key=lambda item: (item['created'], item['id']), reverse=True)

    def current_revision(self, template_id):
        with _store_lock:
            try:
                return self._revision(self._raw(template_id))
            except NotFoundError:
                return None

    def restore_backup(self, template_id, backup_id, revision):
        with _store_lock:
            data = self.load_backup(template_id, backup_id)
            current = self.current_revision(template_id)
            if current != revision:
                raise ConflictError('Template changed since it was inspected')
            if current is None:
                self._write(data, True)
            else:
                self._backup(template_id, self._raw(template_id))
                self._write(data, False)

    def update_guarded(self, data, revision):
        data = validate_template(data)
        with _store_lock:
            raw = self._raw(data['id'])
            if self._revision(raw) != revision:
                raise ConflictError('Template changed since it was loaded')
            # Do not replace a corrupt file through the normal save path.
            self.load_versioned(data['id'])
            self._backup(data['id'], raw)
            self._write(data, False)

    def delete_guarded(self, template_id, revision):
        with _store_lock:
            raw = self._raw(template_id)
            if self._revision(raw) != revision:
                raise ConflictError('Template changed since it was loaded')
            self.load_versioned(template_id)
            self._backup(template_id, raw)
            self.delete(template_id)

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
        with _store_lock:
            self._write(data, True)

    def update(self, data):
        with _store_lock:
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

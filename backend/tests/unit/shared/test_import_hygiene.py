"""
Guard: импорт ``application`` и ``domain`` любого домена не тянет FastAPI, Starlette и SQLAlchemy.

Эти библиотеки приходят не из кода слоёв, а транзитивно — через ``__init__`` shared-пакета,
реэкспортирующего адаптер рядом с портом. tach такую цепочку не видит: ``app.shared`` для него
один модуль. Проверка идёт в чистом интерпретаторе (``-I``), потому что в процессе pytest эти
библиотеки уже загружены другими тестами; ``cwd`` — пустой каталог, чтобы настройки не прочитали
``.env``. Список модулей строится по файлам, а не импортом пакетов: импорт пакета сам и есть
проверяемое действие. Время ограничено потолком unit-уровня.
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Final

# tests/unit/shared/<этот файл> → backend/
_BACKEND_DIR: Final[Path] = Path(__file__).resolve().parents[3]
_FRAMEWORKS: Final[tuple[str, ...]] = ("fastapi", "starlette", "sqlalchemy")
_LAYERS: Final[tuple[str, ...]] = ("application", "domain")

_CHILD_CODE: Final[str] = """
import importlib
import json
import sys

sys.path.insert(0, sys.argv[1])
frameworks = json.loads(sys.argv[2])
for module_name in sys.argv[3:]:
    importlib.import_module(module_name)

print(json.dumps([name for name in frameworks if name in sys.modules]))
"""


def test_application_and_domain_import_without_web_and_orm_frameworks(tmp_path: Path) -> None:
    """Импорт всех модулей application/ и domain/ в чистом интерпретаторе не грузит FastAPI, Starlette, SQLAlchemy."""
    module_paths = sorted(
        path.relative_to(_BACKEND_DIR).with_suffix("")
        for layer in _LAYERS
        for path in (_BACKEND_DIR / "app").glob(f"*/{layer}/**/*.py")
    )
    module_names = [".".join(path.parts[:-1] if path.name == "__init__" else path.parts) for path in module_paths]

    completed = subprocess.run(  # noqa: S603 — интерпретатор этого же процесса, аргументы — пути из репозитория
        [sys.executable, "-I", "-B", "-c", _CHILD_CODE, str(_BACKEND_DIR), json.dumps(_FRAMEWORKS), *module_names],
        cwd=tmp_path,
        env=dict(os.environ),
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert module_names, "не найдено ни одного модуля application/ или domain/ — сломан поиск файлов"
    assert json.loads(completed.stdout) == [], f"загружены фреймворки при импорте {len(module_names)} модулей"

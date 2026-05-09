"""
Procrastinate-таски домена auth.

Локальный ``auth_blueprint`` коллекционирует декларации tasks этого домена
без зависимости от конкретного App-инстанса. Composition root собирает
blueprint'ы всех доменов и передаёт их в ``ProcrastinateComponent``,
который через ``add_tasks_from`` подключает их к App-инстансу.

Реальные таски будут добавлены в Phase 3.
"""

from procrastinate import Blueprint

auth_blueprint = Blueprint()

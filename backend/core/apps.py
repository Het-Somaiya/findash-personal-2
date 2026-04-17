import logging

from django.apps import AppConfig
from django.db import connection

logger = logging.getLogger(__name__)


class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        engine = connection.settings_dict['ENGINE']
        host = connection.settings_dict.get('HOST', '')
        db_name = connection.settings_dict.get('NAME', '')

        if engine == 'mssql':
            logger.info(f"Database: Azure SQL — {host}/{db_name}")
        else:
            logger.info(f"Database: SQLite — {db_name}")

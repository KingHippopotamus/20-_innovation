import json
import os
import logging

logger = logging.getLogger(__name__)


class AccountsLoader:
    def __init__(self, config_path: str = None):
        if config_path is None:
            config_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                "accounts.json",
            )
        self._data = self._load(config_path)

    def _load(self, path: str) -> dict:
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            logger.error(f"accounts.json not found: {path}")
            return {"groups": {}, "responsible_person": {}}

    def get_client_by_group_id(self, group_id: str) -> dict | None:
        """グループIDからクライアント情報を取得"""
        return self._data.get("groups", {}).get(group_id)

    def get_responsible_person(self) -> dict:
        """担当者情報を取得"""
        return self._data.get("responsible_person", {})

    def get_all_client_names(self) -> list[str]:
        """全クライアント名のリストを取得"""
        return [
            info["client_name"]
            for info in self._data.get("groups", {}).values()
            if "client_name" in info
        ]

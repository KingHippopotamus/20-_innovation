import json
import logging
import urllib.request
import urllib.error
import urllib.parse

logger = logging.getLogger(__name__)

SEARCH_API_BASE = "https://ads-search.yahooapis.jp/api/v13"
DISPLAY_API_BASE = "https://ads-display.yahooapis.jp/api/v14"
TOKEN_URL = "https://biz-oauth.yahoo.co.jp/oauth/v1/token"


class YahooAdsService:
    def __init__(self, settings):
        self.client_id = settings.YAHOO_ADS_CLIENT_ID
        self.client_secret = settings.YAHOO_ADS_CLIENT_SECRET
        self.refresh_token = settings.YAHOO_ADS_REFRESH_TOKEN
        self._access_token = None

    def set_campaigns_status(
        self, search_account_id: str, display_account_id: str, action: str
    ) -> dict:
        """Yahoo広告の全キャンペーンを停止/再開 (Search + Display)"""
        results = {"search": None, "display": None}

        if search_account_id:
            results["search"] = self._update_search_campaigns(
                search_account_id, action
            )

        if display_account_id:
            results["display"] = self._update_display_campaigns(
                display_account_id, action
            )

        total_count = sum(
            r.get("count", 0) for r in results.values() if r and r.get("success")
        )
        all_success = all(
            r.get("success", False) for r in results.values() if r is not None
        )

        action_ja = "停止" if action == "pause" else "再開"
        return {
            "success": all_success,
            "count": total_count,
            "message": f"Yahoo広告 {total_count}件のキャンペーンを{action_ja}しました",
            "details": results,
        }

    def _update_search_campaigns(self, account_id: str, action: str) -> dict:
        """検索広告のキャンペーンを更新"""
        try:
            access_token = self._get_access_token()
            campaigns = self._get_search_campaigns(account_id, access_token)
            if not campaigns:
                return {"success": True, "count": 0}

            target_status = "PAUSED" if action == "pause" else "ACTIVE"
            updated = self._set_search_campaign_status(
                account_id, campaigns, target_status, access_token
            )
            return {"success": True, "count": updated}
        except Exception as e:
            logger.error(f"Yahoo Search Ads error: {e}")
            return {"success": False, "count": 0, "error": str(e)}

    def _update_display_campaigns(self, account_id: str, action: str) -> dict:
        """ディスプレイ広告のキャンペーンを更新"""
        try:
            access_token = self._get_access_token()
            campaigns = self._get_display_campaigns(account_id, access_token)
            if not campaigns:
                return {"success": True, "count": 0}

            target_status = "PAUSED" if action == "pause" else "ACTIVE"
            updated = self._set_display_campaign_status(
                account_id, campaigns, target_status, access_token
            )
            return {"success": True, "count": updated}
        except Exception as e:
            logger.error(f"Yahoo Display Ads error: {e}")
            return {"success": False, "count": 0, "error": str(e)}

    def _get_access_token(self) -> str:
        """リフレッシュトークンからアクセストークンを取得"""
        if self._access_token:
            return self._access_token

        data = urllib.parse.urlencode({
            "grant_type": "refresh_token",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": self.refresh_token,
        }).encode("utf-8")

        req = urllib.request.Request(TOKEN_URL, data=data)
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read().decode("utf-8"))
        self._access_token = result["access_token"]
        return self._access_token

    def _get_search_campaigns(self, account_id: str, access_token: str) -> list:
        """検索広告のキャンペーン一覧を取得"""
        url = f"{SEARCH_API_BASE}/CampaignService/get"
        payload = {
            "accountId": int(account_id),
        }
        return self._api_request(url, payload, access_token, "values")

    def _set_search_campaign_status(
        self,
        account_id: str,
        campaigns: list,
        target_status: str,
        access_token: str,
    ) -> int:
        """検索広告のキャンペーンステータスを一括変更"""
        url = f"{SEARCH_API_BASE}/CampaignService/set"
        operands = []
        for camp in campaigns:
            campaign_data = camp.get("campaign", camp)
            current_status = campaign_data.get("userStatus", "")
            if current_status != target_status:
                operands.append({
                    "accountId": int(account_id),
                    "campaignId": campaign_data["campaignId"],
                    "userStatus": target_status,
                })

        if not operands:
            return 0

        payload = {"accountId": int(account_id), "operand": operands}
        result = self._api_request(url, payload, access_token, "values")
        return len(result) if result else 0

    def _get_display_campaigns(self, account_id: str, access_token: str) -> list:
        """ディスプレイ広告のキャンペーン一覧を取得"""
        url = f"{DISPLAY_API_BASE}/CampaignService/get"
        payload = {
            "accountId": int(account_id),
        }
        return self._api_request(url, payload, access_token, "values")

    def _set_display_campaign_status(
        self,
        account_id: str,
        campaigns: list,
        target_status: str,
        access_token: str,
    ) -> int:
        """ディスプレイ広告のキャンペーンステータスを一括変更"""
        url = f"{DISPLAY_API_BASE}/CampaignService/set"
        operands = []
        for camp in campaigns:
            campaign_data = camp.get("campaign", camp)
            current_status = campaign_data.get("userStatus", "")
            if current_status != target_status:
                operands.append({
                    "accountId": int(account_id),
                    "campaignId": campaign_data["campaignId"],
                    "userStatus": target_status,
                })

        if not operands:
            return 0

        payload = {"accountId": int(account_id), "operand": operands}
        result = self._api_request(url, payload, access_token, "values")
        return len(result) if result else 0

    def _api_request(
        self, url: str, payload: dict, access_token: str, result_key: str
    ) -> list:
        """Yahoo Ads APIにリクエストを送信"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")

        try:
            resp = urllib.request.urlopen(req)
            result = json.loads(resp.read().decode("utf-8"))
            return result.get("rval", {}).get(result_key, [])
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            logger.error(f"Yahoo Ads API error: {e.code} {error_body}")
            raise

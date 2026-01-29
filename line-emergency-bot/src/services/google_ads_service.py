import json
import logging
import requests

logger = logging.getLogger(__name__)

GOOGLE_ADS_API_VERSION = "v18"
GOOGLE_ADS_BASE_URL = f"https://googleads.googleapis.com/{GOOGLE_ADS_API_VERSION}"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


class GoogleAdsService:
    def __init__(self, settings):
        self.developer_token = settings.GOOGLE_ADS_DEVELOPER_TOKEN
        self.client_id = settings.GOOGLE_ADS_CLIENT_ID
        self.client_secret = settings.GOOGLE_ADS_CLIENT_SECRET
        self.refresh_token = settings.GOOGLE_ADS_REFRESH_TOKEN
        self.login_customer_id = settings.GOOGLE_ADS_LOGIN_CUSTOMER_ID
        self._access_token = None

    def set_campaigns_status(self, customer_id: str, action: str) -> dict:
        """アカウント配下の全キャンペーンを停止/再開"""
        current_filter = "ENABLED" if action == "pause" else "PAUSED"
        target_status = "PAUSED" if action == "pause" else "ENABLED"

        try:
            access_token = self._get_access_token()
            campaign_ids = self._get_campaign_ids(
                customer_id, current_filter, access_token
            )
            if not campaign_ids:
                return {"success": True, "count": 0, "message": "対象キャンペーンなし"}

            count = self._mutate_campaigns(
                customer_id, campaign_ids, target_status, access_token
            )
            action_ja = "停止" if action == "pause" else "再開"
            return {
                "success": True,
                "count": count,
                "message": f"{count}件のキャンペーンを{action_ja}しました",
            }
        except Exception as e:
            logger.error(f"Google Ads API error: {e}")
            return {"success": False, "count": 0, "message": str(e)}

    def _get_access_token(self) -> str:
        """OAuth2リフレッシュトークンからアクセストークンを取得"""
        if self._access_token:
            return self._access_token

        resp = requests.post(GOOGLE_TOKEN_URL, data={
            "grant_type": "refresh_token",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": self.refresh_token,
        })
        resp.raise_for_status()
        self._access_token = resp.json()["access_token"]
        return self._access_token

    def _get_headers(self, access_token: str) -> dict:
        """Google Ads API用ヘッダーを生成"""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "developer-token": self.developer_token,
            "Content-Type": "application/json",
        }
        if self.login_customer_id:
            headers["login-customer-id"] = self.login_customer_id.replace("-", "")
        return headers

    def _get_campaign_ids(
        self, customer_id: str, status_filter: str, access_token: str
    ) -> list[str]:
        """GAQL で指定ステータスのキャンペーンID一覧を取得"""
        customer_id_clean = customer_id.replace("-", "")
        url = f"{GOOGLE_ADS_BASE_URL}/customers/{customer_id_clean}/googleAds:searchStream"

        query = (
            f"SELECT campaign.id, campaign.name, campaign.status "
            f"FROM campaign "
            f"WHERE campaign.status = '{status_filter}'"
        )

        resp = requests.post(
            url,
            headers=self._get_headers(access_token),
            json={"query": query},
        )
        resp.raise_for_status()

        campaign_ids = []
        for result_batch in resp.json():
            for row in result_batch.get("results", []):
                campaign_id = row.get("campaign", {}).get("id")
                if campaign_id:
                    campaign_ids.append(str(campaign_id))

        logger.info(f"Found {len(campaign_ids)} campaigns with status {status_filter}")
        return campaign_ids

    def _mutate_campaigns(
        self,
        customer_id: str,
        campaign_ids: list[str],
        target_status: str,
        access_token: str,
    ) -> int:
        """キャンペーンのステータスを一括変更"""
        customer_id_clean = customer_id.replace("-", "")
        url = f"{GOOGLE_ADS_BASE_URL}/customers/{customer_id_clean}/campaigns:mutate"

        # ステータスの数値マッピング
        status_value = 2 if target_status == "ENABLED" else 3  # ENABLED=2, PAUSED=3

        operations = []
        for campaign_id in campaign_ids:
            resource_name = f"customers/{customer_id_clean}/campaigns/{campaign_id}"
            operations.append({
                "updateMask": "status",
                "update": {
                    "resourceName": resource_name,
                    "status": status_value,
                },
            })

        resp = requests.post(
            url,
            headers=self._get_headers(access_token),
            json={"operations": operations},
        )
        resp.raise_for_status()

        results = resp.json().get("results", [])
        logger.info(f"Mutated {len(results)} campaigns")
        return len(results)

import hashlib
import hmac
import base64
import json
import logging
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)


class LineService:
    REPLY_URL = "https://api.line.me/v2/bot/message/reply"
    PUSH_URL = "https://api.line.me/v2/bot/message/push"

    def __init__(self, settings):
        self.channel_secret = settings.LINE_CHANNEL_SECRET
        self.channel_access_token = settings.LINE_CHANNEL_ACCESS_TOKEN

    def validate_signature(self, body: str, signature: str) -> bool:
        """LINE Webhookの署名を検証"""
        hash_value = hmac.new(
            self.channel_secret.encode("utf-8"),
            body.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        expected = base64.b64encode(hash_value).decode("utf-8")
        return hmac.compare_digest(signature, expected)

    def push_message(self, to: str, message: str):
        """Push Message APIでメッセージを送信 (グループID or ユーザーID)"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.channel_access_token}",
        }
        data = json.dumps({
            "to": to,
            "messages": [{"type": "text", "text": message}],
        }).encode("utf-8")

        req = urllib.request.Request(self.PUSH_URL, data=data, headers=headers)
        try:
            urllib.request.urlopen(req)
            logger.info(f"Push message sent to {to}")
        except urllib.error.HTTPError as e:
            logger.error(f"Push message failed: {e.code} {e.read().decode()}")
            raise

    def reply_message(self, reply_token: str, message: str):
        """Reply APIでメッセージを返信 (Webhook受信直後のみ使用可能)"""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.channel_access_token}",
        }
        data = json.dumps({
            "replyToken": reply_token,
            "messages": [{"type": "text", "text": message}],
        }).encode("utf-8")

        req = urllib.request.Request(self.REPLY_URL, data=data, headers=headers)
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            logger.error(f"Reply message failed: {e.code} {e.read().decode()}")
            raise

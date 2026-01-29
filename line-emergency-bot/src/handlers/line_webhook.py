import json
import logging
import time
import uuid
import boto3

from src.config.settings import Settings
from src.config.accounts_loader import AccountsLoader
from src.services.line_service import LineService
from src.services.gemini_service import GeminiService
from src.services.twilio_service import TwilioService

logger = logging.getLogger()
logger.setLevel(logging.INFO)

settings = Settings()
accounts_loader = AccountsLoader()
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(settings.DYNAMODB_TABLE_NAME)


def handler(event, context):
    """LINE Webhook Lambda ハンドラー"""
    try:
        body = event.get("body", "")
        signature = (
            event.get("headers", {}).get("x-line-signature", "")
            or event.get("headers", {}).get("X-Line-Signature", "")
        )

        # 署名検証
        line_service = LineService(settings)
        if not line_service.validate_signature(body, signature):
            logger.warning("Invalid LINE signature")
            return {"statusCode": 403, "body": "Invalid signature"}

        body_json = json.loads(body)

        for line_event in body_json.get("events", []):
            if (
                line_event.get("type") == "message"
                and line_event.get("message", {}).get("type") == "text"
            ):
                _process_message(line_event, line_service)

        return {"statusCode": 200, "body": json.dumps({"status": "ok"})}

    except Exception as e:
        logger.error(f"LINE webhook handler error: {e}", exc_info=True)
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}


processed_messages = set()

def _process_message(line_event: dict, line_service: LineService):
    """LINE テキストメッセージを処理"""
    message_id = line_event.get("message", {}).get("id", "")

    # 重複チェック（LINEのリトライ対策）
    if message_id in processed_messages:
        logger.info(f"Duplicate message {message_id}, skipping")
        return
    processed_messages.add(message_id)

    # メモリ管理: 100件を超えたらクリア
    if len(processed_messages) > 100:
        processed_messages.clear()

    message_text = line_event["message"]["text"]
    source = line_event.get("source", {})
    group_id = source.get("groupId", "")
    reply_token = line_event.get("replyToken", "")

    # グループメッセージ以外は無視
    if not group_id:
        logger.info("Not a group message, skipping")
        return

    # グループIDからクライアント情報を取得
    client_info = accounts_loader.get_client_by_group_id(group_id)
    if not client_info:
        logger.info(f"Unknown group: {group_id}, skipping")
        return

    client_name = client_info["client_name"]
    logger.info(f"Message from group {group_id} ({client_name}): {message_text[:50]}")

    # Geminiで意図解析
    gemini_service = GeminiService(settings)
    intent = gemini_service.analyze_intent(message_text)

    if not intent.get("is_ad_request"):
        logger.info("Not an ad request, skipping")
        return

    action = intent.get("action", "pause")
    platforms = intent.get("platforms", ["google", "yahoo"])
    summary = intent.get("summary", "")

    logger.info(f"Ad request detected: action={action}, platforms={platforms}")

    # DynamoDBにセッション作成
    session_id = str(uuid.uuid4())
    session_data = {
        "session_id": session_id,
        "group_id": group_id,
        "client_name": client_name,
        "action": action,
        "platforms": platforms,
        "original_message": message_text,
        "conversation_history": [],
        "status": "pending",
        "created_at": int(time.time()),
        "ttl": int(time.time()) + 3600,  # 1時間後に自動削除
    }
    table.put_item(Item=session_data)

    # 担当者に電話発信
    person = accounts_loader.get_responsible_person()
    phone = person.get("phone", settings.RESPONSIBLE_PERSON_PHONE)

    twilio_service = TwilioService(settings)
    call_result = twilio_service.make_call(phone, session_id)

    if call_result["success"]:
        # セッションにcall_sidを記録
        table.update_item(
            Key={"session_id": session_id},
            UpdateExpression="SET call_sid = :sid, #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":sid": call_result["call_sid"],
                ":status": "calling",
            },
        )

        # LINEグループに受付通知 (reply_tokenが有効なうちに)
        action_ja = "停止" if action == "pause" else "再開"
        platform_names = []
        if "google" in platforms:
            platform_names.append("Google広告")
        if "yahoo" in platforms:
            platform_names.append("Yahoo広告")

        reply_msg = (
            f"{'と'.join(platform_names)}の配信{action_ja}リクエストを受け付けました。\n"
            f"担当者に確認の電話をかけています。"
        )
        try:
            line_service.reply_message(reply_token, reply_msg)
        except Exception:
            # reply_tokenが期限切れの場合はPush Messageで送信
            line_service.push_message(group_id, reply_msg)
    else:
        # エラーはログのみ、LINEには送信しない
        logger.error(f"Twilio call failed: {call_result.get('error', 'unknown')}")

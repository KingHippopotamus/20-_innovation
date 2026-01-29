import json
import logging
import os
import time
import boto3

from src.config.settings import Settings
from src.config.accounts_loader import AccountsLoader
from src.services.gemini_service import GeminiService
from src.services.google_ads_service import GoogleAdsService
from src.services.yahoo_ads_service import YahooAdsService
from src.services.line_service import LineService

logger = logging.getLogger()
logger.setLevel(logging.INFO)

settings = Settings()
accounts_loader = AccountsLoader()
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(settings.DYNAMODB_TABLE_NAME)


def handler(event, context):
    """WebSocket API Gateway Lambda ハンドラー (ConversationRelay用)"""
    route_key = event.get("requestContext", {}).get("routeKey", "")
    connection_id = event.get("requestContext", {}).get("connectionId", "")

    logger.info(f"WebSocket event: route={route_key}, connection={connection_id}")

    if route_key == "$connect":
        return handle_connect(event, connection_id)
    elif route_key == "$disconnect":
        return handle_disconnect(connection_id)
    elif route_key == "$default":
        return handle_message(event, connection_id)

    return {"statusCode": 400}


def handle_connect(event, connection_id: str):
    """WebSocket接続確立時の処理"""
    # クエリパラメータからsession_idを取得
    query_params = event.get("queryStringParameters", {}) or {}
    session_id = query_params.get("session_id", "")

    if session_id:
        # DynamoDBのセッションにconnection_idを紐付け
        try:
            table.update_item(
                Key={"session_id": session_id},
                UpdateExpression="SET connection_id = :cid",
                ExpressionAttributeValues={":cid": connection_id},
            )
            # connection_id → session_id のマッピングも保存
            table.put_item(Item={
                "session_id": f"conn#{connection_id}",
                "original_session_id": session_id,
                "ttl": int(time.time()) + 3600,
            })
        except Exception as e:
            logger.error(f"Failed to update session: {e}")

    return {"statusCode": 200}


def handle_disconnect(connection_id: str):
    """WebSocket切断時の処理"""
    try:
        # connection_id からセッション情報を取得して削除
        response = table.get_item(Key={"session_id": f"conn#{connection_id}"})
        if "Item" in response:
            original_session_id = response["Item"]["original_session_id"]
            table.update_item(
                Key={"session_id": original_session_id},
                UpdateExpression="SET #s = :status",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":status": "disconnected"},
            )
            table.delete_item(Key={"session_id": f"conn#{connection_id}"})
    except Exception as e:
        logger.error(f"Disconnect cleanup error: {e}")

    return {"statusCode": 200}


def handle_message(event, connection_id: str):
    """ConversationRelayからのメッセージを処理"""
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        logger.error("Failed to parse message body")
        return {"statusCode": 400}

    msg_type = body.get("type", "")
    logger.info(f"Message type: {msg_type}, body: {json.dumps(body, ensure_ascii=False)[:500]}")

    # セッション情報を取得
    session = _get_session_by_connection(connection_id)
    if not session:
        logger.error(f"No session found for connection {connection_id}")
        # セッションがなくても簡単な応答を試みる
        if msg_type == "setup":
            _send_ws_message(event, connection_id, "お電話ありがとうございます。システムエラーが発生しました。")
        return {"statusCode": 200}

    logger.info(f"Session found: {session.get('session_id')}, client: {session.get('client_name')}")
    gemini_service = GeminiService(settings)

    if msg_type == "setup":
        # ConversationRelay初期化完了 → 即座に第一声を送信
        client_name = session.get("client_name", "クライアント")
        action = "停止" if session.get("action") == "pause" else "再開"
        platforms = session.get("platforms", [])
        platform_names = []
        if "google" in platforms:
            platform_names.append("Google広告")
        if "yahoo" in platforms:
            platform_names.append("Yahoo広告")
        platforms_str = "と".join(platform_names) if platform_names else "広告"

        # 静的な第一声を即座に送信（Gemini不要）
        first_message = f"お疲れ様です。{client_name}から{platforms_str}の配信{action}リクエストが届いています。承認する場合は1を、拒否する場合は2を押してください。"
        logger.info(f"Sending first message: {first_message}")
        _send_ws_message(event, connection_id, first_message)

        # 会話履歴を保存
        _update_conversation_history(
            session["session_id"],
            [{"role": "assistant", "content": first_message}],
        )

    elif msg_type == "prompt":
        # 担当者の発話テキスト
        speech_text = body.get("voicePrompt", "")
        logger.info(f"User speech: {speech_text}")
        if speech_text:
            response_text = _process_speech(
                session, speech_text, gemini_service, event, connection_id
            )
            logger.info(f"Response generated: {response_text[:100]}")
            _send_ws_message(event, connection_id, response_text)

    elif msg_type == "dtmf":
        # DTMF入力（キーパッド）の処理
        digit = body.get("digit", "")
        logger.info(f"DTMF received: {digit}")
        if digit == "1":
            _execute_approval(session, event, connection_id)
            _send_ws_message(event, connection_id, "承認しました。広告配信を変更します。")
        elif digit == "2":
            _execute_rejection(session)
            _send_ws_message(event, connection_id, "拒否しました。")

    elif msg_type == "error":
        logger.error(f"ConversationRelay error: {body.get('description', 'unknown')}")

    return {"statusCode": 200}


def _get_session_by_connection(connection_id: str) -> dict | None:
    """connection_idからセッション情報を取得"""
    try:
        conn_response = table.get_item(Key={"session_id": f"conn#{connection_id}"})
        if "Item" not in conn_response:
            return None
        original_session_id = conn_response["Item"]["original_session_id"]
        session_response = table.get_item(Key={"session_id": original_session_id})
        return session_response.get("Item")
    except Exception as e:
        logger.error(f"Failed to get session: {e}")
        return None


def _generate_first_message(session: dict, gemini_service: GeminiService) -> str:
    """電話接続時の第一声を生成"""
    system_prompt = gemini_service.build_voice_system_prompt(session)
    conversation_history = [
        {"role": "user", "content": "電話が接続されました。リクエスト内容を伝えてください。"}
    ]

    response = gemini_service.generate_conversation_response(
        conversation_history, system_prompt
    )

    # 会話履歴を保存
    _update_conversation_history(
        session["session_id"],
        [{"role": "assistant", "content": response}],
    )

    return _clean_response(response)


def _process_speech(
    session: dict,
    speech_text: str,
    gemini_service: GeminiService,
    event: dict,
    connection_id: str,
) -> str:
    """担当者の発話を処理し、応答を生成"""
    # 会話履歴を取得
    history = session.get("conversation_history", [])
    history.append({"role": "user", "content": speech_text})

    # Geminiで応答生成
    system_prompt = gemini_service.build_voice_system_prompt(session)
    full_history = [{"role": "user", "content": system_prompt}] + history

    response = gemini_service.generate_conversation_response(full_history, system_prompt)

    # 承認/拒否の検出
    if "{ACTION:approve}" in response:
        response = response.replace("{ACTION:approve}", "").strip()
        _execute_approval(session, event, connection_id)
    elif "{ACTION:reject}" in response:
        response = response.replace("{ACTION:reject}", "").strip()
        _execute_rejection(session)

    # 会話履歴を更新
    history.append({"role": "assistant", "content": response})
    _update_conversation_history(session["session_id"], history)

    return _clean_response(response)


def _execute_approval(session: dict, event: dict, connection_id: str):
    """承認時: 広告APIを実行してLINEに通知"""
    logger.info(f"Approval received for session {session['session_id']}")

    group_id = session.get("group_id", "")
    client_name = session.get("client_name", "")
    action = session.get("action", "pause")
    platforms = session.get("platforms", [])
    action_ja = "停止" if action == "pause" else "再開"

    results = []

    # クライアント情報を取得
    client_info = accounts_loader.get_client_by_group_id(group_id)
    if not client_info:
        _notify_line(group_id, f"エラー: クライアント情報が見つかりません。")
        return

    # Google Ads
    if "google" in platforms:
        google_service = GoogleAdsService(settings)
        customer_id = client_info.get("google_ads", {}).get("customer_id", "")
        if customer_id:
            result = google_service.set_campaigns_status(customer_id, action)
            results.append(f"Google広告: {result['message']}")

    # Yahoo Ads
    if "yahoo" in platforms:
        yahoo_service = YahooAdsService(settings)
        search_id = client_info.get("yahoo_ads", {}).get("search_account_id", "")
        display_id = client_info.get("yahoo_ads", {}).get("display_account_id", "")
        if search_id or display_id:
            result = yahoo_service.set_campaigns_status(search_id, display_id, action)
            results.append(f"Yahoo広告: {result['message']}")

    # LINEグループに通知
    result_message = f"【広告配信{action_ja}完了】\n{client_name}\n" + "\n".join(results)
    _notify_line(group_id, result_message)

    # セッションステータス更新
    table.update_item(
        Key={"session_id": session["session_id"]},
        UpdateExpression="SET #s = :status",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":status": "approved"},
    )


def _execute_rejection(session: dict):
    """拒否時: LINEに通知"""
    logger.info(f"Rejection received for session {session['session_id']}")

    group_id = session.get("group_id", "")
    client_name = session.get("client_name", "")
    action_ja = "停止" if session.get("action") == "pause" else "再開"
    platforms = session.get("platforms", [])
    platform_names = []
    if "google" in platforms:
        platform_names.append("Google広告")
    if "yahoo" in platforms:
        platform_names.append("Yahoo広告")

    message = (
        f"【リクエスト拒否】\n"
        f"{client_name}の{'と'.join(platform_names)}{action_ja}リクエストは"
        f"担当者により拒否されました。"
    )
    _notify_line(group_id, message)

    table.update_item(
        Key={"session_id": session["session_id"]},
        UpdateExpression="SET #s = :status",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":status": "rejected"},
    )


def _notify_line(group_id: str, message: str):
    """LINEグループにPush Messageを送信"""
    try:
        line_service = LineService(settings)
        line_service.push_message(group_id, message)
    except Exception as e:
        logger.error(f"LINE notification failed: {e}")


def _update_conversation_history(session_id: str, history: list):
    """DynamoDBの会話履歴を更新"""
    try:
        table.update_item(
            Key={"session_id": session_id},
            UpdateExpression="SET conversation_history = :history",
            ExpressionAttributeValues={":history": history},
        )
    except Exception as e:
        logger.error(f"Failed to update conversation history: {e}")


def _send_ws_message(event, connection_id: str, message: str):
    """WebSocket経由でConversationRelayにテキスト応答を送信"""
    domain = event.get("requestContext", {}).get("domainName", "")
    stage = event.get("requestContext", {}).get("stage", "")
    endpoint = f"https://{domain}/{stage}"

    logger.info(f"Sending WS message to {connection_id}: {message[:100]}...")
    logger.info(f"Endpoint: {endpoint}")

    apigw = boto3.client("apigatewaymanagementapi", endpoint_url=endpoint)
    try:
        payload = json.dumps({"type": "text", "token": message})
        logger.info(f"Payload: {payload[:200]}")
        apigw.post_to_connection(
            ConnectionId=connection_id, Data=payload.encode("utf-8")
        )
        logger.info("WebSocket message sent successfully")
    except Exception as e:
        logger.error(f"Failed to send WebSocket message: {e}")


def _clean_response(response: str) -> str:
    """Gemini応答からアクションマーカーと記号を除去"""
    import re
    # アクションマーカーを除去
    response = response.replace("{ACTION:approve}", "")
    response = response.replace("{ACTION:reject}", "")
    # 中括弧で囲まれた内容を除去
    response = re.sub(r'\{[^}]*\}', '', response)
    # JSONっぽい記号を除去
    response = re.sub(r'[\{\}\[\]]', '', response)
    # 複数の空白を1つに
    response = re.sub(r'\s+', ' ', response)
    return response.strip()

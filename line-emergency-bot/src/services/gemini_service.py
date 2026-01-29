import json
import logging
import google.generativeai as genai

logger = logging.getLogger(__name__)


class GeminiService:
    def __init__(self, settings):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel("gemini-3-flash-preview")

    def analyze_intent(self, message: str) -> dict:
        """LINEメッセージから広告配信変更の意図を解析"""
        prompt = self._build_intent_prompt(message)

        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )

        try:
            result = json.loads(response.text)
            logger.info(f"Intent analysis result: {result}")
            return result
        except (json.JSONDecodeError, ValueError) as e:
            logger.error(f"Failed to parse Gemini response: {e}")
            return {"is_ad_request": False}

    def generate_conversation_response(
        self, conversation_history: list[dict], system_prompt: str
    ) -> str:
        """電話会話AIとしてマルチターン応答を生成"""
        messages = []
        for msg in conversation_history:
            role = "user" if msg["role"] == "user" else "model"
            messages.append({"role": role, "parts": [msg["content"]]})

        chat = self.model.start_chat(history=messages[:-1] if messages else [])

        # 最後のメッセージがuser発話の場合はそれを送信
        last_message = messages[-1]["parts"][0] if messages else ""

        response = chat.send_message(
            last_message,
            generation_config=genai.types.GenerationConfig(temperature=0.7),
        )

        return response.text

    def build_voice_system_prompt(self, request_info: dict) -> str:
        """電話会話AI用のシステムプロンプトを生成"""
        client_name = request_info.get("client_name", "不明")
        action = "停止" if request_info.get("action") == "pause" else "再開"
        platforms = request_info.get("platforms", [])
        platform_names = []
        if "google" in platforms:
            platform_names.append("Google広告")
        if "yahoo" in platforms:
            platform_names.append("Yahoo広告")
        platforms_str = "と".join(platform_names)
        original_message = request_info.get("original_message", "")

        return f"""あなたは広告運用チームのAIアシスタントです。電話で担当者と会話しています。
以下のリクエスト内容を担当者に伝え、承認か拒否の判断を得てください。

## リクエスト内容
- クライアント: {client_name}
- 操作: {platforms_str}の配信{action}
- アカウント配下の全キャンペーンが対象です
- クライアントからのメッセージ: 「{original_message}」

## あなたの役割
1. まずリクエスト内容を簡潔に伝えてください
2. 担当者からの質問には正確に答えてください
3. 担当者が承認の意思を示したら、応答の最後に必ず以下のJSONを含めてください:
   {{{{ACTION:approve}}}}
4. 担当者が拒否の意思を示したら、応答の最後に必ず以下のJSONを含めてください:
   {{{{ACTION:reject}}}}
5. まだ判断が示されていない場合はJSONを含めないでください

## 注意
- 簡潔に話してください（電話なので長い文は避ける）
- 丁寧語で話してください
- 承認/拒否の判断を急かさないでください
- 質問には正直に答えてください"""

    def _build_intent_prompt(self, message: str) -> str:
        return f"""あなたはLINEグループのメッセージを解析するAIです。
以下のメッセージが「広告の配信停止または再開のリクエスト」かどうかを判定してください。

## 判定基準
- 広告の「停止」「止めて」「ストップ」「一時停止」「配信停止」→ action: "pause"
- 広告の「再開」「再開して」「配信開始」「戻して」→ action: "resume"
- Google広告/Yahoo広告の指定があればそれに従う
- 指定がなければ両方 (["google", "yahoo"])

## メッセージ:
\"\"\"{message}\"\"\"

## 出力 (JSON):
{{
    "is_ad_request": true/false,
    "action": "pause" or "resume",
    "platforms": ["google", "yahoo"],
    "summary": "操作の要約（20文字以内）"
}}

is_ad_requestがfalseの場合、他のフィールドは空でOKです。"""

import json
import logging
from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse, Connect

logger = logging.getLogger(__name__)


class TwilioService:
    def __init__(self, settings):
        self.client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        self.from_phone = settings.TWILIO_PHONE_NUMBER
        self.websocket_url = settings.WEBSOCKET_API_URL

    def make_call(self, to_phone: str, session_id: str) -> dict:
        """担当者に電話を発信し、ConversationRelayに接続"""
        twiml = self._generate_twiml(session_id)

        try:
            call = self.client.calls.create(
                to=to_phone,
                from_=self.from_phone,
                twiml=twiml,
                timeout=30,
            )
            logger.info(f"Call initiated: SID={call.sid}, to={to_phone}")
            return {"success": True, "call_sid": call.sid}
        except Exception as e:
            logger.error(f"Twilio call failed: {e}")
            return {"success": False, "error": str(e)}

    def _generate_twiml(self, session_id: str) -> str:
        """ConversationRelay接続用のTwiMLを生成"""
        response = VoiceResponse()
        connect = Connect()
        connect.conversation_relay(
            url=f"{self.websocket_url}?session_id={session_id}",
            voice="ja-JP-Wavenet-A",
            language="ja-JP",
            transcription_provider="google",
            tts_provider="google",
            speech_rate="1.5",
            dtmf_detection="true",
        )
        response.append(connect)
        return str(response)

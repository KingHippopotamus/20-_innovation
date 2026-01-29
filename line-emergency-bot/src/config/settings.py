import os


class Settings:
    def __init__(self):
        # LINE
        self.LINE_CHANNEL_SECRET = os.environ.get("LINE_CHANNEL_SECRET", "")
        self.LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")

        # Gemini
        self.GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

        # Twilio
        self.TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
        self.TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
        self.TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")
        self.RESPONSIBLE_PERSON_PHONE = os.environ.get("RESPONSIBLE_PERSON_PHONE", "")

        # Google Ads
        self.GOOGLE_ADS_DEVELOPER_TOKEN = os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN", "")
        self.GOOGLE_ADS_CLIENT_ID = os.environ.get("GOOGLE_ADS_CLIENT_ID", "")
        self.GOOGLE_ADS_CLIENT_SECRET = os.environ.get("GOOGLE_ADS_CLIENT_SECRET", "")
        self.GOOGLE_ADS_REFRESH_TOKEN = os.environ.get("GOOGLE_ADS_REFRESH_TOKEN", "")
        self.GOOGLE_ADS_LOGIN_CUSTOMER_ID = os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "")

        # Yahoo Ads
        self.YAHOO_ADS_CLIENT_ID = os.environ.get("YAHOO_ADS_CLIENT_ID", "")
        self.YAHOO_ADS_CLIENT_SECRET = os.environ.get("YAHOO_ADS_CLIENT_SECRET", "")
        self.YAHOO_ADS_REFRESH_TOKEN = os.environ.get("YAHOO_ADS_REFRESH_TOKEN", "")

        # AWS
        self.DYNAMODB_TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME", "ConversationSessions")
        self.WEBSOCKET_API_URL = os.environ.get("WEBSOCKET_API_URL", "")

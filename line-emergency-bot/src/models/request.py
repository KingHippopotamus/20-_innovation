from dataclasses import dataclass, field


@dataclass
class AdControlRequest:
    group_id: str
    client_name: str
    action: str  # "pause" or "resume"
    platforms: list[str] = field(default_factory=list)  # ["google", "yahoo"]
    original_message: str = ""
    google_ads_customer_id: str = ""
    yahoo_ads_search_account_id: str = ""
    yahoo_ads_display_account_id: str = ""

    @property
    def action_ja(self) -> str:
        return "停止" if self.action == "pause" else "再開"

    @property
    def platforms_ja(self) -> str:
        names = []
        if "google" in self.platforms:
            names.append("Google広告")
        if "yahoo" in self.platforms:
            names.append("Yahoo広告")
        return "と".join(names)

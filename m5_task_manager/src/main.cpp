// M5Stack Core2 - 期限管理タスクアプリ
//   ・画面のタスク行をタップすると完了/未完了がトグルされる
//   ・タスクと完了状態は NVS(Preferences) に保存され、電源を切っても残る
//   ・期限は「日付のみ」でも「日付+時刻」でも指定できる
//   ・タスクの追加/削除はシリアル(115200)からコマンドで行う  → help
#include <M5Unified.h>
#include <Preferences.h>
#include <time.h>
#include <stdlib.h>
#include <string.h>

// ---------------------------------------------------------------- データ定義
static const uint16_t STORE_MAGIC = 0x5404;
static const uint16_t STORE_MAGIC_V2 = 0x5403;
static const uint16_t STORE_MAGIC_V1 = 0x5402;
static const int MAX_TASKS = 24;
static const int NAME_LEN = 64;   // UTF-8 のバイト数。日本語なら 21 文字ぶん
static const int16_t NO_TIME = -1;  // 時刻指定なし(終日)

struct Task {
  char name[NAME_LEN];
  int32_t due;      // YYYYMMDD (0 = 期限なし)
  int16_t dueMin;   // 0..1439 = 当日の分, NO_TIME = 時刻指定なし
  uint8_t done;
  uint8_t pad;
  uint32_t doneAt;  // 完了時刻(epoch)
};

struct Store {
  uint16_t magic;
  uint16_t count;
  Task items[MAX_TASKS];
};

// --- 旧フォーマット定義(NVS からの移行専用)
// 過去の firmware が書いた通りのバイト列でなければならないので、
// name の長さは NAME_LEN ではなく必ずリテラル 48 のまま固定すること。
static const int NAME_LEN_OLD = 48;

// v1: 時刻(dueMin)を持たない版
struct TaskV1 {
  char name[48];
  int32_t due;
  uint8_t done;
  uint8_t pad[3];
  uint32_t doneAt;
};
struct StoreV1 {
  uint16_t magic;
  uint16_t count;
  TaskV1 items[MAX_TASKS];
};

// v2: 時刻あり・名前は 48 バイト
struct TaskV2 {
  char name[48];
  int32_t due;
  int16_t dueMin;
  uint8_t done;
  uint8_t pad;
  uint32_t doneAt;
};
struct StoreV2 {
  uint16_t magic;
  uint16_t count;
  TaskV2 items[MAX_TASKS];
};

static Store store;
static Preferences prefs;

// --- 当日アクション(スプレッドシートの「当日アクションシート」から取り込む)
// 出所がシート側なので、電源を切って消えても取り直せばよい。NVS には保存しない
// (保存形式を増やすと移行処理がもう1本増えるため)。
static const int MAX_ACTIONS = 160;   // 1日3人分。超えた分は黙って捨てず警告する
static const int CAT_LEN = 16;
static const int NOTE_LEN = 40;

struct Action {
  char name[NAME_LEN];   // G列 タスク名
  char note[NOTE_LEN];   // K列 補足
  char cat[CAT_LEN];     // F列 分類(開発/差し込み/定時/休憩...)
  char who[CAT_LEN];     // M列 担当
  int16_t startMin;      // C列 開始(当日の分)
  int16_t endMin;        // E列 終了
  int16_t row;           // シート上の行番号(書き戻しの鍵。0 = 不明)
  int16_t mins;          // 実測時間(分)。-1 = 書かない
  uint8_t done;
  uint8_t pending;       // シートへの書き戻しが未完了
};

static Action actions[MAX_ACTIONS];
static int actionCount = 0;
static int actionYMD = 0;      // 取り込んだ日付(YYYYMMDD)
static int aScrollTop = 0;

// 実測時間(I列)は「前に付けたチェックから今回のチェックまで」の長さ。
// 画面には3人ぶん並ぶので、担当ごとに前回チェック時刻を持つ。
static const int MAX_WHO = 8;
struct LastCheck { char who[CAT_LEN]; uint32_t at; };
static LastCheck lastChecks[MAX_WHO];
static int lastCheckCount = 0;

static char statusMsg[48] = "";   // ヘッダー2段目に一時表示する
static uint32_t statusUntil = 0;

enum ViewMode { VIEW_TASKS, VIEW_ACTIONS };
static ViewMode view = VIEW_TASKS;

// ---------------------------------------------------------------- 画面レイアウト
static const int SCR_W = 320, SCR_H = 240;
static const int HEADER_H = 38;   // 1段目=日時/残り件数, 2段目=Web UI のアドレス
static const int LIST_Y = 40;
static const int ROW_H = 39;
static const int ROWS = 4;
static const int FOOTER_Y = 196;

static M5Canvas canvas(&M5.Display);
static bool useCanvas = false;

static int scrollTop = 0;
static bool showDone = false;   // false: 未完了のみ / true: すべて
static int order[MAX_TASKS];    // 表示順(store.items の添字)
static int orderCount = 0;
static bool dirty = true;
static int flashIdx = -1;       // タップ直後のハイライト対象
static uint32_t flashUntil = 0;
static bool clockSuspect = false;  // RTC が飛んでいてビルド時刻で起動した
static char netLine[64] = "Wi-Fi 準備中...";  // ヘッダー2段目(実体の更新は web_ui.h)

// ---------------------------------------------------------------- 時刻ユーティリティ
static void applyTZ() {
  // M5Unified の setSystemTimeFromRtc() は内部で TZ を GMT0 に書き換えたまま戻すため
  // (getenv で得たポインタが setenv により上書きされる)、呼び出し後に必ず再適用する。
  setenv("TZ", "JST-9", 1);
  tzset();
}

static int todayYMD() {
  time_t t = time(nullptr);
  struct tm lt;
  localtime_r(&t, &lt);
  return (lt.tm_year + 1900) * 10000 + (lt.tm_mon + 1) * 100 + lt.tm_mday;
}

static time_t ymdMinToEpoch(int ymd, int minutes) {
  struct tm lt = {};
  lt.tm_year = ymd / 10000 - 1900;
  lt.tm_mon = (ymd / 100) % 100 - 1;
  lt.tm_mday = ymd % 100;
  lt.tm_hour = minutes / 60;
  lt.tm_min = minutes % 60;
  lt.tm_isdst = -1;
  return mktime(&lt);
}

// 日付だけを比べた残り日数(マイナスは超過)
static int daysLeft(int due) {
  if (due <= 0) return 9999;
  double d = difftime(ymdMinToEpoch(due, 12 * 60), ymdMinToEpoch(todayYMD(), 12 * 60));
  return (int)lround(d / 86400.0);
}

// 並べ替え用の期限エポック(時刻未指定はその日の 23:59 扱い)
static time_t dueEpoch(const Task& t) {
  if (t.due <= 0) return (time_t)0x7FFFFFFF;
  return ymdMinToEpoch(t.due, t.dueMin >= 0 ? t.dueMin : 23 * 60 + 59);
}

static const char* WDAY_JA[7] = {"日", "月", "火", "水", "木", "金", "土"};

static void initClock() {
  applyTZ();
  // RTC のバックアップ電圧が落ちていると保持時刻は信用できない
  bool voltLow = M5.Rtc.getVoltLow();
  M5.Rtc.setSystemTimeFromRtc();
  applyTZ();
  time_t now = time(nullptr);
  time_t bt = (time_t)BUILD_UNIX_TIME;
  // ビルド時刻より前 / 遠すぎる未来 は明らかにおかしい
  bool stale = voltLow || now < bt - 3600 || now > bt + (time_t)10 * 365 * 86400;
  if (stale) {
    struct tm g;
    gmtime_r(&bt, &g);
    M5.Rtc.setDateTime(&g);
    M5.Rtc.setSystemTimeFromRtc();
    applyTZ();
    clockSuspect = true;
    Serial.printf("[clock] !! RTC の時刻が信用できません (voltLow=%d) -> ビルド時刻で暫定起動。"
                  "`time 2026-08-22 10:00` で合わせてください\n", (int)voltLow);
  }
  time_t t = time(nullptr);
  struct tm lt;
  localtime_r(&t, &lt);
  Serial.printf("[clock] now = %04d-%02d-%02d %02d:%02d:%02d JST%s\n",
                lt.tm_year + 1900, lt.tm_mon + 1, lt.tm_mday,
                lt.tm_hour, lt.tm_min, lt.tm_sec,
                clockSuspect ? "  (要時刻設定)" : "");
}

// ---------------------------------------------------------------- 永続化
static void save() {
  store.magic = STORE_MAGIC;
  prefs.putBytes("v1", &store, sizeof(store));
}

// NAME_LEN を超える名前を入れるとき、UTF-8 の途中で切ると文字化けしたバイト列が
// NVS に残ってしまうので、必ず文字境界まで戻してから切る。
static void setNameSafe(char* dst, const char* src) {
  size_t n = strlen(src);
  if (n > (size_t)(NAME_LEN - 1)) {
    n = NAME_LEN - 1;
    while (n > 0 && ((uint8_t)src[n] & 0xC0) == 0x80) n--;  // 継続バイトの手前まで戻す
  }
  memcpy(dst, src, n);
  dst[n] = 0;
}

static bool addTask(const char* name, int due, int dueMin) {
  if (store.count >= MAX_TASKS) return false;
  Task& t = store.items[store.count++];
  memset(&t, 0, sizeof(t));
  setNameSafe(t.name, name);
  t.due = due;
  t.dueMin = (int16_t)dueMin;
  t.done = 0;
  t.doneAt = 0;
  return true;
}

static void seedSamples() {
  int today = todayYMD();
  time_t base = ymdMinToEpoch(today, 12 * 60);
  auto ymdOffset = [&](int days) {
    time_t t = base + (time_t)days * 86400;
    struct tm lt;
    localtime_r(&t, &lt);
    return (lt.tm_year + 1900) * 10000 + (lt.tm_mon + 1) * 100 + lt.tm_mday;
  };
  addTask("請求書の提出", ymdOffset(-1), NO_TIME);
  addTask("週次レポート作成", ymdOffset(0), 18 * 60);
  addTask("クライアント返信", ymdOffset(1), 10 * 60 + 30);
  addTask("広告レポート確認", ymdOffset(3), NO_TIME);
  addTask("月次ミーティング準備", ymdOffset(7), 14 * 60);
}

static void load() {
  prefs.begin("m5task", false);
  size_t cap = sizeof(Store);
  if (sizeof(StoreV2) > cap) cap = sizeof(StoreV2);
  if (sizeof(StoreV1) > cap) cap = sizeof(StoreV1);
  uint8_t* buf = (uint8_t*)calloc(1, cap);
  size_t len = prefs.getBytes("v1", buf, cap);
  uint16_t magic = len >= 2 ? *(uint16_t*)buf : 0;
  bool loaded = false;

  if (magic == STORE_MAGIC && len == sizeof(Store)) {
    memcpy(&store, buf, sizeof(store));
    loaded = store.count <= MAX_TASKS;
    if (loaded) Serial.printf("[store] loaded %d tasks from NVS\n", store.count);
  } else if (magic == STORE_MAGIC_V2 && len == sizeof(StoreV2)) {
    StoreV2 old;
    memcpy(&old, buf, sizeof(old));
    if (old.count <= MAX_TASKS) {
      memset(&store, 0, sizeof(store));
      store.magic = STORE_MAGIC;
      store.count = old.count;
      for (int i = 0; i < old.count; i++) {
        memcpy(store.items[i].name, old.items[i].name, NAME_LEN_OLD);
        store.items[i].name[NAME_LEN_OLD - 1] = 0;
        store.items[i].due = old.items[i].due;
        store.items[i].dueMin = old.items[i].dueMin;
        store.items[i].done = old.items[i].done;
        store.items[i].doneAt = old.items[i].doneAt;
      }
      save();
      loaded = true;
      Serial.printf("[store] migrated %d tasks (v2 -> v3)\n", store.count);
    }
  } else if (magic == STORE_MAGIC_V1 && len == sizeof(StoreV1)) {
    StoreV1 old;
    memcpy(&old, buf, sizeof(old));
    if (old.count <= MAX_TASKS) {
      memset(&store, 0, sizeof(store));
      store.magic = STORE_MAGIC;
      store.count = old.count;
      for (int i = 0; i < old.count; i++) {
        memcpy(store.items[i].name, old.items[i].name, NAME_LEN_OLD);
        store.items[i].name[NAME_LEN_OLD - 1] = 0;
        store.items[i].due = old.items[i].due;
        store.items[i].dueMin = NO_TIME;
        store.items[i].done = old.items[i].done;
        store.items[i].doneAt = old.items[i].doneAt;
      }
      save();
      loaded = true;
      Serial.printf("[store] migrated %d tasks (v1 -> v3)\n", store.count);
    }
  }
  free(buf);

  if (!loaded) {
    memset(&store, 0, sizeof(store));
    store.magic = STORE_MAGIC;
    store.count = 0;
    if (!prefs.getBool("seeded", false)) {
      seedSamples();
      prefs.putBool("seeded", true);
      Serial.println("[store] first run -> seeded sample tasks");
    }
    save();
  }
}

// ---------------------------------------------------------------- アクション
static void setStatus(const char* msg, uint32_t ms = 4000) {
  strncpy(statusMsg, msg, sizeof(statusMsg) - 1);
  statusMsg[sizeof(statusMsg) - 1] = 0;
  statusUntil = millis() + ms;
  dirty = true;
}

static uint32_t* lastCheckSlot(const char* who) {
  for (int i = 0; i < lastCheckCount; i++)
    if (!strcmp(lastChecks[i].who, who)) return &lastChecks[i].at;
  if (lastCheckCount >= MAX_WHO) return nullptr;
  LastCheck& c = lastChecks[lastCheckCount++];
  memset(&c, 0, sizeof(c));
  strncpy(c.who, who, CAT_LEN - 1);
  return &c.at;
}

// 担当は開始時刻順に混ぜて並べるので、色で見分けられるようにする。
// 既知の3人は色を固定し、それ以外は名前から決まる色を割り当てる。
static const char* WHO_FIXED[] = {"山口", "三木", "石黒"};
static const uint8_t WHO_RGB[][3] = {
    {56, 190, 120},   // 山口 緑
    {90, 160, 240},   // 三木 青
    {245, 140, 32},   // 石黒 橙
    {210, 110, 200},  // 以下は未知の担当に回す
    {235, 205, 70},
    {110, 210, 205},
};

static int whoColorIdx(const char* who) {
  if (!who[0]) return 5;
  for (int i = 0; i < 3; i++) if (!strcmp(who, WHO_FIXED[i])) return i;
  uint32_t h = 0;
  for (const char* p = who; *p; p++) h = h * 31 + (uint8_t)*p;
  return 3 + (h % 3);
}

// 開始時刻の昇順。同時刻はシートの並び順を保つ(安定ソート)
static void sortActions() {
  for (int i = 1; i < actionCount; i++) {
    Action key = actions[i];
    int j = i - 1;
    while (j >= 0 && actions[j].startMin > key.startMin) {
      actions[j + 1] = actions[j];
      j--;
    }
    actions[j + 1] = key;
  }
}

static int nowMinOfDay() {
  time_t t = time(nullptr);
  struct tm lt;
  localtime_r(&t, &lt);
  return lt.tm_hour * 60 + lt.tm_min;
}

// 今の時刻が入っている枠。無ければ -1
static int currentActionIdx() {
  if (actionYMD && actionYMD != todayYMD()) return -1;  // 昨日以前の取り込みなら「今」は無い
  int n = nowMinOfDay();
  for (int i = 0; i < actionCount; i++) {
    if (actions[i].startMin <= n && n < actions[i].endMin) return i;
  }
  return -1;
}

// 現在の枠が画面に入るようスクロール位置を合わせる
static void scrollToCurrentAction() {
  int c = currentActionIdx();
  if (c < 0) return;
  aScrollTop = c - 1;   // 1行前から見せる
  int maxTop = actionCount - ROWS;
  if (maxTop < 0) maxTop = 0;
  if (aScrollTop > maxTop) aScrollTop = maxTop;
  if (aScrollTop < 0) aScrollTop = 0;
}

// ---------------------------------------------------------------- 並べ替え
static void rebuildOrder() {
  orderCount = 0;
  for (int pass = 0; pass < 2; pass++) {  // 0: 未完了 / 1: 完了済み
    if (pass == 1 && !showDone) continue;
    int idx[MAX_TASKS], n = 0;
    for (int i = 0; i < store.count; i++) {
      if ((pass == 0) == (store.items[i].done == 0)) idx[n++] = i;
    }
    for (int a = 0; a < n; a++) {
      for (int b = a + 1; b < n; b++) {
        bool swap;
        if (pass == 0) {
          swap = dueEpoch(store.items[idx[b]]) < dueEpoch(store.items[idx[a]]);
        } else {
          swap = store.items[idx[b]].doneAt > store.items[idx[a]].doneAt;
        }
        if (swap) { int t = idx[a]; idx[a] = idx[b]; idx[b] = t; }
      }
    }
    for (int a = 0; a < n; a++) order[orderCount++] = idx[a];
  }
  int maxTop = orderCount - ROWS;
  if (maxTop < 0) maxTop = 0;
  if (scrollTop > maxTop) scrollTop = maxTop;
  if (scrollTop < 0) scrollTop = 0;
}

// 保存 -> 並べ替え -> 再描画。store を書き換えたら必ずこれを通すこと
// (order[] を作り直さずに描画すると、削除直後に無効な添字を読む)
static void commitChange() {
  save();
  rebuildOrder();
  dirty = true;
}

static int pendingCount() {
  int n = 0;
  for (int i = 0; i < store.count; i++) if (!store.items[i].done) n++;
  return n;
}

// ---------------------------------------------------------------- ラベル生成
static uint16_t urgencyColor(const Task& t) {
  const uint16_t GRAY = M5.Display.color565(90, 95, 105);
  if (t.done || t.due <= 0) return GRAY;
  if (t.dueMin >= 0) {
    double s = difftime(dueEpoch(t), time(nullptr));
    if (s < 0) return M5.Display.color565(232, 62, 62);
    if (s < 6 * 3600) return M5.Display.color565(245, 140, 32);
    if (s < 48 * 3600) return M5.Display.color565(232, 200, 40);
    return M5.Display.color565(56, 190, 120);
  }
  int d = daysLeft(t.due);
  if (d < 0) return M5.Display.color565(232, 62, 62);
  if (d == 0) return M5.Display.color565(245, 140, 32);
  if (d <= 2) return M5.Display.color565(232, 200, 40);
  return M5.Display.color565(56, 190, 120);
}

static void dateLabel(const Task& t, char* out, size_t n) {
  if (t.due <= 0) { snprintf(out, n, "--/--"); return; }
  snprintf(out, n, "%02d/%02d", (t.due / 100) % 100, t.due % 100);
}

static void timeLabel(const Task& t, char* out, size_t n) {
  if (t.due <= 0 || t.dueMin < 0) { out[0] = 0; return; }
  snprintf(out, n, "%02d:%02d", t.dueMin / 60, t.dueMin % 60);
}

static void remainLabel(const Task& t, char* out, size_t n) {
  if (t.done) { snprintf(out, n, "完了"); return; }
  if (t.due <= 0) { snprintf(out, n, "期限なし"); return; }

  if (t.dueMin >= 0) {
    long s = (long)difftime(dueEpoch(t), time(nullptr));
    long a = s < 0 ? -s : s;
    const char* fmtOver = "%s超過";
    char body[24];
    if (a < 3600) snprintf(body, sizeof(body), "%ld分", a / 60);
    else if (a < 86400) snprintf(body, sizeof(body), "%ld時間%ld分", a / 3600, (a % 3600) / 60);
    else snprintf(body, sizeof(body), "%ld日%ld時間", a / 86400, (a % 86400) / 3600);
    if (s < 0) snprintf(out, n, fmtOver, body);
    else snprintf(out, n, "あと%s", body);
    return;
  }

  int d = daysLeft(t.due);
  if (d < 0) snprintf(out, n, "%d日超過", -d);
  else if (d == 0) snprintf(out, n, "今日まで");
  else snprintf(out, n, "あと%d日", d);
}

// ---------------------------------------------------------------- 描画
template <typename G>
static void drawButton(G& g, int x, int y, int w, int h, const char* label, uint16_t bg, uint16_t fg) {
  g.fillRoundRect(x, y, w, h, 6, bg);
  g.drawRoundRect(x, y, w, h, 6, g.color565(70, 78, 92));
  g.setFont(&fonts::efontJA_16);
  g.setTextColor(fg);
  g.setTextDatum(middle_center);
  g.drawString(label, x + w / 2, y + h / 2);
}

// 分類ごとの色。シートの F列(開発/差し込み/定時/休憩)に対応させる
template <typename G>
static uint16_t catColor(G& g, const char* cat) {
  if (!strcmp(cat, "開発")) return g.color565(56, 190, 120);
  if (!strcmp(cat, "差し込み")) return g.color565(245, 140, 32);
  if (!strcmp(cat, "定時")) return g.color565(90, 160, 240);
  if (!strcmp(cat, "休憩")) return g.color565(150, 120, 210);
  return g.color565(120, 128, 142);
}

template <typename G>
static void renderActionsTo(G& g) {
  const uint16_t WHITE = g.color565(238, 240, 245);
  const uint16_t MUTED = g.color565(140, 148, 162);

  if (actionCount == 0) {
    g.setFont(&fonts::efontJA_16);
    g.setTextColor(MUTED);
    g.setTextDatum(middle_center);
    g.drawString("当日アクションが未取り込みです",
                 SCR_W / 2, LIST_Y + ROWS * ROW_H / 2 - 12);
    g.setFont(&fonts::efontJA_14);
    g.drawString("スプレッドシートから取り込んでください",
                 SCR_W / 2, LIST_Y + ROWS * ROW_H / 2 + 12);
    return;
  }

  int cur = currentActionIdx();
  for (int r = 0; r < ROWS; r++) {
    int i = aScrollTop + r;
    if (i >= actionCount) break;
    const Action& a = actions[i];
    int y = LIST_Y + r * ROW_H;
    int h = ROW_H - 4;
    int mid = y + h / 2;
    bool isNow = (i == cur);

    const uint8_t* wc = WHO_RGB[whoColorIdx(a.who)];
    uint16_t whoCol = g.color565(wc[0], wc[1], wc[2]);

    uint16_t rowbg = isNow ? g.color565(46, 70, 104)
                           : (a.done ? g.color565(24, 26, 33) : g.color565(32, 36, 46));
    g.fillRoundRect(4, y, SCR_W - 8, h, 5, rowbg);
    g.fillRect(4, y + 3, 5, h - 6, a.done ? g.color565(90, 95, 105) : whoCol);
    if (isNow) g.drawRoundRect(4, y, SCR_W - 8, h, 5, g.color565(120, 180, 255));

    // 左カラム: 時間枠
    char buf[16];
    g.setTextDatum(middle_left);
    g.setFont(&fonts::efontJA_14);
    g.setTextColor(a.done ? MUTED : WHITE);
    snprintf(buf, sizeof(buf), "%02d:%02d", a.startMin / 60, a.startMin % 60);
    g.drawString(buf, 14, mid - 8);
    g.setTextColor(MUTED);
    snprintf(buf, sizeof(buf), "%02d:%02d", a.endMin / 60, a.endMin % 60);
    g.drawString(buf, 14, mid + 9);

    // 1行目: タスク名 と 担当(右寄せ)
    g.setClipRect(78, y, 150, h);
    g.setFont(&fonts::efontJA_16);
    g.setTextColor(a.done ? MUTED : WHITE);
    g.drawString(a.name, 80, mid - 7);
    g.clearClipRect();
    if (a.done) {
      int tw = g.textWidth(a.name);
      if (tw > 146) tw = 146;
      g.drawFastHLine(80, mid - 7, tw, MUTED);
    }
    if (a.who[0]) {
      g.setFont(&fonts::efontJA_12);
      g.setTextColor(a.done ? MUTED : whoCol);
      g.setTextDatum(middle_right);
      g.drawString(a.who, SCR_W - 52, mid - 7);
      g.setTextDatum(middle_left);
    }

    char sub[NOTE_LEN + CAT_LEN + 4];
    if (a.note[0]) snprintf(sub, sizeof(sub), "%s ・ %s", a.cat, a.note);
    else snprintf(sub, sizeof(sub), "%s", a.cat);
    g.setClipRect(78, y, 190, h);
    g.setFont(&fonts::efontJA_12);
    g.setTextColor(a.done ? MUTED : catColor(g, a.cat));
    g.drawString(sub, 80, mid + 11);
    g.clearClipRect();

    // チェックボックス
    int cx = SCR_W - 34;
    if (a.done) {
      g.fillRoundRect(cx - 13, mid - 13, 26, 26, 5, g.color565(56, 190, 120));
      g.setFont(&fonts::efontJA_16);
      g.setTextColor(g.color565(16, 18, 24));
      g.setTextDatum(middle_center);
      g.drawString("v", cx, mid - 1);
      g.setTextDatum(middle_left);
    } else {
      g.drawRoundRect(cx - 13, mid - 13, 26, 26, 5, g.color565(120, 130, 145));
    }
  }
}

template <typename G>
static void renderTo(G& g) {
  const uint16_t BG = g.color565(16, 18, 24);
  const uint16_t ROW_BG = g.color565(32, 36, 46);
  const uint16_t ROW_BG_DONE = g.color565(24, 26, 33);
  const uint16_t WHITE = g.color565(238, 240, 245);
  const uint16_t MUTED = g.color565(140, 148, 162);

  g.fillScreen(BG);

  // --- ヘッダー
  g.fillRect(0, 0, SCR_W, HEADER_H,
             clockSuspect ? g.color565(96, 30, 30) : g.color565(28, 42, 68));
  time_t now = time(nullptr);
  struct tm lt;
  localtime_r(&now, &lt);
  char buf[80];
  snprintf(buf, sizeof(buf), "%s%d/%d(%s) %02d:%02d", clockSuspect ? "! " : "",
           lt.tm_mon + 1, lt.tm_mday, WDAY_JA[lt.tm_wday], lt.tm_hour, lt.tm_min);
  g.setFont(&fonts::efontJA_14);
  g.setTextColor(clockSuspect ? g.color565(255, 210, 90) : WHITE);
  g.setTextDatum(middle_left);
  g.drawString(buf, 8, 12);

  int pend;
  if (view == VIEW_ACTIONS) {
    pend = 0;
    for (int i = 0; i < actionCount; i++) if (!actions[i].done) pend++;
    snprintf(buf, sizeof(buf), "残り %d 枠", pend);
  } else {
    pend = pendingCount();
    snprintf(buf, sizeof(buf), "残り %d 件", pend);
  }
  g.setTextColor(pend ? g.color565(255, 210, 90) : g.color565(120, 230, 160));
  g.setTextDatum(middle_right);
  g.drawString(buf, SCR_W - 8, 12);

  // 2段目: ブラウザから開くアドレス
  g.setFont(&fonts::efontJA_12);
  g.setTextColor(g.color565(150, 195, 245));
  g.setTextDatum(middle_left);
  bool showMsg = statusMsg[0] && millis() < statusUntil;
  if (showMsg) g.setTextColor(g.color565(255, 210, 90));
  g.setClipRect(0, 20, SCR_W, HEADER_H - 20);
  g.drawString(showMsg ? statusMsg : netLine, 8, 27);
  g.clearClipRect();

  // --- リスト
  if (view == VIEW_ACTIONS) {
    renderActionsTo(g);
  } else {
  if (orderCount == 0) {
    g.setFont(&fonts::efontJA_16);
    g.setTextColor(MUTED);
    g.setTextDatum(middle_center);
    g.drawString(showDone ? "タスクがありません" : "未完了のタスクはありません",
                 SCR_W / 2, LIST_Y + ROWS * ROW_H / 2 - 12);
    g.setFont(&fonts::efontJA_14);
    g.drawString("上のアドレスをブラウザで開くと追加できます",
                 SCR_W / 2, LIST_Y + ROWS * ROW_H / 2 + 12);
  }

  for (int r = 0; r < ROWS; r++) {
    int oi = scrollTop + r;
    if (oi >= orderCount) break;
    const Task& t = store.items[order[oi]];
    int y = LIST_Y + r * ROW_H;
    int h = ROW_H - 4;
    int mid = y + h / 2;
    bool flash = (order[oi] == flashIdx) && (millis() < flashUntil);

    uint16_t rowbg = flash ? g.color565(70, 110, 160) : (t.done ? ROW_BG_DONE : ROW_BG);
    g.fillRoundRect(4, y, SCR_W - 8, h, 5, rowbg);
    g.fillRect(4, y + 3, 5, h - 6, urgencyColor(t));

    // 左カラム: 期限日付 + 時刻
    char dstr[16], tstr[16];
    dateLabel(t, dstr, sizeof(dstr));
    timeLabel(t, tstr, sizeof(tstr));
    g.setTextDatum(middle_left);
    if (tstr[0]) {
      g.setFont(&fonts::efontJA_14);
      g.setTextColor(t.done ? MUTED : WHITE);
      g.drawString(dstr, 14, mid - 8);
      g.setFont(&fonts::efontJA_14);
      g.setTextColor(t.done ? MUTED : g.color565(190, 200, 215));
      g.drawString(tstr, 14, mid + 9);
    } else {
      g.setFont(&fonts::efontJA_14);
      g.setTextColor(t.done ? MUTED : WHITE);
      g.drawString(dstr, 14, mid);
    }

    // 右カラム: タスク名 + 残り時間
    g.setClipRect(78, y, 190, h);
    g.setFont(&fonts::efontJA_16);
    g.setTextColor(t.done ? MUTED : WHITE);
    g.drawString(t.name, 80, mid - 7);
    g.clearClipRect();
    if (t.done) {
      int tw = g.textWidth(t.name);
      if (tw > 186) tw = 186;
      g.drawFastHLine(80, mid - 7, tw, MUTED);
    }

    char rem[32];
    remainLabel(t, rem, sizeof(rem));
    g.setClipRect(78, y, 190, h);
    g.setFont(&fonts::efontJA_12);
    g.setTextColor(urgencyColor(t));
    g.drawString(rem, 80, mid + 11);
    g.clearClipRect();

    // チェックボックス
    int cx = SCR_W - 34;
    if (t.done) {
      g.fillRoundRect(cx - 13, mid - 13, 26, 26, 5, g.color565(56, 190, 120));
      g.setFont(&fonts::efontJA_16);
      g.setTextColor(g.color565(16, 18, 24));
      g.setTextDatum(middle_center);
      g.drawString("v", cx, mid - 1);
      g.setTextDatum(middle_left);
    } else {
      g.drawRoundRect(cx - 13, mid - 13, 26, 26, 5, g.color565(120, 130, 145));
    }
  }

  }

  // --- スクロールインジケータ
  int total = (view == VIEW_ACTIONS) ? actionCount : orderCount;
  int top = (view == VIEW_ACTIONS) ? aScrollTop : scrollTop;
  if (total > ROWS) {
    int trackH = ROWS * ROW_H - 8;
    int barH = trackH * ROWS / total;
    if (barH < 12) barH = 12;
    int barY = LIST_Y + 4 + (trackH - barH) * top / (total - ROWS);
    g.fillRoundRect(SCR_W - 3, barY, 3, barH, 1, g.color565(90, 100, 120));
  }

  // --- フッター(ボタン4つ)
  const uint16_t BTN = g.color565(40, 46, 58);
  drawButton(g, 2, FOOTER_Y, 76, 40, "▲", BTN, WHITE);
  drawButton(g, 82, FOOTER_Y, 76, 40, "▼", BTN, WHITE);
  if (view == VIEW_ACTIONS) {
    drawButton(g, 162, FOOTER_Y, 76, 40, "今へ", g.color565(46, 62, 88), WHITE);
    drawButton(g, 242, FOOTER_Y, 76, 40, "期限", g.color565(52, 44, 72), WHITE);
  } else {
    drawButton(g, 162, FOOTER_Y, 76, 40, showDone ? "完了込" : "未完のみ",
               g.color565(46, 62, 88), WHITE);
    drawButton(g, 242, FOOTER_Y, 76, 40, "当日", g.color565(52, 44, 72), WHITE);
  }
}

static void render() {
  if (useCanvas) {
    renderTo(canvas);
    canvas.pushSprite(0, 0);
  } else {
    M5.Display.startWrite();
    renderTo(M5.Display);
    M5.Display.endWrite();
  }
}

// ---------------------------------------------------------------- 状態変更
static void toggleTask(int storeIdx) {
  Task& t = store.items[storeIdx];
  t.done = t.done ? 0 : 1;
  t.doneAt = t.done ? (uint32_t)time(nullptr) : 0;
  flashIdx = storeIdx;
  flashUntil = millis() + 220;
  M5.Speaker.tone(t.done ? 2400 : 1200, 70);
  commitChange();
  Serial.printf("[state] %s : %s / 残り %d 件\n",
                t.done ? "完了" : "未完了に戻す", t.name, pendingCount());
}

static void toggleAction(int i) {
  if (i < 0 || i >= actionCount) return;
  Action& a = actions[i];
  a.done = a.done ? 0 : 1;
  M5.Speaker.tone(a.done ? 2400 : 1200, 70);
  dirty = true;

  int mins = -1;
  if (a.done) {
    // 前回チェックからの経過。まだ1件も付けていない担当は、その枠の開始時刻を起点にする
    uint32_t now = (uint32_t)time(nullptr);
    uint32_t* slot = lastCheckSlot(a.who);
    uint32_t base = (slot && *slot) ? *slot : (uint32_t)ymdMinToEpoch(todayYMD(), a.startMin);
    long d = (long)now - (long)base;
    if (d < 0) d = 0;
    if (d > 12 * 3600) d = 12 * 3600;    // 日をまたいだ計算違いを持ち込まない
    mins = (int)(d / 60);
    if (slot) *slot = now;
  }

  Serial.printf("[action] %s : %02d:%02d %s (行%d / 実測%d分)\n",
                a.done ? "完了" : "未完了に戻す", a.startMin / 60, a.startMin % 60,
                a.name, a.row, mins);

  char msg[48];
  if (a.row <= 0) {
    setStatus("端末のみ(行番号なし)");
    return;
  }
  // 実際にシートへ書くのは Mac 側のブリッジ。ここでは未送信として積むだけ
  a.mins = (int16_t)mins;
  a.pending = 1;
  if (a.done && mins >= 0) snprintf(msg, sizeof(msg), "☆待ち 実測 %d:%02d", mins / 60, mins % 60);
  else snprintf(msg, sizeof(msg), a.done ? "☆待ち" : "☆解除待ち");
  setStatus(msg);
}

#include "web_ui.h"

// ---------------------------------------------------------------- シリアル操作
static void printList() {
  Serial.println("--- タスク一覧 ---");
  for (int i = 0; i < store.count; i++) {
    const Task& t = store.items[i];
    char rem[32], dstr[16], tstr[16];
    remainLabel(t, rem, sizeof(rem));
    dateLabel(t, dstr, sizeof(dstr));
    timeLabel(t, tstr, sizeof(tstr));
    Serial.printf("%2d) [%s] %s %-5s %-14s %s\n", i + 1, t.done ? "x" : " ",
                  dstr, tstr[0] ? tstr : "--:--", rem, t.name);
  }
  if (!store.count) Serial.println("(なし)");
  Serial.printf("合計 %d 件 / 未完了 %d 件\n", store.count, pendingCount());
}

// "2026-08-25" / "2026/8/25" / "8/25" / "none" を YYYYMMDD へ。不正なら -1
static int parseDate(const char* s) {
  int y, m, d;
  if (sscanf(s, "%d-%d-%d", &y, &m, &d) == 3) return y * 10000 + m * 100 + d;
  if (sscanf(s, "%d/%d/%d", &y, &m, &d) == 3) return y * 10000 + m * 100 + d;
  if (sscanf(s, "%d/%d", &m, &d) == 2) return (todayYMD() / 10000) * 10000 + m * 100 + d;
  if (!strcmp(s, "none") || !strcmp(s, "-")) return 0;
  return -1;
}

// "17:00" / "9:5" を分に。時刻トークンでなければ -1
static int parseTimeToken(const char* s) {
  int h, m;
  char extra;
  if (sscanf(s, "%d:%d%c", &h, &m, &extra) != 2) return -1;
  if (h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 60 + m;
}

// 先頭の1トークンを切り出す(line を書き換え、残りを rest に返す)
static char* splitToken(char* line, char** rest) {
  char* sp = strchr(line, ' ');
  if (sp) {
    *sp = 0;
    char* r = sp + 1;
    while (*r == ' ') r++;
    *rest = r;
  } else {
    *rest = nullptr;
  }
  return line;
}

// "<日付> [時刻] <名前>" を解釈する。名前が不要なら namePtr に nullptr を渡す
static bool parseDueSpec(char* args, int* due, int* dueMin, char** namePtr) {
  if (!args) return false;
  char* rest = nullptr;
  char* dtok = splitToken(args, &rest);
  int d = parseDate(dtok);
  if (d < 0) return false;
  int mm = NO_TIME;
  if (rest) {
    char save = 0;
    char* sp = strchr(rest, ' ');
    if (sp) { save = *sp; *sp = 0; }
    int t = parseTimeToken(rest);
    if (sp) *sp = save;
    if (t >= 0) {
      mm = t;
      rest = sp ? sp + 1 : nullptr;
      if (rest) while (*rest == ' ') rest++;
    }
  }
  if (namePtr) {
    if (!rest || !*rest) return false;
    *namePtr = rest;
  }
  *due = d;
  *dueMin = mm;
  return true;
}

static void handleCommand(char* line) {
  while (*line == ' ') line++;
  char* rest = nullptr;
  char* cmd = splitToken(line, &rest);

  if (!strcmp(cmd, "help") || !strcmp(cmd, "?")) {
    Serial.println("コマンド:");
    Serial.println("  list                            一覧表示");
    Serial.println("  add <日付> [時刻] <名前>        追加");
    Serial.println("  due <番号> <日付> [時刻]        期限を変更");
    Serial.println("  rename <番号> <名前>            名前を変更");
    Serial.println("  done <番号> / undone <番号>     完了 / 未完了に戻す");
    Serial.println("  del <番号> / clear              削除 / 全削除");
    Serial.println("  seed                            サンプルタスクを入れ直す");
    Serial.println("  time <YYYY-MM-DD HH:MM[:SS]>    本体の時計合わせ(JST)");
    Serial.println("  now                             現在時刻を表示");
    Serial.println("  pending                         シートへ未送信の変更を表示");
    Serial.println("  wifi                            Wi-Fi の状態を表示");
    Serial.println("  wifi <SSID> <パスワード>        Wi-Fi を設定して接続");
    Serial.println("  wifi clear                      Wi-Fi 設定を消して AP モードへ");
    Serial.println("日付: 2026-09-01 / 2026/9/1 / 9/1 / none(期限なし)");
    Serial.println("時刻: 17:00 (省略すると終日扱い)");
    Serial.println("例:   add 2026-09-01 17:00 展示会の資料入稿");
  } else if (!strcmp(cmd, "list")) {
    printList();
  } else if (!strcmp(cmd, "add")) {
    int due, mm;
    char* name = nullptr;
    if (!parseDueSpec(rest, &due, &mm, &name)) {
      Serial.println("使い方: add <日付> [時刻] <名前>   例) add 9/1 17:00 資料入稿");
      return;
    }
    if (store.count >= MAX_TASKS) { Serial.println("上限に達しています"); return; }
    addTask(name, due, mm);
    commitChange();
    Serial.printf("[add] %s (期限 %d %s)\n", name, due,
                  mm >= 0 ? "時刻あり" : "終日");
  } else if (!strcmp(cmd, "due")) {
    if (!rest) { Serial.println("使い方: due <番号> <日付> [時刻]"); return; }
    char* args = nullptr;
    char* ntok = splitToken(rest, &args);
    int n = atoi(ntok);
    if (n < 1 || n > store.count) { Serial.println("番号が不正です"); return; }
    int due, mm;
    if (!parseDueSpec(args, &due, &mm, nullptr)) {
      Serial.println("日付/時刻の書式が不正です");
      return;
    }
    store.items[n - 1].due = due;
    store.items[n - 1].dueMin = (int16_t)mm;
    commitChange();
    Serial.println("OK");
  } else if (!strcmp(cmd, "rename")) {
    if (!rest) { Serial.println("使い方: rename <番号> <名前>"); return; }
    char* name = nullptr;
    char* ntok = splitToken(rest, &name);
    int n = atoi(ntok);
    if (n < 1 || n > store.count || !name || !*name) { Serial.println("引数が不正です"); return; }
    memset(store.items[n - 1].name, 0, NAME_LEN);
    setNameSafe(store.items[n - 1].name, name);
    commitChange();
    Serial.println("OK");
  } else if (!strcmp(cmd, "done") || !strcmp(cmd, "undone") || !strcmp(cmd, "del")) {
    int n = rest ? atoi(rest) : 0;
    if (n < 1 || n > store.count) { Serial.println("番号が不正です"); return; }
    int i = n - 1;
    if (!strcmp(cmd, "del")) {
      Serial.printf("[del] %s\n", store.items[i].name);
      for (int k = i; k + 1 < store.count; k++) store.items[k] = store.items[k + 1];
      store.count--;
    } else {
      store.items[i].done = !strcmp(cmd, "done") ? 1 : 0;
      store.items[i].doneAt = store.items[i].done ? (uint32_t)time(nullptr) : 0;
      Serial.printf("[%s] %s\n", cmd, store.items[i].name);
    }
    commitChange();
  } else if (!strcmp(cmd, "seed")) {
    store.count = 0;
    seedSamples();
    commitChange();
    Serial.println("[seed] サンプルタスクを入れ直しました");
    printList();
  } else if (!strcmp(cmd, "clear")) {
    store.count = 0;
    commitChange();
    Serial.println("[clear] 全削除しました");
  } else if (!strcmp(cmd, "time")) {
    int y, mo, d, h, mi, s = 0;
    int got = rest ? sscanf(rest, "%d-%d-%d %d:%d:%d", &y, &mo, &d, &h, &mi, &s) : 0;
    if (got < 5) got = rest ? sscanf(rest, "%d/%d/%d %d:%d:%d", &y, &mo, &d, &h, &mi, &s) : 0;
    if (got >= 5) {
      if (got == 5) s = 0;
      struct tm ltm = {};
      ltm.tm_year = y - 1900; ltm.tm_mon = mo - 1; ltm.tm_mday = d;
      ltm.tm_hour = h; ltm.tm_min = mi; ltm.tm_sec = s; ltm.tm_isdst = -1;
      time_t e = mktime(&ltm);
      struct tm g;
      gmtime_r(&e, &g);
      M5.Rtc.setDateTime(&g);
      M5.Rtc.setSystemTimeFromRtc();
      applyTZ();
      clockSuspect = false;
      Serial.printf("[time] 設定しました -> %04d-%02d-%02d %02d:%02d:%02d JST\n",
                    y, mo, d, h, mi, s);
      rebuildOrder();
      dirty = true;
    } else {
      Serial.println("使い方: time 2026-08-20 21:00   (秒は省略可)");
    }
  } else if (!strcmp(cmd, "pending")) {
    int n = 0;
    for (int i = 0; i < actionCount; i++) {
      const Action& a = actions[i];
      if (!a.pending) continue;
      Serial.printf("  行%d %s 実測%d分  %02d:%02d %s\n", a.row, a.done ? "☆" : "解除",
                    a.mins, a.startMin / 60, a.startMin % 60, a.name);
      n++;
    }
    Serial.printf("未送信 %d 件\n", n);
  } else if (!strcmp(cmd, "wifi")) {
    if (!rest || !*rest) {
      Serial.printf("[wifi] %s\n", netLine);
      if (netState == NET_AP)
        Serial.printf("[wifi] AP パスワード: %s  (SSID: %s)\n", AP_PASS, AP_SSID);
      Serial.println("設定: wifi <SSID> <パスワード>  /  解除: wifi clear");
      return;
    }
    if (!strcmp(rest, "clear") || !strcmp(rest, "off")) { clearWifi(); return; }
    char* pass = nullptr;
    char* ssid = splitToken(rest, &pass);
    if (!pass || !*pass) { Serial.println("使い方: wifi <SSID> <パスワード>"); return; }
    Serial.printf("[wifi] 保存: SSID=%s\n", ssid);
    saveWifi(ssid, pass);
  } else if (!strcmp(cmd, "now")) {
    time_t t = time(nullptr);
    struct tm lt;
    localtime_r(&t, &lt);
    Serial.printf("[now] %04d-%02d-%02d(%s) %02d:%02d:%02d JST\n",
                  lt.tm_year + 1900, lt.tm_mon + 1, lt.tm_mday, WDAY_JA[lt.tm_wday],
                  lt.tm_hour, lt.tm_min, lt.tm_sec);
  } else if (cmd[0]) {
    Serial.printf("不明なコマンド: %s  (help で一覧)\n", cmd);
  }
}

static void pollSerial() {
  static char buf[160];
  static int len = 0;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') { buf[len] = 0; handleCommand(buf); len = 0; continue; }
    if (len < (int)sizeof(buf) - 1) buf[len++] = c;
  }
}

// ---------------------------------------------------------------- タッチ
static void handleTouch(int x, int y) {
  Serial.printf("[tap] x=%d y=%d\n", x, y);
  if (y >= FOOTER_Y) {
    int* top = (view == VIEW_ACTIONS) ? &aScrollTop : &scrollTop;
    int total = (view == VIEW_ACTIONS) ? actionCount : orderCount;
    if (x < 80) {
      if (*top > 0) { (*top)--; dirty = true; M5.Speaker.tone(1600, 40); }
    } else if (x < 160) {
      if (*top < total - ROWS) { (*top)++; dirty = true; M5.Speaker.tone(1600, 40); }
    } else if (x < 240) {
      if (view == VIEW_ACTIONS) {
        scrollToCurrentAction();
        M5.Speaker.tone(1900, 50);
      } else {
        showDone = !showDone;
        scrollTop = 0;
        rebuildOrder();
        M5.Speaker.tone(1900, 50);
        Serial.printf("[view] %s\n", showDone ? "すべて表示" : "未完了のみ表示");
      }
      dirty = true;
    } else {
      view = (view == VIEW_ACTIONS) ? VIEW_TASKS : VIEW_ACTIONS;
      if (view == VIEW_ACTIONS) scrollToCurrentAction();
      dirty = true;
      M5.Speaker.tone(2100, 50);
      Serial.printf("[view] %s\n", view == VIEW_ACTIONS ? "当日アクション" : "期限リスト");
    }
    return;
  }
  if (y >= LIST_Y && y < LIST_Y + ROWS * ROW_H) {
    int r = (y - LIST_Y) / ROW_H;
    if (view == VIEW_ACTIONS) {
      toggleAction(aScrollTop + r);
    } else {
      int oi = scrollTop + r;
      if (oi < orderCount) toggleTask(order[oi]);
    }
  }
}

// ---------------------------------------------------------------- setup / loop
void setup() {
  Serial.begin(115200);
  delay(200);
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);
  M5.Display.setBrightness(160);
  M5.Speaker.setVolume(80);

  initClock();
  load();
  rebuildOrder();

  canvas.setPsram(true);
  canvas.setColorDepth(16);
  useCanvas = (canvas.createSprite(SCR_W, SCR_H) != nullptr);
  Serial.printf("[gfx] canvas=%s\n", useCanvas ? "sprite" : "direct");

  render();
  netBegin();
  render();
  Serial.println("=== M5 期限管理タスク ===  help でコマンド一覧");
  printList();
}

void loop() {
  M5.update();
  pollSerial();
  netLoop();

  auto t = M5.Touch.getDetail();
  if (t.wasClicked()) handleTouch(t.x, t.y);

  static uint32_t lastClockMin = 0;
  static int lastDay = 0;
  uint32_t nowMin = (uint32_t)(time(nullptr) / 60);
  if (nowMin != lastClockMin) {
    lastClockMin = nowMin;
    int d = todayYMD();
    if (d != lastDay) { lastDay = d; rebuildOrder(); }
    dirty = true;
  }
  if (flashIdx >= 0 && millis() > flashUntil) { flashIdx = -1; dirty = true; }

  if (dirty) { dirty = false; render(); }
  delay(10);
}

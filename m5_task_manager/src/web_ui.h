// ------------------------------------------------------------------ Web 入力UI
//   ・Wi-Fi に繋がればスマホ/PC のブラウザからタスクを追加・編集できる
//   ・Wi-Fi 情報が無い / 繋がらない場合は本体が親機(AP)になるので、
//     スマホから直接その AP に繋げば同じ画面が使える
//   ・接続できたら NTP で時刻を合わせ、RTC にも書き戻す
#pragma once
#include <WiFi.h>
#include <WebServer.h>
#include <esp_sntp.h>

static const char AP_SSID[] = "M5Task-Setup";
static const char AP_PASS[] = "m5task1234";
static const uint32_t STA_TIMEOUT_MS = 15000;

enum NetState { NET_IDLE, NET_CONNECTING, NET_STA, NET_AP };
static NetState netState = NET_IDLE;
static WebServer server(80);
static Preferences netPrefs;          // タスクとは別の namespace（clear で消えないように）
static bool serverUp = false;
static bool ntpDone = false;
static uint32_t staStartedAt = 0;
static uint32_t ntpStartedAt = 0;
static bool ntpNoted = false;

static void netUpdateLabel() {
  switch (netState) {
    case NET_CONNECTING:
      snprintf(netLine, sizeof(netLine), "Wi-Fi 接続中... %s", WiFi.SSID().c_str());
      break;
    case NET_STA:
      snprintf(netLine, sizeof(netLine), "http://%s", WiFi.localIP().toString().c_str());
      break;
    case NET_AP:
      snprintf(netLine, sizeof(netLine), "AP %s → http://%s", AP_SSID,
               WiFi.softAPIP().toString().c_str());
      break;
    default:
      snprintf(netLine, sizeof(netLine), "Wi-Fi 停止中");
      break;
  }
  dirty = true;
}

// ---------------------------------------------------------------- JSON 出力
static void jsonEscape(const char* s, String& out) {
  for (const char* p = s; *p; p++) {
    uint8_t c = (uint8_t)*p;
    if (c == '"' || c == '\\') { out += '\\'; out += (char)c; }
    else if (c < 0x20) { char b[8]; snprintf(b, sizeof(b), "\\u%04x", c); out += b; }
    else out += (char)c;
  }
}

static String tasksJson() {
  String o = "{\"max\":";
  o += MAX_TASKS;
  o += ",\"clockSuspect\":";
  o += clockSuspect ? 1 : 0;
  o += ",\"tasks\":[";
  for (int i = 0; i < store.count; i++) {
    const Task& t = store.items[i];
    if (i) o += ',';
    o += "{\"i\":";
    o += i;
    o += ",\"name\":\"";
    jsonEscape(t.name, o);
    o += "\",\"due\":";
    o += t.due;
    o += ",\"m\":";
    o += t.dueMin;
    o += ",\"done\":";
    o += t.done ? 1 : 0;
    o += '}';
  }
  o += "]}";
  return o;
}

static void sendTasks() {
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json; charset=utf-8", tasksJson());
}

// ---------------------------------------------------------------- API ハンドラ
// "2026-09-01" → 20260901 / 空文字 → 0 / 不正 → -1
static int parseHtmlDate(const String& s) {
  if (!s.length()) return 0;
  int y, m, d;
  if (sscanf(s.c_str(), "%d-%d-%d", &y, &m, &d) != 3) return -1;
  if (m < 1 || m > 12 || d < 1 || d > 31) return -1;
  return y * 10000 + m * 100 + d;
}

// "17:00" → 1020 / 空文字 → NO_TIME / 不正 → -2
static int parseHtmlTime(const String& s) {
  if (!s.length()) return NO_TIME;
  int h, mi;
  if (sscanf(s.c_str(), "%d:%d", &h, &mi) != 2) return -2;
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return -2;
  return h * 60 + mi;
}

static void handleApiTask() {
  String name = server.arg("name");
  name.trim();
  int idx = server.hasArg("i") ? server.arg("i").toInt() : -1;
  int due = parseHtmlDate(server.arg("date"));
  int mm = parseHtmlTime(server.arg("time"));
  if (!name.length()) { server.send(400, "text/plain; charset=utf-8", "名前が空です"); return; }
  if (due < 0 || mm == -2) { server.send(400, "text/plain; charset=utf-8", "期限の書式が不正です"); return; }
  if (due == 0) mm = NO_TIME;  // 期限なしに時刻だけ付いても意味がない

  if (idx >= 0 && idx < store.count) {
    setNameSafe(store.items[idx].name, name.c_str());
    store.items[idx].due = due;
    store.items[idx].dueMin = (int16_t)mm;
    Serial.printf("[web] 更新 #%d %s\n", idx + 1, store.items[idx].name);
  } else {
    if (store.count >= MAX_TASKS) {
      server.send(409, "text/plain; charset=utf-8", "タスクの上限に達しています");
      return;
    }
    addTask(name.c_str(), due, mm);
    Serial.printf("[web] 追加 %s\n", store.items[store.count - 1].name);
    M5.Speaker.tone(2000, 60);
  }
  commitChange();
  sendTasks();
}

static void handleApiToggle() {
  int idx = server.arg("i").toInt();
  if (idx < 0 || idx >= store.count) { server.send(400, "text/plain", "bad index"); return; }
  toggleTask(idx);
  sendTasks();
}

static void handleApiDel() {
  int idx = server.arg("i").toInt();
  if (idx < 0 || idx >= store.count) { server.send(400, "text/plain", "bad index"); return; }
  Serial.printf("[web] 削除 %s\n", store.items[idx].name);
  for (int i = idx; i < store.count - 1; i++) store.items[i] = store.items[i + 1];
  store.count--;
  memset(&store.items[store.count], 0, sizeof(Task));
  commitChange();
  sendTasks();
}

// ------------------------------------------------- 当日アクションの取り込み
// body は text/plain。1行目=日付(YYYYMMDD)、2行目以降がタブ区切りで
//   開始HH:MM \t 終了HH:MM \t 分類 \t タスク名 \t 補足 \t 担当 \t 完了(1/0)
// JSON にしないのは、端末側にパーサを積まずに済ませるため。
static int parseHM(const char* s) {
  int h, m;
  if (sscanf(s, "%d:%d", &h, &m) != 2) return -1;
  if (h < 0 || h > 47 || m < 0 || m > 59) return -1;
  return h * 60 + m;
}

// TSV を actions[] に反映する。1行目=日付、2行目以降が
//   行番号 \t 開始HH:MM \t 終了HH:MM \t 分類 \t タスク名 \t 補足 \t 担当 \t 完了(1/0)
// 行番号はシート上の行で、書き戻しの鍵になる(0 = 不明。書き戻さない)。
static bool applyActionsTsv(const String& body, int* outN, int* outSkipped, int* outOver) {
  // static でないと 64 * sizeof(Action) ≒ 8KB を積むことになり、
  // Arduino の loop タスク(スタック 8KB)がオーバーフローして落ちる。
  static Action work[MAX_ACTIONS];
  int n = 0, ymd = 0, lineNo = 0, skipped = 0, over = 0, from = 0;

  while (from < (int)body.length()) {
    int nl = body.indexOf('\n', from);
    String line = (nl < 0) ? body.substring(from) : body.substring(from, nl);
    from = (nl < 0) ? body.length() : nl + 1;
    line.trim();
    if (!line.length()) continue;
    lineNo++;
    if (lineNo == 1) { ymd = line.toInt(); continue; }

    String col[8];
    int c = 0, p = 0;
    while (c < 8) {
      int t = line.indexOf('\t', p);
      col[c++] = (t < 0) ? line.substring(p) : line.substring(p, t);
      if (t < 0) break;
      p = t + 1;
    }
    int st = parseHM(col[1].c_str());
    int en = parseHM(col[2].c_str());
    if (st < 0 || en < 0 || !col[4].length()) { skipped++; continue; }
    if (n >= MAX_ACTIONS) { over++; continue; }   // 溢れた件数は必ず報告する

    Action& a = work[n++];
    memset(&a, 0, sizeof(a));
    a.row = (int16_t)col[0].toInt();
    a.startMin = (int16_t)st;
    a.endMin = (int16_t)en;
    strncpy(a.cat, col[3].c_str(), CAT_LEN - 1);
    setNameSafe(a.name, col[4].c_str());
    strncpy(a.note, col[5].c_str(), NOTE_LEN - 1);
    strncpy(a.who, col[6].c_str(), CAT_LEN - 1);
    a.done = (col[7] == "1") ? 1 : 0;   // 完了はシートの☆が正
  }

  if (!ymd) return false;

  // シートから読み直すと actions[] を作り直すので、まだ送れていないタップは
  // そのままだと消える。行番号で突き合わせて未送信ぶんを引き継ぐ。
  for (int i = 0; i < actionCount; i++) {
    const Action& old = actions[i];
    if (!old.pending || old.row <= 0) continue;
    for (int j = 0; j < n; j++) {
      if (work[j].row != old.row) continue;
      work[j].done = old.done;
      work[j].mins = old.mins;
      work[j].pending = 1;
      break;
    }
  }

  memcpy(actions, work, sizeof(Action) * n);
  actionCount = n;
  actionYMD = ymd;
  sortActions();          // 担当を混ぜて開始時刻順に並べる
  scrollToCurrentAction();
  dirty = true;
  if (outN) *outN = n;
  if (outSkipped) *outSkipped = skipped;
  if (outOver) *outOver = over;
  if (over) Serial.printf("[action] !! 上限 %d 件を超えたため %d 件を捨てました\n", MAX_ACTIONS, over);
  return true;
}

static void handleApiActionsPost() {
  String body = server.arg("plain");
  if (!body.length()) { server.send(400, "text/plain; charset=utf-8", "body が空です"); return; }
  int n = 0, skipped = 0, over = 0;
  if (!applyActionsTsv(body, &n, &skipped, &over)) {
    server.send(400, "text/plain; charset=utf-8", "1行目に日付(YYYYMMDD)が必要です");
    return;
  }
  view = VIEW_ACTIONS;
  Serial.printf("[action] %d 件 取り込み (%d) / 飛ばした行 %d / 溢れ %d\n",
                n, actionYMD, skipped, over);
  char msg[80];
  snprintf(msg, sizeof(msg), "取り込み %d 件 (飛ばし %d / 上限超過 %d)", n, skipped, over);
  server.send(200, "text/plain; charset=utf-8", msg);
}

static void handleApiActionsGet() {
  String o = "{\"ymd\":";
  o += actionYMD;
  o += ",\"cur\":";
  o += currentActionIdx();
  o += ",\"actions\":[";
  for (int i = 0; i < actionCount; i++) {
    const Action& a = actions[i];
    if (i) o += ',';
    o += "{\"s\":";
    o += a.startMin;
    o += ",\"e\":";
    o += a.endMin;
    o += ",\"who\":\"";
    jsonEscape(a.who, o);
    o += "\",\"cat\":\"";
    jsonEscape(a.cat, o);
    o += "\",\"name\":\"";
    jsonEscape(a.name, o);
    o += "\",\"note\":\"";
    jsonEscape(a.note, o);
    o += "\",\"row\":";
    o += a.row;
    o += ",\"done\":";
    o += a.done ? 1 : 0;
    o += '}';
  }
  o += "]}";
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json; charset=utf-8", o);
}

// ---------------------------------------------------------------- 画面(HTML)
static const char PAGE_HTML[] PROGMEM = R"HTML(<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>M5 タスク</title>
<style>
:root{--bg:#101218;--card:#20242e;--line:#2f3543;--fg:#eef0f5;--muted:#8c94a2;
      --red:#e83e3e;--org:#f58c20;--yel:#e8c828;--grn:#38be78;--accent:#3d7dd8}
*{box-sizing:border-box}
body{margin:0;padding:14px;background:var(--bg);color:var(--fg);
     font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
h1{font-size:17px;margin:0 0 12px;display:flex;justify-content:space-between;align-items:center}
h1 span{font-size:12px;color:var(--muted);font-weight:400}
form{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:16px}
label{display:block;font-size:12px;color:var(--muted);margin:0 0 4px}
input{width:100%;padding:10px;border-radius:7px;border:1px solid var(--line);
      background:#171b23;color:var(--fg);font-size:16px}
.row2{display:flex;gap:8px;margin-top:10px}.row2>div{flex:1}
.acts{display:flex;gap:8px;margin-top:12px}
button{flex:1;padding:11px;border:0;border-radius:7px;background:var(--accent);
       color:#fff;font-size:15px;font-weight:600}
button.sub{background:#39404e}
ul{list-style:none;margin:0;padding:0}
li{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--line);
   border-left:5px solid var(--muted);border-radius:9px;padding:10px 12px;margin-bottom:8px}
li.done{opacity:.5}li.done .nm{text-decoration:line-through}
.chk{width:26px;height:26px;flex:0 0 26px;border-radius:6px;border:2px solid #78828f;
     background:none;padding:0;font-size:15px;line-height:1}
.chk.on{background:var(--grn);border-color:var(--grn);color:#101218}
.txt{flex:1;min-width:0}.nm{font-size:15px;word-break:break-all}
.meta{font-size:12px;color:var(--muted);margin-top:2px}
.mini{flex:0 0 auto;background:none;border:0;color:var(--muted);font-size:12px;padding:4px 6px}
.hd{font-size:12px;color:var(--muted);margin:18px 0 8px}
#msg{font-size:13px;color:var(--org);min-height:18px;margin-bottom:8px}
</style></head><body>
<h1>M5 タスク <span id="cnt"></span></h1>
<div id="msg"></div>
<form id="f" onsubmit="return submitForm(event)">
  <input type="hidden" id="idx" value="-1">
  <label for="name">タスク名</label>
  <input id="name" maxlength="21" placeholder="例) 展示会の資料入稿" required>
  <div class="row2">
    <div><label for="date">期限（空欄=期限なし）</label><input id="date" type="date"></div>
    <div><label for="time">時刻（空欄=終日）</label><input id="time" type="time"></div>
  </div>
  <div class="acts">
    <button type="submit" id="ok">追加</button>
    <button type="button" class="sub" onclick="resetForm()">クリア</button>
  </div>
</form>
<div id="list"></div>
<script>
let T=[];
const $=i=>document.getElementById(i);
const msg=t=>{$('msg').textContent=t||''};

function fmt(t){
  if(!t.due) return '期限なし';
  const s=String(t.due), d=s.slice(4,6)+'/'+s.slice(6,8);
  return t.m<0 ? d+' 終日' : d+' '+String(Math.floor(t.m/60)).padStart(2,'0')+':'+String(t.m%60).padStart(2,'0');
}
function left(t){
  if(t.done||!t.due) return '';
  const s=String(t.due);
  const due=new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8),
                     t.m<0?23:Math.floor(t.m/60), t.m<0?59:t.m%60);
  const sec=(due-new Date())/1000, a=Math.abs(sec);
  const b = a<3600 ? Math.round(a/60)+'分'
          : a<86400 ? Math.floor(a/3600)+'時間'+Math.round(a%3600/60)+'分'
          : Math.floor(a/86400)+'日'+Math.floor(a%86400/3600)+'時間';
  return sec<0 ? b+'超過' : 'あと'+b;
}
function color(t){
  if(t.done||!t.due) return 'var(--muted)';
  const s=String(t.due);
  const due=new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8),
                     t.m<0?23:Math.floor(t.m/60), t.m<0?59:t.m%60);
  const h=(due-new Date())/3600000;
  return h<0?'var(--red)':h<6?'var(--org)':h<48?'var(--yel)':'var(--grn)';
}
function render(){
  const pend=T.filter(t=>!t.done);
  $('cnt').textContent='未完了 '+pend.length+' / 全 '+T.length+' 件';
  const sec=[['未完了',pend.sort(sortDue)],['完了',T.filter(t=>t.done)]];
  $('list').innerHTML=sec.map(([h,a])=>!a.length?'':
    '<div class="hd">'+h+'</div><ul>'+a.map(t=>
      '<li class="'+(t.done?'done':'')+'" style="border-left-color:'+color(t)+'">'+
      '<button class="chk '+(t.done?'on':'')+'" onclick="tog('+t.i+')">'+(t.done?'✓':'')+'</button>'+
      '<div class="txt"><div class="nm">'+esc(t.name)+'</div>'+
      '<div class="meta">'+fmt(t)+(left(t)?' ・ '+left(t):'')+'</div></div>'+
      '<button class="mini" onclick="edit('+t.i+')">編集</button>'+
      '<button class="mini" onclick="del('+t.i+')">削除</button></li>').join('')+'</ul>').join('');
}
function sortDue(a,b){return (a.due||99999999)*10000+(a.m<0?2359:a.m) - ((b.due||99999999)*10000+(b.m<0?2359:b.m))}
function esc(s){return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}

async function call(url,body){
  const r=await fetch(url,{method:body?'POST':'GET',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body});
  if(!r.ok){msg(await r.text());return null}
  msg(''); T=(await r.json()).tasks; render(); return true;
}
const q=o=>Object.entries(o).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
const load=()=>call('/api/tasks');
const tog=i=>call('/api/toggle',q({i}));
const del=i=>confirm('削除しますか？')&&call('/api/del',q({i}));
function edit(i){
  const t=T.find(x=>x.i===i); if(!t)return;
  $('idx').value=i; $('name').value=t.name;
  const s=String(t.due);
  $('date').value=t.due?s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8):'';
  $('time').value=t.m<0?'':String(Math.floor(t.m/60)).padStart(2,'0')+':'+String(t.m%60).padStart(2,'0');
  $('ok').textContent='更新'; window.scrollTo(0,0);
}
function resetForm(){$('idx').value=-1;$('f').reset();$('ok').textContent='追加';msg('')}
async function submitForm(e){
  e.preventDefault();
  const ok=await call('/api/task',q({i:$('idx').value,name:$('name').value,
                                     date:$('date').value,time:$('time').value}));
  if(ok) resetForm();
  return false;
}
load(); setInterval(load,30000);
</script></body></html>)HTML";

// --------------------------------------- スプレッドシートとの受け渡し(Mac 経由)
// ESP32 から直接 Google に書きに行くには GAS を匿名公開するしかないので、
// 代わりに Mac 側のブリッジ(tools/sheet_bridge.py)に取りに来てもらう。
//   GET  /api/pending  未送信の変更を TSV で返す(行番号 \t 完了 \t 実測分)
//   POST /api/ack      書き込めた行番号を送ってもらい、未送信を落とす
static void handleApiPending() {
  String o;
  for (int i = 0; i < actionCount; i++) {
    const Action& a = actions[i];
    if (!a.pending || a.row <= 0) continue;
    o += a.row;
    o += '\t';
    o += a.done ? 1 : 0;
    o += '\t';
    o += a.mins;
    o += '\n';
  }
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "text/plain; charset=utf-8", o);
}

static void handleApiAck() {
  String body = server.arg("plain");
  int from = 0, n = 0;
  while (from < (int)body.length()) {
    int nl = body.indexOf('\n', from);
    String line = (nl < 0) ? body.substring(from) : body.substring(from, nl);
    from = (nl < 0) ? body.length() : nl + 1;
    line.trim();
    if (!line.length()) continue;
    int row = line.toInt();
    for (int i = 0; i < actionCount; i++) {
      if (actions[i].row == row && actions[i].pending) { actions[i].pending = 0; n++; }
    }
  }
  if (n) {
    char msg[40];
    snprintf(msg, sizeof(msg), "シートに反映 %d 件", n);
    setStatus(msg);
    Serial.printf("[bridge] %d 件がシートに書けました\n", n);
  }
  server.send(200, "text/plain; charset=utf-8", String("OK ") + n);
}

// ---------------------------------------------------------------- 起動・維持
static void startServer() {
  if (serverUp) return;
  server.on("/", HTTP_GET, []() {
    server.sendHeader("Cache-Control", "no-store");
    server.send_P(200, "text/html; charset=utf-8", PAGE_HTML);
  });
  server.on("/api/tasks", HTTP_GET, sendTasks);
  server.on("/api/task", HTTP_POST, handleApiTask);
  server.on("/api/toggle", HTTP_POST, handleApiToggle);
  server.on("/api/del", HTTP_POST, handleApiDel);
  server.on("/api/actions", HTTP_GET, handleApiActionsGet);
  server.on("/api/actions", HTTP_POST, handleApiActionsPost);
  server.on("/api/atoggle", HTTP_POST, []() {
    int i = server.arg("i").toInt();
    if (i < 0 || i >= actionCount) { server.send(400, "text/plain", "bad index"); return; }
    toggleAction(i);
    handleApiActionsGet();
  });
  server.on("/api/pending", HTTP_GET, handleApiPending);
  server.on("/api/ack", HTTP_POST, handleApiAck);
  server.onNotFound([]() { server.send(404, "text/plain", "not found"); });
  server.begin();
  serverUp = true;
}

static void startAP() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  netState = NET_AP;
  netUpdateLabel();
  Serial.printf("[net] AP モードで起動: SSID=%s PASS=%s → http://%s\n",
                AP_SSID, AP_PASS, WiFi.softAPIP().toString().c_str());
  startServer();
}

static void startSTA(const String& ssid, const String& pass) {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(ssid.c_str(), pass.c_str());
  netState = NET_CONNECTING;
  staStartedAt = millis();
  netUpdateLabel();
  Serial.printf("[net] %s に接続中...\n", ssid.c_str());
}

static void netBegin() {
  netPrefs.begin("m5net", false);
  String ssid = netPrefs.getString("ssid", "");
  String pass = netPrefs.getString("pass", "");
  if (ssid.length()) startSTA(ssid, pass);
  else {
    Serial.println("[net] Wi-Fi 未設定 → AP モード  (設定: wifi <SSID> <パスワード>)");
    startAP();
  }
}

static void saveWifi(const char* ssid, const char* pass) {
  netPrefs.putString("ssid", ssid);
  netPrefs.putString("pass", pass);
  WiFi.disconnect(true);
  WiFi.softAPdisconnect(true);
  ntpDone = false;
  startSTA(String(ssid), String(pass));
}

static void clearWifi() {
  netPrefs.remove("ssid");
  netPrefs.remove("pass");
  WiFi.disconnect(true);
  Serial.println("[net] Wi-Fi 設定を削除 → AP モードへ");
  startAP();
}

// NTP で合った時刻を RTC にも書き戻す(RTC は UTC で持つ)
static void applyNtpToRtc() {
  time_t now = time(nullptr);
  struct tm g;
  gmtime_r(&now, &g);
  M5.Rtc.setDateTime(&g);
  applyTZ();
  clockSuspect = false;
  ntpDone = true;
  dirty = true;
  struct tm lt;
  localtime_r(&now, &lt);
  Serial.printf("[ntp] 時刻同期 OK: %04d-%02d-%02d %02d:%02d:%02d JST (RTC も更新)\n",
                lt.tm_year + 1900, lt.tm_mon + 1, lt.tm_mday, lt.tm_hour, lt.tm_min, lt.tm_sec);
}

static void netLoop() {
  if (netState == NET_CONNECTING) {
    if (WiFi.status() == WL_CONNECTED) {
      netState = NET_STA;
      netUpdateLabel();
      Serial.printf("[net] 接続しました → http://%s\n", WiFi.localIP().toString().c_str());
      startServer();
      configTzTime("JST-9", "time.google.com", "ntp.nict.jp", "time.cloudflare.com");
      ntpStartedAt = millis();
      ntpNoted = false;
    } else if (millis() - staStartedAt > STA_TIMEOUT_MS) {
      Serial.println("[net] 接続できませんでした → AP モードへ切り替え");
      WiFi.disconnect(true);
      startAP();
    }
    return;
  }
  if (netState == NET_STA) {
    if (WiFi.status() != WL_CONNECTED) {  // 切れたら黙って再接続を待つ
      netState = NET_CONNECTING;
      staStartedAt = millis();
      netUpdateLabel();
      return;
    }
    if (!ntpDone) {
      if (sntp_get_sync_status() == SNTP_SYNC_STATUS_COMPLETED) {
        applyNtpToRtc();
      } else if (!ntpNoted && millis() - ntpStartedAt > 30000) {
        // SNTP は時刻の補正が必要なときだけ COMPLETED を返す。
        // 既に時計が合っていれば何も起きないのが正常なので、1回だけ知らせて以降は黙る
        // (ポーリング自体は続けるので、あとからずれても補正・RTC 書き戻しが走る)。
        ntpNoted = true;
        Serial.printf("[ntp] 30秒間 補正なし (server0=%s)。時計が既に合っていればこれが正常です。%s\n",
                      sntp_getservername(0),
                      clockSuspect ? "※時刻が不明な状態なので `time <YYYY-MM-DD HH:MM>` で合わせてください" : "");
      }
    }
  }
  if (serverUp) server.handleClient();
}

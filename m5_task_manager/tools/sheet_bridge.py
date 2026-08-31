#!/usr/bin/env python3
"""当日アクションシート ⇄ M5Stack Core2 を同期する常駐スクリプト。

シートの読み書きは、すでにデプロイ済みの汎用 GAS ウェブアプリ
(~/.gas-webapp-url) の readRange / sheetEdit を借りる。
そのため新しい公開エンドポイントも OAuth 設定も要らない。
GAS 側のコードには一切手を入れていない。

一定間隔で以下を行う。

  1. M5 から未送信の変更（☆を付けた/外した、実測時間）を受け取る
  2. それをシートの A列(☆) と I列(実測時間) に書く
  3. 書けた行を M5 に伝えて未送信を落とす
  4. シートの当日行を読み直して M5 に流し込む

書き込みを先にやってから読み直すのが要点。逆にすると、
まだ書けていないタップをシートの古い状態で上書きして消してしまう。

    python3 tools/sheet_bridge.py 192.168.100.37            # 常駐(5分間隔)
    python3 tools/sheet_bridge.py 192.168.100.37 --once     # 1回だけ
"""
import argparse, datetime, json, os, re, sys, time, urllib.request

SPREADSHEET_ID = '1oN7tW8HmOMyP7q8ivPw2P5a-Fl7vZBhSen3zxZzuSX4'
TAB = '当日アクションシート'
LAST_ROW = 260
STARS = '☆★'

# 1始まりの列番号
C_STAR, C_DATE, C_START, C_END = 1, 2, 3, 5
C_CAT, C_NAME, C_ACTUAL, C_NOTE, C_WHO = 6, 7, 9, 11, 13


def gas(payload, tries=3):
    """GAS ウェブアプリを叩く。

    curl だとリダイレクト後に再 POST して失敗するので urllib を使う。
    GAS は数分に一度くらい HTML のエラーページや 404 を返すことがあるので、
    数回だけ間を置いて叩き直す。それでも駄目なら例外にして常駐側のループに任せる
    （ここで sys.exit すると一過性の不調で常駐が止まってしまう）。
    """
    url = open(os.path.expanduser('~/.gas-webapp-url')).read().strip()
    last = ''
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                         headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=120) as r:
                body = r.read().decode('utf-8')
            return json.loads(body)
        except json.JSONDecodeError:
            last = 'HTML が返りました: ' + ' '.join(body.split())[:120]
        except Exception as e:
            last = str(e)
        if i < tries - 1:
            time.sleep(2 * (i + 1))
    raise RuntimeError(f'GAS が応答しません({tries}回試行): {last}')


def read_rows():
    r = gas({'action': 'readRange', 'spreadsheetId': SPREADSHEET_ID,
             'sheetName': TAB, 'range': f'A1:M{LAST_ROW}'})
    if 'error' in r:
        raise RuntimeError('シートを読めません: ' + str(r['error']))
    return r['values']


def write_cells(ops):
    r = gas({'action': 'sheetEdit', 'spreadsheetId': SPREADSHEET_ID, 'ops': ops})
    if 'error' in r:
        raise RuntimeError('シートに書けません: ' + str(r['error']))
    return r


def dev(host, path, method='GET', body=b''):
    req = urllib.request.Request(f'http://{host}{path}',
                                 data=body if method == 'POST' else None, method=method,
                                 headers={'Content-Type': 'text/plain; charset=utf-8'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode('utf-8')


def push_pending(host):
    """M5 の未送信変更をシートに書く。"""
    body = dev(host, '/api/pending').strip()
    if not body:
        return []
    ops, rows = [], []
    for line in body.split('\n'):
        c = line.split('\t')
        if len(c) < 3:
            continue
        row, done, mins = int(c[0]), c[1] == '1', int(c[2])
        ops.append({'op': 'write', 'tab': TAB, 'row': row, 'col': C_STAR,
                    'values': [['☆' if done else '']]})
        if done and mins >= 0:
            # I列は期間(duration)書式。文字列だと集計が壊れるので
            # 「1日を1とした数値」で入れ、セルの書式には触らない。
            ops.append({'op': 'write', 'tab': TAB, 'row': row, 'col': C_ACTUAL,
                        'values': [[mins / 1440.0]]})
        rows.append(row)
    write_cells(ops)
    dev(host, '/api/ack', 'POST', ('\n'.join(str(r) for r in rows)).encode())
    print(f'  シートへ書き込み: {len(rows)} 行 {rows}')
    return rows


def build_tsv(vals, today):
    want = f'{today.month}/{today.day}'
    lines = [today.strftime('%Y%m%d')]
    for i, row in enumerate(vals, start=1):        # i = シート上の行番号
        cell = lambda n: (row[n - 1].strip() if len(row) >= n and row[n - 1] else '')
        if cell(C_DATE) != want:
            continue
        st, en = cell(C_START)[:5], cell(C_END)[:5]
        if not re.fullmatch(r'\d{1,2}:\d{2}', st) or not re.fullmatch(r'\d{1,2}:\d{2}', en):
            continue
        name = cell(C_NAME)
        if not name:
            continue
        star = cell(C_STAR)
        lines.append('\t'.join([str(i), st, en, cell(C_CAT), name,
                                cell(C_NOTE), cell(C_WHO),
                                '1' if star and star[0] in STARS else '0']))
    return lines


def pull(host, date=None):
    day = date or datetime.date.today()
    lines = build_tsv(read_rows(), day)
    now = f'{datetime.datetime.now():%H:%M:%S}'
    if len(lines) == 1:
        # 日付が変わった直後は当日の行がまだ無い。ここで送ると端末の表示が消えるので送らない。
        print(f'[{now}] {day} の行がシートに無いため、端末の表示は据え置き')
        return
    res = dev(host, '/api/actions', 'POST', '\n'.join(lines).encode())
    print(f'[{now}] M5 へ送信: {len(lines) - 1} 行 / {res}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('host')
    ap.add_argument('--interval', type=float, default=2,
                    help='M5 の未送信を見に行く間隔(秒)。ローカル通信なので短くてよい')
    ap.add_argument('--pull-interval', type=float, default=300,
                    help='シート全体を読み直す間隔(秒)。GAS の実行時間クォータを食うので短くしない')
    ap.add_argument('--once', action='store_true')
    ap.add_argument('--date', help='YYYY-MM-DD。指定した日の行を取り込む(既定は今日)')
    a = ap.parse_args()
    day = datetime.date.fromisoformat(a.date) if a.date else None

    # M5 の変更は毎回すぐ書く。シートの読み直しは pull-interval ごとだけ。
    # 読み直しは 1 回あたり約 2 秒 GAS を動かすので、頻度を上げるとクォータを食う
    # (300秒間隔なら 1 日あたり約 10 分。書き込みぶんを足しても余裕がある)。
    # 書き込み直後の読み直しはしない。端末側はすでにその状態を表示しているし、
    # 書けたことは sheetEdit の応答で分かるため。
    last_pull = 0.0
    while True:
        try:
            push_pending(a.host)      # 先に書く。逆順だとタップが古い状態で消える
            now = time.time()
            if a.once or now - last_pull >= a.pull_interval:
                pull(a.host, day)
                last_pull = now
        except SystemExit:
            raise
        except Exception as e:
            print(f'  失敗: {e}')
        if a.once:
            break
        time.sleep(a.interval)


if __name__ == '__main__':
    main()

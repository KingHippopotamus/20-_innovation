#!/usr/bin/env python3
"""当日アクションシートの内容を M5Stack Core2 に取り込む。

Google Drive MCP の read_file_content が返した JSON({fileContent: markdown表})から
「当日アクションシート」に相当するブロックを取り出し、
デバイスの POST /api/actions に text/plain で流し込む。

    python3 tools/import_actions.py <dump.json> <デバイスIP> [--date YYYYMMDD]

--date を付けると日付を差し替える(現在時刻のハイライト確認用)。
"""
import datetime, json, re, sys, urllib.request
from collections import Counter

# 当日アクションシートの列(markdown表に落ちた後の位置)
COL_STAR, COL_DATE, COL_START, COL_END, COL_CAT, COL_NAME, COL_NOTE, COL_WHO = 0, 1, 2, 4, 5, 6, 10, 12
STARS = '☆★'   # A列にこれが入っていれば完了

clean = lambda c: re.sub(r'<[^>]+>', '', c).replace('\\', '').strip()


def extract(dump_path, today):
    """当日アクションシートのブロックを選ぶ。

    同じブックには過去日のシート・未来アクション・作業ログが並んでおり、
    行数で選ぶと 178 行のログを、日付の新しさで選ぶと未来アクションを掴む。
    「当日」なので、**最頻の日付が今日に一番近いブロック**を採るのが正しい。
    どれを採ったかは必ず表示して、目で確かめられるようにする。
    """
    doc = json.load(open(dump_path, encoding='utf-8'))['fileContent']
    cands = []
    for bi, block in enumerate(doc.split('\n\n')):
        rows = []
        for line in block.split('\n'):
            if not line.startswith('|'):
                continue
            c = [clean(x) for x in line.split('|')[1:-1]]
            if len(c) <= COL_WHO:
                continue
            if not re.fullmatch(r'\d{1,2}/\d{1,2}', c[COL_DATE]):
                continue
            if not re.fullmatch(r'\d{1,2}:\d{2}(:\d{2})?', c[COL_START]):
                continue
            if not re.fullmatch(r'\d{1,2}:\d{2}(:\d{2})?', c[COL_END]):
                continue
            rows.append(c)
        if len(rows) < 5:
            continue
        md = Counter(r[COL_DATE] for r in rows).most_common(1)[0][0]
        m, d = (int(x) for x in md.split('/'))
        try:
            dist = abs((datetime.date(today.year, m, d) - today).days)
        except ValueError:
            continue
        same = [r for r in rows if r[COL_DATE] == md]
        cands.append((dist, -len(same), bi, md, same))

    if not cands:
        return None
    cands.sort()
    dist, _, bi, md, rows = cands[0]
    print(f'block {bi} を採用: 日付 {md}（今日との差 {dist} 日）/ {len(rows)} 行')
    for other in cands[1:4]:
        print(f'  （候補: block {other[2]} 日付 {other[3]} {-other[1]} 行）')
    return md, rows


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    dump, host = sys.argv[1], sys.argv[2]
    override = None
    if '--date' in sys.argv:
        override = sys.argv[sys.argv.index('--date') + 1]

    today = datetime.date.today()
    got = extract(dump, today)
    if not got:
        sys.exit('当日アクションらしき行が見つかりませんでした')
    md, rows = got

    m, d = (int(x) for x in md.split('/'))
    ymd = override or f'{today.year}{m:02d}{d:02d}'   # シートに年が無いので補う

    hm = lambda t: ':'.join(t.split(':')[:2])          # 14:49:00 -> 14:49
    lines = [ymd]
    for c in rows:
        done = '1' if c[COL_STAR] and c[COL_STAR][0] in STARS else '0'
        # 先頭は行番号。ダンプからは分からないので 0(=書き戻し不可)を入れる
        lines.append('\t'.join(['0', hm(c[COL_START]), hm(c[COL_END]), c[COL_CAT],
                                 c[COL_NAME], c[COL_NOTE], c[COL_WHO], done]))

    body = '\n'.join(lines).encode('utf-8')
    print(f'{len(lines)-1} 行を {host} に送ります (日付 {ymd})')
    req = urllib.request.Request(f'http://{host}/api/actions', data=body,
                                 headers={'Content-Type': 'text/plain; charset=utf-8'})
    with urllib.request.urlopen(req, timeout=15) as r:
        print(r.status, r.read().decode('utf-8'))


if __name__ == '__main__':
    main()

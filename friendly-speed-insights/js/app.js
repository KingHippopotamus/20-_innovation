/**
 * Friendly Speed Insights - Frontend Logic
 */

// ===================================
// 設定
// ===================================

// GASのWebアプリURL（デプロイ後に設定してください）
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwrZlwzteRg8DIyFNxgLcWQQVGMD8Y0vQoCOqMdxcNq1q5dLLcGYNMmkebdBmn29F0/exec';

// 対象の5項目（フィルタリング）
const TARGET_AUDITS = [
    'modern-image-formats',      // 画像の形式を新しくしましょう
    'uses-optimized-images',     // 画像のデータ量を圧縮しましょう
    'offscreen-images',          // 画面外の画像を遅延読み込み
    'unused-javascript',         // 不要なプログラムを整理
    'server-response-time'       // サーバー応答時間
];

// 日本語タイトルと詳細説明
const AUDIT_INFO = {
    'modern-image-formats': {
        title: '画像の形式を新しくしましょう',
        description: 'WebPやAVIF形式に変換すると、画像の品質を保ちながらファイルサイズを大幅に削減できます。',
        howTo: `1. Squoosh（https://squoosh.app）を開く
2. 画像をドラッグ＆ドロップ
3. 右側で「WebP」形式を選択
4. 品質を80程度に調整してダウンロード
5. HTMLの<picture>タグで新しい画像を使用`
    },
    'uses-optimized-images': {
        title: '画像のデータ量を圧縮しましょう',
        description: '画像ファイルを最適化することで、ページの読み込み時間を短縮できます。見た目はほぼ変わりません。',
        howTo: `1. TinyPNG（https://tinypng.com）を開く
2. 圧縮したい画像をドラッグ＆ドロップ
3. 自動で圧縮されるのでダウンロード
4. サイトの画像を置き換える

※PNG・JPEGどちらも対応しています`
    },
    'offscreen-images': {
        title: '画面外の画像を遅延読み込みしましょう',
        description: '最初に表示されない画像は後から読み込むことで、ページの初期表示が速くなります。',
        howTo: `imgタグに loading="lazy" を追加するだけ！

【変更前】
<img src="photo.jpg" alt="写真">

【変更後】
<img src="photo.jpg" alt="写真" loading="lazy">

※ファーストビュー（最初に見える部分）の画像には付けないでください`
    },
    'unused-javascript': {
        title: '不要なプログラムを整理しましょう',
        description: '使っていないJavaScriptを削除・整理することで、ページが軽くなります。',
        howTo: `【WordPressの場合】
1. 使っていないプラグインを削除
2. Asset CleanUpなどの最適化プラグインを導入
3. 不要なスクリプトを無効化

【一般的なサイトの場合】
1. 使っていないライブラリを削除
2. 開発者ツールの「Coverage」で未使用コードを確認
3. 不要な機能のスクリプトを削除`
    },
    'server-response-time': {
        title: 'サーバー応答時間を改善しましょう',
        description: 'サーバーの応答が遅いと、すべての読み込みが遅れます。根本的な改善が必要です。',
        howTo: `【すぐにできること】
1. キャッシュプラグインを導入（WP Super Cacheなど）
2. 画像のCDN利用を検討

【根本的な改善】
1. サーバープランのアップグレード
2. より高速なサーバーへ移行
3. データベースの最適化

※サーバー選びは専門家に相談することをおすすめします`
    }
};

// スコアの評価文
const SCORE_DESCRIPTIONS = {
    good: 'すばらしい！サイトは高速です',
    average: '改善の余地があります',
    poor: '改善が必要です'
};

// ===================================
// DOM要素
// ===================================
const form = document.getElementById('analyze-form');
const urlInput = document.getElementById('url-input');
const analyzeBtn = document.getElementById('analyze-btn');
const btnText = analyzeBtn.querySelector('.btn-text');
const btnLoading = analyzeBtn.querySelector('.btn-loading');
const loading = document.getElementById('loading');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');
const scoreSection = document.getElementById('score-section');
const scoreCircle = document.getElementById('score-circle');
const scoreNumber = document.getElementById('score-number');
const scoreDescription = document.getElementById('score-description');
const savingsTotal = document.getElementById('savings-total');
const totalSavingsEl = document.getElementById('total-savings');
const actionsSection = document.getElementById('actions-section');
const actionList = document.getElementById('action-list');
const apiKeyInput = document.getElementById('api-key-input');
const aiSection = document.getElementById('ai-section');
const aiContent = document.getElementById('ai-content');

// API Keyの読み込み
const savedKey = localStorage.getItem('gemini_api_key');
if (savedKey && apiKeyInput) {
    apiKeyInput.value = savedKey;
}

if (apiKeyInput) {
    apiKeyInput.addEventListener('change', (e) => {
        localStorage.setItem('gemini_api_key', e.target.value);
    });
}

// ===================================
// イベントハンドラ
// ===================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const url = urlInput.value.trim();
    if (!url) return;

    // URLのバリデーション
    if (!isValidUrl(url)) {
        showError('有効なURLを入力してください（例: https://example.com）');
        return;
    }

    // GAS URLが設定されているかチェック
    if (GAS_API_URL === 'YOUR_GAS_WEB_APP_URL_HERE') {
        showError('GASのWebアプリURLが設定されていません。app.jsのGAS_API_URLを設定してください。');
        return;
    }

    // UI初期化
    hideResults();
    hideError();
    showLoading();
    setButtonLoading(true);

    // AIセクションをリセット
    if (aiSection) aiSection.style.display = 'none';

    try {
        const data = await fetchPageSpeedData(url);

        // エラーチェック
        if (data.error) {
            throw new Error(data.error);
        }

        const score = extractScore(data);
        const audits = filterAndSortAudits(data);

        displayScore(score);
        displayActions(audits);

        // AI分析の実行（APIキーがある場合）
        const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
        if (apiKey) {
            analyzeWithGemini(apiKey, url, score, audits);
        }

    } catch (error) {
        showError(error.message || 'エラーが発生しました。URLを確認してもう一度お試しください。');
    } finally {
        hideLoading();
        setButtonLoading(false);
    }
});

// ===================================
// AI分析機能
// ===================================
async function analyzeWithGemini(apiKey, url, score, audits) {
    if (!aiSection || !aiContent) return;

    aiSection.style.display = 'block';
    aiContent.innerHTML = '<div class="spinner" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:10px;"></div> AIがHTMLを解析して改善案を考えています...';

    // 1. HTMLの取得を試みる（CORS制限があるため、失敗する可能性が高いがトライする）
    let htmlContent = "（HTMLの取得に失敗しました。CORS制限またはアクセス不能なURLです）";
    try {
        // タイムアウト付きでfetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            const text = await res.text();
            // トークン節約のため、冒頭20000文字のみ使用
            htmlContent = text.substring(0, 20000);
            if (text.length > 20000) htmlContent += "\n...（以下省略）";
        }
    } catch (e) {
        console.warn('HTML fetch failed:', e);
    }

    // 2. プロンプトの作成
    const prompt = `
あなたは世界最高峰のWebパフォーマンス改善エンジニアです。
以下のPageSpeed Insights診断結果と、WebページのHTMLソースコード（冒頭部分）を分析し、
具体的で実行可能な改善アドバイスを日本語で提供してください。

【診断対象】
URL: ${url}
パフォーマンススコア: ${score}/100

【優先的に改善すべき項目（PageSpeed Insights）】
${audits.map(a => `- ${a.title} (推定短縮時間: ${(a.savingsMs/1000).toFixed(1)}秒)`).join('\n')}

【HTMLソースコード（冒頭一部）】
\`\`\`html
${htmlContent}
\`\`\`

【指示】
1. **HTMLコードに基づく具体的な指摘**: 提供されたHTMLを見て、「この<img>タグにloading="lazy"がない」「head内のこのスクリプトがレンダリングをブロックしている」など、コードレベルで指摘してください。HTMLが取得できなかった場合は、一般的なアドバイスにとどめてください。
2. **修正前後のコード例**: 可能であれば、「修正前」と「修正後」のコード例を示して説明してください。
3. **初心者への配慮**: 専門用語には簡単な解説を添え、なぜその修正が必要なのかを優しく説明してください。
4. **励まし**: スコアが低くても改善できることを伝え、前向きなトーンで締めくくってください。
`;

    // 3. Gemini API呼び出し
    try {
        const model = 'gemini-2.5-flash';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'API Error');
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
            // marked.jsを使ってMarkdownをHTMLに変換
            aiContent.innerHTML = marked.parse(text);
        } else {
            aiContent.textContent = "申し訳ありません。AIからの応答を生成できませんでした。";
        }

    } catch (e) {
        console.error(e);
        aiContent.innerHTML = `<p style="color: #d32f2f;">AI分析中にエラーが発生しました。<br>APIキーが正しいか、または無料枠の上限に達していないか確認してください。<br>エラー詳細: ${e.message}</p>`;
    }
}

// ===================================
// API通信
// ===================================
async function fetchPageSpeedData(url) {
    const apiUrl = `${GAS_API_URL}?url=${encodeURIComponent(url)}`;

    const response = await fetch(apiUrl, {
        method: 'GET',
        redirect: 'follow'
    });

    if (!response.ok) {
        throw new Error('API呼び出しに失敗しました');
    }

    return response.json();
}

// ===================================
// データ処理
// ===================================
function extractScore(data) {
    const score = data.lighthouseResult?.categories?.performance?.score;
    return score !== undefined ? Math.round(score * 100) : null;
}

function filterAndSortAudits(data) {
    const audits = data.lighthouseResult?.audits || {};

    // 対象5項目をフィルタリング（効果があるもののみ）
    const filtered = TARGET_AUDITS
        .filter(id => {
            const audit = audits[id];
            if (!audit) return false;

            // overallSavingsMsがあり、0より大きい場合のみ
            const savingsMs = audit.details?.overallSavingsMs || 0;
            return savingsMs > 0;
        })
        .map(id => ({
            id: id,
            ...audits[id],
            savingsMs: audits[id].details?.overallSavingsMs || 0
        }));

    // overallSavingsMsで降順ソート（効果が高い順）
    filtered.sort((a, b) => b.savingsMs - a.savingsMs);

    // 上位5件を返す
    return filtered.slice(0, 5);
}

// ===================================
// UI表示
// ===================================
function displayScore(score) {
    if (score === null) {
        scoreNumber.textContent = '-';
        scoreCircle.className = 'score-circle';
        scoreDescription.textContent = 'スコアを取得できませんでした';
        scoreSection.style.display = 'block';
        return;
    }

    scoreNumber.textContent = score;

    // 信号色の判定
    let colorClass, description;
    if (score >= 90) {
        colorClass = 'score-good';
        description = SCORE_DESCRIPTIONS.good;
    } else if (score >= 50) {
        colorClass = 'score-average';
        description = SCORE_DESCRIPTIONS.average;
    } else {
        colorClass = 'score-poor';
        description = SCORE_DESCRIPTIONS.poor;
    }

    scoreCircle.className = `score-circle ${colorClass}`;
    scoreDescription.textContent = description;
    scoreSection.style.display = 'block';
}

function displayActions(audits) {
    actionList.innerHTML = '';

    if (audits.length === 0) {
        actionList.innerHTML = '<p class="no-actions">改善が必要な項目はありません。すばらしいです！</p>';
        savingsTotal.style.display = 'none';
        actionsSection.style.display = 'block';
        return;
    }

    // 合計時短効果を計算
    const totalMs = audits.reduce((sum, audit) => sum + audit.savingsMs, 0);
    const totalSeconds = (totalMs / 1000).toFixed(1);
    totalSavingsEl.textContent = totalSeconds;
    savingsTotal.style.display = 'block';

    // アクションカードを生成
    audits.forEach((audit, index) => {
        const info = AUDIT_INFO[audit.id] || {
            title: audit.title,
            description: audit.description || '',
            howTo: '詳細な改善方法については、開発者にご相談ください。'
        };
        const savingsSeconds = (audit.savingsMs / 1000).toFixed(1);

        const card = document.createElement('div');
        card.className = 'action-card';
        card.innerHTML = `
            <div class="action-header">
                <span class="action-number">${index + 1}</span>
                <span class="action-title">${info.title}</span>
                <span class="action-savings">-${savingsSeconds}秒</span>
            </div>
            <p class="action-description">${info.description}</p>
            <button class="detail-btn" onclick="toggleDetail(this)">具体的なやり方を見る</button>
            <div class="action-detail">
                <strong>具体的なやり方</strong>
                <pre>${info.howTo}</pre>
            </div>
        `;

        actionList.appendChild(card);
    });

    actionsSection.style.display = 'block';
}

// ===================================
// ユーティリティ関数
// ===================================
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function toggleDetail(btn) {
    const detail = btn.nextElementSibling;
    detail.classList.toggle('open');
    btn.textContent = detail.classList.contains('open') ? '閉じる' : '具体的なやり方を見る';
}

function showLoading() {
    loading.style.display = 'block';
}

function hideLoading() {
    loading.style.display = 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
}

function hideError() {
    errorSection.style.display = 'none';
}

function hideResults() {
    scoreSection.style.display = 'none';
    actionsSection.style.display = 'none';
    savingsTotal.style.display = 'none';
}

function setButtonLoading(isLoading) {
    analyzeBtn.disabled = isLoading;
    btnText.style.display = isLoading ? 'none' : 'inline';
    btnLoading.style.display = isLoading ? 'inline' : 'none';
}

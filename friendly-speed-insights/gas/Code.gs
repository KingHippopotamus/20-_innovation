/**
 * Friendly Speed Insights - GAS一体型
 *
 * 【セットアップ手順】
 * 1. https://script.google.com で新規プロジェクト作成
 * 2. このコードを Code.gs に貼り付け
 * 3. 「ファイル」→「+」→「HTML」→ 名前を「index」にして作成
 * 4. index.html の内容を貼り付け
 * 5. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
 * 6. 「アクセスできるユーザー」を「全員」に設定
 * 7. デプロイURLにアクセス
 */

// APIキー
const API_KEY = 'AIzaSyDp3Ry8kPv8LDLVpa8_qmx158AK7dkrvoo';

/**
 * WebアプリのエントリーポイントHTMLを返す
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Friendly Speed Insights')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * モバイル・デスクトップ両方を診断
 * @param {string} url - 診断対象のURL
 * @returns {Object} { mobile: {...}, desktop: {...} }
 */
function analyzeBoth(url) {
  // URLバリデーション
  if (!url) {
    return { error: 'URLが必要です' };
  }

  if (!url.match(/^https?:\/\/.+/)) {
    return { error: '有効なURLを入力してください' };
  }

  try {
    // モバイルとデスクトップを並列で取得
    const mobileResult = fetchPageSpeed(url, 'mobile');
    const desktopResult = fetchPageSpeed(url, 'desktop');

    return {
      mobile: mobileResult,
      desktop: desktopResult
    };

  } catch (error) {
    return {
      error: 'API呼び出し中にエラーが発生しました: ' + error.message
    };
  }
}

/**
 * PageSpeed Insights APIを呼び出す
 * @param {string} url - 診断対象のURL
 * @param {string} strategy - 'mobile' or 'desktop'
 * @returns {Object} APIレスポンス
 */
function fetchPageSpeed(url, strategy) {
  const apiUrl = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
    + '?url=' + encodeURIComponent(url)
    + '&key=' + API_KEY
    + '&strategy=' + strategy
    + '&category=performance';

  const response = UrlFetchApp.fetch(apiUrl, {
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    const errorData = JSON.parse(responseText);
    return {
      error: errorData.error?.message || 'API呼び出しに失敗しました',
      code: responseCode
    };
  }

  return JSON.parse(responseText);
}

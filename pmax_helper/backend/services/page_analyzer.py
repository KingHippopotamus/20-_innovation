"""
ChatGPT (Lambda経由) を使用してページを分析し、動画生成プロンプトを生成する
"""
import os
import requests
import time
from bs4 import BeautifulSoup
from typing import Dict, Optional


class PageAnalyzer:
    """ChatGPT (Lambda経由) を使用してページコンテンツを分析"""

    LAMBDA_INVOKE_URL = "https://xbofudi6a9.execute-api.ap-northeast-1.amazonaws.com/default/invokeChatGPTStepFunction"
    LAMBDA_RESULT_URL = "https://j0y48q4hvj.execute-api.ap-northeast-1.amazonaws.com/default/getChatGPTResults"
    MAX_ATTEMPTS = 60

    def __init__(self, secret_key: Optional[str] = None):
        """
        Args:
            secret_key: Lambda Secret Key（環境変数 LAMBDA_SECRET_KEY から取得も可能）
        """
        self.secret_key = secret_key or os.getenv('LAMBDA_SECRET_KEY')

    def analyze_page(self, url: str) -> Dict[str, str]:
        """
        ページを分析して商材情報とプロンプトを生成

        Args:
            url: 分析するページのURL

        Returns:
            {
                'product_name': str,  # 商材名
                'target_audience': str,  # ターゲット
                'main_benefit': str,  # 主なベネフィット
                'generated_prompt': str,  # 生成されたプロンプト
                'error': str (if failed)
            }
        """
        if not self.secret_key:
            return {
                'error': 'Lambda Secret Key not configured. Please set LAMBDA_SECRET_KEY in .env file'
            }

        try:
            # ページのHTMLを取得
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')

            # 本文テキストを抽出（スクリプトとスタイルを除外）
            for script in soup(["script", "style"]):
                script.decompose()

            text_content = soup.get_text()
            # 空白を整理
            lines = (line.strip() for line in text_content.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text_content = ' '.join(chunk for chunk in chunks if chunk)

            # テキストが長すぎる場合は制限
            if len(text_content) > 30000:
                text_content = text_content[:30000]

            # ChatGPT (Lambda経由) で分析
            system_prompt = """あなたは、指定されたWebページのコンテンツを分析し、P-MAX広告用の動画生成に必要な情報を抽出するAIアシスタントです。

以下の7つの要素を抽出・推測してください：

1. [商材/ブランド名]: h1タグ、titleタグ、またはロゴ周辺のテキストから最も適切な名称
2. [メインターゲット]: 「〜な方へ」「〜にお悩みでは？」などの記述からターゲット層を推測
3. [キャッチコピー]: ページのファーストビュー（FV）にある最も印象的で短いフレーズ
4. [ベネフィット1]: 商材が提供する最も重要な利点や特徴の1つ目
5. [ベネフィット2]: 商材が提供する2番目に重要な利点や特徴
6. [オファー]: 「無料トライアル」「限定割引」「キャンペーン中」などの行動喚起フレーズ。見つからない場合は「特に指定なし」
7. [CTAテキスト]: 「今すぐ購入」「資料請求」「無料で試す」など、ページ内の主要なボタンの文言

以下の形式で回答してください：
商材/ブランド名: [商材/ブランド名]
メインターゲット: [メインターゲット]
キャッチコピー: [キャッチコピー]
ベネフィット1: [ベネフィット1]
ベネフィット2: [ベネフィット2]
オファー: [オファー]
CTAテキスト: [CTAテキスト]"""

            analysis_text = self._invoke_chatgpt(system_prompt, f"【ウェブページの内容】\n{text_content}")

            # 分析結果をパース
            product_info = self._parse_analysis(analysis_text)

            # プロンプトを生成
            generated_prompt = self._generate_video_prompt(product_info)

            return {
                'product_name': product_info.get('product_name', ''),
                'target_audience': product_info.get('target_audience', ''),
                'catchphrase': product_info.get('catchphrase', ''),
                'benefit1': product_info.get('benefit1', ''),
                'benefit2': product_info.get('benefit2', ''),
                'offer': product_info.get('offer', ''),
                'cta_text': product_info.get('cta_text', ''),
                'generated_prompt': generated_prompt,
                'raw_analysis': analysis_text,
                'page_url': url  # URLを追加して、画像抽出で使用できるようにする
            }

        except Exception as e:
            return {'error': f'Page analysis failed: {str(e)}'}

    def _parse_analysis(self, analysis_text: str) -> Dict[str, str]:
        """ChatGPTの分析結果をパースする"""
        result = {}

        lines = analysis_text.split('\n')
        for line in lines:
            if '商材/ブランド名' in line or '商材名' in line:
                result['product_name'] = line.split(':', 1)[1].strip() if ':' in line else ''
            elif 'メインターゲット' in line:
                result['target_audience'] = line.split(':', 1)[1].strip() if ':' in line else ''
            elif 'キャッチコピー' in line:
                result['catchphrase'] = line.split(':', 1)[1].strip() if ':' in line else ''
            elif 'ベネフィット1' in line:
                result['benefit1'] = line.split(':', 1)[1].strip() if ':' in line else ''
            elif 'ベネフィット2' in line:
                result['benefit2'] = line.split(':', 1)[1].strip() if ':' in line else ''
            elif 'オファー' in line:
                result['offer'] = line.split(':', 1)[1].strip() if ':' in line else ''
            elif 'CTAテキスト' in line or 'CTA' in line:
                result['cta_text'] = line.split(':', 1)[1].strip() if ':' in line else ''

        return result

    def _generate_video_prompt(self, product_info: Dict[str, str]) -> str:
        """
        商材情報を基に動画生成プロンプトを生成

        Args:
            product_info: 商材情報（7つの要素）

        Returns:
            動画生成用のプロンプト
        """
        product_name = product_info.get('product_name', '[商材/ブランド名]')
        target = product_info.get('target_audience', '[メインターゲット]')
        catchphrase = product_info.get('catchphrase', '[キャッチコピー]')
        benefit1 = product_info.get('benefit1', '[ベネフィット1]')
        benefit2 = product_info.get('benefit2', '[ベネフィット2]')
        offer = product_info.get('offer', '[オファー]')
        cta_text = product_info.get('cta_text', '[CTAテキスト]')

        prompt = f"""汎用P-MAX広告動画 生成プロンプト（12秒・キャラクター画像1点入力）
【目的】 Google P-MAX広告枠（YouTube Shorts, Discover等）向けに、無音再生でもターゲットの注意を引き、行動を喚起する12秒の動画を生成する。

【提供アセット（必須）】

キャラクター画像（背景透過推奨）

【ユーザー入力（URL分析結果）】

[商材/ブランド名]：{product_name}

[メインターゲット]：{target}

[キャッチコピー]：{catchphrase}

[ベネフィット1]：{benefit1}

[ベネフィット2]：{benefit2}

[オファー（任意）]：{offer}

[CTAテキスト]：{cta_text}

【AIへの動画生成シーケンス指示】

全体のトーン＆マナー: モダン、スピーディー、信頼感。BGMはアップテンポなインストルメンタル。テロップはすべて大きく、読みやすいゴシック体を使用し、背景と強いコントラストをつけること。

▼ シーケンス 1：掴み (0-3秒)

映像:

提供されたキャラクター画像を入力画像として使用する。

このキャラクターに、{target} に向かって手を振ったり、元気にジャンプして登場するようなアニメーション（動き）をつける。

背景はブランドカラーをベースにした明るくダイナミックな抽象アニメーション。

テロップ (特大): {catchphrase}

▼ シーケンス 2：ベネフィット 1 (4-6秒)

映像:

キャラクターは画面の隅（例：左下）に移動し、案内役として頷いたり、指をさしたりするリアクションをとる。

画面中央に {benefit1} を象徴するシンプルなアイコン（例：歯車、チェックマーク、書類アイコン）がポップアップ表示される。

テロップ (大・中央): {benefit1}

▼ シーケンス 3：ベネフィット 2 / オファー (7-9秒)

映像:

中央のアイコンとテキストが、{benefit2} または {offer} の内容に素早く切り替わる。（例：グラフアイコン、カレンダーアイコン）

キャラクターは驚きや喜びの表情のアニメーションをとる。

テロップ (大・中央): {benefit2} または {offer}

▼ シーケンス 4：CTAとブランド提示 (10-12秒)

映像:

画面全体が白またはブランドカラーのクリーンな背景に切り替わる。（キャラクターはここで消えても良い）

中央にテキストで {product_name} をロゴのように大きく表示する。（フォントは太く、信頼感のあるもの）

その下に、行動喚起のボタン風デザインを配置する。

テロップ (ボタン内・特大): {cta_text}

テロップ (画面下部・小): {product_name} で検索

共通事項:
- テキストが読みやすいように、最前面に配置し、背景と十分なコントラストを持たせること。
"""

        return prompt

    def _invoke_chatgpt(self, system_prompt: str, user_content: str) -> str:
        """
        Lambda経由でChatGPTを呼び出してレスポンスを取得

        Args:
            system_prompt: システムプロンプト
            user_content: ユーザーコンテンツ

        Returns:
            ChatGPTのレスポンステキスト
        """
        # 1. メッセージをフォーマット
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]

        # 2. StepFunctionを起動
        execution_arn = self._invoke_step_function(messages)

        # 3. 結果をポーリング
        result = self._poll_for_results(execution_arn)

        # 4. レスポンスからメッセージを抽出
        return self._extract_message(result)

    def _invoke_step_function(self, messages: list) -> str:
        """
        Lambda StepFunctionを起動

        Args:
            messages: ChatGPTに送信するメッセージ配列

        Returns:
            executionArn
        """
        import json

        payload = {
            "secretKey": self.secret_key,
            "messages": messages
        }

        headers = {
            'Content-Type': 'application/json; charset=utf-8'
        }

        json_payload = json.dumps(payload, ensure_ascii=False).encode('utf-8')

        response = requests.post(
            self.LAMBDA_INVOKE_URL,
            data=json_payload,
            headers=headers,
            timeout=30
        )
        response.raise_for_status()

        result = response.json()
        return result.get('executionArn')

    def _poll_for_results(self, execution_arn: str) -> Dict:
        """
        StepFunctionの実行結果をポーリングで取得

        Args:
            execution_arn: 実行ARN

        Returns:
            実行結果
        """
        import json
        import logging
        logger = logging.getLogger(__name__)

        payload = {
            "secretKey": self.secret_key,
            "executionArn": execution_arn
        }

        # PHPと同じように、普通のJSON文字列を送る（API Gatewayが自動でbase64エンコードする）
        json_str = json.dumps(payload, ensure_ascii=False)

        logger.info(f"🔍 Polling payload: {payload}")

        for attempt in range(self.MAX_ATTEMPTS):
            # Content-Typeを設定せず、dataで生のJSON文字列を送る（PHPと同じ挙動）
            response = requests.post(
                self.LAMBDA_RESULT_URL,
                data=json_str,
                timeout=30
            )

            logger.info(f"🔍 Response status: {response.status_code}")
            logger.info(f"🔍 Response text: {response.text}")

            response.raise_for_status()

            result = response.json()
            status = result.get('status')

            if status == 'SUCCEEDED':
                return result
            elif status == 'FAILED':
                raise Exception(f"StepFunction execution failed: {result.get('error')}")
            elif status == 'RUNNING':
                time.sleep(1)  # 1秒待機してリトライ
                continue
            else:
                raise Exception(f"Unknown status: {status}")

        raise Exception("Polling timeout: Max attempts reached")

    def _extract_message(self, result: Dict) -> str:
        """
        実行結果からChatGPTのメッセージを抽出

        Args:
            result: StepFunctionの実行結果

        Returns:
            ChatGPTのメッセージテキスト
        """
        import json
        import logging
        logger = logging.getLogger(__name__)

        try:
            output = result.get('output', '{}')

            if isinstance(output, str):
                output = json.loads(output)

            body = output.get('body', '{}')

            if isinstance(body, str):
                body = json.loads(body)

            # bodyには {"message": "..."} という構造が入っている
            message_content = body.get('message', '')

            if message_content:
                logger.info(f"✅ Extracted message: {message_content[:200]}...")
                return message_content

            # 代替: function_call.choices[0].message.contentから取得
            function_call = output.get('function_call', {})
            choices = function_call.get('choices', [])
            if choices and len(choices) > 0:
                content = choices[0].get('message', {}).get('content', '')
                if content:
                    logger.info(f"✅ Extracted from function_call: {content[:200]}...")
                    return content

            raise Exception("No message content found in response")
        except Exception as e:
            logger.error(f"❌ Extract error: {str(e)}", exc_info=True)
            raise Exception(f"Failed to extract message from response: {str(e)}")

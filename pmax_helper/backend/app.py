from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import zipfile
import logging
from io import BytesIO
from dotenv import load_dotenv

from services.scraper import ImageScraper
from services.image_processor import ImageProcessor
from services.video_generator import VideoGenerator
from services.page_analyzer import PageAnalyzer

# 環境変数をロード（システム環境変数をオーバーライド）
load_dotenv(override=True)

# ログ設定（ファイルとコンソールの両方に出力）
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('debug.log'),  # ファイルに出力
        logging.StreamHandler()  # コンソールにも出力
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# API キー
FAL_KEY = os.getenv('FAL_KEY')
LAMBDA_SECRET_KEY = os.getenv('LAMBDA_SECRET_KEY')


@app.route('/api/extract-images', methods=['POST'])
def extract_images():
    """指定されたURLから画像を抽出"""
    try:
        data = request.json
        page_url = data.get('page_url')

        if not page_url:
            return jsonify({'error': 'page_url is required'}), 400

        scraper = ImageScraper(page_url)
        images = scraper.extract_images()

        if not images['logo_url'] and not images['character_url']:
            return jsonify({'error': 'No images found with specified selectors'}), 404

        return jsonify(images), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analyze-page', methods=['POST'])
def analyze_page():
    """Gemini APIを使用してページを分析し、プロンプトを生成"""
    try:
        data = request.json
        page_url = data.get('page_url')

        if not page_url:
            logger.error("❌ No page_url provided")
            return jsonify({'error': 'page_url is required'}), 400

        logger.info(f"🔍 Analyzing page: {page_url}")

        # ページを分析
        analyzer = PageAnalyzer(LAMBDA_SECRET_KEY)
        result = analyzer.analyze_page(page_url)

        if 'error' in result:
            logger.error(f"❌ Analysis failed: {result['error']}")
            return jsonify(result), 500

        # キャラクター画像URLも取得
        try:
            scraper = ImageScraper(page_url)
            images = scraper.extract_images()
            result['character_image_url'] = images.get('character_url', '')
            logger.info(f"✅ Character image URL: {result['character_image_url']}")
        except Exception as e:
            logger.warning(f"⚠️ Failed to extract character image: {str(e)}")
            result['character_image_url'] = ''

        logger.info(f"✅ Analysis complete. Generated prompt length: {len(result.get('generated_prompt', ''))}")
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"❌ Fatal error in analyze_page: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate-videos', methods=['POST'])
def generate_videos():
    """画像から動画を生成"""
    try:
        data = request.json
        page_url = data.get('page_url')
        custom_prompt = data.get('prompt')  # カスタムプロンプト
        product_info_data = data.get('product_info')  # 商材情報
        character_image_url = data.get('character_image_url')  # キャラクター画像URL
        logger.info(f"🎬 Starting video generation for URL: {page_url}")
        if custom_prompt:
            logger.info(f"📝 Custom prompt provided: {custom_prompt}")
        if product_info_data:
            logger.info(f"📊 Product info provided: {product_info_data}")
        if character_image_url:
            logger.info(f"🖼️ Character image URL provided: {character_image_url}")

        if not page_url and not character_image_url:
            logger.error("❌ No page_url or character_image_url provided")
            return jsonify({'error': 'page_url or character_image_url is required'}), 400

        # Step 1: 画像を取得
        logger.info("📸 Step 1: Getting character image...")

        # 優先順位: character_image_url > page_urlから抽出
        if character_image_url:
            logger.info(f"✅ Using provided character image URL: {character_image_url}")
            final_character_url = character_image_url
        else:
            logger.info("📸 Extracting character image from page...")
            scraper = ImageScraper(page_url)
            images = scraper.extract_images()
            final_character_url = images.get('character_url', '')
            logger.info(f"✅ Character image extracted: {final_character_url}")

        if not final_character_url:
            logger.error("❌ No character image URL available")
            return jsonify({'error': 'キャラクター画像が見つかりませんでした'}), 400

        processor = ImageProcessor()
        generator = VideoGenerator(FAL_KEY)

        # 商材情報が提供された場合、プロンプトを再生成
        final_prompt = custom_prompt
        if product_info_data:
            logger.info("🔄 Regenerating prompt from product info...")
            analyzer = PageAnalyzer(LAMBDA_SECRET_KEY)
            final_prompt = analyzer._generate_video_prompt(product_info_data)
            logger.info(f"✅ Prompt regenerated: {final_prompt[:100]}...")

        # Step 2 & 3: キャラクター動画を生成
        try:
            logger.info("🎨 Step 2: Processing character image...")
            # URLから画像をダウンロード
            import requests as req
            response = req.get(final_character_url, timeout=10)
            response.raise_for_status()
            character_data = response.content
            logger.info(f"✅ Character image downloaded ({len(character_data)} bytes)")

            processed_character = processor.preprocess_image(character_data)
            logger.info(f"✅ Character image preprocessed ({len(processed_character)} bytes)")

            logger.info("🎥 Step 3: Generating character video with fal-ai...")
            video_result = generator.generate_character_video(
                processed_character,
                prompt=final_prompt
            )
            logger.info(f"✅ Character video generated: {video_result}")

            logger.info(f"🎉 Video generation complete")
            return jsonify(video_result), 200
        except Exception as e:
            logger.error(f"❌ Character video generation failed: {str(e)}", exc_info=True)
            return jsonify({'error': str(e)}), 500

    except Exception as e:
        logger.error(f"❌ Fatal error in generate_videos: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/download-video', methods=['POST'])
def download_video():
    """生成された動画をダウンロード"""
    try:
        data = request.json
        video_url = data.get('video_url')

        if not video_url:
            return jsonify({'error': 'video_url is required'}), 400

        generator = VideoGenerator(FAL_KEY)
        video_data = generator.download_video(video_url)

        video_buffer = BytesIO(video_data)
        video_buffer.seek(0)

        return send_file(
            video_buffer,
            mimetype='video/mp4',
            as_attachment=True,
            download_name='character_video.mp4'
        )

    except Exception as e:
        logger.error(f"❌ Video download failed: {str(e)}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """ヘルスチェック"""
    return jsonify({'status': 'ok'}), 200


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)

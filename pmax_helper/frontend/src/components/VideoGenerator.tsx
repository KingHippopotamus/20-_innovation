import React, { useState, useEffect } from 'react'
import axios from 'axios'
import './VideoGenerator.css'

interface VideoResult {
  video_url?: string
  status?: string
  error?: string
}

const VideoGenerator: React.FC = () => {
  const [pageUrl, setPageUrl] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VideoResult | null>(null)
  const [productInfo, setProductInfo] = useState<{
    product_name: string
    target_audience: string
    catchphrase: string
    benefit1: string
    benefit2: string
    offer: string
    cta_text: string
  } | null>(null)
  const [characterImageUrl, setCharacterImageUrl] = useState<string>('')
  const [isFirstAnalysis, setIsFirstAnalysis] = useState<boolean>(true)

  // プロンプト生成関数
  const generatePrompt = (info: typeof productInfo) => {
    if (!info) return ''

    const product_name = info.product_name || '[商材/ブランド名]'
    const target = info.target_audience || '[メインターゲット]'
    const catchphrase = info.catchphrase || '[キャッチコピー]'
    const benefit1 = info.benefit1 || '[ベネフィット1]'
    const benefit2 = info.benefit2 || '[ベネフィット2]'
    const offer = info.offer || '[オファー]'
    const cta_text = info.cta_text || '[CTAテキスト]'

    return `汎用P-MAX広告動画 生成プロンプト（キャラクター画像1点入力）

【目的】 Google P-MAX広告枠（YouTube Shorts, Discover等）向けに、無音再生でもターゲットの注意を引き、行動を喚起する15秒の動画を生成する。

【提供アセット（必須）】
キャラクター画像（背景透過推奨）

【ユーザー入力（URL分析結果）】
[商材/ブランド名]：${product_name}
[メインターゲット]：${target}
[キャッチコピー]：${catchphrase}
[ベネフィット1]：${benefit1}
[ベネフィット2]：${benefit2}
[オファー（任意）]：${offer}
[CTAテキスト]：${cta_text}

【AIへの動画生成シーケンス指示】

全体のトーン＆マナー: モダン、スピーディー、信頼感。BGMはアップテンポなインストゥルメンタル。テロップはすべて大きく、読みやすいゴシック体を使用し、背景と強いコントラストをつけること。

▼ シーケンス 1：掴み (0-3秒)
映像:
提供されたキャラクター画像を入力画像として使用する。
このキャラクターに、${target} に向かって手を振ったり、元気にジャンプして登場するようなアニメーション（動き）をつける。
背景はブランドカラーをベースにした明るくダイナミックな抽象アニメーション。
テロップ (特大): ${catchphrase}

▼ シーケンス 2：ベネフィット 1 (4-8秒)
映像:
キャラクターは画面の隅（例：左下）に移動し、案内役として頷いたり、指をさしたりするリアクションをとる。
画面中央に ${benefit1} を象徴するシンプルなアイコン（例：歯車、チェックマーク、書類アイコン）がポップアップ表示される。
テロップ (大・中央): ${benefit1}

▼ シーケンス 3：ベネフィット 2 / オファー (9-12秒)
映像:
中央のアイコンとテキストが、${benefit2} または ${offer} の内容に素早く切り替わる。（例：グラフアイコン、カレンダーアイコン）
キャラクターは驚きや喜びの表情のアニメーションをとる。
テロップ (大・中央): ${benefit2} または ${offer}

▼ シーケンス 4：CTAとブランド提示 (13-15秒)
映像:
画面全体が白またはブランドカラーのクリーンな背景に切り替わる。（キャラクターはここで消えても良い）
中央にテキストで ${product_name} をロゴのように大きく表示する。（フォントは太く、信頼感のあるもの）
その下に、行動喚起のボタン風デザインを配置する。
テロップ (ボタン内・特大): ${cta_text}
テロップ (画面下部・小): ${product_name} で検索`
  }

  // プロンプトを再生成する関数
  const regeneratePrompt = () => {
    if (productInfo) {
      const newPrompt = generatePrompt(productInfo)
      setPrompt(newPrompt)
    }
  }

  // 分析直後（初回のみ）プロンプトを自動生成
  useEffect(() => {
    if (productInfo && isFirstAnalysis) {
      const newPrompt = generatePrompt(productInfo)
      setPrompt(newPrompt)
      setIsFirstAnalysis(false)
    }
  }, [productInfo, isFirstAnalysis])

  const handleAnalyze = async () => {
    if (!pageUrl.trim()) {
      setError('URLを入力してください')
      return
    }

    console.log('🔍 Starting page analysis for:', pageUrl)
    setAnalyzing(true)
    setError(null)
    setProductInfo(null)
    setIsFirstAnalysis(true) // 新しい分析なので初回フラグをリセット

    try {
      console.log('📡 Sending request to /api/analyze-page...')
      const response = await axios.post('/api/analyze-page', {
        page_url: pageUrl
      })

      console.log('✅ Analysis response received:', response.data)

      // 商材情報を保存
      setProductInfo({
        product_name: response.data.product_name || '',
        target_audience: response.data.target_audience || '',
        catchphrase: response.data.catchphrase || '',
        benefit1: response.data.benefit1 || '',
        benefit2: response.data.benefit2 || '',
        offer: response.data.offer || '',
        cta_text: response.data.cta_text || ''
      })

      // キャラクター画像URLを保存
      if (response.data.character_image_url) {
        setCharacterImageUrl(response.data.character_image_url)
      }

      // 初回のみプロンプトを自動生成（分析直後）
      // 2回目以降は「プロンプトを再生成」ボタンを使用

    } catch (err: any) {
      console.error('❌ Analysis error occurred:', err)
      console.error('Error response:', err.response?.data)
      setError(err.response?.data?.error || '分析エラーが発生しました')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleGenerate = async () => {
    if (!pageUrl.trim()) {
      setError('URLを入力してください')
      return
    }

    console.log('🎬 Starting video generation for:', pageUrl)
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      console.log('📡 Sending request to /api/generate-videos...')
      const response = await axios.post('/api/generate-videos', {
        page_url: pageUrl,
        prompt: prompt.trim() || undefined,
        product_info: productInfo || undefined,
        character_image_url: characterImageUrl || undefined
      })

      console.log('✅ Response received:', response.data)
      setResult(response.data)
    } catch (err: any) {
      console.error('❌ Error occurred:', err)
      console.error('Error response:', err.response?.data)
      setError(err.response?.data?.error || 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!result?.video_url) return

    try {
      const response = await axios.post(
        '/api/download-video',
        {
          video_url: result.video_url
        },
        {
          responseType: 'blob'
        }
      )

      // MP4ファイルをダウンロード
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'character_video.mp4')
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err: any) {
      setError('ダウンロードに失敗しました')
    }
  }

  return (
    <div className="video-generator">
      <div className="input-section">
        <label htmlFor="page-url">ページURL</label>
        <input
          id="page-url"
          type="text"
          placeholder="https://example.com"
          value={pageUrl}
          onChange={(e) => setPageUrl(e.target.value)}
          disabled={loading || analyzing}
        />

        <button onClick={handleAnalyze} disabled={analyzing || loading} style={{ marginBottom: '20px' }}>
          {analyzing ? '分析中...' : '🔍 AIで分析'}
        </button>

        {characterImageUrl && (
          <div style={{ background: '#fff3e0', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0 }}>🖼️ キャラクター画像</h3>

            <div style={{ marginBottom: '15px' }}>
              <img
                src={characterImageUrl}
                alt="Character"
                style={{ maxWidth: '200px', maxHeight: '200px', border: '2px solid #ccc', borderRadius: '8px' }}
              />
            </div>

            <label style={{ display: 'block', fontWeight: 'bold' }}>画像URL:</label>
            <input
              type="text"
              value={characterImageUrl}
              onChange={(e) => setCharacterImageUrl(e.target.value)}
              style={{ width: '100%', padding: '8px', marginTop: '5px' }}
            />
          </div>
        )}

        {productInfo && (
          <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0 }}>📊 商材情報（編集可能）</h3>

            <label style={{ display: 'block', marginTop: '10px', fontWeight: 'bold' }}>商材/ブランド名:</label>
            <input
              type="text"
              value={productInfo.product_name}
              onChange={(e) => setProductInfo({ ...productInfo, product_name: e.target.value })}
              style={{ width: '100%', padding: '8px', marginTop: '5px' }}
            />

            <label style={{ display: 'block', marginTop: '10px', fontWeight: 'bold' }}>メインターゲット:</label>
            <input
              type="text"
              value={productInfo.target_audience}
              onChange={(e) => setProductInfo({ ...productInfo, target_audience: e.target.value })}
              style={{ width: '100%', padding: '8px', marginTop: '5px' }}
            />

            <label style={{ display: 'block', marginTop: '10px', fontWeight: 'bold' }}>キャッチコピー:</label>
            <input
              type="text"
              value={productInfo.catchphrase}
              onChange={(e) => setProductInfo({ ...productInfo, catchphrase: e.target.value })}
              style={{ width: '100%', padding: '8px', marginTop: '5px' }}
            />

            <label style={{ display: 'block', marginTop: '10px', fontWeight: 'bold' }}>ベネフィット1:</label>
            <input
              type="text"
              value={productInfo.benefit1}
              onChange={(e) => setProductInfo({ ...productInfo, benefit1: e.target.value })}
              style={{ width: '100%', padding: '8px', marginTop: '5px' }}
            />

            <label style={{ display: 'block', marginTop: '10px', fontWeight: 'bold' }}>ベネフィット2:</label>
            <input
              type="text"
              value={productInfo.benefit2}
              onChange={(e) => setProductInfo({ ...productInfo, benefit2: e.target.value })}
              style={{ width: '100%', padding: '8px', marginTop: '5px' }}
            />

            <label style={{ display: 'block', marginTop: '10px', fontWeight: 'bold' }}>オファー:</label>
            <input
              type="text"
              value={productInfo.offer}
              onChange={(e) => setProductInfo({ ...productInfo, offer: e.target.value })}
              style={{ width: '100%', padding: '8px', marginTop: '5px' }}
            />

            <label style={{ display: 'block', marginTop: '10px', fontWeight: 'bold' }}>CTAテキスト:</label>
            <input
              type="text"
              value={productInfo.cta_text}
              onChange={(e) => setProductInfo({ ...productInfo, cta_text: e.target.value })}
              style={{ width: '100%', padding: '8px', marginTop: '5px' }}
            />
          </div>
        )}

        {productInfo && (
          <button
            onClick={regeneratePrompt}
            style={{ marginBottom: '10px', background: '#2196f3', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            type="button"
          >
            🔄 商材情報からプロンプトを再生成
          </button>
        )}

        <label htmlFor="prompt">動画生成プロンプト</label>
        <textarea
          id="prompt"
          rows={12}
          placeholder="例: Make this character wave energetically and smile..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
          style={{ width: '100%', padding: '10px', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5' }}
        />

        <button onClick={handleGenerate} disabled={loading}>
          {loading ? '生成中...' : '🎬 動画を生成'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {analyzing && (
        <div className="loading-section">
          <div className="spinner"></div>
          <p>ページを分析しています。しばらくお待ちください...</p>
        </div>
      )}

      {loading && (
        <div className="loading-section">
          <div className="spinner"></div>
          <p>動画を生成しています。しばらくお待ちください...</p>
        </div>
      )}

      {result && (
        <div className="results-section">
          <h2>生成された動画</h2>

          {/* デバッグ情報 */}
          <div style={{ background: '#f0f0f0', padding: '10px', marginBottom: '20px', fontSize: '12px', fontFamily: 'monospace' }}>
            <strong>🐛 デバッグ情報:</strong>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>

          <div className="video-grid">
            {result.video_url && (
              <div className="video-card">
                <h3>キャラクター動画 (12秒)</h3>
                <video controls style={{ width: '100%', maxWidth: '640px' }}>
                  <source src={result.video_url} type="video/mp4" />
                  お使いのブラウザは動画タグをサポートしていません。
                </video>
                <button className="download-button" onClick={handleDownload} style={{ marginTop: '10px' }}>
                  📥 MP4でダウンロード
                </button>
              </div>
            )}

            {!result.video_url && result.error && (
              <div className="video-card">
                <h3>エラー</h3>
                <p className="error-text">⚠️ {result.error}</p>
              </div>
            )}

            {!result.video_url && !result.error && (
              <p className="error-text">⚠️ 動画が生成されませんでした</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoGenerator

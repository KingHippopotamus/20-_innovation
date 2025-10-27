import React, { useState } from 'react'
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

  const handleAnalyze = async () => {
    if (!pageUrl.trim()) {
      setError('URLを入力してください')
      return
    }

    console.log('🔍 Starting page analysis for:', pageUrl)
    setAnalyzing(true)
    setError(null)
    setProductInfo(null)

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

      // 生成されたプロンプトをテキストエリアに設定
      if (response.data.generated_prompt) {
        setPrompt(response.data.generated_prompt)
      }

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

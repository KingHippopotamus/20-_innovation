/**
 * 指修正タブコンポーネント
 * 画像アップロード → 複数範囲選択 → スケッチ補助 → 複数モデルで指修正
 */

import { useState, useRef, useCallback, useEffect, type ChangeEvent, type JSX } from 'react';
import { Upload, Hand, Download, RotateCcw, Settings, Pencil, Eraser } from 'lucide-react';
import { createFalClient } from '@fal-ai/client';

/* ---------- 定数 ---------- */
const DEFAULT_PROMPT =
  'Edit only the fingers in the masked area to show exactly five fingers (thumb, index, middle, ring, pinky). Keep the same pose, same art style, same colors, and same objects. Do not change anything outside the masked area.';

type ModelId = 'gpt-image' | 'flux2-pro' | 'flux-fill' | 'nano-banana-pro';

interface ModelOption {
  id: ModelId;
  name: string;
  description: string;
  needsMask: boolean;
  hasStrength: boolean;
}

const MODELS: ModelOption[] = [
  { id: 'gpt-image', name: 'GPT Image 1.5 Edit', description: 'マスクベース精密編集（推奨）', needsMask: true, hasStrength: false },
  { id: 'flux2-pro', name: 'FLUX.2 Pro Edit', description: '最新・プロンプトベース編集', needsMask: false, hasStrength: false },
  { id: 'flux-fill', name: 'FLUX.1 Fill', description: 'マスクベースインペインティング', needsMask: true, hasStrength: true },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro', description: 'Gemini テキスト指示ベース', needsMask: false, hasStrength: false },
];

const BRUSH_COLORS = ['#ff0000', '#0000ff', '#00aa00', '#ffffff', '#000000', '#ff8800'];

/* ---------- 型 ---------- */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface StrokePoint {
  x: number;
  y: number;
}

interface Stroke {
  points: StrokePoint[];
  color: string;
  width: number;
  isEraser: boolean;
}

/** 複数Rectのバウンディングボックスを返す */
const getBoundingBox = (rects: Rect[]): Rect | null => {
  if (rects.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

interface FingerFixTabProps {
  initialImageUrl?: string | null;
  onImageConsumed?: () => void;
}

const FingerFixTab = ({ initialImageUrl, onImageConsumed }: FingerFixTabProps = {}): JSX.Element => {
  /* ----- state ----- */
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelId>('gpt-image');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [strength, setStrength] = useState(0.3);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [selections, setSelections] = useState<Rect[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [pendingRect, setPendingRect] = useState<Rect | null>(null);

  const [isFixing, setIsFixing] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);

  const [croppedOriginal, setCroppedOriginal] = useState<string | null>(null);
  const [croppedCandidates, setCroppedCandidates] = useState<string[]>([]);

  /* ----- スケッチ state ----- */
  const [sketchMode, setSketchMode] = useState(false);
  const [brushColor, setBrushColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(10);
  const [isEraser, setIsEraser] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentModel = MODELS.find(m => m.id === selectedModel)!;

  /* ----- 外部から画像を受け取る ----- */
  useEffect(() => {
    if (!initialImageUrl) return;
    const loadExternalImage = async () => {
      try {
        // URLから画像をfetch→dataURLに変換
        const res = await fetch(initialImageUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          setImageDataUrl(dataUrl);
          setSelections([]);
          setCandidates([]);
          setCroppedCandidates([]);
          setCroppedOriginal(null);
          setResultImageUrl(null);
          setSketchMode(false);
          setStrokes([]);
          const img = new Image();
          img.onload = () => setImageEl(img);
          img.src = dataUrl;
        };
        reader.readAsDataURL(blob);
      } catch {
        // fallback: URLをそのまま使う
        setImageDataUrl(initialImageUrl);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => setImageEl(img);
        img.src = initialImageUrl;
      }
      onImageConsumed?.();
    };
    void loadExternalImage();
  }, [initialImageUrl]);

  /* ----- 画像アップロード ----- */
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImageDataUrl(dataUrl);
      setSelections([]);
      setCandidates([]);
      setCroppedCandidates([]);
      setCroppedOriginal(null);
      setResultImageUrl(null);
      setSketchMode(false);
      setStrokes([]);

      const img = new Image();
      img.onload = () => setImageEl(img);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  /* ----- ストローク描画ヘルパー ----- */
  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length < 2) return;
    ctx.save();
    if (stroke.isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
    }
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  };

  /* ----- Canvas描画 ----- */
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !imageEl) return;

    canvas.width = imageEl.naturalWidth;
    canvas.height = imageEl.naturalHeight;
    ctx.drawImage(imageEl, 0, 0);

    const allRects = pendingRect ? [...selections, pendingRect] : selections;

    if (allRects.length > 0) {
      // 暗くする（選択範囲外）
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 各選択範囲を明るく
      for (const sel of allRects) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(sel.x, sel.y, sel.w, sel.h);
        ctx.clip();
        ctx.drawImage(imageEl, 0, 0);
        ctx.restore();
      }

      // スケッチを描画（全選択範囲内にクリップ）
      if (strokes.length > 0 || currentStroke) {
        ctx.save();
        ctx.beginPath();
        for (const sel of allRects) {
          ctx.rect(sel.x, sel.y, sel.w, sel.h);
        }
        ctx.clip();
        for (const s of strokes) drawStroke(ctx, s);
        if (currentStroke) drawStroke(ctx, currentStroke);
        ctx.restore();
      }

      // 選択枠
      for (const sel of allRects) {
        ctx.strokeStyle = sketchMode ? '#3b82f6' : '#f97316';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
        ctx.setLineDash([]);
      }
    }
  }, [imageEl, selections, pendingRect, strokes, currentStroke, sketchMode]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  /* ----- マウスイベント ----- */
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const coords = getCanvasCoords(e);

    if (sketchMode && selections.length > 0) {
      // スケッチモード: 描画開始
      setIsDrawing(true);
      setCurrentStroke({
        points: [coords],
        color: isEraser ? '#ffffff' : brushColor,
        width: brushSize,
        isEraser,
      });
      return;
    }

    // 範囲選択モード: 新しい矩形を追加
    setDragStart(coords);
    setIsDragging(true);
    setPendingRect(null);
    setCandidates([]);
    setCroppedCandidates([]);
    setCroppedOriginal(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const coords = getCanvasCoords(e);

    if (sketchMode && isDrawing && currentStroke) {
      setCurrentStroke({
        ...currentStroke,
        points: [...currentStroke.points, coords],
      });
      return;
    }

    if (!isDragging || !dragStart) return;
    setPendingRect({
      x: Math.min(dragStart.x, coords.x),
      y: Math.min(dragStart.y, coords.y),
      w: Math.abs(coords.x - dragStart.x),
      h: Math.abs(coords.y - dragStart.y),
    });
  };

  const handleMouseUp = (): void => {
    if (sketchMode && isDrawing && currentStroke) {
      if (currentStroke.points.length >= 2) {
        setStrokes(prev => [...prev, currentStroke]);
      }
      setCurrentStroke(null);
      setIsDrawing(false);
      return;
    }

    setIsDragging(false);
    setDragStart(null);
    if (pendingRect && pendingRect.w >= 20 && pendingRect.h >= 20) {
      setSelections(prev => [...prev, pendingRect]);
    }
    setPendingRect(null);
  };

  /* ----- マスク生成（白黒: 黒=保持、白=編集） ----- */
  const generateMaskDataUrl = (): string | null => {
    if (!imageEl || selections.length === 0) return null;
    const c = document.createElement('canvas');
    c.width = imageEl.naturalWidth;
    c.height = imageEl.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffffff';
    for (const sel of selections) {
      ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
    }
    return c.toDataURL('image/png');
  };

  /* ----- GPT Image用: 選択範囲を透明にした元画像 ----- */
  const generateErasedImageDataUrl = (): string => {
    if (!imageEl || selections.length === 0) return imageDataUrl!;
    const c = document.createElement('canvas');
    c.width = imageEl.naturalWidth;
    c.height = imageEl.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(imageEl, 0, 0);
    // 選択範囲を透明に（ここをAIが生成する）
    for (const sel of selections) {
      ctx.clearRect(sel.x, sel.y, sel.w, sel.h);
    }
    return c.toDataURL('image/png');
  };

  /* ----- スケッチ入り画像を生成 ----- */
  const generateSketchedImageDataUrl = (): string => {
    if (!imageEl || strokes.length === 0) return imageDataUrl!;
    const c = document.createElement('canvas');
    c.width = imageEl.naturalWidth;
    c.height = imageEl.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(imageEl, 0, 0);
    for (const s of strokes) drawStroke(ctx, s);
    return c.toDataURL('image/png');
  };

  /* ----- クローズアップ（CORS回避: fetchでblob取得） ----- */
  const cropImage = async (sourceUrl: string, sel: Rect): Promise<string> => {
    try {
      let objectUrl: string | null = null;
      let imgSrc = sourceUrl;
      if (sourceUrl.startsWith('http')) {
        const res = await fetch(sourceUrl);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        imgSrc = objectUrl;
      }
      return await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = sel.w;
          c.height = sel.h;
          c.getContext('2d')!.drawImage(img, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          resolve(sourceUrl);
        };
        img.src = imgSrc;
      });
    } catch {
      return sourceUrl;
    }
  };

  /* ----- API呼び出し ----- */
  const startFingerFix = async (): Promise<void> => {
    if (!imageDataUrl) return;
    if (!apiKey) { alert('FAL.ai API キーを入力してください'); return; }
    if (currentModel.needsMask && selections.length === 0) { alert('修正範囲を選択してください'); return; }

    setIsFixing(true);
    setCandidates([]);
    setCroppedCandidates([]);
    setCroppedOriginal(null);

    const maskDataUrl = generateMaskDataUrl();
    const erasedImageDataUrl = generateErasedImageDataUrl();
    const sketchedImageDataUrl = generateSketchedImageDataUrl();
    const hasSketch = strokes.length > 0;

    try {
      const fal = createFalClient({ credentials: apiKey });

      const callApi = (): Promise<{ data: { images: { url: string }[] } }> => {
        switch (selectedModel) {
          case 'gpt-image':
            // OpenAI方式: 元画像の選択範囲を透明にして送信（透明部分をAIが生成）
            return fal.run('fal-ai/gpt-image-1.5/edit' as any, {
              input: {
                prompt: hasSketch
                  ? `${prompt} Use the rough sketch drawn on the second reference image as a guide for finger placement and count.`
                  : prompt,
                image_urls: hasSketch
                  ? [erasedImageDataUrl, sketchedImageDataUrl]
                  : [erasedImageDataUrl],
                quality: 'high',
                num_images: 1,
                background: 'opaque',
                input_fidelity: 'high',
              } as any,
            }) as any;

          case 'flux2-pro':
            return fal.run('fal-ai/flux-2-pro/edit' as any, {
              input: {
                prompt: hasSketch
                  ? `${prompt} Use the rough sketch as a guide for finger placement and count.`
                  : prompt,
                image_urls: hasSketch
                  ? [sketchedImageDataUrl]
                  : [imageDataUrl],
                safety_tolerance: '5',
                sync_mode: true,
              } as any,
            }) as any;

          case 'flux-fill':
            return fal.run('fal-ai/flux-pro/v1/fill' as any, {
              input: {
                prompt: hasSketch
                  ? `${prompt} Follow the rough sketch guide for finger placement.`
                  : prompt,
                image_url: hasSketch ? sketchedImageDataUrl : imageDataUrl,
                mask_url: maskDataUrl,
                strength,
                num_images: 1,
                safety_tolerance: '6',
                sync_mode: true,
              } as any,
            }) as any;

          case 'nano-banana-pro':
            return fal.run('fal-ai/nano-banana-pro/edit' as any, {
              input: {
                prompt: hasSketch
                  ? `${prompt} Follow the rough sketch guide for finger placement.`
                  : prompt,
                image_urls: hasSketch
                  ? [sketchedImageDataUrl]
                  : [imageDataUrl],
                num_images: 1,
              } as any,
            }) as any;
        }
      };

      const results = await Promise.all([callApi(), callApi(), callApi()]);
      const urls = results.map((r) => r.data.images[0].url);
      setCandidates(urls);

      const bbox = getBoundingBox(selections);
      if (bbox) {
        setCroppedOriginal(await cropImage(imageDataUrl, bbox));
        setCroppedCandidates(await Promise.all(urls.map(url => cropImage(url, bbox))));
      }
    } catch (err) {
      console.error('指修正エラー:', err);
      alert(`指修正に失敗しました: ${err}`);
    } finally {
      setIsFixing(false);
    }
  };

  /* ----- 候補選択 ----- */
  const applyCandidate = (url: string): void => {
    setResultImageUrl(url);
    setCandidates([]);
    setCroppedCandidates([]);
    setCroppedOriginal(null);
    setSelections([]);
    setSketchMode(false);
    setStrokes([]);
  };

  const useResultAsSource = (): void => {
    if (!resultImageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImageEl(img);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      setImageDataUrl(c.toDataURL('image/png'));
      setResultImageUrl(null);
      setSelections([]);
      setStrokes([]);
    };
    img.src = resultImageUrl;
  };

  const downloadResult = async (): Promise<void> => {
    const url = resultImageUrl || imageDataUrl;
    if (!url) return;
    const blob = await (await fetch(url)).blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'finger_fixed.png';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const resetSelections = (): void => {
    setSelections([]);
    setPendingRect(null);
    setCandidates([]);
    setCroppedCandidates([]);
    setCroppedOriginal(null);
    setSketchMode(false);
    setStrokes([]);
  };

  const removeLastSelection = (): void => {
    setSelections(prev => prev.slice(0, -1));
  };

  const undoStroke = (): void => {
    setStrokes(prev => prev.slice(0, -1));
  };

  /* ====================================================== */
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center mb-8 text-orange-800">
          <Hand className="inline-block mr-3" />
          指修正ツール
        </h1>

        {/* -------- API設定 -------- */}
        <section className="mb-8 p-4 bg-blue-50 rounded-lg">
          <header className="flex items-center mb-3">
            <Settings className="mr-2 text-blue-600" />
            <h2 className="text-lg font-semibold text-blue-800">API 設定</h2>
          </header>
          <input
            type="password"
            className="w-full p-3 border border-blue-200 rounded-lg mb-3"
            placeholder="FAL.ai API キー"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />

          <label className="block text-sm font-semibold text-gray-700 mb-1">モデル</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as ModelId)}
            className="w-full p-3 border border-blue-200 rounded-lg bg-white"
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.description}
              </option>
            ))}
          </select>
        </section>

        {/* -------- 修正設定 -------- */}
        <section className="mb-8 p-4 bg-orange-50 rounded-lg">
          <header className="flex items-center mb-3">
            <Hand className="mr-2 text-orange-600" />
            <h2 className="text-lg font-semibold text-orange-800">修正設定</h2>
          </header>

          <label className="block text-sm font-semibold text-gray-700 mb-1">プロンプト</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full p-3 border border-orange-200 rounded text-sm mb-3"
          />

          {currentModel.hasStrength && (
            <>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Strength: {strength.toFixed(2)}
                <span className="font-normal text-gray-500 ml-2">（低い＝元画像を保持）</span>
              </label>
              <input
                type="range" min="0.1" max="0.8" step="0.05"
                value={strength}
                onChange={(e) => setStrength(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0.1（微修正）</span>
                <span>0.8（大幅変更）</span>
              </div>
            </>
          )}
        </section>

        {/* -------- 画像アップロード -------- */}
        <section className="mb-8 p-4 bg-green-50 rounded-lg">
          <header className="flex items-center mb-3">
            <Upload className="mr-2 text-green-600" />
            <h2 className="text-lg font-semibold text-green-800">画像アップロード</h2>
          </header>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-3 border-2 border-dashed border-green-300 rounded-lg hover:bg-green-100"
          >
            画像を選択
          </button>
        </section>

        {/* -------- Canvas -------- */}
        {imageEl && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">
                {sketchMode
                  ? '選択範囲にスケッチを描いてください（指の位置をガイド）'
                  : currentModel.needsMask
                    ? '修正範囲をドラッグで選択（複数可）'
                    : 'クローズアップ表示する範囲を選択（複数可・任意）'}
              </h2>
              <div className="flex gap-2">
                {selections.length > 0 && !sketchMode && (
                  <button
                    onClick={() => setSketchMode(true)}
                    className="px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center"
                  >
                    <Pencil className="mr-1" size={14} /> スケッチ補助
                  </button>
                )}
                {selections.length > 1 && !sketchMode && (
                  <button onClick={removeLastSelection} className="px-3 py-2 bg-yellow-100 text-yellow-700 rounded text-sm hover:bg-yellow-200 flex items-center">
                    <RotateCcw className="mr-1" size={14} /> 最後の選択を取消
                  </button>
                )}
                {selections.length > 0 && (
                  <button onClick={resetSelections} className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 flex items-center">
                    <RotateCcw className="mr-1" size={14} /> 全リセット
                  </button>
                )}
              </div>
            </div>

            {/* スケッチツールバー */}
            {sketchMode && selections.length > 0 && (
              <div className="mb-3 p-3 bg-blue-50 rounded-lg flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-blue-700">ツール:</span>
                  <button
                    onClick={() => setIsEraser(false)}
                    className={`px-3 py-1.5 rounded text-sm flex items-center ${!isEraser ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
                  >
                    <Pencil size={14} className="mr-1" /> ペン
                  </button>
                  <button
                    onClick={() => setIsEraser(true)}
                    className={`px-3 py-1.5 rounded text-sm flex items-center ${isEraser ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
                  >
                    <Eraser size={14} className="mr-1" /> 消しゴム
                  </button>
                </div>

                {!isEraser && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-blue-700">色:</span>
                    {BRUSH_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setBrushColor(c)}
                        className={`w-7 h-7 rounded-full border-2 ${brushColor === c ? 'border-blue-600 scale-110' : 'border-gray-300'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(e) => setBrushColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                      title="自由に色を選択"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-blue-700">太さ:</span>
                  <input
                    type="range" min="10" max="100" step="10" value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-xs text-gray-500">{brushSize}px</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={undoStroke}
                    disabled={strokes.length === 0}
                    className="px-3 py-1.5 bg-white text-gray-600 border rounded text-sm hover:bg-gray-50 disabled:opacity-40 flex items-center"
                  >
                    <RotateCcw size={14} className="mr-1" /> 戻す
                  </button>
                  <button
                    onClick={() => setStrokes([])}
                    disabled={strokes.length === 0}
                    className="px-3 py-1.5 bg-white text-gray-600 border rounded text-sm hover:bg-gray-50 disabled:opacity-40"
                  >
                    全消去
                  </button>
                  <button
                    onClick={() => setSketchMode(false)}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    選択モードに戻る
                  </button>
                </div>

                {strokes.length > 0 && (
                  <span className="text-xs text-green-600 font-semibold">
                    スケッチ {strokes.length} ストローク（AI の参考画像として送信されます）
                  </span>
                )}
              </div>
            )}

            <div className="border-2 border-gray-300 rounded-lg overflow-hidden inline-block">
              <canvas
                ref={canvasRef}
                className="max-w-full h-auto cursor-crosshair"
                style={{ maxHeight: '600px' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
            {selections.length > 0 && (
              <p className="text-sm text-gray-500 mt-2">
                選択範囲: {selections.length} 箇所
                {strokes.length > 0 && <span className="ml-3 text-blue-600">+ スケッチ補助あり</span>}
              </p>
            )}
          </section>
        )}

        {/* -------- 修正ボタン -------- */}
        {imageEl && (!currentModel.needsMask || selections.length > 0) && (
          <div className="mb-8 flex justify-center">
            <button
              onClick={() => void startFingerFix()}
              disabled={isFixing || !apiKey}
              className="px-8 py-3 bg-orange-600 text-white rounded-lg disabled:bg-gray-400 flex items-center text-lg"
            >
              {isFixing ? (
                <><div className="animate-spin h-5 w-5 border-b-2 border-white mr-3" /> 3候補を生成中...</>
              ) : (
                <><Hand className="mr-3" size={20} /> 指を修正（3候補生成）</>
              )}
            </button>
          </div>
        )}

        {/* -------- 候補表示 -------- */}
        {candidates.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-orange-800 mb-4">候補を選択してください</h2>

            {croppedOriginal && croppedCandidates.length > 0 && (
              <>
                <h3 className="text-sm font-semibold text-gray-600 mb-3">クローズアップ</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="border-2 border-gray-300 rounded-lg p-3">
                    <p className="text-xs text-center text-gray-500 mb-2 font-semibold">元画像</p>
                    <img src={croppedOriginal} alt="original" className="w-full h-auto rounded" />
                  </div>
                  {croppedCandidates.map((cropUrl, i) => (
                    <div key={i} onClick={() => applyCandidate(candidates[i])}
                      className="border-2 border-orange-200 rounded-lg p-3 cursor-pointer hover:border-orange-500 hover:shadow-lg transition-all">
                      <p className="text-xs text-center text-orange-600 mb-2 font-semibold">候補 {i + 1}</p>
                      <img src={cropUrl} alt={`candidate ${i + 1}`} className="w-full h-auto rounded" />
                    </div>
                  ))}
                </div>
              </>
            )}

            <h3 className="text-sm font-semibold text-gray-600 mb-3">全体画像</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {candidates.map((url, i) => (
                <div key={i} onClick={() => applyCandidate(url)}
                  className="border-2 border-orange-200 rounded-lg p-3 cursor-pointer hover:border-orange-500 hover:shadow-lg transition-all">
                  <p className="text-xs text-center text-orange-600 mb-2 font-semibold">候補 {i + 1}</p>
                  <img src={url} alt={`candidate ${i + 1}`} className="w-full h-auto rounded" />
                </div>
              ))}
            </div>

            <div className="mt-4 text-center">
              <button onClick={resetSelections} className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">キャンセル</button>
            </div>
          </section>
        )}

        {/* -------- 結果表示 -------- */}
        {resultImageUrl && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-green-800 mb-4">修正結果</h2>
            <div className="border-2 border-green-300 rounded-lg overflow-hidden inline-block">
              <img src={resultImageUrl} alt="fixed" className="max-w-full h-auto" style={{ maxHeight: '600px' }} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={() => void downloadResult()} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center">
                <Download className="mr-2" size={16} /> ダウンロード
              </button>
              <button onClick={useResultAsSource} className="px-6 py-2 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 flex items-center">
                <RotateCcw className="mr-2" size={16} /> この結果をさらに修正する
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default FingerFixTab;

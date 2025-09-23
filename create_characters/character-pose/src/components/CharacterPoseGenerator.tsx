// src/components/CharacterPoseGenerator.tsx
import {
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type JSX,
} from 'react';
import {
  Upload,
  Download,
  Plus,
  Trash2,
  Play,
  Settings,
  Image as ImageIcon,
  Square,
  Check,
} from 'lucide-react';
import { createFalClient } from '@fal-ai/client';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/* ---------- 型 ---------- */
interface GeneratedImage {
  prompt: string;
  imageUrl: string;
  index: number;
  selected: boolean;
}

/* ---------- 本体 ---------- */
const CharacterPoseGenerator = (): JSX.Element => {
  /* ----- state ----- */
  const [apiKey, setApiKey] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [posePrompts, setPosePrompts] = useState<string[]>([
    'jumping in the air happily',
    'waving one hand energetically',
    'dancing with a big smile',
    'sitting calmly and looking up',
    'floating gently as if dreaming',
    'running while laughing',
    'holding a tiny flag with pride',
    'hugging a small heart',
    'stacked on top of each other like a tower',
    'playing with bubbles',
  ]);
  const [newPrompt, setNewPrompt] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  const [commonPrompt, setCommonPrompt] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const shouldStopRef = useRef(false);
  const [progress, setProgress] = useState(0);

  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);

  /* モーダル */
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  const openModal = (url: string): void => setModalImageUrl(url);
  const closeModal = (): void => setModalImageUrl(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ----- localStorage (プロンプト保存) ----- */
  useEffect(() => {
    const saved = localStorage.getItem('characterPosePrompts');
    if (saved) setPosePrompts(JSON.parse(saved));
  }, []);
  const savePrompts = (arr: string[]) =>
    localStorage.setItem('characterPosePrompts', JSON.stringify(arr));

  /* ----- 画像アップロード ----- */
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);

    const reader = new FileReader();
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') setImagePreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  /* ----- プロンプト操作 ----- */
  const addPrompt = () => {
    const t = newPrompt.trim();
    if (t && !posePrompts.includes(t)) {
      const next = [...posePrompts, t];
      setPosePrompts(next);
      savePrompts(next);
      setNewPrompt('');
    }
  };
  const removePrompt = (idx: number) => {
    const next = posePrompts.filter((_, i) => i !== idx);
    setPosePrompts(next);
    savePrompts(next);
  };

  /* ----- Base64 変換 ----- */
  const toBase64 = (f: File) =>
    new Promise<string>((ok, ng) => {
      const r = new FileReader();
      r.onload = () => (typeof r.result === 'string' ? ok(r.result) : ng());
      r.onerror = () => ng(r.error ?? new Error('read error'));
      r.readAsDataURL(f);
    });

  /* ----- FAL 呼び出し ----- */
  const callFal = async (prompt: string, img64: string): Promise<string> => {
    const fal = createFalClient({ credentials: apiKey });
    const { data } = await fal.run('fal-ai/flux-pro/kontext', {
      input: {
        prompt: `${prompt} (make sure hands show five distinct fingers)`,
        image_url: img64,
        output_format: 'png',
        guidance_scale: 9,
        num_images: 1,
        safety_tolerance: '6',
        sync_mode: true,
      },
    });
    return data.images[0].url;
  };

  /* ----- 生成 ----- */
  const stopGeneration = () => {
    shouldStopRef.current = true;
  };

  const generatePoseImages = async () => {
    if (!selectedImage || posePrompts.length === 0) {
      alert('画像とプロンプトを設定してください');
      return;
    }
    if (!apiKey) {
      alert('FAL.ai API キーを入力してください');
      return;
    }

    setIsGenerating(true);
    shouldStopRef.current = false;
    setProgress(0);
    setGeneratedImages([]);

    const img64 = await toBase64(selectedImage);
    const results: GeneratedImage[] = [];

    for (let i = 0; i < posePrompts.length; i++) {
      if (shouldStopRef.current) break;

      const merged = `${commonPrompt} ${posePrompts[i]}`.trim();
      try {
        const url = await callFal(merged, img64);
        results.push({ prompt: posePrompts[i], imageUrl: url, index: i, selected: true });
      } catch {
        results.push({
          prompt: posePrompts[i],
          imageUrl:
            'data:image/svg+xml;base64,' +
            btoa(
              '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#ffe6e6"/></svg>',
            ),
          index: i,
          selected: true,
        });
      }

      setProgress(((i + 1) / posePrompts.length) * 100);
      setGeneratedImages([...results]);

      if (!shouldStopRef.current) await new Promise(r => setTimeout(r, 300));
    }

    setIsGenerating(false);
    shouldStopRef.current = false;
  };

  /* ----- 選択 ----- */
  const toggleImageSelection = (idx: number) =>
    setGeneratedImages(prev =>
      prev.map(img => (img.index === idx ? { ...img, selected: !img.selected } : img)),
    );
  const toggleSelectAll = () => {
    const willSelect = !generatedImages.every(i => i.selected);
    setGeneratedImages(prev => prev.map(i => ({ ...i, selected: willSelect })));
  };
  const selectedCount = generatedImages.filter(i => i.selected).length;

  /* ----- DL (JSZip) ----- */
  const makeZipAndSave = async (files: { name: string; blob: Blob }[], zipName: string) => {
    const zip = new JSZip();
    for (const f of files) {
      // ArrayBuffer の方が互換性高い
      zip.file(f.name, await f.blob.arrayBuffer());
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, zipName);
  };

  const downloadSingleImage = async (img: GeneratedImage) => {
    const blob = await (await fetch(img.imageUrl)).blob();
    saveAs(blob, `pose_${img.index + 1}.png`);
  };

  const downloadSelectedImages = async () => {
    const targets = generatedImages.filter(i => i.selected);
    if (targets.length === 0) return alert('画像を選択してください');

    const files = await Promise.all(
      targets.map(async img => ({
        name: `pose_${img.index + 1}.png`,
        blob: await (await fetch(img.imageUrl)).blob(),
      })),
    );
    await makeZipAndSave(files, `poses_${targets.length}.zip`);
  };

  /* ====================================================== */
  return (
    <>
      {/* ---------- モーダル ---------- */}
      {modalImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeModal}
        >
          <div
            className="relative bg-white p-4 rounded-lg shadow-lg max-w-[90vw] max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              className="absolute -right-3 -top-3 w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shadow"
            >
              ×
            </button>
            <img src={modalImageUrl} alt="preview" className="max-w-full max-h-[80vh]" />
          </div>
        </div>
      )}

      {/* ---------- UI ---------- */}
      <div className="w-screen p-6 bg-gradient-to-br from-purple-50 to-pink-50 min-h-screen">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-8 text-purple-800">
            <ImageIcon className="inline-block mr-3" />
            キャラクターポーズ生成機能
          </h1>

          {/* =================== 1. API キー入力 =================== */}
          <section className="mb-8 p-4 bg-blue-50 rounded-lg">
            <header className="flex items-center mb-3">
              <Settings className="mr-2 text-blue-600" />
              <h2 className="text-lg font-semibold text-blue-800">API 設定</h2>
            </header>
            <input
              type="password"
              className="w-full p-3 border border-blue-200 rounded-lg"
              placeholder="FAL.ai API キー"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
          </section>

          {/* =================== 2. 画像アップロード =================== */}
          <section className="mb-8 p-4 bg-green-50 rounded-lg">
            <header className="flex items-center mb-3">
              <Upload className="mr-2 text-green-600" />
              <h2 className="text-lg font-semibold text-green-800">キャラクター画像</h2>
            </header>
            <div className="flex gap-4 flex-col md:flex-row">
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-3 border-2 border-dashed border-green-300 rounded-lg hover:bg-green-100"
                >
                  画像をアップロード
                </button>
              </div>
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="preview"
                  className="w-32 h-32 border-2 border-green-300 rounded object-cover"
                />
              )}
            </div>
          </section>

          {/* =================== 3. 共通プロンプト =================== */}
          <section className="mb-6">
            <label className="block text-sm font-semibold mb-1 text-gray-700">
              すべてのプロンプトに付与する共通語句
            </label>
            <input
              value={commonPrompt}
              onChange={e => setCommonPrompt(e.target.value)}
              placeholder="例: high quality illustration, 8K"
              className="w-full p-2 border border-gray-300 rounded"
            />
          </section>

          {/* =================== 4. 個別プロンプト一覧 =================== */}
          <section className="mb-8 p-4 bg-yellow-50 rounded-lg">
            <h2 className="text-lg font-semibold text-yellow-800 mb-3">プロンプト</h2>

            {/* 追加 */}
            <div className="flex gap-2 mb-4">
              <input
                value={newPrompt}
                onChange={e => setNewPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addPrompt();
                }}
                placeholder="新しいポーズ"
                className="flex-1 p-2 border border-yellow-300 rounded"
              />
              <button
                onClick={addPrompt}
                className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* 一覧 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {posePrompts.map((p, i) => (
                <div key={i} className="flex items-center gap-2 bg-white border rounded p-2">
                  {editingIdx === i ? (
                    <>
                      <input
                        autoFocus
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const next = [...posePrompts];
                            next[i] = editingText.trim() || p;
                            setPosePrompts(next);
                            savePrompts(next);
                            setEditingIdx(null);
                          }
                        }}
                        className="flex-1 px-2 py-1 border rounded text-sm"
                      />
                      <button
                        onClick={() => setEditingIdx(null)}
                        className="text-gray-500 hover:text-gray-700 text-xs"
                      >
                        キャンセル
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        onDoubleClick={() => {
                          setEditingIdx(i);
                          setEditingText(p);
                        }}
                        className="flex-1 text-sm cursor-text select-text"
                      >
                        {p}
                      </span>
                      <button
                        onClick={() => removePrompt(i)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* =================== 5. 生成／停止 =================== */}
          <div className="mb-8 flex justify-center gap-4">
            <button
              onClick={generatePoseImages}
              disabled={
                isGenerating || !apiKey || !selectedImage || posePrompts.length === 0
              }
              className="px-8 py-3 bg-purple-600 text-white rounded-lg disabled:bg-gray-400 flex items-center"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin h-5 w-5 border-b-2 border-white mr-2" />
                  生成中... {Math.round(progress)}%
                </>
              ) : (
                <>
                  <Play className="mr-2" size={20} /> 生成
                </>
              )}
            </button>
            {isGenerating && (
              <button
                onClick={stopGeneration}
                className="px-6 py-3 bg-red-600 text-white rounded-lg flex items-center"
              >
                <Square className="mr-2" size={16} /> 停止
              </button>
            )}
          </div>

          {/* 進捗バー */}
          {isGenerating && (
            <div className="mb-8">
              <div className="w-full bg-gray-200 h-2 rounded">
                <div
                  className="bg-purple-600 h-2 rounded"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-center text-sm text-gray-600 mt-2">
                {Math.round(progress)}% 完了
                {shouldStopRef.current && (
                  <span className="ml-2 text-red-600">(停止中…)</span>
                )}
              </p>
            </div>
          )}

          {/* =================== 6. 画像一覧 =================== */}
          {generatedImages.length > 0 && (
            <section className="mb-8">
              <div className="flex flex-wrap gap-2 justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">
                  生成画像 ({generatedImages.length})
                </h2>
                <div className="flex gap-2 flex-wrap items-center">
                  <button
                    onClick={toggleSelectAll}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    {generatedImages.every(i => i.selected) ? '全選択解除' : '全選択'}
                  </button>
                  <button
                    onClick={downloadSelectedImages}
                    disabled={selectedCount === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
                  >
                    <Download className="mr-2" size={16} />
                    一括ダウンロード&nbsp;({selectedCount})
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {generatedImages.map(img => (
                  <div
                    key={img.index}
                    className="relative border rounded shadow-sm hover:shadow-md transition-all"
                  >
                    <img
                      src={img.imageUrl}
                      alt={img.prompt}
                      className="w-full h-auto object-cover cursor-pointer"
                      onClick={() => openModal(img.imageUrl)}
                    />

                    {/* チェック */}
                    <div
                      onClick={() => toggleImageSelection(img.index)}
                      className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center bg-white shadow-md cursor-pointer ${
                        img.selected ? 'border-blue-500 bg-blue-100' : 'border-gray-400'
                      }`}
                    >
                      {img.selected && <Check size={16} className="text-blue-600" />}
                    </div>

                    {/* 個別 DL */}
                    <div className="p-2">
                      <button
                        onClick={() => downloadSingleImage(img)}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded py-1 flex items-center justify-center"
                      >
                        <Download className="mr-1" size={12} />
                        DL
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
};

export default CharacterPoseGenerator;

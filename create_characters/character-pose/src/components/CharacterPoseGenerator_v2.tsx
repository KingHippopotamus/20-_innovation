/**
 * キャラクターポーズ生成コンポーネント
 * 画像アップロード →（fal.ai API／いまはモック）でポーズ画像を生成し
 * 個別／選択／全画像をダウンロードできる。
 */

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
import { createFalClient } from '@fal-ai/client';  // createFalClient をインポート

/** 生成済み画像の型 */
interface GeneratedImage {
  prompt: string;
  imageUrl: string;
  index: number;
  selected: boolean;
}

const CharacterPoseGenerator = (): JSX.Element => {
  /* -------------------- state -------------------- */
  const [apiKey, setApiKey] = useState<string>('');
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
  const [newPrompt, setNewPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [shouldStop, setShouldStop] = useState<boolean>(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* -------------------- localStorage -------------------- */
  useEffect((): void => {
      const saved = localStorage.getItem('characterPosePrompts');
      if (saved) setPosePrompts(JSON.parse(saved));
  }, []);

  const savePromptsToStorage = (prompts: string[]): void => {
      localStorage.setItem('characterPosePrompts', JSON.stringify(prompts));
  };

  /* -------------------- utils -------------------- */
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      if (!file) return;
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (ev): void => {
          if (typeof ev.target?.result === 'string') setImagePreview(ev.target.result);
      };
      reader.readAsDataURL(file);
  };

  const addPrompt = (): void => {
      const trimmed = newPrompt.trim();
      if (trimmed && !posePrompts.includes(trimmed)) {
          const next = [...posePrompts, trimmed];
          setPosePrompts(next);
          savePromptsToStorage(next);
          setNewPrompt('');
      }
  };

  const removePrompt = (idx: number): void => {
      const next = posePrompts.filter((_, i) => i !== idx);
      setPosePrompts(next);
      savePromptsToStorage(next);
  };

  const convertImageToBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
              if (typeof reader.result === 'string') resolve(reader.result);
              else reject(new Error('Base64 変換失敗'));
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
      });

    /** FAL.ai API呼び出し */
    const callFalAPI = async (prompt: string, imageB64: string): Promise<string> => {
        const falClient = createFalClient({ credentials: apiKey });  // falClient を作成
    
        try {
            const result = await falClient.run('fal-ai/instant-character', {
                input: {
                    prompt: `A character ${prompt}, both hands clearly show five distinct fingers, correct anatomy, high quality illustration`,
                    image_url: imageB64,
                    negative_prompt: 'extra fingers, six fingers, deformed hand, blurry, nsfw',
                    output_format: 'png',
                    guidance_scale: 9,
                    num_images: 1,
                },
            });
    
            if (result.data?.images && result.data.images[0]) {
                return result.data.images[0].url;
            } else {
                throw new Error('画像の取得に失敗しました');
            }
        } catch (err) {
            console.error('API 呼び出しエラー:', err);
            throw new Error('画像の生成中にエラーが発生しました');
        }
    };

  /* -------------------- generation -------------------- */
  const stopGeneration = (): void => setShouldStop(true);

  const generatePoseImages = async (): Promise<void> => {
      if (!selectedImage || posePrompts.length === 0) {
          alert('画像とプロンプトを設定してください');
          return;
      }
      if (!apiKey) {
          alert('FAL.ai API キーを入力してください');
          return;
      }

      setIsGenerating(true);
      setShouldStop(false);
      setGeneratedImages([]);
      setProgress(0);

      const b64 = await convertImageToBase64(selectedImage);
      const results: GeneratedImage[] = [];

      for (let i = 0; i < posePrompts.length; i++) {
          if (shouldStop) break;
          const prompt = posePrompts[i];

          try {
              const url = await callFalAPI(prompt, b64);
              results.push({ prompt, imageUrl: url, index: i, selected: false });
          } catch {
              results.push({
                  prompt,
                  imageUrl:
                      'data:image/svg+xml;base64,' +
                      btoa(
                          '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#ffebee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="16" fill="#c62828">Error</text></svg>',
                      ),
                  index: i,
                  selected: false,
              });
          }

          setProgress(((i + 1) / posePrompts.length) * 100);
          setGeneratedImages([...results]);
          if (!shouldStop) await new Promise((r) => setTimeout(r, 300));
      }

      setIsGenerating(false);
      setShouldStop(false);
  };

  /* -------------------- selection -------------------- */
  const toggleImageSelection = (idx: number): void => {
      setGeneratedImages((prev): GeneratedImage[] =>
          prev.map((img): GeneratedImage =>
              img.index === idx ? { ...img, selected: !img.selected } : img,
          ),
      );
  };

  const toggleSelectAll = (): void => {
      const all = generatedImages.every((img) => img.selected);
      setGeneratedImages((prev): GeneratedImage[] =>
          prev.map((img): GeneratedImage => ({ ...img, selected: !all })),
      );
  };

  /* -------------------- download helpers -------------------- */
  const downloadBlobList = (files: { name: string; blob: Blob }[], zip: string): void => {
      const list = 'ZIP Archive\n' + files.map((f) => `- ${f.name}`).join('\n');
      const blob = new Blob([list], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zip;
      a.click();
      URL.revokeObjectURL(url);
  };

  const downloadSingleImage = async (img: GeneratedImage): Promise<void> => {
      const res = await fetch(img.imageUrl);
      const blob = await res.blob();
      downloadBlobList([{ name: `pose_${img.index + 1}.png`, blob }], `pose_${img.index + 1}.zip`);
  };

  const downloadSelectedImages = async (): Promise<void> => {
      const targets = generatedImages.filter((img) => img.selected);
      if (targets.length === 0) {
          alert('画像を選択してください');
          return;
      }
      const files = await Promise.all(
          targets.map(async (img) => ({
              name: `pose_${img.index + 1}.png`,
              blob: await (await fetch(img.imageUrl)).blob(),
          })),
      );
      downloadBlobList(files, `selected_${files.length}.zip`);
  };

  const downloadAllImages = async (): Promise<void> => {
      if (generatedImages.length === 0) {
          alert('画像がありません');
          return;
      }
      const files = await Promise.all(
          generatedImages.map(async (img) => ({
              name: `pose_${img.index + 1}.png`,
              blob: await (await fetch(img.imageUrl)).blob(),
          })),
      );
      downloadBlobList(files, 'all_poses.zip');
  };

  const selectedCount = generatedImages.filter((i) => i.selected).length;

  /* -------------------- JSX -------------------- */
  return (
      <div className="max-w-6xl mx-auto p-6 bg-gradient-to-br from-purple-50 to-pink-50 min-h-screen">
          <div className="bg-white rounded-xl shadow-lg p-8">
              <h1 className="text-3xl font-bold text-center mb-8 text-purple-800">
                  <ImageIcon className="inline-block mr-3" />
                  キャラクターポーズ生成機能
              </h1>

              {/* ---------------- API キー ---------------- */}
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
                      onChange={(e): void => setApiKey(e.target.value)}
                  />
              </section>

              {/* ---------------- 画像入力 ---------------- */}
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
                              onClick={(): void => fileInputRef.current?.click()}
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

              {/* ---------------- プロンプト ---------------- */}
              <section className="mb-8 p-4 bg-yellow-50 rounded-lg">
                  <h2 className="text-lg font-semibold text-yellow-800 mb-3">プロンプト</h2>
                  <div className="flex gap-2 mb-4">
                      <input
                          value={newPrompt}
                          onChange={(e): void => setNewPrompt(e.target.value)}
                          onKeyDown={(e): void => {
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {posePrompts.map((p, i) => (
                          <div
                              key={i}
                              className="flex justify-between items-center p-2 bg-white rounded border"
                          >
                              <span className="text-sm">{p}</span>
                              <button
                                  onClick={(): void => removePrompt(i)}
                                  className="text-red-500 hover:text-red-700"
                              >
                                  <Trash2 size={14} />
                              </button>
                          </div>
                      ))}
                  </div>
              </section>

              {/* ---------------- 生成／停止 ---------------- */}
              <div className="mb-8 flex justify-center gap-4">
                  <button
                      onClick={generatePoseImages}
                      disabled={
                          isGenerating ||
                          !apiKey ||
                          !selectedImage ||
                          posePrompts.length === 0
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

              {/* ---------------- 進捗 ---------------- */}
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
                          {shouldStop && (
                              <span className="ml-2 text-red-600">(停止中…)</span>
                          )}
                      </p>
                  </div>
              )}

              {/* ---------------- 画像一覧 ---------------- */}
              {generatedImages.length > 0 && (
                  <section className="mb-8">
                      <div className="flex flex-wrap gap-2 justify-between items-center mb-4">
                          <h2 className="text-lg font-semibold">
                              生成画像 ({generatedImages.length})
                          </h2>
                          <div className="flex gap-2 flex-wrap items-center">
                              <button
                                  onClick={(): void => setSelectMode(!selectMode)}
                                  className={`px-3 py-2 rounded text-sm ${
                                      selectMode
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                              >
                                  {selectMode ? '選択モード終了' : '選択モード'}
                              </button>
                              {selectMode && (
                                  <>
                                      <button
                                          onClick={toggleSelectAll}
                                          className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                                      >
                                          {generatedImages.every((i) => i.selected)
                                              ? '全解除'
                                              : '全選択'}
                                      </button>
                                      <button
                                          onClick={(): void => void downloadSelectedImages()}
                                          disabled={selectedCount === 0}
                                          className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
                                      >
                                          <Download className="mr-1" size={14} />
                                          選択 ZIP ({selectedCount})
                                      </button>
                                  </>
                              )}
                              <button
                                  onClick={(): void => void downloadAllImages()}
                                  className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center"
                              >
                                  <Download className="mr-2" size={16} /> 全 ZIP
                              </button>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {generatedImages.map((img) => (
                              <div
                                  key={img.index}
                                  className={`border rounded shadow-sm hover:shadow-md relative ${
                                      selectMode && img.selected ? 'ring-2 ring-blue-500' : ''
                                  }`}
                              >
                                  {selectMode && (
                                      <button
                                          onClick={(): void => toggleImageSelection(img.index)}
                                          className="absolute top-2 left-2 bg-white w-6 h-6 rounded flex items-center justify-center shadow"
                                      >
                                          {img.selected ? (
                                              <Check size={16} className="text-blue-600" />
                                          ) : (
                                              <div className="w-4 h-4 border border-gray-400 rounded" />
                                          )}
                                      </button>
                                  )}

                                  <img
                                      src={img.imageUrl}
                                      alt={img.prompt}
                                      className="w-full h-32 object-cover cursor-pointer"
                                      onClick={(): void => {
                                          if (selectMode) toggleImageSelection(img.index);
                                      }}
                                  />
                                  <div className="p-2">
                                      <p
                                          className="text-xs text-gray-600 truncate mb-1"
                                          title={img.prompt}
                                      >
                                          {img.prompt}
                                      </p>
                                      <button
                                          onClick={(): void => void downloadSingleImage(img)}
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
  );
};

export default CharacterPoseGenerator;

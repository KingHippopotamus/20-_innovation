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
  Image as ImageIcon,
  Square,
  Check,
  Hand,
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/** 生成済み画像の型 */
interface GeneratedImage {
  prompt: string;
  imageUrl: string;
  index: number;
  selected: boolean;
}

interface FingerFixState {
  targetIndex: number;
  candidates: string[];
  isLoading: boolean;
  originalUrl: string;
}

const FINGER_FIX_PROMPT =
  'Fix both hands so that each hand clearly shows five distinct fingers with correct anatomy and proportions. Keep the rest of the image unchanged.';
const FINGER_FIX_NEGATIVE_PROMPT =
  'extra finger, six fingers, deformed hand, blurry, nsfw';

interface CharacterPoseGeneratorProps {
  designedCharacter?: GeneratedImage | null;
  onOpenFingerFix?: (imageUrl: string) => void;
}

const CharacterPoseGenerator = ({ designedCharacter, onOpenFingerFix }: CharacterPoseGeneratorProps): JSX.Element => {
  /* -------------------- state -------------------- */
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(designedCharacter?.imageUrl || null);
  const [posePrompts, setPosePrompts] = useState<string[]>([
      'A character is waving one hand energetically',
      'A character is bowing calmly and looking up',
      'A character is pointing at a clock to show the time',
      'A character is rushing while laughing',
      'A character is hugging a small heart',
      'A character is pointing at a calendar',
      'A character is calling on a phone',
      'A character is putting a hand on right side to show the direction',
      'A character is pointing up with one hand',
      'A character is putting a hand on its chest with pride',
      'Two characters are shaking hands while smiling',
  ]);
  const [newPrompt, setNewPrompt] = useState<string>('');
  const [commonPrompt, setCommonPrompt] = useState<string>('Anthropomorphic, human-like hands with five distinct fingers on each hand, fingers clearly separated (1-5)');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [shouldStop, setShouldStop] = useState<boolean>(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  const [fingerFixState, setFingerFixState] = useState<FingerFixState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shouldStopRef = useRef<boolean>(false);

  /* モーダル操作 */
  const openModal = (url: string): void => setModalImageUrl(url);
  const closeModal = (): void => setModalImageUrl(null);

  /* -------------------- localStorage -------------------- */
  useEffect((): void => {
      const savedPrompts = localStorage.getItem('characterPosePrompts');
      if (savedPrompts) setPosePrompts(JSON.parse(savedPrompts));
      
      const savedCommonPrompt = localStorage.getItem('characterPoseCommonPrompt_2');
      if (savedCommonPrompt) setCommonPrompt(savedCommonPrompt);
  }, []);

  const savePromptsToStorage = (prompts: string[]): void => {
      localStorage.setItem('characterPosePrompts', JSON.stringify(prompts));
  };

  const saveCommonPromptToStorage = (commonPrompt: string): void => {
      localStorage.setItem('characterPoseCommonPrompt_2', commonPrompt);
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

    /** API Gateway 呼び出し */
    const callAPI = async (prompt: string, imageB64: string): Promise<string> => {
        try {
            const response = await fetch('/api/characterPoseGeneration', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: `${commonPrompt}, ${prompt}`,
                    negative_prompt: 'extra fingers, six fingers, fewer than five, fused/missing digits, deformed hands, paws, claws, hands cropped, occluded hands, blur',
                    image_url: imageB64,
                    seed: 42,
                    steps: 30,
                }),
            });
    
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
    
            const data = await response.json();
            
            // FAL APIの実際のレスポンス形式に対応
            if (data.images && data.images[0] && data.images[0].url) {
                return data.images[0].url;
            }
            
            // エラーレスポンスの場合
            if (data.error || data.detail) {
                throw new Error(data.error || data.detail || '画像の取得に失敗しました');
            }
            
            throw new Error('不明なレスポンス形式です');
        } catch (err) {
            console.error('API 呼び出しエラー:', err);
            throw new Error('画像の生成中にエラーが発生しました');
        }
    };

  /* -------------------- finger fix -------------------- */
  const callFingerFixAPI = async (imageUrl: string): Promise<string[]> => {
    const response = await fetch('/api/characterPoseGeneration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: FINGER_FIX_PROMPT,
        negative_prompt: FINGER_FIX_NEGATIVE_PROMPT,
        image_url: imageUrl,
        strength: 0.45,
        num_images: 3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (data.images && data.images.length > 0) {
      return data.images.map((img: { url: string }) => img.url);
    }
    throw new Error(data.error || data.detail || '指修正に失敗しました');
  };

  const startFingerFix = async (index: number): Promise<void> => {
    const img = generatedImages.find(i => i.index === index);
    if (!img || fingerFixState?.isLoading) return;

    setFingerFixState({ targetIndex: index, candidates: [], isLoading: true, originalUrl: img.imageUrl });

    try {
      const candidates = await callFingerFixAPI(img.imageUrl);
      setFingerFixState({ targetIndex: index, candidates, isLoading: false, originalUrl: img.imageUrl });
    } catch (err) {
      console.error('指修正エラー:', err);
      alert('指修正の候補生成に失敗しました');
      setFingerFixState(null);
    }
  };

  const applyFingerFix = (candidateUrl: string): void => {
    if (!fingerFixState) return;
    setGeneratedImages(prev =>
      prev.map(i =>
        i.index === fingerFixState.targetIndex ? { ...i, imageUrl: candidateUrl } : i,
      ),
    );
    setFingerFixState(null);
  };

  const cancelFingerFix = (): void => setFingerFixState(null);

  /* -------------------- generation -------------------- */
  const stopGeneration = (): void => {
      setShouldStop(true);
      shouldStopRef.current = true;
  };

  const generatePoseImages = async (): Promise<void> => {
      if ((!selectedImage && !designedCharacter) || posePrompts.length === 0) {
          alert('画像とプロンプトを設定してください');
          return;
      }

      setIsGenerating(true);
      setShouldStop(false);
      shouldStopRef.current = false;
      setGeneratedImages([]);
      setProgress(0);

      let imageRef: string;
      if (designedCharacter) {
          // designedCharacterのURLをそのまま使う（base64変換するとペイロード上限超過で503になる）
          imageRef = designedCharacter.imageUrl;
      } else {
          imageRef = await convertImageToBase64(selectedImage!);
      }
      const results: GeneratedImage[] = [];

      for (let i = 0; i < posePrompts.length; i++) {
          if (shouldStopRef.current) break;
          const prompt = posePrompts[i];

          try {
              const url = await callAPI(prompt, imageRef);
              if (shouldStopRef.current) break;
              results.push({ prompt, imageUrl: url, index: i, selected: false });
          } catch {
              if (shouldStopRef.current) break;
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

          if (shouldStopRef.current) break;
          setProgress(((i + 1) / posePrompts.length) * 100);
          setGeneratedImages([...results]);
          if (!shouldStopRef.current) await new Promise((r) => setTimeout(r, 300));
      }

      setIsGenerating(false);
      setShouldStop(false);
      shouldStopRef.current = false;
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
  const downloadSingleBlob = (blob: Blob, filename: string): void => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
  };

  const downloadSingleImage = async (img: GeneratedImage): Promise<void> => {
      const res = await fetch(img.imageUrl);
      const blob = await res.blob();
      downloadSingleBlob(blob, `pose_${img.index + 1}.png`);
  };

  const downloadSelectedImages = async (): Promise<void> => {
      const targets = generatedImages.filter((img) => img.selected);
      if (targets.length === 0) {
          alert('画像を選択してください');
          return;
      }
      
      if (targets.length === 1) {
          // 単一ファイルの場合は直接ダウンロード
          const img = targets[0];
          const res = await fetch(img.imageUrl);
          const blob = await res.blob();
          downloadSingleBlob(blob, `pose_${img.index + 1}.png`);
      } else {
          // 複数ファイルの場合はZIPで圧縮
          const zip = new JSZip();
          
          for (const img of targets) {
              const res = await fetch(img.imageUrl);
              const blob = await res.blob();
              zip.file(`pose_${img.index + 1}.png`, blob);
          }
          
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          saveAs(zipBlob, `selected_${targets.length}.zip`);
      }
  };

  const downloadAllImages = async (): Promise<void> => {
      if (generatedImages.length === 0) {
          alert('画像がありません');
          return;
      }
      
      if (generatedImages.length === 1) {
          // 単一ファイルの場合は直接ダウンロード
          const img = generatedImages[0];
          const res = await fetch(img.imageUrl);
          const blob = await res.blob();
          downloadSingleBlob(blob, `pose_${img.index + 1}.png`);
      } else {
          // 複数ファイルの場合はZIPで圧縮
          const zip = new JSZip();
          
          for (const img of generatedImages) {
              const res = await fetch(img.imageUrl);
              const blob = await res.blob();
              zip.file(`pose_${img.index + 1}.png`, blob);
          }
          
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          saveAs(zipBlob, 'all_poses.zip');
      }
  };

  const selectedCount = generatedImages.filter((i) => i.selected).length;

  /* -------------------- JSX -------------------- */
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
                      onClick={(e) => e.stopPropagation()}
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

          {/* ---------- 指修正モーダル ---------- */}
          {fingerFixState && (
              <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                  onClick={cancelFingerFix}
              >
                  <div
                      className="relative bg-white p-6 rounded-lg shadow-lg max-w-[90vw] max-h-[90vh] overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                  >
                      <button
                          onClick={cancelFingerFix}
                          className="absolute -right-3 -top-3 w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shadow"
                      >
                          ×
                      </button>

                      <h3 className="text-lg font-bold text-orange-800 mb-4">
                          <Hand className="inline-block mr-2" size={20} />
                          指修正 — 候補を選択してください
                      </h3>

                      {fingerFixState.isLoading ? (
                          <div className="flex flex-col items-center justify-center py-16 px-8">
                              <div className="animate-spin h-12 w-12 border-4 border-orange-500 border-t-transparent rounded-full mb-4" />
                              <p className="text-gray-600">3パターンの候補を生成中...</p>
                          </div>
                      ) : (
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="border-2 border-gray-300 rounded-lg p-2">
                                  <p className="text-xs text-center text-gray-500 mb-2 font-semibold">元画像</p>
                                  <img
                                      src={fingerFixState.originalUrl}
                                      alt="original"
                                      className="w-full h-auto rounded"
                                  />
                              </div>
                              {fingerFixState.candidates.map((url, i) => (
                                  <div
                                      key={i}
                                      onClick={() => applyFingerFix(url)}
                                      className="border-2 border-orange-200 rounded-lg p-2 cursor-pointer hover:border-orange-500 hover:shadow-lg transition-all"
                                  >
                                      <p className="text-xs text-center text-orange-600 mb-2 font-semibold">
                                          候補 {i + 1}
                                      </p>
                                      <img src={url} alt={`candidate ${i + 1}`} className="w-full h-auto rounded" />
                                  </div>
                              ))}
                          </div>
                      )}

                      <div className="mt-4 text-center">
                          <button
                              onClick={cancelFingerFix}
                              className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                              キャンセル
                          </button>
                      </div>
                  </div>
              </div>
          )}

          <div className="max-w-6xl mx-auto p-6 bg-gradient-to-br from-purple-50 to-pink-50 min-h-screen w-full">
          <div className="bg-white rounded-xl shadow-lg p-8">
              <h1 className="text-3xl font-bold text-center mb-8 text-purple-800">
                  <ImageIcon className="inline-block mr-3" />
                  キャラクターポーズ生成機能
              </h1>


              {/* ---------------- 画像入力 ---------------- */}
              <section className="mb-8 p-4 bg-green-50 rounded-lg">
                  <header className="flex items-center mb-3">
                      <Upload className="mr-2 text-green-600" />
                      <h2 className="text-lg font-semibold text-green-800">キャラクター画像</h2>
                      {designedCharacter && (
                          <span className="ml-auto text-sm text-green-600 bg-green-100 px-2 py-1 rounded">
                              デザイナーから選択済み
                          </span>
                      )}
                  </header>
                  <div className="flex gap-4 flex-col md:flex-row">
                      {!designedCharacter && (
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
                      )}
                      {designedCharacter && (
                          <div className="flex-1">
                              <div className="p-4 border border-green-300 rounded-lg bg-white">
                                  <p className="text-sm text-gray-600">選択されたキャラクター画像を使用します</p>
                              </div>
                          </div>
                      )}
                      {imagePreview && (
                          <img
                              src={imagePreview}
                              alt="preview"
                              className="w-32 h-32 border-2 border-green-300 rounded object-cover"
                          />
                      )}
                  </div>
              </section>

              {/* ---------------- 共通プロンプト ---------------- */}
              <section className="mb-6">
                  <label className="block text-sm font-semibold mb-1 text-gray-700">
                      すべてのプロンプトに付与する共通語句
                  </label>
                  <input
                      value={commonPrompt}
                      onChange={(e): void => setCommonPrompt(e.target.value)}
                      onBlur={(e): void => saveCommonPromptToStorage(e.target.value)}
                      placeholder="例: high quality illustration, 8K"
                      className="w-full p-2 border border-gray-300 rounded"
                  />
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
                          (!selectedImage && !designedCharacter) ||
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
                                          {selectedCount === 1 ? '選択 DL' : `選択 ZIP (${selectedCount})`}
                                      </button>
                                  </>
                              )}
                              <button
                                  onClick={(): void => void downloadAllImages()}
                                  className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center"
                              >
                                  <Download className="mr-2" size={16} /> 
                                  {generatedImages.length === 1 ? '全 DL' : `全 ZIP (${generatedImages.length})`}
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
                                          className={`absolute top-2 left-2 w-6 h-6 rounded flex items-center justify-center shadow border-2 ${
                                              img.selected 
                                                  ? 'bg-blue-600 border-blue-600 text-white' 
                                                  : 'bg-white border-gray-300 hover:border-blue-400'
                                          }`}
                                      >
                                          {img.selected && (
                                              <Check size={14} className="text-white" />
                                          )}
                                      </button>
                                  )}

                                  <img
                                      src={img.imageUrl}
                                      alt={img.prompt}
                                      className="w-full h-48 object-contain cursor-pointer bg-gray-50"
                                      onClick={(): void => {
                                          if (selectMode) {
                                              toggleImageSelection(img.index);
                                          } else {
                                              openModal(img.imageUrl);
                                          }
                                      }}
                                  />
                                  <div className="p-2">
                                      <p
                                          className="text-xs text-gray-600 truncate mb-1"
                                          title={img.prompt}
                                      >
                                          {img.prompt}
                                      </p>
                                      <div className="flex gap-1">
                                          <button
                                              onClick={(): void => {
                                                  if (onOpenFingerFix) {
                                                      onOpenFingerFix(img.imageUrl);
                                                  } else {
                                                      void startFingerFix(img.index);
                                                  }
                                              }}
                                              disabled={fingerFixState?.isLoading}
                                              className="flex-1 bg-orange-100 hover:bg-orange-200 text-orange-700 text-xs rounded py-1 flex items-center justify-center disabled:opacity-50"
                                          >
                                              <Hand className="mr-1" size={12} />
                                              指修正
                                          </button>
                                          <button
                                              onClick={(): void => void downloadSingleImage(img)}
                                              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded py-1 flex items-center justify-center"
                                          >
                                              <Download className="mr-1" size={12} />
                                              DL
                                          </button>
                                      </div>
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

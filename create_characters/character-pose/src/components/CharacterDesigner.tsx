/**
 * キャラクターデザインコンポーネント
 * 4項目選択システム（種族、職業、テーマカラー、LPトーン）でキャラクターを設計し、
 * 4バリエーション画像を生成する
 */

import { useState, type JSX } from 'react';
import {
  Palette,
  Users,
  Briefcase,
  Heart,
  Shuffle,
  Dice6,
  Copy,
  Wand2,
  X,
  ArrowRight,
} from 'lucide-react';

interface GeneratedImage {
  prompt: string;
  imageUrl: string;
  index: number;
  selected: boolean;
}

interface CharacterDesignerProps {
  onCharacterSelect: (character: GeneratedImage) => void;
}

const CharacterDesigner: React.FC<CharacterDesignerProps> = ({ onCharacterSelect }): JSX.Element => {
  // ==================== 設定 ====================
  const USE_REAL_API = true; // true: 実際のAPI、false: モック機能

  // ==================== State管理 ====================
  const [selectedMotif, setSelectedMotif] = useState<string>('');
  const [selectedOccupation, setSelectedOccupation] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('#FF6B6B');
  const [selectedTone, setSelectedTone] = useState<string>('');

  const [customMotif, setCustomMotif] = useState<string>('');
  const [customOccupation, setCustomOccupation] = useState<string>('');
  const [customTone, setCustomTone] = useState<string>('');

  // モチーフカテゴリ選択
  const [activeMotifCategory, setActiveMotifCategory] = useState<'human' | 'animal' | 'fantasy'>('human');

  // 人間の場合の詳細選択
  const [selectedGender, setSelectedGender] = useState<string>('');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string>('');

  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);

  // プロンプト編集機能
  const [isEditingPrompt, setIsEditingPrompt] = useState<boolean>(false);
  const [customPrompt, setCustomPrompt] = useState<string>('');

  // ==================== データ定義 ====================
  const motifCategories = {
    human: {
      name: '人間',
      genders: [
        { id: 'male', name: '男性' },
        { id: 'female', name: '女性' },
      ],
      ageGroups: [
        { id: 'child', name: '子供' },
        { id: 'youth', name: '青年' },
        { id: 'adult', name: '大人' },
        { id: 'middle', name: '中年' },
        { id: 'elder', name: '老人' },
      ]
    },
    animal: {
      name: '動物',
      items: [
        { id: 'cat', name: '猫' },
        { id: 'dog', name: '犬' },
        { id: 'wolf', name: '狼' },
        { id: 'fox', name: '狐' },
        { id: 'rabbit', name: 'うさぎ' },
        { id: 'bear', name: '熊' },
        { id: 'panda', name: 'パンダ' },
        { id: 'lion', name: 'ライオン' },
        { id: 'tiger', name: 'トラ' },
        { id: 'horse', name: '馬' },
        { id: 'bird', name: '鳥' },
        { id: 'owl', name: 'ふくろう' },
        { id: 'hawk', name: '鷹' },
        { id: 'penguin', name: 'ペンギン' },
        { id: 'dolphin', name: 'イルカ' },
        { id: 'shark', name: 'サメ' },
        { id: 'snake', name: 'ヘビ' },
        { id: 'lizard', name: 'トカゲ' },
      ]
    },
    fantasy: {
      name: '空想上の生き物',
      items: [
        { id: 'dragon', name: 'ドラゴン' },
        { id: 'ryu', name: '龍' },
        { id: 'unicorn', name: 'ユニコーン' },
        { id: 'phoenix', name: 'フェニックス' },
        { id: 'angel', name: '天使' },
        { id: 'demon', name: '悪魔' },
        { id: 'fairy', name: '妖精' },
        { id: 'elf', name: 'エルフ' },
        { id: 'centaur', name: 'ケンタウロス' },
        { id: 'mermaid', name: 'マーメイド' },
        { id: 'griffin', name: 'グリフォン' },
        { id: 'minotaur', name: 'ミノタウロス' },
      ]
    }
  };

  const occupations = [
    '弁護士', '税理士', '司法書士', '行政書士', '社労士', '会計士', '医師', '歯科医師',
    '薬剤師', '獣医師', 'カウンセラー', '整体師', '美容師', 'エステティシャン', 'ネイリスト',
    'マッサージ師', 'トレーナー', '料理人', '水道工事', '電気工事', 'リフォーム', '清掃業',
    '引越し業', '害虫駆除', '不動産', '保険代理店', 'コンサルタント', 'カーディーラー',
    '車検・修理', 'IT企業'
  ];

  const colors = [
    { hex: '#FF1414', name: '赤' },
    { hex: '#4ECDC4', name: '青緑' },
    { hex: '#264AD9', name: '青' },
    { hex: '#16A10C', name: '緑' },
    { hex: '#FECA57', name: '黄' },
    { hex: '#9B59B6', name: '紫' },
    { hex: '#FF9FF3', name: 'ピンク' },
    { hex: '#2C3E50', name: '黒' },
    { hex: '#FFFFFF', name: '白' },
    { hex: '#F39C12', name: '金' },
    { hex: '#95A5A6', name: '銀' },
    { hex: '#FF6348', name: 'オレンジ' },
  ];

  const tones = [
    '真面目・信頼感', 'ポップ・親しみやすい', '和風・伝統的',
    'ジブリ', 'カートゥーン', 'リアル',
  ];

  // ==================== ヘルパー関数 ====================
  const generateMotifString = (): string => {
    if (customMotif.trim()) return customMotif.trim();

    if (activeMotifCategory === 'human') {
      if (selectedGender && selectedAgeGroup) {
        const genderName = motifCategories.human.genders.find(g => g.id === selectedGender)?.name || '';
        const ageName = motifCategories.human.ageGroups.find(a => a.id === selectedAgeGroup)?.name || '';
        return `${genderName}の${ageName}`;
      }
    } else {
      return selectedMotif;
    }

    return '';
  };

  const generatePrompt = (): string => {
    if (isEditingPrompt && customPrompt.trim()) {
      return customPrompt.trim();
    }

    const motif = generateMotifString();
    const occupation = customOccupation || selectedOccupation;
    const tone = customTone || selectedTone;

    return `A ${motif} character working as ${occupation}, wearing ${selectedColor} colored clothing or outfit in ${tone} style, standing upright with both arms spread wide, looking directly at viewer, completely transparent background with no objects or scenery, anthropomorphic hands with exactly 5 fingers on each hand, fingers clearly separated and detailed, does not hold anything in hands, open hands, professional illustration, high quality, detailed character design`;
  };

  const getAutoGeneratedPrompt = (): string => {
    const motif = generateMotifString();
    const occupation = customOccupation || selectedOccupation;
    const tone = customTone || selectedTone;

    return `A ${motif} character working as ${occupation}, wearing ${selectedColor} colored clothing or outfit in ${tone} style, standing upright with both arms spread wide, looking directly at viewer, completely transparent background with no objects or scenery, anthropomorphic hands with exactly 5 fingers on each hand, fingers clearly separated and detailed, does not hold anything in hands, open hands, professional illustration, high quality, detailed character design`;
  };

  const isFormValid = (): boolean => {
    if (isEditingPrompt) {
      return customPrompt.trim().length > 0;
    }

    const hasMotif = generateMotifString().length > 0;
    const hasOccupation = selectedOccupation || customOccupation.trim();
    const hasTone = selectedTone || customTone.trim();
    return !!(hasMotif && hasOccupation && hasTone);
  };

  // ==================== イベントハンドラー ====================
  const handleRandomMotif = (): void => {
    const categories = ['human', 'animal', 'fantasy'] as const;
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];

    setActiveMotifCategory(randomCategory);
    setCustomMotif('');

    if (randomCategory === 'human') {
      const randomGender = motifCategories.human.genders[Math.floor(Math.random() * motifCategories.human.genders.length)];
      const randomAge = motifCategories.human.ageGroups[Math.floor(Math.random() * motifCategories.human.ageGroups.length)];
      setSelectedGender(randomGender.id);
      setSelectedAgeGroup(randomAge.id);
      setSelectedMotif('');
    } else {
      const items = motifCategories[randomCategory].items;
      const random = items[Math.floor(Math.random() * items.length)];
      setSelectedMotif(random.name);
      setSelectedGender('');
      setSelectedAgeGroup('');
    }
  };

  const handleRandomOccupation = (): void => {
    const random = occupations[Math.floor(Math.random() * occupations.length)];
    setSelectedOccupation(random);
    setCustomOccupation('');
  };

  const handleRandomColor = (): void => {
    const random = colors[Math.floor(Math.random() * colors.length)];
    setSelectedColor(random.hex);
  };

  const handleRandomTone = (): void => {
    const random = tones[Math.floor(Math.random() * tones.length)];
    setSelectedTone(random);
    setCustomTone('');
  };

  const handleRandomAll = (): void => {
    handleRandomMotif();
    handleRandomOccupation();
    handleRandomColor();
    handleRandomTone();
  };

  const copyPrompt = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(generatePrompt());
      alert('プロンプトをコピーしました！');
    } catch (err) {
      console.error('コピーに失敗しました:', err);
    }
  };

  /** API Gateway 呼び出し */
  const callCharacterAPI = async (prompt: string): Promise<string> => {
    try {
      const response = await fetch('/api/nano-banana', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          negative_prompt: 'low quality, blurry, bad anatomy, deformed, cropped, out of frame, extra fingers, six fingers, fewer than five fingers, fused fingers, missing fingers, malformed, hands, paws, claws, background objects, scenery, furniture, props, items, decorations, landscape, sky, ground, floor, walls',
          seed: Math.floor(Math.random() * 1000000),
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

  const generateCharacterImages = async (): Promise<void> => {
    if (!isFormValid()) {
      alert('すべての項目を選択してください');
      return;
    }

    setIsGenerating(true);
    setGeneratedImages([]);

    try {
      const basePrompt = generatePrompt();
      const variations = [
        {
          name: '基本',
          suffix: '',
          description: 'basic pose'
        },
        {
          name: '表情変更',
          suffix: ', smiling happily with cheerful expression',
          description: 'happy expression'
        },
        {
          name: '服装変更',
          suffix: ', wearing different style of professional attire',
          description: 'different outfit'
        },
        {
          name: '顔変更',
          suffix: ', with different face',
          description: 'different face'
        },
      ];

      const results: GeneratedImage[] = [];

      for (let i = 0; i < 4; i++) {
        const variation = variations[i];
        const prompt = basePrompt + variation.suffix;

        try {
          let imageUrl: string;

          if (USE_REAL_API) {
            // 実際のAPI呼び出し
            imageUrl = await callCharacterAPI(prompt);
          } else {
            // モック画像生成（2秒の遅延をシミュレート）
            await new Promise(resolve => setTimeout(resolve, 2000));
            const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="white"/><rect x="100" y="150" width="312" height="200" fill="${selectedColor}" opacity="0.8"/><text x="50%" y="40%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="20" fill="#333">${variation.name}</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="14" fill="#666">${generateMotifString()}</text></svg>`;
            imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
          }

          results.push({
            prompt,
            imageUrl,
            index: i,
            selected: false,
          });
        } catch (error) {
          console.error(`バリエーション${i + 1}の生成に失敗:`, error);
          // エラー時のフォールバック画像
          const errorText = `Error: ${i + 1}`;
          const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#ffebee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="16" fill="#c62828">${errorText}</text></svg>`;
          const mockImageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;

          results.push({
            prompt,
            imageUrl: mockImageUrl,
            index: i,
            selected: false,
          });
        }

        setGeneratedImages([...results]);

        // 次のリクエストまで少し待機（API制限回避）
        if (i < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('画像生成処理全体でエラーが発生:', error);
      alert('画像生成中にエラーが発生しました。しばらく待ってから再度お試しください。');
    } finally {
      // 必ずボタンの状態をリセット
      setIsGenerating(false);
    }
  };

  const openModal = (url: string): void => setModalImageUrl(url);
  const closeModal = (): void => setModalImageUrl(null);

  // ==================== JSX ====================
  return (
    <>
      {/* モーダル */}
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
              <X size={16} />
            </button>
            <img src={modalImageUrl} alt="preview" className="max-w-full max-h-[80vh]" />
          </div>
        </div>
      )}

      <div className="p-6">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-center mb-8 text-purple-800">
            <Wand2 className="inline-block mr-3" />
            キャラクターデザイナー
          </h1>

          {/* 設定項目グリッド */}
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* モチーフ選択 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-pink-800 flex items-center">
                  <Users className="mr-2" />
                  モチーフ
                </h3>
                <button
                  onClick={handleRandomMotif}
                  className="p-2 bg-pink-100 text-pink-600 rounded-lg hover:bg-pink-200"
                >
                  <Shuffle size={16} />
                </button>
              </div>

              {/* カスタム入力 */}
              <input
                type="text"
                value={customMotif}
                onChange={(e) => {
                  setCustomMotif(e.target.value);
                  if (e.target.value.trim()) {
                    setSelectedMotif('');
                    setSelectedGender('');
                    setSelectedAgeGroup('');
                  }
                }}
                placeholder="カスタムモチーフを入力..."
                className="w-full p-2 border border-gray-300 rounded focus:border-pink-400 focus:outline-none mb-4"
              />

              {/* カテゴリタブ */}
              <div className="flex border-b border-pink-200 mb-4">
                {Object.entries(motifCategories).map(([key, category]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setActiveMotifCategory(key as 'human' | 'animal' | 'fantasy');
                      setSelectedMotif('');
                      setCustomMotif('');
                      setSelectedGender('');
                      setSelectedAgeGroup('');
                    }}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                      activeMotifCategory === key
                        ? 'border-pink-500 text-pink-700'
                        : 'border-transparent hover:border-pink-300'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              {/* 人間の場合の性別・年齢層選択 */}
              {activeMotifCategory === 'human' && (
                <div className="space-y-4">
                  {/* 性別選択 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">性別</label>
                    <div className="grid grid-cols-3 gap-2">
                      {motifCategories.human.genders.map((gender) => (
                        <button
                          key={gender.id}
                          onClick={() => setSelectedGender(gender.id)}
                          className={`p-2 text-sm rounded border text-center hover:bg-pink-50 ${
                            selectedGender === gender.id
                              ? 'bg-pink-100 border-pink-400 text-pink-800'
                              : 'border-gray-200'
                          }`}
                        >
                          {gender.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 年齢層選択 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">年齢層</label>
                    <div className="grid grid-cols-3 gap-2">
                      {motifCategories.human.ageGroups.map((age) => (
                        <button
                          key={age.id}
                          onClick={() => setSelectedAgeGroup(age.id)}
                          className={`p-2 text-sm rounded border text-center hover:bg-pink-50 ${
                            selectedAgeGroup === age.id
                              ? 'bg-pink-100 border-pink-400 text-pink-800'
                              : 'border-gray-200'
                          }`}
                        >
                          {age.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 動物・空想上の生き物の場合のプリセット選択 */}
              {activeMotifCategory !== 'human' && (
                <div className="grid grid-cols-2 gap-2 mb-4 max-h-40 overflow-y-auto">
                  {motifCategories[activeMotifCategory].items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedMotif(item.name);
                        setCustomMotif('');
                        setSelectedGender('');
                        setSelectedAgeGroup('');
                      }}
                      className={`p-2 text-sm rounded border text-left hover:bg-pink-50 ${
                        selectedMotif === item.name
                          ? 'bg-pink-100 border-pink-400 text-pink-800'
                          : 'border-gray-200'
                      }`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              )}

              {/* 選択中表示 */}
              <div className="mt-2 h-10 flex items-center">
                {generateMotifString() && (
                  <div className="p-2 bg-pink-50 rounded text-sm w-full">
                    選択中: <span className="font-semibold text-pink-700">
                      {generateMotifString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 職業選択 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-green-800 flex items-center">
                  <Briefcase className="mr-2" />
                  職業
                </h3>
                <button
                  onClick={handleRandomOccupation}
                  className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200"
                >
                  <Shuffle size={16} />
                </button>
              </div>
              {/* カスタム入力 */}
              <input
                type="text"
                value={customOccupation}
                onChange={(e) => {
                  setCustomOccupation(e.target.value);
                  if (e.target.value.trim()) setSelectedOccupation('');
                }}
                placeholder="カスタム職業を入力..."
                className="w-full p-2 border border-gray-300 rounded focus:border-green-400 focus:outline-none mb-4"
              />

              {/* プリセット選択 */}
              <div className="grid grid-cols-2 gap-2 mb-4 max-h-40 overflow-y-auto">
                {occupations.map((occupation) => (
                  <button
                    key={occupation}
                    onClick={() => {
                      setSelectedOccupation(occupation);
                      setCustomOccupation('');
                    }}
                    className={`p-2 text-sm rounded border text-left hover:bg-green-50 ${
                      selectedOccupation === occupation
                        ? 'bg-green-100 border-green-400 text-green-800'
                        : 'border-gray-200'
                    }`}
                  >
                    {occupation}
                  </button>
                ))}
              </div>

              {/* 選択中表示 */}
              <div className="mt-2 h-10 flex items-center">
                {(selectedOccupation || customOccupation) && (
                  <div className="p-2 bg-green-50 rounded text-sm w-full">
                    選択中: <span className="font-semibold text-green-700">
                      {customOccupation || selectedOccupation}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* テーマカラー選択 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-orange-800 flex items-center">
                  <Palette className="mr-2" />
                  テーマカラー
                </h3>
                <button
                  onClick={handleRandomColor}
                  className="p-2 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200"
                >
                  <Shuffle size={16} />
                </button>
              </div>
              {/* プリセット色選択 */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {colors.map((color) => (
                  <button
                    key={color.hex}
                    onClick={() => setSelectedColor(color.hex)}
                    className={`w-full h-12 rounded border-2 flex flex-col items-center justify-center text-xs font-semibold ${
                      selectedColor === color.hex
                        ? 'border-orange-400 ring-2 ring-orange-200'
                        : 'border-gray-300 hover:border-orange-300'
                    }`}
                    style={{
                      backgroundColor: color.hex,
                      color: color.hex === '#FFFFFF' || color.hex === '#FECA57' ? '#000' : '#fff'
                    }}
                  >
                    {color.name}
                  </button>
                ))}
              </div>

              {/* HEX入力 */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  placeholder="#FF6B6B"
                  className="flex-1 p-2 border border-gray-300 rounded focus:border-orange-400 focus:outline-none"
                />
                <input
                  type="color"
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                />
              </div>

              {/* 選択中表示 */}
              <div className="h-14 flex items-center">
                <div className="p-3 bg-orange-50 rounded flex items-center gap-3 w-full">
                  <div
                    className="w-8 h-8 rounded border border-gray-300"
                    style={{ backgroundColor: selectedColor }}
                  />
                  <span className="text-sm font-semibold text-orange-700">
                    {selectedColor}
                  </span>
                </div>
              </div>
            </div>

            {/* LPトーン選択 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-purple-800 flex items-center">
                  <Heart className="mr-2" />
                  LPトーン
                </h3>
                <button
                  onClick={handleRandomTone}
                  className="p-2 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-200"
                >
                  <Shuffle size={16} />
                </button>
              </div>
              {/* カスタム入力 */}
              <input
                type="text"
                value={customTone}
                onChange={(e) => {
                  setCustomTone(e.target.value);
                  if (e.target.value.trim()) setSelectedTone('');
                }}
                placeholder="カスタムトーンを入力..."
                className="w-full p-2 border border-gray-300 rounded focus:border-purple-400 focus:outline-none mb-4"
              />

              {/* プリセット選択 */}
              <div className="grid grid-cols-2 gap-2 mb-4 max-h-40 overflow-y-auto">
                {tones.map((tone) => (
                  <button
                    key={tone}
                    onClick={() => {
                      setSelectedTone(tone);
                      setCustomTone('');
                    }}
                    className={`p-2 text-sm rounded border text-left hover:bg-purple-50 ${
                      selectedTone === tone
                        ? 'bg-purple-100 border-purple-400 text-purple-800'
                        : 'border-gray-200'
                    }`}
                  >
                    {tone}
                  </button>
                ))}
              </div>

              {/* 選択中表示 */}
              <div className="mt-2 h-10 flex items-center">
                {(selectedTone || customTone) && (
                  <div className="p-2 bg-purple-50 rounded text-sm w-full">
                    選択中: <span className="font-semibold text-purple-700">
                      {customTone || selectedTone}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* プロンプトプレビュー・編集 */}
          <div className="mb-8 p-4 bg-gray-50 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <h3 className="font-semibold text-gray-700">生成プロンプト</h3>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => {
                    if (!isEditingPrompt) {
                      setCustomPrompt(getAutoGeneratedPrompt());
                    }
                    setIsEditingPrompt(!isEditingPrompt);
                  }}
                  className={`px-3 py-2 rounded text-sm whitespace-nowrap ${
                    isEditingPrompt
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                >
                  {isEditingPrompt ? '自動生成に戻す' : 'プロンプト編集'}
                </button>
                <button
                  onClick={() => void copyPrompt()}
                  className="p-2 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 flex-shrink-0"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>

            <div className="min-h-0">
              {isEditingPrompt ? (
                <div className="space-y-2">
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:border-blue-400 focus:outline-none resize-vertical min-h-[6rem]"
                    rows={4}
                    placeholder="カスタムプロンプトを入力してください..."
                  />
                  <p className="text-xs text-gray-500">
                    プロンプトを直接編集できます。「自動生成に戻す」ボタンで元の自動生成に戻せます。
                  </p>
                </div>
              ) : (
                <div className="min-h-[6rem] flex items-start">
                  <p className="text-sm text-gray-600 break-words leading-relaxed">{generatePrompt()}</p>
                </div>
              )}
            </div>
          </div>

          {/* アクションボタン */}
          <div className="flex flex-wrap gap-4 justify-center mb-8">
            <button
              onClick={handleRandomAll}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center"
            >
              <Dice6 className="mr-2" size={20} />
              全ランダム
            </button>
            <button
              onClick={() => void generateCharacterImages()}
              disabled={!isFormValid() || isGenerating}
              className="px-8 py-3 bg-pink-600 text-white rounded-lg disabled:bg-gray-400 flex items-center"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin h-5 w-5 border-b-2 border-white mr-2" />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2" size={20} />
                  キャラクター生成
                </>
              )}
            </button>
          </div>

          {/* 生成画像一覧 */}
          {generatedImages.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4">生成結果</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {generatedImages.map((img) => (
                  <div key={img.index} className="border rounded-lg shadow-sm hover:shadow-md">
                    <img
                      src={img.imageUrl}
                      alt={img.prompt}
                      className="w-full h-48 object-cover rounded-t-lg cursor-pointer"
                      onClick={() => openModal(img.imageUrl)}
                    />
                    <div className="p-3">
                      <button
                        onClick={() => onCharacterSelect(img)}
                        className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 flex items-center justify-center"
                      >
                        このキャラでポーズ生成
                        <ArrowRight className="ml-2" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CharacterDesigner;
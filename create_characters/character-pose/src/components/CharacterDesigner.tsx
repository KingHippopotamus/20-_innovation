import {
  useState,
  type JSX,
} from 'react';
import {
  Palette,
  User,
  Briefcase,
  Heart,
  Sparkles,
  Play,
  ArrowRight,
  Shuffle,
  Dice6,
  Copy,
} from 'lucide-react';

interface CharacterDesignerProps {
  onCharacterSelect: (imageUrl: string) => void;
  onSwitchTopose: () => void;
}

interface GeneratedCharacter {
  imageUrl: string;
  prompt: string;
  index: number;
}

const CharacterDesigner = ({ onCharacterSelect, onSwitchTopose }: CharacterDesignerProps): JSX.Element => {

  // 階層選択システム
  const [selectedCategory, setSelectedCategory] = useState<'人間' | '動物' | '空想上の生き物' | ''>('');

  // 人間の場合
  const [selectedGender, setSelectedGender] = useState('');
  const [selectedAge, setSelectedAge] = useState('');

  // 動物の場合
  const [selectedAnimal, setSelectedAnimal] = useState('');

  // 空想上の生き物の場合
  const [selectedFantasy, setSelectedFantasy] = useState('');

  // カスタム入力
  const [customMotif, setCustomMotif] = useState('');

  const [selectedJob, setSelectedJob] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedArtStyle, setSelectedArtStyle] = useState('');

  const [customJob, setCustomJob] = useState('');
  const [customColorCode, setCustomColorCode] = useState('#FF6B6B');
  const [customArtStyle, setCustomArtStyle] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCharacters, setGeneratedCharacters] = useState<GeneratedCharacter[]>([]);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);

  // カテゴリ選択肢
  const categoryOptions = ['人間', '動物', '空想上の生き物'];

  // 人間の選択肢
  const genderOptions = ['男性', '女性', 'その他'];
  const ageOptions = ['子供', '青年', '大人', '中年', '老人'];

  // 動物の選択肢
  const animalOptions = [
    '猫', '犬', '狼', '狐', 'うさぎ', '熊',
    'パンダ', 'ライオン', 'トラ', '馬', '鳥', 'ふくろう',
    '鷹', 'ペンギン', 'イルカ', 'サメ', 'ヘビ', 'トカゲ'
  ];

  // 空想上の生き物の選択肢
  const fantasyOptions = [
    'ドラゴン', '龍', 'ユニコーン', 'フェニックス', '天使', '悪魔',
    '妖精', 'エルフ', 'ケンタウロス', 'マーメイド', 'グリフォン', 'ミノタウロス'
  ];

  const jobOptions = [
    '弁護士', '税理士', '司法書士', '行政書士', '社労士', '会計士',
    '医師', '歯科医師', '薬剤師', '獣医師', 'カウンセラー', '整体師',
    '美容師', 'エステティシャン', 'ネイリスト', 'マッサージ師', 'トレーナー', '料理人',
    '水道工事', '電気工事', 'リフォーム', '清掃業', '引越し業', '害虫駆除',
    '不動産', '保険代理店', 'コンサルタント', 'カーディーラー', '車検・修理', 'IT企業'
  ];

  const colorOptions = [
    '赤', '青', '緑', '黄', '紫', 'ピンク',
    '黒', '白', '金', '銀', 'オレンジ', '茶色'
  ];

  const artStyleOptions = [
    '真面目・信頼感', 'ポップ・親しみやすい', '高級感・上品', 'カジュアル・気軽',
    '和風・伝統的', 'モダン・洗練', 'かわいい・癒し系', 'クール・スタイリッシュ',
    'ナチュラル・優しい', 'エネルギッシュ・活発', 'シンプル・ミニマル', 'リッチ・豪華'
  ];

  const generatePrompt = (): string => {
    const parts = [];

    // モチーフ情報の構築
    let motifInfo = '';
    if (customMotif.trim()) {
      motifInfo = customMotif.trim();
    } else if (selectedCategory === '人間') {
      const genderPart = selectedGender ? selectedGender : '';
      const agePart = selectedAge ? selectedAge : '';
      motifInfo = `${agePart}${genderPart}`.trim() || '人間';
    } else if (selectedCategory === '動物') {
      motifInfo = selectedAnimal ? `${selectedAnimal}の擬人化` : '';
    } else if (selectedCategory === '空想上の生き物') {
      motifInfo = selectedFantasy ? `${selectedFantasy}の擬人化` : '';
    }

    const job = customJob.trim() || selectedJob;
    const color = customColorCode !== '#FF6B6B' ? `color ${customColorCode}` : selectedColor;
    const artStyle = customArtStyle.trim() || selectedArtStyle;

    if (motifInfo) parts.push(motifInfo);
    if (job) parts.push(`${job}の`);
    parts.push('キャラクター');
    if (color) parts.push(`、${color}を基調とした配色`);
    if (artStyle) parts.push(`、${artStyle}`);

    const basePrompt = parts.join('');

    return `${basePrompt}, full body character, standing upright with arms spread wide to show both hands clearly, hands with exactly 5 fingers each, no background, transparent background, high quality character design, detailed illustration, 8K`;
  };

  const callFal = async (prompt: string): Promise<string> => {
    // モック画像を返す
    await new Promise(resolve => setTimeout(resolve, 2000));
    const mockSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#f0f8ff"/><text x="256" y="200" text-anchor="middle" fill="#333" font-size="16" font-family="Arial">Mock Character</text><text x="256" y="250" text-anchor="middle" fill="#666" font-size="12" font-family="Arial">${prompt.substring(0, 30)}...</text><circle cx="256" cy="320" r="60" fill="#ff69b4" opacity="0.7"/><circle cx="226" cy="300" r="8" fill="#333"/><circle cx="286" cy="300" r="8" fill="#333"/><path d="M 230 340 Q 256 360 282 340" stroke="#333" stroke-width="3" fill="none"/></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(mockSvg)));
  };

  const randomizeMotif = () => {
    const randomCategoryIndex = Math.floor(Math.random() * categoryOptions.length);
    const randomCategory = categoryOptions[randomCategoryIndex] as '人間' | '動物' | '空想上の生き物';

    setSelectedCategory(randomCategory);
    setCustomMotif('');

    if (randomCategory === '人間') {
      const randomGenderIndex = Math.floor(Math.random() * genderOptions.length);
      const randomAgeIndex = Math.floor(Math.random() * ageOptions.length);
      setSelectedGender(genderOptions[randomGenderIndex]);
      setSelectedAge(ageOptions[randomAgeIndex]);
      setSelectedAnimal('');
      setSelectedFantasy('');
    } else if (randomCategory === '動物') {
      const randomAnimalIndex = Math.floor(Math.random() * animalOptions.length);
      setSelectedAnimal(animalOptions[randomAnimalIndex]);
      setSelectedGender('');
      setSelectedAge('');
      setSelectedFantasy('');
    } else if (randomCategory === '空想上の生き物') {
      const randomFantasyIndex = Math.floor(Math.random() * fantasyOptions.length);
      setSelectedFantasy(fantasyOptions[randomFantasyIndex]);
      setSelectedGender('');
      setSelectedAge('');
      setSelectedAnimal('');
    }
  };

  const randomizeJob = () => {
    const randomIndex = Math.floor(Math.random() * jobOptions.length);
    setSelectedJob(jobOptions[randomIndex]);
    setCustomJob('');
  };

  const randomizeColor = () => {
    const randomIndex = Math.floor(Math.random() * colorOptions.length);
    setSelectedColor(colorOptions[randomIndex]);
    setCustomColorCode('#FF6B6B');
  };

  const randomizeArtStyle = () => {
    const randomIndex = Math.floor(Math.random() * artStyleOptions.length);
    setSelectedArtStyle(artStyleOptions[randomIndex]);
    setCustomArtStyle('');
  };

  const randomizeAll = () => {
    randomizeMotif();
    randomizeJob();
    randomizeColor();
    randomizeArtStyle();
  };

  const generateCharacters = async () => {
    // モチーフチェック
    const hasMotif = customMotif.trim() || selectedCategory;
    if (selectedCategory === '人間' && !(selectedGender && selectedAge)) {
      alert('人間の場合は性別と年齢層を選択してください');
      return;
    }
    if (selectedCategory === '動物' && !selectedAnimal) {
      alert('動物の種類を選択してください');
      return;
    }
    if (selectedCategory === '空想上の生き物' && !selectedFantasy) {
      alert('空想上の生き物の種類を選択してください');
      return;
    }

    const job = customJob.trim() || selectedJob;
    const color = customColorCode !== '#FF6B6B' || selectedColor;
    const artStyle = customArtStyle.trim() || selectedArtStyle;

    if (!hasMotif || !job || !color || !artStyle) {
      alert('4つの項目をすべて設定してください');
      return;
    }


    setIsGenerating(true);
    setGeneratedCharacters([]);

    const basePrompt = generatePrompt();
    const variations = [
      basePrompt,
      `${basePrompt}, different hairstyle`,
      `${basePrompt}, different outfit style`,
      `${basePrompt}, different facial expression`,
    ];

    const results: GeneratedCharacter[] = [];

    for (let i = 0; i < variations.length; i++) {
      try {
        const imageUrl = await callFal(variations[i]);
        results.push({
          imageUrl,
          prompt: variations[i],
          index: i,
        });
        setGeneratedCharacters([...results]);
      } catch (error) {
        console.error('生成エラー:', error);
        const errorSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#ffe6e6"/><text x="256" y="256" text-anchor="middle" dominant-baseline="middle" fill="#666" font-size="20">エラー</text></svg>';
        results.push({
          imageUrl: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(errorSvg))),
          prompt: variations[i],
          index: i,
        });
      }
    }

    setIsGenerating(false);
  };

  const selectCharacterAndSwitch = (imageUrl: string) => {
    onCharacterSelect(imageUrl);
    onSwitchTopose();
  };

  const openModal = (url: string) => setModalImageUrl(url);
  const closeModal = () => setModalImageUrl(null);

  const copyPromptToClipboard = () => {
    const prompt = generatePrompt();
    navigator.clipboard.writeText(prompt).then(() => {
      alert('プロンプトをクリップボードにコピーしました！');
    }).catch(() => {
      alert('コピーに失敗しました');
    });
  };

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
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              className="absolute -right-3 -top-3 w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shadow"
            >
              ×
            </button>
            <img src={modalImageUrl} alt="キャラクター詳細" className="max-w-full max-h-[80vh]" />
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-7xl mx-auto border border-gray-100">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            <Sparkles className="inline-block mr-3 text-purple-600" size={32} />
            キャラクターデザイン
          </h1>
          <p className="text-gray-600 text-lg">4つの要素を組み合わせてオリジナルキャラクターを作成</p>
        </div>

        {/* 全体ランダム生成ボタン */}
        <div className="mb-8 text-center">
          <button
            onClick={randomizeAll}
            className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 flex items-center mx-auto shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
          >
            <Dice6 className="mr-3" size={24} />
            すべてランダム生成
          </button>
        </div>

        {/* 4項目選択 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* モチーフ選択 */}
          <section className="p-6 bg-pink-50 rounded-xl border border-pink-200">
            <header className="flex items-center justify-between mb-5">
              <div className="flex items-center">
                <Heart className="mr-3 text-pink-600" size={24} />
                <h3 className="text-xl font-bold text-pink-800">モチーフ</h3>
              </div>
              <button
                onClick={randomizeMotif}
                className="p-3 bg-pink-200 hover:bg-pink-300 rounded-full transition-colors shadow-sm"
                title="ランダム選択"
              >
                <Shuffle size={18} className="text-pink-700" />
              </button>
            </header>

            {/* カスタム入力（最上部） */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-pink-700 mb-2">
                フリー入力
              </label>
              <input
                type="text"
                placeholder="例: ロボット、宇宙人、忍者、魔法使い..."
                value={customMotif}
                onChange={e => setCustomMotif(e.target.value)}
                className="w-full p-4 border-2 border-pink-300 rounded-xl text-sm bg-white shadow-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all"
              />
            </div>

            {!customMotif && (
              <>
                {/* 区切り線 */}
                <div className="flex items-center mb-5">
                  <div className="flex-1 border-t border-pink-200"></div>
                  <span className="px-3 text-sm text-pink-600 bg-pink-50">または以下から選択</span>
                  <div className="flex-1 border-t border-pink-200"></div>
                </div>

                {/* カテゴリ選択 */}
                <div className="mb-5">
                  <h4 className="text-sm font-semibold text-pink-700 mb-3">カテゴリ</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {categoryOptions.map(option => (
                      <button
                        key={option}
                        onClick={() => {
                          setSelectedCategory(option as '人間' | '動物' | '空想上の生き物');
                          setSelectedGender('');
                          setSelectedAge('');
                          setSelectedAnimal('');
                          setSelectedFantasy('');
                        }}
                        className={`p-3 text-sm font-medium rounded-lg transition-all ${
                          selectedCategory === option
                            ? 'bg-pink-600 text-white shadow-md'
                            : 'bg-white border border-pink-200 hover:bg-pink-100 hover:border-pink-300'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 詳細選択 - カテゴリが選択された場合のみ表示 */}
                {selectedCategory && (
                  <>
                    {selectedCategory === '人間' && (
                      <div className="space-y-5">
                        {/* 選択組み合わせプレビュー */}
                        {(selectedGender || selectedAge) && (
                          <div className="p-4 bg-pink-100 rounded-xl border border-pink-200">
                            <div className="text-sm font-medium text-pink-700 mb-2">選択中の組み合わせ</div>
                            <div className="text-pink-800 font-semibold text-lg">
                              {selectedAge || "年齢層"} × {selectedGender || "性別"}
                              {selectedAge && selectedGender && (
                                <span className="ml-3 text-pink-600 text-base">→ {selectedAge}{selectedGender}</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 性別選択 */}
                        <div>
                          <h4 className="text-sm font-semibold text-pink-700 mb-3 flex items-center">
                            <span className="w-3 h-3 bg-pink-500 rounded-full mr-2"></span>
                            1. 性別を選択してください
                          </h4>
                          <div className="grid grid-cols-3 gap-3">
                            {genderOptions.map(option => (
                              <button
                                key={option}
                                onClick={() => setSelectedGender(option)}
                                className={`p-4 text-sm font-medium rounded-xl transition-all ${
                                  selectedGender === option
                                    ? 'bg-pink-500 text-white shadow-lg border-2 border-pink-500'
                                    : 'bg-white border-2 border-pink-200 hover:bg-pink-50 hover:border-pink-300'
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 年齢層選択 */}
                        <div>
                          <h4 className="text-sm font-semibold text-pink-700 mb-3 flex items-center">
                            <span className="w-3 h-3 bg-pink-500 rounded-full mr-2"></span>
                            2. 年齢層を選択してください
                          </h4>
                          <div className="grid grid-cols-3 gap-3">
                            {ageOptions.map(option => (
                              <button
                                key={option}
                                onClick={() => setSelectedAge(option)}
                                className={`p-4 text-sm font-medium rounded-xl transition-all ${
                                  selectedAge === option
                                    ? 'bg-pink-500 text-white shadow-lg border-2 border-pink-500'
                                    : 'bg-white border-2 border-pink-200 hover:bg-pink-50 hover:border-pink-300'
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedCategory === '動物' && (
                      <div>
                        <h4 className="text-sm font-semibold text-pink-700 mb-4 flex items-center">
                          <span className="w-3 h-3 bg-pink-500 rounded-full mr-2"></span>
                          動物の種類を選択してください
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                          {animalOptions.map(option => (
                            <button
                              key={option}
                              onClick={() => setSelectedAnimal(option)}
                              className={`p-3 text-sm font-medium rounded-xl transition-all ${
                                selectedAnimal === option
                                  ? 'bg-pink-500 text-white shadow-lg border-2 border-pink-500'
                                  : 'bg-white border-2 border-pink-200 hover:bg-pink-50 hover:border-pink-300'
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedCategory === '空想上の生き物' && (
                      <div>
                        <h4 className="text-sm font-semibold text-pink-700 mb-4 flex items-center">
                          <span className="w-3 h-3 bg-pink-500 rounded-full mr-2"></span>
                          空想上の生き物を選択してください
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                          {fantasyOptions.map(option => (
                            <button
                              key={option}
                              onClick={() => setSelectedFantasy(option)}
                              className={`p-3 text-sm font-medium rounded-xl transition-all ${
                                selectedFantasy === option
                                  ? 'bg-pink-500 text-white shadow-lg border-2 border-pink-500'
                                  : 'bg-white border-2 border-pink-200 hover:bg-pink-50 hover:border-pink-300'
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>

          {/* 職業 */}
          <section className="p-6 bg-green-50 rounded-xl border border-green-200">
            <header className="flex items-center justify-between mb-5">
              <div className="flex items-center">
                <Briefcase className="mr-3 text-green-600" size={24} />
                <h3 className="text-xl font-bold text-green-800">職業</h3>
              </div>
              <button
                onClick={randomizeJob}
                className="p-3 bg-green-200 hover:bg-green-300 rounded-full transition-colors shadow-sm"
                title="ランダム選択"
              >
                <Shuffle size={18} className="text-green-700" />
              </button>
            </header>

            {/* カスタム入力（最上部） */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-green-700 mb-2">
                フリー入力
              </label>
              <input
                type="text"
                placeholder="例: デザイナー、プログラマー、営業..."
                value={customJob}
                onChange={e => setCustomJob(e.target.value)}
                className="w-full p-4 border-2 border-green-300 rounded-xl text-sm bg-white shadow-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
              />
            </div>

            {!customJob && (
              <>
                {/* 区切り線 */}
                <div className="flex items-center mb-5">
                  <div className="flex-1 border-t border-green-200"></div>
                  <span className="px-3 text-sm text-green-600 bg-green-50">または以下から選択</span>
                  <div className="flex-1 border-t border-green-200"></div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {jobOptions.map(option => (
                    <button
                      key={option}
                      onClick={() => {setSelectedJob(option); setCustomJob('');}}
                      className={`p-3 text-sm font-medium rounded-lg transition-all ${
                        selectedJob === option && !customJob
                          ? 'bg-green-600 text-white shadow-md'
                          : 'bg-white border border-green-200 hover:bg-green-100 hover:border-green-300'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* テーマカラー */}
          <section className="p-6 bg-orange-50 rounded-xl border border-orange-200">
            <header className="flex items-center justify-between mb-5">
              <div className="flex items-center">
                <Palette className="mr-3 text-orange-600" size={24} />
                <h3 className="text-xl font-bold text-orange-800">テーマカラー</h3>
              </div>
              <button
                onClick={randomizeColor}
                className="p-3 bg-orange-200 hover:bg-orange-300 rounded-full transition-colors shadow-sm"
                title="ランダム選択"
              >
                <Shuffle size={18} className="text-orange-700" />
              </button>
            </header>

            {/* カラーピッカー（最上部） */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-orange-700 mb-2">
                カスタムカラー
              </label>
              <div className="flex gap-3">
                <input
                  type="color"
                  value={customColorCode}
                  onChange={e => setCustomColorCode(e.target.value)}
                  className="w-16 h-12 border-2 border-orange-300 rounded-xl cursor-pointer shadow-sm"
                />
                <input
                  type="text"
                  placeholder="#FF6B6B"
                  value={customColorCode}
                  onChange={e => setCustomColorCode(e.target.value)}
                  className="flex-1 p-4 border-2 border-orange-300 rounded-xl text-sm font-mono bg-white shadow-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                />
              </div>
            </div>

            {customColorCode === '#FF6B6B' && (
              <>
                {/* 区切り線 */}
                <div className="flex items-center mb-5">
                  <div className="flex-1 border-t border-orange-200"></div>
                  <span className="px-3 text-sm text-orange-600 bg-orange-50">または以下から選択</span>
                  <div className="flex-1 border-t border-orange-200"></div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {colorOptions.map(option => (
                    <button
                      key={option}
                      onClick={() => {setSelectedColor(option); setCustomColorCode('#FF6B6B');}}
                      className={`p-3 text-sm font-medium rounded-lg transition-all ${
                        selectedColor === option && customColorCode === '#FF6B6B'
                          ? 'bg-orange-600 text-white shadow-md'
                          : 'bg-white border border-orange-200 hover:bg-orange-100 hover:border-orange-300'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* LPトーン */}
          <section className="p-6 bg-purple-50 rounded-xl border border-purple-200">
            <header className="flex items-center justify-between mb-5">
              <div className="flex items-center">
                <User className="mr-3 text-purple-600" size={24} />
                <h3 className="text-xl font-bold text-purple-800">LPトーン</h3>
              </div>
              <button
                onClick={randomizeArtStyle}
                className="p-3 bg-purple-200 hover:bg-purple-300 rounded-full transition-colors shadow-sm"
                title="ランダム選択"
              >
                <Shuffle size={18} className="text-purple-700" />
              </button>
            </header>

            {/* カスタム入力（最上部） */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-purple-700 mb-2">
                フリー入力
              </label>
              <input
                type="text"
                placeholder="例: エレガント、力強い、ミステリアス..."
                value={customArtStyle}
                onChange={e => setCustomArtStyle(e.target.value)}
                className="w-full p-4 border-2 border-purple-300 rounded-xl text-sm bg-white shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
            </div>

            {!customArtStyle && (
              <>
                {/* 区切り線 */}
                <div className="flex items-center mb-5">
                  <div className="flex-1 border-t border-purple-200"></div>
                  <span className="px-3 text-sm text-purple-600 bg-purple-50">または以下から選択</span>
                  <div className="flex-1 border-t border-purple-200"></div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {artStyleOptions.map(option => (
                    <button
                      key={option}
                      onClick={() => {setSelectedArtStyle(option); setCustomArtStyle('');}}
                      className={`p-3 text-sm font-medium rounded-lg transition-all ${
                        selectedArtStyle === option && !customArtStyle
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-white border border-purple-200 hover:bg-purple-100 hover:border-purple-300'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        {/* 選択状況表示 */}
        {(customMotif || selectedCategory || customJob || selectedJob || customColorCode !== '#FF6B6B' || selectedColor || customArtStyle || selectedArtStyle) && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-semibold text-gray-700 mb-2">選択中の要素:</h4>
            <div className="flex flex-wrap gap-2">
              {/* モチーフ表示 */}
              {customMotif && (
                <span className="px-3 py-1 bg-pink-200 text-pink-800 rounded-full text-sm">
                  {customMotif}
                </span>
              )}
              {!customMotif && selectedCategory === '人間' && (selectedGender || selectedAge) && (
                <span className="px-3 py-1 bg-pink-200 text-pink-800 rounded-full text-sm">
                  {selectedAge}{selectedGender}
                </span>
              )}
              {!customMotif && selectedCategory === '動物' && selectedAnimal && (
                <span className="px-3 py-1 bg-pink-200 text-pink-800 rounded-full text-sm">
                  {selectedAnimal}の擬人化
                </span>
              )}
              {!customMotif && selectedCategory === '空想上の生き物' && selectedFantasy && (
                <span className="px-3 py-1 bg-pink-200 text-pink-800 rounded-full text-sm">
                  {selectedFantasy}の擬人化
                </span>
              )}

              {(customJob || selectedJob) && (
                <span className="px-3 py-1 bg-green-200 text-green-800 rounded-full text-sm">
                  {customJob || selectedJob}
                </span>
              )}
              {(customColorCode !== '#FF6B6B' || selectedColor) && (
                <span className="px-3 py-1 bg-orange-200 text-orange-800 rounded-full text-sm">
                  {customColorCode !== '#FF6B6B' ? customColorCode : selectedColor}
                </span>
              )}
              {(customArtStyle || selectedArtStyle) && (
                <span className="px-3 py-1 bg-purple-200 text-purple-800 rounded-full text-sm">
                  {customArtStyle || selectedArtStyle}
                </span>
              )}
            </div>
          </div>
        )}

        {/* デバッグ: 最終プロンプト表示 */}
        {(customMotif || selectedCategory || customJob || selectedJob || customColorCode !== '#FF6B6B' || selectedColor || customArtStyle || selectedArtStyle) && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-yellow-800">🐛 デバッグ: 生成プロンプト</h4>
              <button
                onClick={copyPromptToClipboard}
                className="flex items-center px-3 py-1 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded text-sm transition-colors"
                title="プロンプトをコピー"
              >
                <Copy size={14} className="mr-1" />
                コピー
              </button>
            </div>
            <div className="bg-white p-3 rounded border font-mono text-sm text-gray-800 whitespace-pre-wrap break-words">
              {generatePrompt()}
            </div>
          </div>
        )}

        {/* 生成ボタン */}
        <div className="mb-10 flex justify-center">
          <button
            onClick={generateCharacters}
            disabled={isGenerating || (
              !(customMotif || (
                selectedCategory && (
                  (selectedCategory === '人間' && selectedGender && selectedAge) ||
                  (selectedCategory === '動物' && selectedAnimal) ||
                  (selectedCategory === '空想上の生き物' && selectedFantasy)
                )
              )) ||
              !(customJob || selectedJob) ||
              !(customColorCode !== '#FF6B6B' || selectedColor) ||
              !(customArtStyle || selectedArtStyle)
            )}
            className="px-10 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-lg font-semibold rounded-xl disabled:bg-gray-400 disabled:from-gray-400 disabled:to-gray-400 flex items-center shadow-lg hover:shadow-xl transition-all transform hover:scale-105 disabled:transform-none disabled:hover:scale-100"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin h-6 w-6 border-2 border-b-transparent border-white rounded-full mr-3" />
                キャラクター生成中...
              </>
            ) : (
              <>
                <Play className="mr-3" size={24} />
                キャラクターを生成
              </>
            )}
          </button>
        </div>

        {/* 生成結果 */}
        {generatedCharacters.length > 0 && (
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">生成されたキャラクター</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {generatedCharacters.map(character => (
                <div key={character.index} className="relative border-2 border-gray-200 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105 overflow-hidden">
                  <img
                    src={character.imageUrl}
                    alt={`キャラクター ${character.index + 1}`}
                    className="w-full h-auto object-cover cursor-pointer"
                    onClick={() => openModal(character.imageUrl)}
                  />
                  <div className="p-4">
                    <button
                      onClick={() => selectCharacterAndSwitch(character.imageUrl)}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-semibold rounded-lg py-3 flex items-center justify-center transition-all transform hover:scale-105"
                    >
                      このキャラでポーズ生成
                      <ArrowRight className="ml-2" size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
};

export default CharacterDesigner;
/**
 * アプリケーションのルートコンポーネント
 * タブナビゲーション機能とデータ連携機能を提供
 *
 * @returns JSX.Element
 */

import { useState, type JSX } from 'react';
import CharacterPoseGenerator from "./components/CharacterPoseGenerator";
import CharacterDesigner from "./components/CharacterDesigner";
import FingerFixTab from "./components/FingerFixTab";

interface GeneratedImage {
  prompt: string;
  imageUrl: string;
  index: number;
  selected: boolean;
}

type ActiveTab = 'design' | 'pose' | 'fix';

const App: React.FC = (): JSX.Element => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('design');
    const [designedCharacter, setDesignedCharacter] = useState<GeneratedImage | null>(null);
    const [fingerFixImageUrl, setFingerFixImageUrl] = useState<string | null>(null);

    const handleCharacterSelect = (character: GeneratedImage): void => {
        setDesignedCharacter(character);
        setActiveTab('pose');
    };

    const handleOpenFingerFix = (imageUrl: string): void => {
        setFingerFixImageUrl(imageUrl);
        setActiveTab('fix');
    };

    return (
        <div className="min-h-screen w-screen bg-gradient-to-br from-purple-50 to-pink-50">
            <div className="max-w-7xl mx-auto">
                {/* タブナビゲーション */}
                <div className="flex justify-center p-6">
                    <div className="bg-white rounded-lg shadow-md p-1 flex">
                        <button
                            onClick={() => setActiveTab('design')}
                            className={`px-6 py-3 rounded-md font-semibold transition-all ${
                                activeTab === 'design'
                                    ? 'bg-purple-600 text-white shadow-md'
                                    : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            キャラデザイナー
                        </button>
                        <button
                            onClick={() => setActiveTab('pose')}
                            className={`px-6 py-3 rounded-md font-semibold transition-all ${
                                activeTab === 'pose'
                                    ? 'bg-purple-600 text-white shadow-md'
                                    : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            ポーズ生成
                        </button>
                        <button
                            onClick={() => setActiveTab('fix')}
                            className={`px-6 py-3 rounded-md font-semibold transition-all ${
                                activeTab === 'fix'
                                    ? 'bg-orange-600 text-white shadow-md'
                                    : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            指修正
                        </button>
                    </div>
                </div>

                {/* タブコンテンツ */}
                {activeTab === 'design' && (
                    <CharacterDesigner onCharacterSelect={handleCharacterSelect} />
                )}
                {activeTab === 'pose' && (
                    <CharacterPoseGenerator designedCharacter={designedCharacter} onOpenFingerFix={handleOpenFingerFix} />
                )}
                {activeTab === 'fix' && (
                    <FingerFixTab initialImageUrl={fingerFixImageUrl} onImageConsumed={() => setFingerFixImageUrl(null)} />
                )}
            </div>
        </div>
    );
};

export default App;

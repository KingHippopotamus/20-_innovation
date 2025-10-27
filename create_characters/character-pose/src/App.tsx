/**
 * アプリケーションのルートコンポーネント
 *
 * @returns JSX.Element
 */

import { useState } from "react";
import CharacterPoseGenerator from "./components/CharacterPoseGenerator";
import CharacterDesigner from "./components/CharacterDesigner";

const App: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'design' | 'pose'>('design');
    const [designedCharacter, setDesignedCharacter] = useState<string | null>(null);

    return (
        <div className="w-screen min-h-screen bg-gradient-to-br from-purple-50 to-pink-50">
            {/* タブナビゲーション */}
            <div className="bg-white shadow-md">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex space-x-8">
                        <button
                            onClick={() => setActiveTab('design')}
                            className={`py-4 px-6 border-b-2 font-medium text-sm ${
                                activeTab === 'design'
                                    ? 'border-purple-500 text-purple-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            キャラクターデザイン
                        </button>
                        <button
                            onClick={() => setActiveTab('pose')}
                            className={`py-4 px-6 border-b-2 font-medium text-sm ${
                                activeTab === 'pose'
                                    ? 'border-purple-500 text-purple-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            ポーズ生成
                        </button>
                    </div>
                </div>
            </div>

            {/* タブコンテンツ */}
            <div className="p-6">
                {activeTab === 'design' && (
                    <CharacterDesigner
                        onCharacterSelect={setDesignedCharacter}
                        onSwitchTopose={() => setActiveTab('pose')}
                    />
                )}
                {activeTab === 'pose' && (
                    <CharacterPoseGenerator
                        initialCharacterImage={designedCharacter}
                    />
                )}
            </div>
        </div>
    );
};

export default App;

/**
 * キャラクターポーズ生成コンポーネント
 * - 画像をアップロードし、ポーズごとに FAL.ai Instant Character でキャラポーズ画像を生成
 * - 生成画像を ZIP で一括ダウンロード
 *
 * @packageDocumentation
 */

import { useState, useRef } from 'react';
import type { ChangeEvent, JSX } from 'react';
import {
    Upload,
    Download,
    Plus,
    Trash2,
    Play,
    Settings,
    Image as ImageIcon,
} from 'lucide-react';
import { fal } from '@fal-ai/client';

/** 生成済み画像オブジェクトの型 */
interface GeneratedImage {
    prompt: string;
    imageUrl: string;
    index: number;
}

/**
 * キャラクターポーズ生成機能
 *
 * @return JSX.Element
 * @throws Error 画像変換や API 失敗時
 */
const CharacterPoseGenerator = (): JSX.Element => {
    const [apiKey, setApiKey] = useState<string>(import.meta.env.VITE_FAL_KEY ?? '');
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
    const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
    const [progress, setProgress] = useState<number>(0);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    /** 画像選択時の処理 */
    const handleImageUpload = (event: ChangeEvent<HTMLInputElement>): void => {
        const file: File | undefined = event.target.files?.[0];
        if (!file) return;
        setSelectedImage(file);
        const reader: FileReader = new FileReader();
        reader.onload = (e): void => {
            if (typeof e.target?.result === 'string') {
                setImagePreview(e.target.result);
            }
        };
        reader.readAsDataURL(file);
    };

    /** プロンプト追加 */
    const addPrompt = (): void => {
        const trimmed: string = newPrompt.trim();
        if (trimmed && !posePrompts.includes(trimmed)) {
            setPosePrompts([...posePrompts, trimmed]);
            setNewPrompt('');
        }
    };

    /** プロンプト削除 */
    const removePrompt = (index: number): void => {
        setPosePrompts(posePrompts.filter((_, i): boolean => i !== index));
    };

    /** 画像を Base64 へ変換 */
    const convertImageToBase64 = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader: FileReader = new FileReader();
            reader.onload = (): void => {
                if (typeof reader.result === 'string') resolve(reader.result);
                else reject(new Error('画像の Base64 変換に失敗しました'));
            };
            reader.onerror = (): void => reject(reader.error);
            reader.readAsDataURL(file);
        });

    /** FAL.ai Instant Character 呼び出し */
    const callFalAPI = async (prompt: string, imageB64: string): Promise<string> => {
        fal.config({ credentials: apiKey });
        const { data } = await fal.subscribe('fal-ai/instant-character', {
            input: {
                prompt: `A character ${prompt}, both hands clearly show five distinct fingers, correct anatomy, high quality illustration`,
                image_url: imageB64,
                negative_prompt: 'extra fingers, six fingers, deformed hand, blurry, nsfw',
                output_format: 'png',
                guidance_scale: 9,
                num_images: 1,
            },
            logs: true,
        });
        return (data as { images: { url: string }[] }).images[0].url;
    };

    /** 画像生成メイン処理 */
    const generatePoseImages = async (): Promise<void> => {
        if (!selectedImage || posePrompts.length === 0) {
            alert('画像とポーズプロンプトを設定してください');
            return;
        }
        if (!apiKey) {
            alert('FAL.ai API キーを入力してください');
            return;
        }

        setIsGenerating(true);
        setGeneratedImages([]);
        setProgress(0);

        try {
            const imageBase64: string = await convertImageToBase64(selectedImage);
            const results: GeneratedImage[] = [];

            for (let i = 0; i < posePrompts.length; i++) {
                const prompt: string = posePrompts[i];

                try {
                    const imageUrl: string = await callFalAPI(prompt, imageBase64);
                    results.push({ prompt, imageUrl, index: i });
                } catch (err) {
                    console.error(`"${prompt}" の生成失敗:`, err);
                    results.push({
                        prompt,
                        index: i,
                        imageUrl:
                            'data:image/svg+xml;base64,' +
                            btoa(
                                `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#ffebee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="16" fill="#c62828">Error</text></svg>`,
                            ),
                    });
                }

                setProgress(((i + 1) / posePrompts.length) * 100);
                setGeneratedImages([...results]);
                await new Promise((r): number => window.setTimeout(r, 300));
            }
        } finally {
            setIsGenerating(false);
        }
    };

    /** 生成済み画像を ZIP ダウンロード */
    const downloadAsZip = async (): Promise<void> => {
        if (generatedImages.length === 0) {
            alert('ダウンロードする画像がありません');
            return;
        }

        const files: { name: string; blob: Blob }[] = [];
        for (const img of generatedImages) {
            try {
                const res: Response = await fetch(img.imageUrl);
                files.push({
                    name: `pose_${img.index + 1}.png`,
                    blob: await res.blob(),
                });
            } catch (err) {
                console.error('画像取得失敗:', err);
            }
        }

        const list: string =
            'ZIP Archive\n' + files.map((f): string => `- ${f.name}`).join('\n');
        const zip: Blob = new Blob([list], { type: 'text/plain' });
        const url: string = URL.createObjectURL(zip);
        const a: HTMLAnchorElement = document.createElement('a');
        a.href = url;
        a.download = 'character_poses.zip';
        a.click();
        URL.revokeObjectURL(url);
    };

    /* ---------- JSX ---------- */
    return (
        <div className="max-w-6xl mx-auto p-6 bg-gradient-to-br from-purple-50 to-pink-50 min-h-screen">
            <div className="bg-white rounded-xl shadow-lg p-8">
                <h1 className="text-3xl font-bold text-center mb-8 text-purple-800">
                    <ImageIcon className="inline-block mr-3" />
                    キャラクターポーズ生成機能
                </h1>

                {/* API キー入力 */}
                <section className="mb-8 p-4 bg-blue-50 rounded-lg">
                    <header className="flex items-center mb-3">
                        <Settings className="mr-2 text-blue-600" />
                        <h2 className="text-lg font-semibold text-blue-800">API 設定</h2>
                    </header>
                    <input
                        type="password"
                        placeholder="FAL.ai API キーを入力"
                        value={apiKey}
                        onChange={(e): void => setApiKey(e.target.value)}
                        className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    />
                </section>

                {/* 画像アップロード */}
                <section className="mb-8 p-4 bg-green-50 rounded-lg">
                    <header className="flex items-center mb-3">
                        <Upload className="mr-2 text-green-600" />
                        <h2 className="text-lg font-semibold text-green-800">キャラクター画像</h2>
                    </header>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <input
                                type="file"
                                accept="image/*"
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                                className="hidden"
                            />
                            <button
                                onClick={(): void => fileInputRef.current?.click()}
                                className="w-full p-3 border-2 border-dashed border-green-300 rounded-lg hover:border-green-500 hover:bg-green-100 transition-colors"
                            >
                                画像をアップロード
                            </button>
                        </div>
                        {imagePreview && (
                            <div className="w-32 h-32 rounded-lg overflow-hidden border-2 border-green-300">
                                <img
                                    src={imagePreview}
                                    alt="プレビュー"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                    </div>
                </section>

                {/* ポーズプロンプト入力 */}
                <section className="mb-8 p-4 bg-yellow-50 rounded-lg">
                    <h2 className="text-lg font-semibold mb-3 text-yellow-800">
                        ポーズプロンプト管理
                    </h2>

                    <div className="flex gap-2 mb-4">
                        <input
                            type="text"
                            placeholder="新しいポーズを追加"
                            value={newPrompt}
                            onChange={(e): void => setNewPrompt(e.target.value)}
                            onKeyDown={(e): void => {
                                if (e.key === 'Enter') addPrompt();
                            }}
                            className="flex-1 p-2 border border-yellow-300 rounded focus:ring-2 focus:ring-yellow-400"
                        />
                        <button
                            onClick={addPrompt}
                            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                        {posePrompts.map((prompt: string, index: number): JSX.Element => (
                            <div
                                key={index}
                                className="flex items-center justify-between p-2 bg-white rounded border"
                            >
                                <span className="text-sm flex-1">{prompt}</span>
                                <button
                                    onClick={(): void => removePrompt(index)}
                                    className="ml-2 text-red-500 hover:text-red-700"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <p className="text-sm text-yellow-700 mt-2">
                        現在のポーズ数: {posePrompts.length}
                    </p>
                </section>

                {/* 生成ボタン */}
                <div className="mb-8 text-center">
                    <button
                        onClick={generatePoseImages}
                        disabled={
                            isGenerating || !apiKey || !selectedImage || posePrompts.length === 0
                        }
                        className="px-8 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center mx-auto"
                    >
                        {isGenerating ? (
                            <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                                生成中... {Math.round(progress)}%
                            </>
                        ) : (
                            <>
                                <Play className="mr-2" size={20} />
                                ポーズ画像を生成
                            </>
                        )}
                    </button>
                </div>

                {/* 進捗バー */}
                {isGenerating && (
                    <div className="mb-8">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <p className="text-center text-sm text-gray-600 mt-2">
                            {Math.round(progress)}% 完了
                        </p>
                    </div>
                )}

                {/* 生成画像一覧 & ZIP ダウンロード */}
                {generatedImages.length > 0 && (
                    <section className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">生成された画像</h2>
                            <button
                                onClick={downloadAsZip}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
                            >
                                <Download className="mr-2" size={16} />
                                ZIP ダウンロード
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {generatedImages.map(
                                (image: GeneratedImage): JSX.Element => (
                                    <figure
                                        key={image.index}
                                        className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                                    >
                                        <img
                                            src={image.imageUrl}
                                            alt={image.prompt}
                                            className="w-full h-32 object-cover"
                                        />
                                        <figcaption className="p-2">
                                            <p
                                                className="text-xs text-gray-600 truncate"
                                                title={image.prompt}
                                            >
                                                {image.prompt}
                                            </p>
                                        </figcaption>
                                    </figure>
                                ),
                            )}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};

export default CharacterPoseGenerator;

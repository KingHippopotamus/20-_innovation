/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{ts,tsx,js,jsx}",   // ← TSX/TS を必ず含める
    ],
    theme: { extend: {} },
    plugins: [],
};

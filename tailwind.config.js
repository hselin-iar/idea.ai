/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: "class",
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "#2a2826",
                foreground: "#e6e2dd",
                primary: "#2b8cee",
                "background-light": "#f0efeb",
                "background-dark": "#2a2826",
                "surface-light": "#e6e2dd",
                "surface-dark": "#35322e",
                "text-main": "#3e3c38",
                "text-muted": "#75716b",
                "card-green": "#2c2f2a",
            },
            fontFamily: {
                display: ["Space Grotesk", "sans-serif"],
                sans: ["Space Grotesk", "sans-serif"],
            },
            boxShadow: {
                'neumorphic': '9px 9px 18px #d1d0cd, -9px -9px 18px #ffffff',
                'neumorphic-pressed': 'inset 6px 6px 12px #d1d0cd, inset -6px -6px 12px #ffffff',
                'neumorphic-sm': '5px 5px 10px #d1d0cd, -5px -5px 10px #ffffff',
                'neumorphic-dark': '9px 9px 18px #1f1e1c, -9px -9px 18px #35322e',
                'engraved': 'inset 3px 3px 6px #1f1e1c, inset -3px -3px 6px #35322e',
                'raised': '6px 6px 12px #1f1e1c, -6px -6px 12px #35322e',
            },
            backgroundImage: {
                'noise': "url('data:image/svg+xml;utf8,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22 opacity=%220.08%22/%3E%3C/svg%3E')",
                // Removed low-res paper texture, relying on SVG noise for high-definition texture
                'paper': "none",
            }
        },
    },
    plugins: [],
};

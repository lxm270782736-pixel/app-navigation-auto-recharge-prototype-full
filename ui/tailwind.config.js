/** @type {import('tailwindcss').Config} */
// Lib build sets BUILD_MODE=lib (see package.json scripts). In that mode we
// DO NOT scan @astribot/ui, because the host shell bundles its own utilities
// for those components — scanning here just bloats dist/style.css.
// Standalone / dev builds scan it so Switch/Button etc. render correctly.
const isLib = process.env.BUILD_MODE === 'lib';

export default {
  darkMode: ['class'],
  content: isLib
    ? ['./src/**/*.{ts,tsx}']
    : [
        './src/**/*.{ts,tsx}',
        './node_modules/@astribot/ui/dist/**/*.js',
      ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"HarmonyOS Sans SC"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};

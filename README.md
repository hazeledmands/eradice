[![Netlify Status](https://api.netlify.com/api/v1/badges/cceb37a8-0728-4c72-a6d0-ad27c1d4468d/deploy-status)](https://app.netlify.com/sites/eradice/deploys)

# Eradice - Dice Roller

A modern dice roller application built with Next.js and React. Roll dice with custom modifiers and watch them animate in real-time with beautiful visual effects.

## Features

- 🎲 Roll multiple dice at once (e.g., "3d+2")
- ✨ Animated dice rolling with smooth transitions
- 🔥 Exploding dice mechanics
- 📊 Roll history ledger
- 🎨 Modern UI with glassmorphism effects
- 📱 Responsive design for mobile and desktop

## Tech Stack

- **Next.js 14** - React framework for production
- **React 18** - UI library
- **CSS Modules** - Scoped styling
- **random-js** - Cryptographically secure random number generation

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- Yarn or npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/hazeledmands/eradice.git
cd eradice
```

2. Install dependencies:
```bash
yarn install
```

### Development

Run the development server:

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

### Build

Build the application for production:

```bash
yarn build
```

This creates an optimized production build in the `.next` folder.

### Start Production Server

Start the production server locally:

```bash
yarn start
```

Runs the production build locally on [http://localhost:3000](http://localhost:3000).

### Lint

Run ESLint to check for code issues:

```bash
yarn lint
```

## Usage

Enter dice notation in the input field:
- `3d` - Roll 3 dice
- `3d+2` - Roll 3 dice and add 2 to the result
- The last die is an exploding die that can trigger additional rolls

## Project Structure

```
eradice/
├── components/          # React components
│   └── Roller.js       # Main dice roller component
├── pages/              # Next.js pages
│   ├── _app.js        # App wrapper with global styles
│   └── index.js       # Home page
├── styles/             # CSS files
│   ├── globals.css    # Global styles
│   └── App.module.css # Component styles (CSS modules)
├── public/             # Static assets
└── next.config.js      # Next.js configuration
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [React Documentation](https://react.dev) - learn about React

## Deployment

The easiest way to deploy your Next.js app is to use [Vercel](https://vercel.com), the platform created by the Next.js team:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/hazeledmands/eradice)

Or deploy to [Netlify](https://netlify.com) using the Netlify button or CLI.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

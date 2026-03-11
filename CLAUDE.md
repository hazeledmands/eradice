# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `yarn dev` - Start dev server (http://localhost:3000)
- `yarn build` - Production build (static export to `build/` directory)
- `yarn lint` - ESLint (extends next/core-web-vitals)
- `yarn test` - Run all tests with Jest
- `yarn test:watch` - Run tests in watch mode
- `yarn test -- --testPathPattern=dice` - Run tests matching a path pattern

## Architecture

Eradice is a dice roller web app built with Next.js 14 (Pages Router) and TypeScript. It uses static export (`output: 'export'`) and deploys to Netlify.

**Exploding dice mechanic**: The last die in a roll is the exploding die. Rolling a 6 on it spawns additional dice (chaining if more 6s are rolled). Rolling a 1 on it cancels the highest non-exploding die. This logic lives entirely in `createRoll()`.

### Conventions

- **CSS Modules**: All component styling uses colocated `.module.css` files.
- **Property-based testing**: Parser tests use `fast-check` for property-based testing rather than example-based tests.

## Development Guidelines

### Before Starting Work

- **Tests must be green.** Verify all tests pass before beginning any work. If tests are failing, fix them before proceeding.
- **No warnings allowed.** Check that test and build output is free of warnings. If any warnings exist, address them before continuing.

### Development Approach

- **Use TDD.** Write tests before writing implementation code.
- **Update documentation along with code.**
- **Before every commit**, review the README.md file to make sure that it accurately reflects the current state of the project.

# Copilot Instructions for Virtual Occupancy Sensor

## Project Overview

This is a Homey app that provides virtual occupancy sensor functionality. Homey is a smart home platform by Athom, and this app extends its capabilities by adding support for virtual occupancy sensors.

## Technology Stack

- **Runtime**: Node.js (v16+)
- **Language**: TypeScript (v5.9.3)
- **Framework**: Homey Apps SDK v3
- **Linting**: ESLint with Athom's configuration
- **Build Tool**: TypeScript Compiler (tsc)

## Project Structure

```
.
├── .github/              # GitHub configuration and workflows
├── .homeycompose/        # Homey app source configuration
│   └── app.json         # Main app metadata (edit this, not root app.json)
├── app.ts               # Main application entry point
├── app.json             # Generated app configuration (DO NOT EDIT)
├── assets/              # App images and resources
├── locales/             # Internationalization files
└── package.json         # Node.js dependencies and scripts
```

**Important**: The `app.json` in the root is generated from `.homeycompose/app.json`. Always edit files in `.homeycompose/` instead of the root `app.json`.

## Development Workflow

### Building the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `.homeybuild/` directory.

### Linting

```bash
npm run lint
```

This runs ESLint with the Athom Homey app configuration. The project follows Athom's coding standards.

### Installing Dependencies

```bash
npm install
```

## Code Standards

### ESLint Configuration

The project uses `eslint-config-athom/homey-app` which enforces:
- **Semicolons**: Required at the end of statements
- **Quotes**: Single quotes preferred
- **Indentation**: 2 spaces
- **Code style**: Athom's Homey app conventions

### TypeScript Configuration

- Extends `@tsconfig/node16`
- Allows JavaScript files (`allowJs: true`)
- Outputs to `.homeybuild/` directory
- Target: Node.js 16+

### File Naming

- TypeScript files: Use `.ts` extension
- Main app file: `app.ts`
- Use lowercase with hyphens for multi-word files

## Homey SDK Guidelines

### App Class Structure

All Homey apps extend `Homey.App` and must implement:

```typescript
import Homey from 'homey';

module.exports = class MyApp extends Homey.App {
  async onInit() {
    // App initialization logic
    this.log('App initialized');
  }
};
```

### Common Patterns

- Use `this.log()` for logging within app classes
- Use async/await for asynchronous operations
- Follow Homey SDK v3 conventions
- Check compatibility: `>=12.4.0`

## Contributing Guidelines

When making changes:

1. **Minimal changes**: Only modify what's necessary to fix the issue
2. **No reformatting**: Don't change whitespace or formatting of unrelated code
3. **Follow conventions**: Match the existing code style
4. **Test locally**: Build and lint before committing
5. **Squash commits**: Keep PR history clean

Refer to `CONTRIBUTING.md` for detailed contribution guidelines.

## Common Tasks

### Adding New Features

1. Update `.homeycompose/app.json` for app metadata changes
2. Implement feature in `app.ts` or new TypeScript files
3. Run `npm run build` to compile
4. Run `npm run lint` to ensure code quality

### Fixing Linting Errors

Most linting errors can be auto-fixed:

```bash
npm run lint -- --fix
```

### Debugging

- Use `this.log()` for logging in Homey app classes
- Check Homey CLI documentation for debugging tools
- Review Homey platform compatibility (>=12.4.0)

## Important Notes

- **Platform**: This app is designed for Homey's `local` platform
- **SDK Version**: Uses Homey SDK v3
- **TypeScript Version**: Currently using v5.9.3
- **Generated Files**: Never manually edit `app.json` - it's auto-generated from `.homeycompose/`
- **Dependencies**: Keep Homey SDK types aligned with the SDK version in use

## Resources

- [Homey Apps SDK Documentation](https://apps.developer.homey.app/)
- [Athom Developer Community](https://community.homey.app/)
- [Athom GitHub Organization](https://github.com/athombv)

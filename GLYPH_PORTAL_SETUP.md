# Glyph Portal integration note

RupeeRizz's existing frontend is JavaScript/JSX (not TypeScript), while it already has the shadcn-style `components/ui` structure and Tailwind CSS.

For that reason, the supplied Glyph Portal component is implemented as `components/ui/glyph-portal.jsx` so it can be integrated without converting the whole app or adding a TypeScript build step.

If the codebase is later migrated to TypeScript, install:

```bash
npm install -D typescript @types/node @types/react @types/react-dom
```

Then add a `tsconfig.json` and rename `glyph-portal.jsx` to `glyph-portal.tsx` after adding the component's types from the supplied prompt.

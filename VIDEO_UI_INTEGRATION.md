# RupeeRizz — Video UI Integration

This build keeps the existing RupeeRizz functionality and reworks the presentation layer around the motion-heavy fintech visual reference supplied with the project.

## What changed

- New animated RupeeRizz boot/loading experience (`components/rupee/RizzSplash.js`).
- New animated background/orbit system (`components/rupee/RizzAtmosphere.js`).
- Landing page rebuilt around floating cards, window-style UI, big editorial typography, pills, motion and RupeeRizz's existing teal/green palette.
- Logged-in shell rebuilt with a floating glass header, side rail, mobile drawer and animated route transitions.
- Dashboard rebuilt with a visual “money pulse”, metric tiles, interactive-looking story cards, AI nudge treatment, receipts and support tiles.
- Receipt flow rebuilt visually around a scan/verify experience while preserving the existing OCR/API flow.
- Shared Card/Button styling updated for the new visual language.
- Existing receipt tests continue to pass.

## Important upload note

The conversation upload contained the `RupeeRzzz(1).zip` project and the video reference, but an actual `exp_rr` folder / `index.html` attachment was not available in the mounted files. Rather than inventing or claiming that missing file was integrated, the new front-loading experience was rebuilt natively inside the Next.js app.

When the original `exp_rr/index.html` is available, it can be swapped into the same entry point without changing the rest of the UI system.

## Run on Windows

From `Rupee_Rizz_Final_v6`:

```powershell
npm install
npm run dev
```

Then open `http://localhost:3000`.

The project already contains the existing `.env.local` from the supplied project. Keep your own environment values private.

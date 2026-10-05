'use client';

import { useId, useLayoutEffect, useRef } from 'react';

const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const smooth = (a, b, n) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const DEFAULT_FONT = '"Arial Black", "Arial", sans-serif';

function interior(context, char, font) {
  const canvas = context.canvas;
  context.font = font;
  const m = context.measureText(char);
  const pad = 8;
  const left = Math.ceil(m.actualBoundingBoxLeft || 0);
  const ascent = Math.ceil(m.actualBoundingBoxAscent || 0);
  canvas.width = Math.max(1, Math.ceil((m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0)) + pad * 2);
  canvas.height = Math.max(1, Math.ceil((m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0)) + pad * 2);
  context.font = font;
  context.fontKerning = 'none';
  context.fillText(char, pad + left, pad + ascent);
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  const rows = new Uint16Array(width + 1);
  let size = 0;
  let bx = 0;
  let by = 0;
  for (let y = 0; y < height; y += 1) {
    let diagonal = 0;
    for (let x = 0; x < width; x += 1) {
      const above = rows[x + 1];
      rows[x + 1] = pixels[(y * width + x) * 4 + 3] > 245 ? Math.min(above, rows[x], diagonal) + 1 : 0;
      diagonal = above;
      if (rows[x + 1] > size) {
        size = rows[x + 1];
        bx = x;
        by = y;
      }
    }
  }
  if (size < 3) return null;
  return {
    x: (bx + 1 - size / 2 - pad - left) / 3,
    y: (by + 1 - size / 2 - pad - ascent) / 3,
    radius: (size / 2 - 1) / 3,
  };
}

function scrollParent(element) {
  for (let p = element.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY) && p !== document.body && p !== document.documentElement) return p;
  }
  return null;
}

export default function GlyphPortal({
  word = 'RIZZ',
  focusChar,
  interactive = true,
  background,
  front,
  children,
  scrollLength = 3,
  fontFamily = DEFAULT_FONT,
  fontWeight = 900,
  annotations = false,
  enterLabel = 'Enter RupeeRizz',
  onEnter,
  className,
  style,
}) {
  const uid = `gp-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const clipId = `${uid}-clip`;
  const sectionRef = useRef(null);
  const text = word.trim().normalize('NFC') || 'RIZZ';
  const characters = Array.from(text, (char, index) => ({ char, index }));
  const length = Number.isFinite(scrollLength) ? clamp(scrollLength, 1, 8) : 3;
  const weight = Number.isFinite(fontWeight) ? clamp(fontWeight, 1, 1000) : 900;
  const hasFront = front != null;
  const q = `:where(#${uid})`;

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const pin = section.querySelector('[data-gp-pin]');
    const field = section.querySelector('[data-gp-field]');
    const art = section.querySelector('[data-gp-art]');
    const clip = section.querySelector(`#${clipId}`);
    const glyph = section.querySelector('[data-gp-glyph]');
    const marks = section.querySelector('[data-gp-marks]');
    const choices = section.querySelector('[data-gp-choices]');
    const buttons = Array.from(choices.querySelectorAll('button'));
    const picker = section.querySelector('[data-gp-select]');
    const root = scrollParent(section);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let disposed = false;
    let raf = 0;
    let dirty = true;
    let active = true;
    let ready = false;
    const mountedAt = performance.now();
    let browserFrameSeen = false;
    let stalled = false;
    let W = 1;
    let H = 1;
    let travel = 1;
    let startScale = 1;
    let endScale = 1;
    let center = { x: 0, y: 0 };
    let target = null;
    let lastProgress = -1;
    let candidates = [];
    let letters = [];
    let choosing = false;
    let bounds = { x: 0, y: 0, width: 1, height: 1 };
    let fontDirty = true;

    glyph.style.fontFamily = fontFamily;
    const computedFamily = getComputedStyle(glyph).fontFamily;
    const families = computedFamily.match(/(?:[^,"']+|"[^"]*"|'[^']*')+/g) ?? [];
    const available = families.filter((family) => {
      try { return document.fonts.check(`${weight} 100px ${family.trim()}`, text); } catch { return false; }
    });
    glyph.style.fontFamily = [...available, DEFAULT_FONT].join(',');
    stalled = available.length < families.length;

    const readInk = () => {
      if (!context) return false;
      const font = getComputedStyle(glyph);
      const scanFont = `${font.fontWeight} 300px ${font.fontFamily}`;
      context.font = `${font.fontWeight} 100px ${font.fontFamily}`;
      context.fontKerning = 'none';
      const metrics = context.measureText(text);
      const advances = Array.from({ length: text.length }, (_, i) => context.measureText(text.slice(0, i)).width);
      bounds = {
        x: -(metrics.actualBoundingBoxLeft || 0),
        y: -(metrics.actualBoundingBoxAscent || 0),
        width: (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0),
        height: (metrics.actualBoundingBoxAscent || 0) + (metrics.actualBoundingBoxDescent || 0),
      };
      if (!bounds.width || !bounds.height) return false;
      center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      const requested = focusChar ? text.indexOf(focusChar.normalize('NFC')) : -1;
      let offset = 0;
      candidates = [];
      letters = [];
      for (const char of Array.from(text)) {
        context.font = `${font.fontWeight} 100px ${font.fontFamily}`;
        const m = context.measureText(char);
        letters.push({
          index: offset,
          x: advances[offset] - (m.actualBoundingBoxLeft || 0),
          y: -(m.actualBoundingBoxAscent || 0),
          width: (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0),
          height: (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0),
        });
        const found = interior(context, char, scanFont);
        if (found) candidates.push({ ...found, x: found.x + advances[offset], index: offset });
        offset += char.length;
      }
      target = candidates.find((candidate) => candidate.index === requested)
        ?? [...candidates].sort((a, b) => b.radius - a.radius || Math.abs(a.x - center.x) - Math.abs(b.x - center.x))[0]
        ?? null;
      return true;
    };

    const select = (next) => {
      target = next;
      endScale = target ? Math.max(startScale, Math.hypot(W, H) / (target.radius * 1.35)) : startScale;
      section.dataset.gpFocus = target ? Array.from(text.slice(target.index))[0] : '';
      section.dataset.gpFocusIndex = String(target?.index ?? -1);
      buttons.forEach((button) => {
        const selected = Number(button.dataset.gpLetter) === target?.index;
        button.disabled = !candidates.some((candidate) => candidate.index === Number(button.dataset.gpLetter));
        button.setAttribute('aria-checked', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      if (picker.value !== '') picker.value = String(target?.index ?? -1);
      Array.from(picker.options).forEach((option) => {
        option.disabled = option.value === '' || !candidates.some((candidate) => candidate.index === Number(option.value));
      });
      const u = 1 / startScale;
      const y = bounds.y + bounds.height + 25 * u;
      const x = bounds.x;
      const right = x + bounds.width;
      const cross = target ? `M${target.x - 9 * u} ${target.y}h${18 * u}M${target.x} ${target.y - 9 * u}v${18 * u}` : '';
      const annotationPath = marks.querySelector('path');
      annotationPath.setAttribute('d', `M${x} ${y}H${right}M${x} ${y - 5 * u}v${10 * u}M${right} ${y - 5 * u}v${10 * u}${cross}`);
      annotationPath.setAttribute('stroke-width', String(u));
    };

    const position = () => {
      const origin = root ? root.getBoundingClientRect().top + root.clientTop : 0;
      return clamp((origin - section.getBoundingClientRect().top) / travel);
    };

    const paint = (progress) => {
      const isStatic = motion.matches || !browserFrameSeen || stalled || !target;
      const p = isStatic ? 0 : progress;
      const t = clamp(p / 0.78);
      const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      const scale = Math.exp(Math.log(startScale) + Math.log(endScale / startScale) * eased);
      const blend = endScale === startScale ? 0 : (1 / scale - 1 / startScale) / (1 / endScale - 1 / startScale);
      const cx = center.x + ((target?.x ?? center.x) - center.x) * blend;
      const cy = center.y + ((target?.y ?? center.y) - center.y) * blend;
      const roll = -4 * smooth(0.06, 0.5, t) * (1 - smooth(0.62, 0.92, t));
      const transform = `translate(${W / 2} ${H * 0.46 + H * 0.04 * eased}) scale(${scale}) rotate(${roll}) translate(${-cx} ${-cy})`;
      const radians = roll * Math.PI / 180;
      const dx = W / 2 / scale;
      const dy = (H * 0.46 + H * 0.04 * eased) / scale;
      clip.setAttribute('transform', `scale(${scale}) rotate(${roll})`);
      glyph.setAttribute('transform', `translate(${Math.cos(radians) * dx + Math.sin(radians) * dy - cx} ${-Math.sin(radians) * dx + Math.cos(radians) * dy - cy})`);
      marks.setAttribute('transform', transform);
      marks.style.opacity = String(1 - smooth(0.015, 0.17, p));
      choosing = interactive && !isStatic && p < 0.04;
      choices.inert = !choosing;
      section.dataset.gpChoosing = String(choosing);
      field.style.clipPath = t >= 1 ? 'none' : `url(#${clipId})`;
      section.style.setProperty('--gp-caption', String(1 - smooth(0.01, 0.16, p)));
      section.style.setProperty('--gp-reveal', String(isStatic ? 1 : smooth(0.78, 0.9, p)));
      section.style.setProperty('--gp-field-scale', String(1 + 0.16 * smooth(0, 0.82, p)));
      section.style.setProperty('--gp-caption-hit', p < 0.08 ? 'auto' : 'none');
      section.dataset.gpEntered = String(p >= 0.9);
      section.dataset.gpProgress = p.toFixed(5);
      if (p !== lastProgress) lastProgress = p;
    };

    const layout = () => {
      if (!section.clientWidth) return;
      W = pin.clientWidth;
      const smallViewport = section.querySelector('[data-gp-viewport]')?.offsetHeight || window.innerHeight;
      const viewportHeight = Math.max(1, Math.min(root?.clientHeight ?? smallViewport, smallViewport));
      H = motion.matches ? Math.min(viewportHeight * 0.75, 480) : viewportHeight;
      section.style.setProperty('--gp-height', `${H}px`);
      travel = H * length;
      art.setAttribute('viewBox', `0 0 ${W} ${H}`);
      if (fontDirty) {
        ready = readInk();
        fontDirty = false;
      }
      if (!ready) return;
      const wordHeight = hasFront && H < 480 ? Math.min(H * 0.38, Math.max(24, H - 264)) : H * 0.38;
      startScale = Math.min(W * 0.84 / bounds.width, wordHeight / bounds.height);
      select(target);
      buttons.forEach((button) => {
        const letter = letters.find((item) => item.index === Number(button.dataset.gpLetter));
        if (!letter) return;
        Object.assign(button.style, {
          left: `${W / 2 + (letter.x - center.x) * startScale}px`,
          top: `${H * 0.46 + (letter.y - center.y) * startScale - Math.max(0, 44 - letter.height * startScale) / 2}px`,
          width: `${Math.max(1, letter.width * startScale)}px`,
          height: `${Math.max(44, letter.height * startScale)}px`,
        });
      });
      section.style.setProperty('--gp-word-top', `${H * 0.46 - bounds.height * startScale / 2}px`);
      section.style.setProperty('--gp-word-bottom', `${H * 0.46 + bounds.height * startScale / 2}px`);
      section.dataset.gpReady = 'true';
      section.dataset.gpMotion = !motion.matches && browserFrameSeen && !stalled && target ? 'on' : 'off';
    };

    const frame = (time) => {
      raf = 0;
      if (disposed) return;
      if (time !== undefined && !browserFrameSeen) {
        browserFrameSeen = true;
        stalled ||= performance.now() - mountedAt > 2500;
        dirty = true;
      }
      if (dirty) {
        dirty = false;
        layout();
      }
      if (ready) paint(position());
    };
    const schedule = () => { if (!raf && active) raf = requestAnimationFrame(frame); };
    const resize = () => { cancelAnimationFrame(raf); dirty = true; frame(); };
    const scroll = () => schedule();
    const choose = (event) => {
      if (!choosing || position() >= 0.04) return;
      const button = event.target?.closest?.('[data-gp-letter]');
      const next = candidates.find((candidate) => candidate.index === Number(button?.dataset.gpLetter));
      if (!next || next === target) return;
      select(next);
      paint(position());
    };
    const navigate = (event) => {
      if (!choosing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = candidates.indexOf(target);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? candidates.length - 1
        : (current + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + candidates.length) % candidates.length;
      buttons.find((button) => Number(button.dataset.gpLetter) === candidates[index]?.index)?.focus({ preventScroll: true });
    };
    const pick = () => {
      if (!choosing || position() >= 0.04) return;
      const next = candidates.find((candidate) => candidate.index === Number(picker.value));
      if (next) {
        select(next);
        paint(position());
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(section);
    if (root) observer.observe(root);
    const visibility = new IntersectionObserver(([entry]) => {
      active = entry.isIntersecting;
      if (active) { dirty = true; schedule(); }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { root, rootMargin: '100% 0px' });
    visibility.observe(section);
    (root ?? window).addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    motion.addEventListener('change', resize);
    choices.addEventListener('pointerover', choose);
    choices.addEventListener('click', choose);
    choices.addEventListener('focusin', choose);
    choices.addEventListener('keydown', navigate);
    picker.addEventListener('change', pick);
    frame();
    schedule();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      visibility.disconnect();
      (root ?? window).removeEventListener('scroll', scroll);
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      motion.removeEventListener('change', resize);
      choices.removeEventListener('pointerover', choose);
      choices.removeEventListener('click', choose);
      choices.removeEventListener('focusin', choose);
      choices.removeEventListener('keydown', navigate);
      picker.removeEventListener('change', pick);
    };
  }, [text, focusChar, interactive, fontFamily, weight, length, clipId, hasFront]);

  return (
    <section
      ref={sectionRef}
      id={uid}
      className={className}
      aria-label={text}
      style={{ '--gp-length': length, '--gp-characters': Array.from(text).length, ...style }}
    >
      <style>{`
        ${q}{--gp-paper:#f6fbf8;--gp-ink:#102a2f;--gp-field:#0b3b2a;--gp-foreground:#fbfbfa;position:relative;isolation:isolate;background:var(--gp-paper);color:var(--gp-ink);font-family:Arial,sans-serif;}
        ${q}>[data-gp-viewport]{position:absolute;inset:0 auto auto 0;height:100vh;height:100svh;width:0;pointer-events:none;visibility:hidden;}
        ${q} [data-gp-pin]{position:relative;height:var(--gp-height,100svh);overflow:clip;isolation:isolate;container-type:size;}
        ${q} [data-gp-field]{position:absolute;inset:0;background:var(--gp-field);opacity:0;pointer-events:none;}
        ${q}[data-gp-ready=true] [data-gp-field]{opacity:1;}
        ${q} [data-gp-art]{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;}
        ${q} [data-gp-marks]{fill:none;stroke:var(--gp-ink);opacity:.6;}
        ${q} [data-gp-choices]{position:absolute;inset:0;visibility:hidden;pointer-events:none;}
        ${q}[data-gp-choosing=true] [data-gp-choices]{visibility:visible;}
        ${q} [data-gp-letter]{box-sizing:border-box;position:absolute;border:0;padding:0;margin:0;background:transparent;cursor:pointer;pointer-events:auto;touch-action:pan-y;}
        ${q} [data-gp-letter]:disabled{pointer-events:none;}
        ${q} [data-gp-letter]:focus-visible{outline:2px solid var(--gp-field);outline-offset:5px;}
        ${q} [data-gp-touch-picker]{display:none;position:absolute;top:calc(var(--gp-word-bottom,50%) + 42px);left:50%;transform:translateX(-50%);font:12px/1.4 Arial,sans-serif;align-items:center;gap:12px;visibility:hidden;}
        ${q}[data-gp-choosing=true] [data-gp-touch-picker]{visibility:visible;}
        ${q} [data-gp-select]{min-height:44px;min-width:90px;border:1px solid #d8deda;border-radius:12px;background:rgba(255,255,255,.92);color:var(--gp-ink);padding:0 12px;font:inherit;box-shadow:0 12px 30px rgba(10,60,44,.1);}
        ${q} [data-gp-select]:focus-visible{outline:2px solid var(--gp-field);outline-offset:4px;}
        @media(any-pointer:coarse){${q} [data-gp-touch-picker]{display:flex;}}
        ${q} [data-gp-fallback]{position:absolute;inset:0;display:none;place-items:center;font-size:min(calc(100cqw / var(--gp-characters)),38cqh);line-height:1;color:var(--gp-field);}
        ${q}[data-gp-ready=true] [data-gp-fallback]{visibility:hidden;}
        ${q} [data-gp-caption]{position:absolute;inset:auto clamp(22px,7vw,92px) clamp(22px,7vh,62px);display:flex;align-items:center;justify-content:space-between;gap:1rem;font-size:12px;line-height:1.4;opacity:var(--gp-caption,1);pointer-events:var(--gp-caption-hit,auto);z-index:20;}
        ${q} [data-gp-front]{position:absolute;inset:0;opacity:var(--gp-caption,1);pointer-events:none;z-index:18;}
        ${q} [data-gp-front] a,${q} [data-gp-front] button{pointer-events:var(--gp-caption-hit,auto);}
        ${q} [data-gp-front] a:focus-visible,${q} [data-gp-front] button:focus-visible{outline:2px solid currentColor;outline-offset:5px;}
        ${q} [data-gp-enter]{display:inline-flex;align-items:center;justify-content:center;gap:16px;min-height:48px;padding:0 20px;border-radius:14px;color:var(--gp-ink);background:rgba(255,255,255,.9);border:1px solid rgba(16,42,47,.1);font:700 13px/1 Arial,sans-serif;text-decoration:none;box-shadow:0 12px 40px rgba(5,34,25,.13);transition:.2s ease;}
        ${q} [data-gp-enter]:hover{transform:translateY(-2px);background:#fff;box-shadow:0 16px 45px rgba(5,34,25,.17);}
        ${q} [data-gp-content]{box-sizing:border-box;position:relative;min-height:var(--gp-height,100svh);padding:clamp(48px,8vw,110px) clamp(22px,7vw,110px);display:grid;align-content:center;color:var(--gp-foreground);background:var(--gp-field);overflow-wrap:anywhere;}
        ${q}[data-gp-motion=on] [data-gp-pin]{position:sticky;top:0;}
        ${q}[data-gp-motion=off] [data-gp-hint]{display:none;}
        ${q}[data-gp-motion=on] [data-gp-content]{margin-top:calc((var(--gp-length) - 1) * var(--gp-height));background:transparent;opacity:var(--gp-reveal,0);pointer-events:none;}
        ${q}[data-gp-motion=on][data-gp-entered=true] [data-gp-content]{pointer-events:auto;}
        ${q}[data-gp-motion=on]:has([data-gp-content]:focus-within) [data-gp-field]{clip-path:none!important;}
        ${q}[data-gp-motion=on] [data-gp-content]:focus-within{opacity:1;pointer-events:auto;}
        ${q}:has([data-gp-content]:focus-within) [data-gp-caption],${q}:has([data-gp-content]:focus-within) [data-gp-marks]{opacity:0;}
        @media(prefers-reduced-motion:reduce){${q} [data-gp-pin]{position:relative!important;} ${q} [data-gp-content]{margin-top:0!important;opacity:1!important;background:var(--gp-field)!important;min-height:0;padding-block:64px;} ${q} [data-gp-caption]{opacity:1!important;}}
      `}</style>
      <div data-gp-viewport aria-hidden="true" />
      <div data-gp-pin>
        <div data-gp-field aria-hidden="true" inert>
          {background || (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: 'scale(var(--gp-field-scale,1))',
                background: 'radial-gradient(circle at 18% 12%, rgba(130,242,193,.72), transparent 26%), radial-gradient(circle at 80% 20%, rgba(245,251,248,.11), transparent 22%), radial-gradient(circle at 48% 78%, rgba(4,32,23,.62), transparent 43%), linear-gradient(135deg,#0b2f24 0%,#135d43 48%,#08261c 100%)',
              }}
            />
          )}
        </div>
        <svg data-gp-art aria-hidden="true" focusable="false">
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <text
                data-gp-glyph
                x="0"
                y="0"
                style={{ fontFamily, fontWeight: weight, fontSize: 100, fontKerning: 'none', fontVariantLigatures: 'none', letterSpacing: 0 }}
              >
                {text}
              </text>
            </clipPath>
          </defs>
          <g data-gp-marks style={{ visibility: annotations ? 'visible' : 'hidden' }}><path /></g>
        </svg>
        <div data-gp-choices role="radiogroup" aria-label="Choose the letter to enter through" inert>
          {characters.map(({ char, index }, i) => (
            <button
              type="button"
              role="radio"
              aria-checked="false"
              tabIndex={-1}
              data-gp-letter={index}
              key={index}
              aria-label={`${char}, letter ${i + 1} of ${characters.length}`}
            />
          ))}
        </div>
        <label data-gp-touch-picker>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>Entry letter</span>
          <select data-gp-select defaultValue="">
            <option value="" disabled>Choose a letter</option>
            {characters.map(({ char, index }, i) => <option key={index} value={index}>{i + 1} · {char}</option>)}
          </select>
        </label>
        {front && <div data-gp-front>{front}</div>}
        <span data-gp-fallback aria-hidden="true" style={{ fontFamily, fontWeight: weight }}>{text}</span>
        <div data-gp-caption>
          <span data-gp-hint aria-hidden="true">{interactive ? 'Pick a letter, then scroll.' : ''}</span>
          <button
            data-gp-enter
            type="button"
            onClick={(event) => {
              event.preventDefault();
              if (onEnter) onEnter();
              else section.querySelector('[data-gp-content]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {enterLabel}<span aria-hidden="true">↘</span>
          </button>
        </div>
      </div>
      <div data-gp-content id={`${uid}-content`} tabIndex={-1}>
        {children}
      </div>
    </section>
  );
}

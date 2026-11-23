import sharp from 'sharp';

// Remove dark photographic side margins only when both paper edges are clear.
// Do not crop scans whose background cannot be distinguished from the page.
export async function preparePaper(bytes) {
  const source = await sharp(bytes, { limitInputPixels: 24000000 }).autoOrient()
    .flatten({ background: 'white' }).png().toBuffer();
  const meta = await sharp(source).metadata();
  const { data, info } = await sharp(source).resize({ width: 160 }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const columns = Array.from({ length: info.width }, (_, x) => {
    let sum = 0;
    for (let y = 0; y < info.height; y++) sum += data[y * info.width + x];
    return sum / info.height;
  });
  const average = (a) => a.reduce((s, n) => s + n, 0) / a.length;
  const center = average(columns.slice(40, 120));
  const leftEdge = average(columns.slice(0, 6));
  const rightEdge = average(columns.slice(-6));
  let crop = null;
  if (center > 175 && center - leftEdge > 35 && center - rightEdge > 35) {
    const threshold = (Math.max(leftEdge, rightEdge) + center) / 2 + 8;
    let left = columns.findIndex((v) => v >= threshold);
    let right = columns.findLastIndex((v) => v >= threshold);
    if (left > 0 && right < 159 && right - left > 90) {
      // Stay inside the detected edges: a small dark sliver generates spurious
      // characters on almost every row. The remaining margin is added in white.
      left = Math.ceil((left + 1) * meta.width / 160);
      right = Math.floor(right * meta.width / 160);
      crop = { left, top: 0, width: right - left, height: meta.height };
    }
  }
  let paper = crop ? await sharp(source).extract(crop).png().toBuffer() : source;
  const skew = await estimateSkew(paper);
  if (skew) paper = await sharp(paper).rotate(skew, { background: 'white' }).png().toBuffer();
  const bounds = await sharp(paper).metadata();
  return { image: paper, crop, skew, width: bounds.width, height: bounds.height };
}

export async function estimateSkew(image) {
  const { data, info } = await sharp(image).resize({ width: 600, withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const points = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 10; x < info.width - 10; x++) if (data[y * info.width + x] < 110) points.push([x, y]);
  }
  if (points.length < 100) return 0;
  let bestAngle = 0, bestScore = 0, zeroScore = 0;
  for (let angle = -3; angle <= 3; angle += 0.25) {
    const slope = Math.tan(angle * Math.PI / 180);
    const projection = new Uint32Array(info.height + 80);
    for (const [x, y] of points) {
      const row = Math.round(y + slope * (x - info.width / 2)) + 40;
      if (row >= 0 && row < projection.length) projection[row]++;
    }
    const score = projection.reduce((sum, n) => sum + n * n, 0);
    if (angle === 0) zeroScore = score;
    if (score > bestScore) { bestAngle = angle; bestScore = score; }
  }
  return Math.abs(bestAngle) < 3 && bestScore > zeroScore * 1.04 ? bestAngle : 0;
}

export async function enlargePaper(paper, angle = 0, variant = 'color') {
  const scale = Math.max(1, Math.min(3, 1500 / paper.width, 4200 / paper.height));
  let image = sharp(paper.image).rotate(angle, { background: 'white' })
    .resize({ width: Math.round(paper.width * scale), height: Math.round(paper.height * scale), fit: 'inside' });
  if (variant === 'contrast') image = image.greyscale().normalise();
  return image.extend({ top: 20, bottom: 20, left: 20, right: 20, background: 'white' }).png().toBuffer();
}

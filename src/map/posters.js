// Church programme posters for billboards: crusades, revivals, choir concerts, youth and women's
// conferences… drawn on a canvas in the bold style of Lagos roadside boards. The churches are
// fictional (Grace Assembly and friends); players can book their own posters (life.js AD_SPOTS).

export const CHURCHES = ['Grace Assembly, Yaba', 'Living Waters Chapel, Surulere', 'Mount Zion Gospel Church, Ikeja', 'Christ Love Assembly, Lekki', 'Shepherd\'s House, Ebute Metta', 'Victory Tabernacle, Oshodi'];
export const THEMES = {
  royal: ['#1e3a8a', '#facc15', '#ffffff'],
  fire: ['#7f1d1d', '#f97316', '#fde68a'],
  purple: ['#4c1d95', '#f0abfc', '#ffffff'],
  green: ['#14532d', '#a3e635', '#ffffff'],
  gold: ['#18181b', '#eab308', '#fef9c3'],
  sky: ['#0369a1', '#ffffff', '#fef08a'],
};
export const MOTIFS = ['cross', 'dove', 'flame', 'crown', 'mic', 'bible'];

const PROGRAMMES = [
  ['HOLY GHOST NIGHT', 'Friday · 10pm till dawn', 'fire', 'flame'],
  ['REVIVAL 2026', 'Fire on the Mountain · 3 days', 'fire', 'flame'],
  ['SONGS OF ZION', 'Choir concert · Sunday 4pm', 'purple', 'mic'],
  ['ARISE & SHINE', 'Youth conference · Isaiah 60:1', 'sky', 'crown'],
  ['WOMEN OF VIRTUE', 'Conference · Proverbs 31', 'purple', 'crown'],
  ['MEN OF VALOUR', 'Breakfast meeting · Saturday 8am', 'royal', 'bible'],
  ['21 DAYS OF PRAYER', 'Prayer rain · 6am daily', 'royal', 'dove'],
  ['CHILDREN\'S CRUSADE', 'Bring the little ones · Saturday', 'sky', 'dove'],
  ['THANKSGIVING SUNDAY', 'Come and dance! · 9am', 'gold', 'cross'],
  ['GOSPEL CRUSADE @ TBS', 'Lagos for Jesus · Free entry', 'fire', 'cross'],
  ['BIBLE SCHOOL', 'New session · Register now', 'green', 'bible'],
  ['NIGHT OF WORSHIP', 'Live band · All night', 'gold', 'mic'],
  ['MARRIAGE SEMINAR', 'Building godly homes', 'royal', 'dove'],
  ['EASTER RETREAT', 'He is risen! · Camp ground', 'green', 'cross'],
];

/** A deterministic set of posters for the map's billboards. */
export function defaultPosters(n, seed = 3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const [title, sub, theme, motif] = PROGRAMMES[(i * 5 + seed) % PROGRAMMES.length];
    out.push({ title, sub, theme, motif, church: CHURCHES[(i * 7 + seed) % CHURCHES.length] });
  }
  return out;
}

/**
 * Draw a poster into a canvas region.
 * @param {CanvasRenderingContext2D} g
 * @param {{title: string, sub?: string, church?: string, theme?: string, motif?: string, booked?: boolean}} p
 */
export function drawPoster(g, x, y, w, h, p) {
  const [bg, accent, fg] = THEMES[p.theme] || THEMES.royal;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  const grad = g.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, shade(bg, -0.35));
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  // rays of light behind the motif
  g.globalAlpha = 0.18;
  g.fillStyle = accent;
  const cx = x + w * 0.83, cy = y + h * 0.45;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * w);
    g.lineTo(cx + Math.cos(a + 0.12) * w, cy + Math.sin(a + 0.12) * w);
    g.fill();
  }
  g.globalAlpha = 1;
  motif(g, p.motif || 'cross', cx, cy, h * 0.3, accent);
  // text
  const pad = w * 0.05;
  g.fillStyle = accent;
  g.font = `800 ${Math.round(h * 0.075)}px Inter, system-ui, sans-serif`;
  g.textBaseline = 'top';
  g.fillText((p.church || '').toUpperCase(), x + pad, y + h * 0.08, w * 0.66);
  g.fillStyle = fg;
  const t = p.title || '';
  let size = h * 0.22;
  g.font = `800 ${Math.round(size)}px "Space Grotesk", Inter, system-ui, sans-serif`;
  while (g.measureText(t).width > w * 0.68 && size > h * 0.11) { size -= 1; g.font = `800 ${Math.round(size)}px "Space Grotesk", Inter, system-ui, sans-serif`; }
  wrap(g, t, x + pad, y + h * 0.22, w * 0.68, size * 1.02, 2);
  g.fillStyle = accent;
  g.fillRect(x + pad, y + h * 0.7, w * 0.62, Math.max(2, h * 0.02));
  g.fillStyle = fg;
  g.font = `600 ${Math.round(h * 0.085)}px Inter, system-ui, sans-serif`;
  g.fillText(p.sub || '', x + pad, y + h * 0.76, w * 0.7);
  if (p.booked) {
    g.fillStyle = accent;
    g.font = `800 ${Math.round(h * 0.06)}px Inter, system-ui, sans-serif`;
    g.fillText('★ AMEN CITY PLAYER AD', x + pad, y + h * 0.9, w * 0.6);
  }
  g.restore();
}

function wrap(g, text, x, y, maxW, lh, maxLines) {
  const lines = [];
  let line = '';
  for (const w of text.split(' ')) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => g.fillText(l, x, y + i * lh, maxW));
}

function motif(g, kind, cx, cy, r, color) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = r * 0.12;
  g.lineCap = 'round';
  switch (kind) {
    case 'cross':
      g.fillRect(-r * 0.12, -r, r * 0.24, r * 2);
      g.fillRect(-r * 0.6, -r * 0.45, r * 1.2, r * 0.24);
      break;
    case 'dove':
      g.beginPath();
      g.ellipse(0, 0, r * 0.55, r * 0.28, -0.2, 0, Math.PI * 2);
      g.fill();
      g.beginPath(); g.moveTo(-r * 0.1, -r * 0.1); g.quadraticCurveTo(-r * 0.4, -r * 1.0, r * 0.5, -r * 0.9); g.quadraticCurveTo(r * 0.1, -r * 0.4, r * 0.2, 0); g.fill();
      g.beginPath(); g.arc(r * 0.55, -r * 0.15, r * 0.18, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-r * 0.5, 0); g.lineTo(-r * 0.95, -r * 0.25); g.lineTo(-r * 0.9, r * 0.2); g.fill();
      break;
    case 'flame':
      g.beginPath();
      g.moveTo(0, r); g.bezierCurveTo(-r * 0.9, r * 0.5, -r * 0.4, -r * 0.3, 0, -r);
      g.bezierCurveTo(r * 0.2, -r * 0.4, r * 0.9, 0, r * 0.6, r * 0.5); g.quadraticCurveTo(r * 0.4, r, 0, r);
      g.fill();
      break;
    case 'crown':
      g.beginPath();
      g.moveTo(-r * 0.8, r * 0.5); g.lineTo(-r * 0.8, -r * 0.4); g.lineTo(-r * 0.4, 0); g.lineTo(0, -r * 0.6); g.lineTo(r * 0.4, 0); g.lineTo(r * 0.8, -r * 0.4); g.lineTo(r * 0.8, r * 0.5);
      g.closePath(); g.fill();
      break;
    case 'mic':
      g.beginPath(); g.ellipse(0, -r * 0.35, r * 0.32, r * 0.5, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(0, -r * 0.2, r * 0.55, 0.2, Math.PI - 0.2); g.stroke();
      g.fillRect(-r * 0.06, r * 0.35, r * 0.12, r * 0.5); g.fillRect(-r * 0.35, r * 0.82, r * 0.7, r * 0.12);
      break;
    default: // bible
      g.fillRect(-r * 0.7, -r * 0.6, r * 1.4, r * 1.2);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(-r * 0.04, -r * 0.6, r * 0.08, r * 1.2);
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillRect(-r * 0.09, -r * 0.35, r * 0.18, r * 0.6); g.fillRect(-r * 0.3, -r * 0.18, r * 0.6, r * 0.16);
  }
  g.restore();
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + c * k)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

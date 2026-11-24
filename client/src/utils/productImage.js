const KEYWORD_ICONS = [
  { keywords: ['trà sữa', 'milk tea', 'trân châu'], emoji: '🧋', bg: '#e8c9a0' },
  { keywords: ['matcha'], emoji: '🍵', bg: '#b7d6a8' },
  { keywords: ['cà phê', 'coffee', 'bạc xỉu', 'espresso', 'latte', 'cappuccino'], emoji: '☕', bg: '#c9a27a' },
  { keywords: ['bánh', 'cake', 'tiramisu', 'croissant', 'bakery'], emoji: '🍰', bg: '#f2d9b1' },
  { keywords: ['sinh tố', 'smoothie', 'nước ép', 'juice'], emoji: '🥤', bg: '#f5c99b' },
];

function pickIcon(name = '') {
  const lower = name.toLowerCase();
  const match = KEYWORD_ICONS.find((entry) => entry.keywords.some((k) => lower.includes(k)));
  return match || { emoji: '🥤', bg: '#e2d5c3' };
}

export function productPlaceholder(name) {
  const { emoji, bg } = pickIcon(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160">
    <rect width="200" height="160" fill="${bg}"/>
    <text x="50%" y="54%" font-size="64" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function productImageSrc(product) {
  return product?.imageUrl || productPlaceholder(product?.name);
}

const CATEGORY_ICONS = [
  { keywords: ['trà sữa', 'milk tea', 'trân châu'], emoji: '🧋', from: '#c9a06a', to: '#e8c9a0' },
  { keywords: ['matcha'], emoji: '🍵', from: '#6f9c5a', to: '#b7d6a8' },
  { keywords: ['cà phê', 'coffee', 'bạc xỉu', 'espresso', 'latte', 'cappuccino'], emoji: '☕', from: '#8a5a35', to: '#c9a27a' },
  { keywords: ['bánh', 'cake', 'tiramisu', 'croissant', 'bakery'], emoji: '🍰', from: '#d99a4b', to: '#f2d9b1' },
  { keywords: ['ăn vặt', 'snack'], emoji: '🍿', from: '#c98a3a', to: '#f0cf8f' },
  { keywords: ['trà trái cây', 'trà đào', 'trà olong', 'fruit tea'], emoji: '🍹', from: '#d16a5a', to: '#f5b7a0' },
  { keywords: ['sinh tố', 'smoothie', 'nước ép', 'juice'], emoji: '🥤', from: '#d98a3a', to: '#f5c99b' },
  { keywords: ['special', 'đặc biệt'], emoji: '✨', from: '#5a7fd9', to: '#a8c4f0' },
];

function pickCategoryIcon(name = '') {
  const lower = name.toLowerCase();
  const match = CATEGORY_ICONS.find((entry) => entry.keywords.some((k) => lower.includes(k)));
  return match || { emoji: '🥤', from: '#3d8bc9', to: '#a8d0f0' };
}

export function categoryPlaceholder(name) {
  const { emoji, from, to } = pickCategoryIcon(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="140">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${from}"/>
        <stop offset="100%" stop-color="${to}"/>
      </linearGradient>
    </defs>
    <rect width="480" height="140" fill="url(#g)"/>
    <text x="36" y="50%" font-size="72" text-anchor="start" dominant-baseline="middle">${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function categoryImageSrc(category) {
  return category?.imageUrl || categoryPlaceholder(category?.name);
}

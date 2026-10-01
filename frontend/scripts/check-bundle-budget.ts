/*
 * Проверяет бюджет бандла (.claude/rules/web/performance.md → «Bundle Budget») по прод-сборке.
 * Вес страницы — то, что браузер обязан скачать, чтобы её показать: точка входа и всё, что
 * она и чанки страницы тянут статическими импортами, плюс их CSS. Динамический import()
 * (глобус-фон, соседние страницы) грузится отдельно и в вес страницы не входит.
 *
 * Граф берётся из манифеста Vite, а не из текста чанков: манифест разделяет статические и
 * динамические импорты, а в предзагрузке они выглядят одинаково.
 *
 * Запуск: make budget (собирает с манифестом и проверяет). Падает, если страница не влезает.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const MANIFEST = `${DIST}.vite/manifest.json`;

interface ManifestChunk {
  file: string;
  isEntry?: boolean;
  imports?: string[];
  css?: string[];
}

type Manifest = Record<string, ManifestChunk>;

interface Budget {
  js: number;
  css: number;
}

// Лимиты в kB gzip (1 kB = 1000 байт, как в отчёте Vite). Числа и их обоснование живут в
// performance.md; меняешь там — меняй здесь.
const BUDGETS = {
  landing: { js: 200, css: 40 },
  app: { js: 300, css: 50 },
} satisfies Record<string, Budget>;

interface Page {
  name: string;
  budget: keyof typeof BUDGETS;
  /** Модули маршрута из App.tsx, которые грузятся лениво: лейаут и сама страница. */
  modules: string[];
}

const PAGES: readonly Page[] = [
  { name: "/", budget: "landing", modules: ["src/pages/PublicLayout.tsx", "src/pages/LandingPage.tsx"] },
  { name: "/login", budget: "app", modules: ["src/pages/PublicLayout.tsx", "src/pages/LoginPage.tsx"] },
  { name: "/signup", budget: "app", modules: ["src/pages/PublicLayout.tsx", "src/pages/SignUpPage.tsx"] },
  { name: "/home", budget: "app", modules: ["src/pages/HomePage.tsx"] },
  {
    name: "/journeys",
    budget: "app",
    modules: ["src/pages/journeys/JourneysLayout.tsx", "src/pages/journeys/JourneysMapView.tsx"],
  },
  {
    name: "/journeys/movements",
    budget: "app",
    modules: ["src/pages/journeys/JourneysLayout.tsx", "src/pages/journeys/MovementsMapView.tsx"],
  },
  {
    name: "/journeys/add",
    budget: "app",
    modules: ["src/pages/journeys/JourneysLayout.tsx", "src/pages/journeys/AddJourneyPage.tsx"],
  },
];

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;

// Размеры — свой gzip уровня 9, а не цифры из вывода `vite build`: Vite жмёт другим компрессором,
// и его gz-колонка расходится с этой на 1–3 %. Лимиты сверять только с выводом этого скрипта.
const gzipSizes = new Map<string, number>();
function gzipSize(file: string): number {
  let size = gzipSizes.get(file);
  if (size === undefined) {
    size = gzipSync(readFileSync(`${DIST}${file}`), { level: 9 }).length;
    gzipSizes.set(file, size);
  }

  return size;
}

function chunk(key: string): ManifestChunk {
  const found = manifest[key];
  if (!found) {
    throw new Error(`В манифесте нет «${key}» — модуль переименован? Поправь PAGES в ${import.meta.filename}`);
  }

  return found;
}

/** Файлы JS и CSS, которые тянут модули `roots` вместе со всеми статическими импортами. */
function staticClosure(roots: readonly string[]): { js: Set<string>; css: Set<string> } {
  const js = new Set<string>();
  const css = new Set<string>();
  const seen = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const key = stack.pop() as string;
    if (seen.has(key)) continue;

    seen.add(key);
    const { file, imports = [], css: styles = [] } = chunk(key);
    js.add(file);
    for (const style of styles) css.add(style);

    stack.push(...imports);
  }

  return { js, css };
}

function totalKb(files: Set<string>): number {
  let bytes = 0;
  for (const file of files) bytes += gzipSize(file);

  return bytes / 1000;
}

const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry);
let isOverBudget = false;
const rows = PAGES.map((page) => {
  const { js, css } = staticClosure([...entries, ...page.modules]);
  const budget: Budget = BUDGETS[page.budget];
  const jsKb = totalKb(js);
  const cssKb = totalKb(css);
  const isOver = jsKb > budget.js || cssKb > budget.css;
  if (isOver) isOverBudget = true;

  return {
    page: page.name,
    budget: page.budget,
    "JS, kB gz": `${jsKb.toFixed(1)} / ${budget.js}`,
    "CSS, kB gz": `${cssKb.toFixed(1)} / ${budget.css}`,
    status: isOver ? "OVER" : "ok",
  };
});

console.table(rows);
if (isOverBudget) {
  console.error("Бюджет превышен: ужми страницу или пересмотри лимит в performance.md с обоснованием.");
  process.exit(1);
}

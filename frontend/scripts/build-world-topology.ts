/*
 * Собирает границы стран для плоских карт: data/world-countries.geo.json (источник, в бандл не
 * попадает) → src/data/world-countries.topo.json (то, что импортирует WorldMap). Результат
 * коммитится; CI пересобирает его и падает, если он разошёлся с источником.
 *
 * TopoJSON хранит общую границу соседей один раз, а координаты — целыми шагами сетки с дельтами
 * вместо шестизначных дробей. Контуры не упрощаются; квантование лишь склеивает соседние точки,
 * попавшие в один шаг сетки, — так кольцо теряет точку-другую, а точка сдвигается не больше чем
 * на полшага.
 *
 * Запуск: make generate-world
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { topology } from "topojson-server";

const SOURCE = fileURLToPath(new URL("../data/world-countries.geo.json", import.meta.url));
const TARGET = fileURLToPath(new URL("../src/data/world-countries.topo.json", import.meta.url));

// Под этим ключом страны лежат в `objects` топологии — его же читает WorldMap.
const COUNTRIES_OBJECT = "countries";

/*
 * Число шагов сетки по каждой оси. Холст карты — 1000 единиц на 360° долготы, при максимальном
 * приближении (×8) на экране шириной 1920 px единица холста ≈ 15 px. Шаг сетки 1e5 — 0.0036°,
 * то есть ~0.15 px даже вблизи; 1e4 дал бы ~1.5 px, и на ×8 контуры пошли бы лесенкой.
 */
const QUANTIZATION = 100_000;

const source = JSON.parse(readFileSync(SOURCE, "utf8")) as FeatureCollection<Polygon | MultiPolygon>;
const world = topology({ [COUNTRIES_OBJECT]: source }, QUANTIZATION);
writeFileSync(TARGET, `${JSON.stringify(world)}\n`);

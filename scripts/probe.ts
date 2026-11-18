import { detect } from '../src/detectors.js';
import { FILES } from '../src/scenario/scenario.js';

for (const f of FILES) {
  for (const s of f.sections) {
    if (!s.restricted) continue;
    console.log(f.id, s.id, s.restricted, JSON.stringify(s.title), JSON.stringify(s.markers));
  }
  const hits = detect(f.name);
  if (hits.length || f.sections.some((s) => s.restricted)) console.log('  name', JSON.stringify(f.name), hits.map((h) => h.label));
}
for (const t of ['password: "correct horse battery staple"', 'password = "abc def ghi"', 'secret: "a\\"b c"', 'Card 4111 1111 1111 1111 09/27', 'card 4111111111111111 0927']) {
  console.log(JSON.stringify(t), detect(t).map((h) => [h.label, t.slice(h.index, h.index + h.length)]));
}

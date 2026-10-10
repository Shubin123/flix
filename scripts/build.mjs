import {cp, mkdir, rm, readFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
const output = resolve('dist');
const model = JSON.parse(await readFile('public/data/model.json', 'utf8'));
if (model.sourceCount < 14 || model.movieCount < 10000 || model.yearRange[1] !== 2026 || model.academyCeremonyThrough !== 2026) throw new Error('Train the complete model before building.');
for (const name of ['catalog.json.gz', 'vocabulary.json.gz', 'embeddings.i8.gz', 'projection.f32.gz', 'features.indices.u16.gz', 'features.values.u8.gz', 'features.offsets.u32.gz', 'sources.json']) {
  if (!(await stat(`public/data/${name}`)).size) throw new Error(`Missing model artifact: ${name}`);
}
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
await cp('public', output, {recursive: true});
console.log(`Built Flix with ${model.movieCount.toLocaleString()} films and ${model.sourceCount} cited datasets in ${output}`);

import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildSync } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, '.cache')
const outFile = join(cacheDir, 'shared.test.mjs')

mkdirSync(cacheDir, { recursive: true })

buildSync({
  entryPoints: [join(root, 'tests', 'shared.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: outFile
})

const run = spawnSync(process.execPath, ['--test', outFile], { cwd: root, stdio: 'inherit' })
process.exit(run.status ?? 1)

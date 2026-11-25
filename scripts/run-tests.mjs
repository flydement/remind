import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, '.cache')
const outFile = join(cacheDir, 'shared.test.mjs')
const esbuild = join(root, 'node_modules', 'esbuild', 'bin', 'esbuild')

if (!existsSync(esbuild)) {
  throw new Error('esbuild not found, please run npm install')
}

mkdirSync(cacheDir, { recursive: true })

const bundle = spawnSync(
  process.execPath,
  [
    esbuild,
    join(root, 'tests', 'shared.test.ts'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    `--outfile=${outFile}`
  ],
  { cwd: root, stdio: 'inherit' }
)

if (bundle.status !== 0) {
  process.exit(bundle.status ?? 1)
}

const run = spawnSync(process.execPath, ['--test', outFile], { cwd: root, stdio: 'inherit' })
process.exit(run.status ?? 1)

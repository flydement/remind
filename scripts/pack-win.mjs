import { spawnSync } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  writeFileSync,
  renameSync,
  statSync,
  readdirSync
} from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ELECTRON_VERSION = '33.4.11'
const zipName = `electron-v${ELECTRON_VERSION}-win32-x64.zip`
const cacheDir = join(root, '.cache')
const zipPath = join(cacheDir, zipName)
const outDir = join(root, 'dist', '小猫工作助手-win32-x64')
const zipOut = join(root, 'dist', '小猫工作助手-windows.zip')
const appDir = join(outDir, 'resources', 'app')

const MIRRORS = [
  `https://npmmirror.com/mirrors/electron/v${ELECTRON_VERSION}/${zipName}`,
  `https://cdn.npmmirror.com/binaries/electron/v${ELECTRON_VERSION}/${zipName}`,
  `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${zipName}`
]

function run(cmd, args, extra = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...extra })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`)
}

function copyTree(src, dest) {
  const st = statSync(src)
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true })
    for (const entry of readdirSync(src)) {
      copyTree(join(src, entry), join(dest, entry))
    }
  } else {
    cpSync(src, dest)
  }
}

function esbuildBin() {
  const bin = join(root, 'node_modules', 'esbuild', 'bin', 'esbuild')
  if (!existsSync(bin)) throw new Error('esbuild not found, run npm install')
  return bin
}

async function download() {
  if (existsSync(zipPath) && statSync(zipPath).size > 50_000_000) {
    console.log('using cached electron zip')
    return
  }
  mkdirSync(cacheDir, { recursive: true })
  for (const url of MIRRORS) {
    console.log('download', url)
    const tmp = `${zipPath}.part`
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok || !res.body) {
        console.log('skip', res.status)
        continue
      }
      await pipeline(res.body, createWriteStream(tmp))
      const size = statSync(tmp).size
      if (size < 50_000_000) {
        console.log('file too small', size)
        rmSync(tmp, { force: true })
        continue
      }
      renameSync(tmp, zipPath)
      console.log('downloaded', size, 'bytes')
      return
    } catch (err) {
      console.log('failed', err.message)
      rmSync(tmp, { force: true })
    }
  }
  throw new Error('无法下载 Windows 版 Electron，请检查网络后重试 npm run pack:win')
}

function unzipTo(dest) {
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  if (process.platform === 'win32') {
    run('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`
    ])
  } else {
    run('unzip', ['-q', zipPath, '-d', dest])
  }
}

async function main() {
  console.log('1/4 build renderer')
  run(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.config.ts'])

  console.log('2/4 bundle main/preload')
  const stage = join(root, '.cache', 'app-stage')
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true })
  run(process.execPath, [
    esbuildBin(),
    join(root, 'src/main/index.ts'),
    '--bundle',
    '--platform=node',
    '--external:electron',
    '--format=cjs',
    `--outfile=${join(stage, 'main.cjs')}`
  ])
  run(process.execPath, [
    esbuildBin(),
    join(root, 'src/preload/index.ts'),
    '--bundle',
    '--platform=node',
    '--external:electron',
    '--format=cjs',
    `--outfile=${join(stage, 'preload.cjs')}`
  ])
  writeFileSync(
    join(stage, 'package.json'),
    JSON.stringify(
      {
        name: 'rian',
        version: '1.0.0',
        main: 'main.cjs',
        productName: '小猫工作助手'
      },
      null,
      2
    )
  )
  cpSync(join(root, 'dist-web'), join(stage, 'renderer'), { recursive: true })
  if (existsSync(join(root, 'resources/icon.png'))) {
    cpSync(join(root, 'resources/icon.png'), join(stage, 'icon.png'))
  }

  console.log('3/4 fetch electron runtime')
  await download()
  unzipTo(outDir)

  console.log('4/4 assemble exe folder')
  const defaultAsar = join(outDir, 'resources', 'default_app.asar')
  if (existsSync(defaultAsar)) rmSync(defaultAsar)
  mkdirSync(join(outDir, 'resources'), { recursive: true })
  rmSync(appDir, { recursive: true, force: true })
  copyTree(stage, appDir)
  if (!existsSync(join(appDir, 'main.cjs'))) {
    throw new Error('app 目录复制失败: ' + appDir)
  }
  if (existsSync(join(stage, 'icon.png'))) {
    cpSync(join(stage, 'icon.png'), join(outDir, 'resources', 'icon.png'))
  }
  if (existsSync(join(root, 'resources', 'reminder.html'))) {
    cpSync(join(root, 'resources', 'reminder.html'), join(outDir, 'resources', 'reminder.html'))
  }
  const electronExe = join(outDir, 'electron.exe')
  const appExe = join(outDir, '小猫工作助手.exe')
  if (existsSync(appExe)) rmSync(appExe)
  if (!existsSync(electronExe)) throw new Error('electron.exe missing after unzip')
  renameSync(electronExe, appExe)

  const rcedit = join(cacheDir, 'rcedit-x64.exe')
  const ico = join(root, 'resources', 'icon.ico')
  if (existsSync(rcedit) && existsSync(ico)) {
    console.log('set exe icon via rcedit')
    run(rcedit, [appExe, '--set-icon', ico])
  }

  rmSync(zipOut, { force: true })
  if (process.platform === 'darwin') {
    run('ditto', ['-c', '-k', '--norsrc', '--keepParent', outDir, zipOut])
  } else {
    run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${outDir}' -DestinationPath '${zipOut}' -Force`])
  }

  console.log('')
  console.log('完成。把整个文件夹拷到 Windows，双击 小猫工作助手.exe 即可。')
  console.log('  文件夹:', outDir)
  console.log('  压缩包:', zipOut)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, 'dist', '小猫工作助手-win32-x64')
const icon = join(root, 'resources', 'icon.ico')
const cacheDir = join(root, '.cache')
const nsiPath = join(cacheDir, 'installer.nsi')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version || '1.0.0'
const outFile = join(root, 'dist', `小猫工作助手-Setup-${version}.exe`)

if (!existsSync(join(appDir, '小猫工作助手.exe'))) {
  throw new Error(`未找到打包产物：${appDir}，请先运行 npm run pack:win`)
}
mkdirSync(cacheDir, { recursive: true })

const cands = [process.env.MAKENSIS, 'C:\\Program Files (x86)\\NSIS\\makensis.exe', 'C:\\Program Files\\NSIS\\makensis.exe']
const makensis = cands.find((c) => c && existsSync(c))
if (!makensis) throw new Error('未找到 makensis.exe，请先安装 NSIS（winget install NSIS.NSIS）')

const nsi = `Unicode true
!include "MUI2.nsh"
!include "x64.nsh"

Name "小猫工作助手"
OutFile "${outFile}"
InstallDir "$LOCALAPPDATA\\Programs\\小猫工作助手"
RequestExecutionLevel user
SetCompressor /SOLID lzma
Icon "${icon}"
!define MUI_ICON "${icon}"
!define MUI_UNICON "${icon}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\\小猫工作助手.exe"
!define MUI_FINISHPAGE_RUN_TEXT "立即运行小猫工作助手"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

Section "安装" SecMain
  SetOutPath "$INSTDIR"
  File /r "${appDir}\\*.*"
  WriteUninstaller "$INSTDIR\\uninstall.exe"
  CreateDirectory "$SMPROGRAMS\\小猫工作助手"
  CreateShortcut "$SMPROGRAMS\\小猫工作助手\\小猫工作助手.lnk" "$INSTDIR\\小猫工作助手.exe"
  CreateShortcut "$DESKTOP\\小猫工作助手.lnk" "$INSTDIR\\小猫工作助手.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\小猫工作助手" "DisplayName" "小猫工作助手"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\小猫工作助手" "DisplayIcon" "$INSTDIR\\小猫工作助手.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\小猫工作助手" "UninstallString" "$INSTDIR\\uninstall.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\小猫工作助手" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\小猫工作助手" "Publisher" "小猫工作助手"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\小猫工作助手" "DisplayVersion" "${version}"
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\小猫工作助手" "NoModify" 1
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\小猫工作助手" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'taskkill /f /im "小猫工作助手.exe"'
  Sleep 500
  Delete "$INSTDIR\\uninstall.exe"
  RMDir /r "$INSTDIR"
  Delete "$SMPROGRAMS\\小猫工作助手\\小猫工作助手.lnk"
  RMDir "$SMPROGRAMS\\小猫工作助手"
  Delete "$DESKTOP\\小猫工作助手.lnk"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\小猫工作助手"
SectionEnd
`

writeFileSync(nsiPath, '\uFEFF' + nsi, 'utf-8')

console.log('makensis:', makensis)
const r = spawnSync(makensis, ['/V2', nsiPath], { cwd: root, stdio: 'inherit' })
if (r.status !== 0) throw new Error('makensis failed')
console.log('')
console.log('安装包已生成：', outFile)

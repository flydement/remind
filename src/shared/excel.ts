import type { WorkItem } from './types'
import { toLocalDate } from './time'

export interface ExcelExportOptions {
  /** 统计月份基准日期（如 2026-11 对应「11月工作完成情况」与「12月工作计划」） */
  monthDate?: Date
  /** 第一列「部门」名称，默认“部门” */
  department?: string
  /** 默认「责任人」，当工作项未单独设置责任人时使用 */
  defaultOwner?: string
  /** 是否将当前月及之前尚未完成的事项并入下月工作计划，默认 true */
  carryOverOpen?: boolean
}

export interface MonthlyExcelPlan {
  year: number
  curMonth: number
  nextMonth: number
  department: string
  doneKey: WorkItem[]
  doneNormal: WorkItem[]
  planKey: WorkItem[]
  planNormal: WorkItem[]
}

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime()
}

function byDateAsc(aIso: string, bIso: string): number {
  return new Date(aIso).getTime() - new Date(bIso).getTime()
}

export function collectMonthlyExcelPlan(
  items: WorkItem[],
  options: ExcelExportOptions = {}
): MonthlyExcelPlan {
  const ref = options.monthDate ?? new Date()
  const year = ref.getFullYear()
  const monthIdx = ref.getMonth()
  const curStart = new Date(year, monthIdx, 1, 0, 0, 0, 0)
  const curEnd = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999)
  const nextStart = new Date(year, monthIdx + 1, 1, 0, 0, 0, 0)
  const nextEnd = new Date(year, monthIdx + 2, 0, 23, 59, 59, 999)

  const curMonth = curStart.getMonth() + 1
  const nextMonth = nextStart.getMonth() + 1
  const carryOverOpen = options.carryOverOpen ?? true

  const doneItems = items
    .filter((w) => {
      if (w.status !== 'done') return false
      const anchor = w.completedAt || w.updatedAt || w.dueAt
      return inRange(anchor, curStart, curEnd) || (!w.completedAt && inRange(w.dueAt, curStart, curEnd))
    })
    .sort((a, b) => byDateAsc(a.completedAt || a.dueAt, b.completedAt || b.dueAt))

  const doneIds = new Set(doneItems.map((w) => w.id))

  const planItems = items
    .filter((w) => {
      if (doneIds.has(w.id)) return false
      if (inRange(w.dueAt, nextStart, nextEnd)) {
        return w.status !== 'done' || nextEnd.getTime() < Date.now()
      }
      if (carryOverOpen && w.status !== 'done' && new Date(w.dueAt).getTime() <= curEnd.getTime()) {
        return true
      }
      return false
    })
    .sort((a, b) => byDateAsc(a.dueAt, b.dueAt))

  return {
    year,
    curMonth,
    nextMonth,
    department: options.department?.trim() || '部门',
    doneKey: doneItems.filter((w) => w.priority === 'high'),
    doneNormal: doneItems.filter((w) => w.priority !== 'high'),
    planKey: planItems.filter((w) => w.priority === 'high'),
    planNormal: planItems.filter((w) => w.priority !== 'high')
  }
}

function escapeXml(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const

function strCell(ref: string, style: number, value?: string): string {
  if (value === undefined || value === '') {
    return `<c r="${ref}" s="${style}"/>`
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function numCell(ref: string, style: number, value: number): string {
  return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
}

function formatFinishDate(w: WorkItem, isDoneSection: boolean): string {
  const iso = isDoneSection ? w.completedAt || w.dueAt : w.dueAt
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return toLocalDate(d)
}

interface DataRowSpec {
  deptText?: string
  timeText?: string
  catText?: string
  seq: number
  content: string
  owner: string
  finishDate: string
  remark: string
  rowHeight: number
}

function buildWorksheetXml(plan: MonthlyExcelPlan, defaultOwner = ''): string {
  const fallbackOwner = defaultOwner.trim()
  const merges: string[] = []
  const dataRows: DataRowSpec[] = []

  const appendSection = (
    timeLabel: string,
    keyItems: WorkItem[],
    normalItems: WorkItem[],
    isDoneSection: boolean
  ): void => {
    const sectionStartRow = 2 + dataRows.length
    const keyCount = Math.max(1, keyItems.length)
    const normalCount = Math.max(1, normalItems.length)
    const sectionTotal = keyCount + normalCount
    // 保证左侧纵向多行标题（如「11月\n工作\n完成\n情况」）在行数较少时也不会被裁切
    const minRowHt = sectionTotal <= 2 ? 36 : sectionTotal <= 3 ? 30 : 26

    const keyStartRow = 2 + dataRows.length
    for (let i = 0; i < keyCount; i++) {
      const w = keyItems[i]
      dataRows.push({
        timeText: i === 0 ? timeLabel : undefined,
        catText: i === 0 ? '重点\n工作' : undefined,
        seq: i + 1,
        content: w ? w.title : '',
        owner: w ? (w.assignee?.trim() || fallbackOwner) : '',
        finishDate: w ? formatFinishDate(w, isDoneSection) : '',
        remark: w ? w.notes.trim() : '',
        rowHeight: minRowHt
      })
    }
    const keyEndRow = 2 + dataRows.length - 1
    if (keyEndRow > keyStartRow) {
      merges.push(`C${keyStartRow}:C${keyEndRow}`)
    }

    const normalStartRow = 2 + dataRows.length
    for (let i = 0; i < normalCount; i++) {
      const w = normalItems[i]
      dataRows.push({
        catText: i === 0 ? '一般\n工作' : undefined,
        seq: i + 1,
        content: w ? w.title : '',
        owner: w ? (w.assignee?.trim() || fallbackOwner) : '',
        finishDate: w ? formatFinishDate(w, isDoneSection) : '',
        remark: w ? w.notes.trim() : '',
        rowHeight: minRowHt
      })
    }
    const normalEndRow = 2 + dataRows.length - 1
    if (normalEndRow > normalStartRow) {
      merges.push(`C${normalStartRow}:C${normalEndRow}`)
    }

    const sectionEndRow = 2 + dataRows.length - 1
    if (sectionEndRow > sectionStartRow) {
      merges.push(`B${sectionStartRow}:B${sectionEndRow}`)
    }
  }

  appendSection(`${plan.curMonth}月\n工作\n完成\n情况`, plan.doneKey, plan.doneNormal, true)
  appendSection(`${plan.nextMonth}月\n工作\n计划`, plan.planKey, plan.planNormal, false)

  if (dataRows.length > 0) {
    dataRows[0].deptText = plan.department
  }
  const lastRow = 1 + dataRows.length
  if (lastRow > 2) {
    merges.unshift(`A2:A${lastRow}`)
  }

  const headers = ['部门', '时间', '工作\n类别', '序号', '工作内容', '责任人', '完成时间', '备注']
  const headerCells = headers
    .map((h, idx) => strCell(`${COL_LETTERS[idx]}1`, 1, h))
    .join('')

  const xmlRows: string[] = [`<row r="1" ht="34" customHeight="1">${headerCells}</row>`]

  dataRows.forEach((r, idx) => {
    const rowNum = idx + 2
    const cells = [
      strCell(`A${rowNum}`, 2, r.deptText),
      strCell(`B${rowNum}`, 2, r.timeText),
      strCell(`C${rowNum}`, 2, r.catText),
      numCell(`D${rowNum}`, 2, r.seq),
      strCell(`E${rowNum}`, 3, r.content),
      strCell(`F${rowNum}`, 2, r.owner),
      strCell(`G${rowNum}`, 2, r.finishDate),
      strCell(`H${rowNum}`, 3, r.remark)
    ].join('')
    xmlRows.push(`<row r="${rowNum}" ht="${r.rowHeight}" customHeight="1">${cells}</row>`)
  })

  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : ''

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<dimension ref="A1:H${lastRow}"/>`,
    '<sheetViews><sheetView workbookViewId="0"/></sheetViews>',
    '<sheetFormatPr defaultRowHeight="26"/>',
    '<cols>',
    '<col min="1" max="1" width="12" customWidth="1"/>',
    '<col min="2" max="2" width="12" customWidth="1"/>',
    '<col min="3" max="3" width="12" customWidth="1"/>',
    '<col min="4" max="4" width="8" customWidth="1"/>',
    '<col min="5" max="5" width="44" customWidth="1"/>',
    '<col min="6" max="6" width="13" customWidth="1"/>',
    '<col min="7" max="7" width="14" customWidth="1"/>',
    '<col min="8" max="8" width="26" customWidth="1"/>',
    '</cols>',
    `<sheetData>${xmlRows.join('')}</sheetData>`,
    mergeXml,
    '</worksheet>'
  ].join('')
}

const CONTENT_TYPES_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
  '</Types>'
].join('')

const ROOT_RELS_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
  '</Relationships>'
].join('')

const WORKBOOK_RELS_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
  '</Relationships>'
].join('')

const STYLES_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  '<fonts count="2">',
  '<font><sz val="11"/><color rgb="FF0F172A"/><name val="微软雅黑"/></font>',
  '<font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="微软雅黑"/></font>',
  '</fonts>',
  '<fills count="3">',
  '<fill><patternFill patternType="none"/></fill>',
  '<fill><patternFill patternType="gray125"/></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>',
  '</fills>',
  '<borders count="2">',
  '<border><left/><right/><top/><bottom/><diagonal/></border>',
  '<border>',
  '<left style="thin"><color rgb="FF334155"/></left>',
  '<right style="thin"><color rgb="FF334155"/></right>',
  '<top style="thin"><color rgb="FF334155"/></top>',
  '<bottom style="thin"><color rgb="FF334155"/></bottom>',
  '<diagonal/>',
  '</border>',
  '</borders>',
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
  '<cellXfs count="4">',
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>',
  '</cellXfs>',
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
  '</styleSheet>'
].join('')

function buildWorkbookXml(sheetName: string): string {
  const safeName = escapeXml(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || '工作台账')
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets>`,
    '</workbook>'
  ].join('')
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function zipStored(files: { name: string; content: string }[]): Uint8Array {
  const enc = new TextEncoder()
  const prepared = files.map((f) => {
    const nameBytes = enc.encode(f.name)
    const data = enc.encode(f.content)
    return { nameBytes, data, crc: crc32(data) }
  })

  const dosTime = 0x6000
  const dosDate = (46 << 9) | (1 << 5) | 1 // 2026-01-01

  let localTotal = 0
  let centralTotal = 0
  for (const p of prepared) {
    localTotal += 30 + p.nameBytes.length + p.data.length
    centralTotal += 46 + p.nameBytes.length
  }

  const out = new Uint8Array(localTotal + centralTotal + 22)
  const view = new DataView(out.buffer)

  let localOffset = 0
  let centralOffset = localTotal

  for (const p of prepared) {
    const itemLocalStart = localOffset
    // Local file header
    view.setUint32(localOffset, 0x04034b50, true)
    view.setUint16(localOffset + 4, 20, true)
    view.setUint16(localOffset + 6, 0x0800, true)
    view.setUint16(localOffset + 8, 0, true)
    view.setUint16(localOffset + 10, dosTime, true)
    view.setUint16(localOffset + 12, dosDate, true)
    view.setUint32(localOffset + 14, p.crc, true)
    view.setUint32(localOffset + 18, p.data.length, true)
    view.setUint32(localOffset + 22, p.data.length, true)
    view.setUint16(localOffset + 26, p.nameBytes.length, true)
    view.setUint16(localOffset + 28, 0, true)
    out.set(p.nameBytes, localOffset + 30)
    out.set(p.data, localOffset + 30 + p.nameBytes.length)
    localOffset += 30 + p.nameBytes.length + p.data.length

    // Central directory file header
    view.setUint32(centralOffset, 0x02014b50, true)
    view.setUint16(centralOffset + 4, 20, true)
    view.setUint16(centralOffset + 6, 20, true)
    view.setUint16(centralOffset + 8, 0x0800, true)
    view.setUint16(centralOffset + 10, 0, true)
    view.setUint16(centralOffset + 12, dosTime, true)
    view.setUint16(centralOffset + 14, dosDate, true)
    view.setUint32(centralOffset + 16, p.crc, true)
    view.setUint32(centralOffset + 20, p.data.length, true)
    view.setUint32(centralOffset + 24, p.data.length, true)
    view.setUint16(centralOffset + 28, p.nameBytes.length, true)
    view.setUint16(centralOffset + 30, 0, true)
    view.setUint16(centralOffset + 32, 0, true)
    view.setUint16(centralOffset + 34, 0, true)
    view.setUint16(centralOffset + 36, 0, true)
    view.setUint32(centralOffset + 38, 0, true)
    view.setUint32(centralOffset + 42, itemLocalStart, true)
    out.set(p.nameBytes, centralOffset + 46)
    centralOffset += 46 + p.nameBytes.length
  }

  // End of central directory record
  view.setUint32(centralOffset, 0x06054b50, true)
  view.setUint16(centralOffset + 4, 0, true)
  view.setUint16(centralOffset + 6, 0, true)
  view.setUint16(centralOffset + 8, prepared.length, true)
  view.setUint16(centralOffset + 10, prepared.length, true)
  view.setUint32(centralOffset + 12, centralTotal, true)
  view.setUint32(centralOffset + 16, localTotal, true)
  view.setUint16(centralOffset + 20, 0, true)

  return out
}

export function generateWorkExcelBytes(
  items: WorkItem[],
  options: ExcelExportOptions = {}
): Uint8Array {
  const plan = collectMonthlyExcelPlan(items, options)
  const sheetName = `${plan.curMonth}月完成及${plan.nextMonth}月计划`
  const sheetXml = buildWorksheetXml(plan, options.defaultOwner)

  return zipStored([
    { name: '[Content_Types].xml', content: CONTENT_TYPES_XML },
    { name: '_rels/.rels', content: ROOT_RELS_XML },
    { name: 'xl/workbook.xml', content: buildWorkbookXml(sheetName) },
    { name: 'xl/_rels/workbook.xml.rels', content: WORKBOOK_RELS_XML },
    { name: 'xl/styles.xml', content: STYLES_XML },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml }
  ])
}

export function buildExcelFilename(options: ExcelExportOptions = {}): string {
  const ref = options.monthDate ?? new Date()
  const y = ref.getFullYear()
  const m = ref.getMonth() + 1
  const nextM = ((ref.getMonth() + 1) % 12) + 1
  const dept = options.department?.trim()
  const prefix = dept && dept !== '部门' ? `${dept}-` : ''
  return `${prefix}${y}年${m}月工作完成情况及${nextM}月工作计划.xlsx`
}

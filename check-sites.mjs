// check-sites.mjs —— 站点经验库的机械门禁。
//
// 校验两件事，缺一即 exit 1：
//   ① 索引 ↔ 实体【双向一一对应】：knowledge/INDEX.md 表格第一格的反引号域名
//      与 knowledge/sites/*.md 文件名互为全集；
//   ② 每个手册文件具备必需小节（说明性文件不算手册）；
//   ③ 工作区根的注入存根 SITES.md 存在且指向 knowledge/INDEX.md。
//      （2026-10-14 重构后：存根是唯一被注入系统提示的东西，索引不再整张注入。）
//
// 用法：
//   node check-sites.mjs             # 校验真实库
//   node check-sites.mjs --self-test # 漂移自测：合成样例，确认「好的过、坏的必须红」
//
// 纯 ASCII 代码 + 显式 utf8（工作区规则 15）。
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 本脚本【自我定位】：索引与手册都在本包内的 knowledge/ 下 ⇒ 换机器 / 换目录都不用改。
const PROJ = import.meta.dirname
const INDEX_MD = join(PROJ, 'knowledge', 'INDEX.md')
const SITES_DIR = join(PROJ, 'knowledge', 'sites')

// ⚠️ 只有"注入存根"在【会话工作区根】、位于本包之外 ⇒ 换工作区要改这里，
//    或用第 1 个命令行参数 / DSH_WORKSPACE 环境变量覆盖。
const WORKSPACE = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? process.env.DSH_WORKSPACE ?? 'D:\\code\\DeepSeekHarness'
const ROOT_STUB = join(WORKSPACE, 'SITES.md')

// 手册必须有的小节（改这里就要同步改 SITES.md 里的说明与 templates）
const REQUIRED_SECTIONS = ['## 入口', '## 检索要点', '## 坑与对策', '## 实测记录']

/** 从 SITES.md 里抽出「表格第一格是反引号域名」的那些域名 */
function domainsFromIndex(text, problems) {
  const domains = []
  const lines = text.split('\n')
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim()
    if (!line.startsWith('|')) continue
    const first = line.slice(1).split('|')[0].trim()
    const m = /^`([^`]+)`$/.exec(first)
    if (!m) {
      // 第一格有反引号但不是「整格就是一个域名」⇒ 极可能是格式被改坏了
      if (first.includes('`')) problems.push(`SITES.md:${i + 1} 第一格的格式不对（应是整格一个反引号域名）: ${first}`)
      continue
    }
    domains.push(m[1])
  }
  return domains
}

function runCheck({ sitesMdPath, sitesDir }) {
  const problems = []

  if (!existsSync(sitesMdPath)) {
    return { problems: [`读不到索引文件: ${sitesMdPath}`], indexed: [], files: [] }
  }
  if (!existsSync(sitesDir)) {
    return { problems: [`读不到手册目录: ${sitesDir}`], indexed: [], files: [] }
  }

  const indexed = domainsFromIndex(readFileSync(sitesMdPath, 'utf8'), problems)
  const files = readdirSync(sitesDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))

  const dupIdx = indexed.filter((d, i) => indexed.indexOf(d) !== i)
  if (dupIdx.length > 0) problems.push(`索引里重复的域名: ${[...new Set(dupIdx)].join(', ')}`)
  const dupFile = files.filter((f, i) => files.indexOf(f) !== i)
  if (dupFile.length > 0) problems.push(`目录里重复的文件名: ${[...new Set(dupFile)].join(', ')}`)

  // ① 双向一一对应
  for (const d of indexed) if (!files.includes(d)) problems.push(`索引里有「${d}」，但 ${d}.md 不存在`)
  for (const f of files) if (!indexed.includes(f)) problems.push(`存在 ${f}.md，但索引 SITES.md 里没有它`)

  // ② 必需小节
  for (const f of files) {
    const p = join(sitesDir, `${f}.md`)
    const body = readFileSync(p, 'utf8')
    const missing = REQUIRED_SECTIONS.filter((s) => !body.includes(s))
    if (missing.length > 0) problems.push(`${f}.md 缺少必需小节: ${missing.join(' / ')}`)
    if (body.trim().length < 400) problems.push(`${f}.md 太短（${body.trim().length} 字符），像是空壳`)
  }

  return { problems, indexed, files }
}

function report({ problems, indexed, files }, title) {
  console.log(`--- ${title} ---`)
  console.log(`  索引里 ${indexed.length} 个域名: ${indexed.join(', ') || '(无)'}`)
  console.log(`  目录里 ${files.length} 个手册: ${files.join(', ') || '(无)'}`)
  if (problems.length === 0) {
    console.log('  RESULT: OK')
  } else {
    console.log(`  RESULT: FAIL (${problems.length})`)
    for (const p of problems) console.log(`    - ${p}`)
  }
  return problems.length === 0
}

// ─────────────────────────── 主流程 ───────────────────────────
if (process.argv.includes('--self-test')) {
  const root = mkdtempSync(join(tmpdir(), 'check-sites-'))
  let allGood = true
  try {
    const md = join(root, 'SITES.md')
    const dir = join(root, 'sites')
    mkdirSync(dir, { recursive: true })

    const goodBody = REQUIRED_SECTIONS.map((s) => `${s}\n`).join('\n') + '\n' + 'x'.repeat(500) + '\n'
    writeFileSync(join(dir, 'a.com.md'), goodBody, 'utf8')
    writeFileSync(join(dir, 'b.com.md'), goodBody, 'utf8')
    writeFileSync(md, [
      '# t',
      '| 域名 | 平台 |',
      '|---|---|',
      '| `a.com` | A |',
      '| `b.com` | B |',
    ].join('\n'), 'utf8')

    const clean = runCheck({ sitesMdPath: md, sitesDir: dir })
    if (!report(clean, '自测 1：完好的库应当通过')) allGood = false

    // 漂移 A：索引多一条，实体没有
    writeFileSync(md, [
      '# t',
      '| 域名 | 平台 |',
      '|---|---|',
      '| `a.com` | A |',
      '| `b.com` | B |',
      '| `ghost.com` | 幽灵 |',
    ].join('\n'), 'utf8')
    if (report(runCheck({ sitesMdPath: md, sitesDir: dir }), '自测 2：索引多一条 → 必须红')) allGood = false

    // 漂移 B：有条目但缺小节
    writeFileSync(md, ['# t', '| 域名 | 平台 |', '|---|---|', '| `a.com` | A |', '| `b.com` | B |'].join('\n'), 'utf8')
    writeFileSync(join(dir, 'b.com.md'), '## 入口\n' + 'x'.repeat(500), 'utf8')
    if (report(runCheck({ sitesMdPath: md, sitesDir: dir }), '自测 3：缺小节 → 必须红')) allGood = false

    // 漂移 C：目录多一个文件，索引没有
    writeFileSync(md, ['# t', '| 域名 | 平台 |', '|---|---|', '| `a.com` | A |'].join('\n'), 'utf8')
    writeFileSync(join(dir, 'b.com.md'), goodBody, 'utf8')
    if (report(runCheck({ sitesMdPath: md, sitesDir: dir }), '自测 4：目录多一条 → 必须红')) allGood = false
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  console.log(allGood ? '\nSELF-TEST: OK（好的过、三类漂移都红）' : '\nSELF-TEST: FAIL（自测本身有问题）')
  process.exitCode = allGood ? 0 : 1
} else {
  // 先查"注入的那份存根"：它才是 agent 每轮真正看得到的东西，缺了整条链就断了。
  const stub = existsSync(ROOT_STUB) ? readFileSync(ROOT_STUB, 'utf8') : ''
  const stubOk = stub.includes('knowledge') && stub.includes('INDEX.md')
  console.log('--- 注入存根（工作区根 SITES.md） ---')
  console.log(`  ${stubOk ? 'ok  ' : 'FAIL'} ${ROOT_STUB}  ${Buffer.byteLength(stub, 'utf8')} 字节`)
  if (!stubOk) console.log('        —— 缺失，或没指向 knowledge/INDEX.md（那样 agent 就找不到经验库）')

  const ok = report(runCheck({ sitesMdPath: INDEX_MD, sitesDir: SITES_DIR }), '站点经验库门禁') && stubOk
  if (!ok) {
    console.log('\n修法：索引与手册必须一一对应；手册缺小节就补，多了幽灵条目就删；')
    console.log('      存根 SITES.md 必须存在且指向 knowledge/INDEX.md。')
    console.log('（改了 INDEX.md 的表格格式导致解析不到，也会落进这里。）')
  }
  process.exitCode = ok ? 0 : 1
}

// 端到端探针：直接对 @playwright/mcp 说 MCP 协议（不经过 DSH），
// 验证「cmd /c npx 启动 -> initialize -> tools/list -> 真导航一次」整条链路。
// ⚠️ 会真的弹出一个有头 Chrome 窗口（这正是要验证的），结束时会关掉它。
// 纯 ASCII 代码 + 显式 utf8（规则 15）。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const PKG = '@playwright/mcp@0.0.83'
// ⚠️ 不写死用户名：profile 从 %USERPROFILE% 推导（与 cordis.patch.yml 里的 !!js 表达式同源）
const PROFILE = join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh', 'browser-profile-research')
// 产物目录 = 本脚本所在目录下的 runtime/（自我定位，不写死盘符）
const OUTDIR = join(import.meta.dirname, 'runtime')
const TARGET = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'https://www.bing.com'

// 不弹浏览器就能自检：路径推导得对不对、目录在不在
if (process.argv.includes('--dry-run')) {
  const okProfile = existsSync(PROFILE)
  const okOut = existsSync(OUTDIR)
  console.log(`  PKG     = ${PKG}`)
  console.log(`  PROFILE = ${PROFILE}`)
  console.log(`            exists=${okProfile}${okProfile ? '' : '   <-- 首次运行会新建（正常；但登录态要重新登）'}`)
  console.log(`  OUTDIR  = ${OUTDIR}`)
  // ⚠️ 目录不存在【不是错误】：它是输出目录，新 clone 下来通常为空，运行时会自动创建。
  console.log(`            exists=${okOut}${okOut ? '' : '   <-- 运行时会自动创建（不是错误）'}`)
  console.log(`  TARGET  = ${TARGET}`)
  console.log('  RESULT: OK（路径推导正确）')
  process.exit(0)
}

// ⚠️ 产物目录不存在就建：它是输出目录，新 clone 下来通常没有 —— 不建会让浏览器写失败。
//    （仓库里用 runtime/.gitkeep 保住目录本身，这里再兜一层。）
if (!existsSync(OUTDIR)) mkdirSync(OUTDIR, { recursive: true })

const child = spawn('cmd', ['/c', 'npx', '-y', PKG,
  '--browser', 'chrome',
  '--user-data-dir', PROFILE,
  '--output-dir', OUTDIR,
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
})

let buf = ''
const pending = new Map()
let nextId = 1
const stderrLines = []

child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    if (line === '') continue
    let msg
    try { msg = JSON.parse(line) } catch { console.log(`[非 JSON 输出] ${line.slice(0, 300)}`); continue }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id)
      pending.delete(msg.id)
      resolve(msg)
    } else if (msg.method) {
      // 服务器通知，忽略
    }
  }
})
child.stderr.setEncoding('utf8')
child.stderr.on('data', (d) => { for (const l of d.split('\n')) if (l.trim()) stderrLines.push(l.trim()) })

const send = (method, params) => {
  const id = nextId++
  const payload = { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }
  child.stdin.write(JSON.stringify(payload) + '\n')
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve })
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`超时: ${method}`)) } }, 90000)
  })
}
const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) }) + '\n')

const fail = []
const ok = (m) => console.log(`  ok   ${m}`)
const bad = (m) => { fail.push(m); console.log(`  FAIL ${m}`) }

try {
  console.log('[1] initialize')
  const init = await send('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'dsh-preset-research-probe', version: '1.0.0' },
  })
  const si = init.result?.serverInfo
  si ? ok(`serverInfo: ${si.name} ${si.version}`) : bad(`initialize 无 serverInfo: ${JSON.stringify(init).slice(0, 300)}`)
  init.result?.protocolVersion ? ok(`协议版本 ${init.result.protocolVersion}`) : bad('无 protocolVersion')
  notify('notifications/initialized')

  console.log('[2] tools/list')
  const list = await send('tools/list', {})
  const tools = (list.result?.tools ?? []).map((t) => t.name)
  tools.length > 0 ? ok(`拿到 ${tools.length} 个工具`) : bad('工具列表为空')
  const interesting = tools.filter((t) => /navigate|click|type|snapshot|screenshot|wait|tab|close/i.test(t))
  console.log(`       关键工具: ${interesting.join(', ') || '(无)'}`)
  for (const need of ['browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type', 'browser_wait_for']) {
    tools.includes(need) ? ok(`有 ${need}`) : bad(`缺 ${need}`)
  }

  console.log(`[3] 真导航一次 -> ${TARGET}`)
  const t0 = Date.now()
  const nav = await send('tools/call', { name: 'browser_navigate', arguments: { url: TARGET } })
  const ms = Date.now() - t0
  if (nav.result?.isError) bad(`navigate 返回错误: ${JSON.stringify(nav.result).slice(0, 400)}`)
  else ok(`navigate 成功，用时 ${ms}ms`)
  const navText = JSON.stringify(nav.result ?? {}).slice(0, 400)
  console.log(`       ${navText}`)

  console.log('[4] 读一次页面快照（证明页面真的加载了内容）')
  const snap = await send('tools/call', { name: 'browser_snapshot', arguments: {} })
  const snapText = JSON.stringify(snap.result ?? {})
  if (snap.result?.isError) bad(`snapshot 返回错误: ${snapText.slice(0, 400)}`)
  else if (snapText.length < 200) bad(`snapshot 内容过短（页面可能是空的）: ${snapText.slice(0, 300)}`)
  else ok(`snapshot 拿到 ${snapText.length} 字节内容`)

  console.log('[5] 收尾：关掉浏览器')
  try { const c = await send('tools/call', { name: 'browser_close', arguments: {} }); c.result?.isError ? console.log('       (close 报错，忽略)') : ok('browser_close 成功') } catch (e) { console.log(`       (close 超时/失败，忽略: ${e.message})`) }
} catch (e) {
  bad(`链路异常: ${e.message}`)
} finally {
  if (stderrLines.length) {
    console.log('[server stderr 前 15 行]')
    for (const l of stderrLines.slice(0, 15)) console.log(`       ${l}`)
  }
  try { child.kill() } catch { /* ignore */ }
  console.log(fail.length === 0 ? '\nRESULT: OK' : `\nRESULT: FAIL (${fail.length})`)
  for (const f of fail) console.log(`  - ${f}`)
  process.exitCode = fail.length === 0 ? 0 : 1
}

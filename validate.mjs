// 安装前校验：dsh-preset-research 的 package.json 与 cordis.patch.yml。
// 用 profile 里现成的 yaml 包解析（含 !!js 自定义标签）。纯 ASCII 代码（规则 15）。
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const root = import.meta.dirname
// ⚠️ 不写死用户名：从 %USERPROFILE% 推导 DSH profile 目录（那里装着 yaml 包）
const req = createRequire(join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh', 'profiles', 'package.json'))
const YAML = req('yaml')

const fail = []
const ok = (m) => console.log(`  ok   ${m}`)
const bad = (m) => { fail.push(m); console.log(`  FAIL ${m}`) }
// 行首写 /regex/ 会被上一行末尾「除以」掉（ASI），所以收进 helper
const isAbsWin = (p) => /^[A-Za-z]:\\/.test(p ?? '')

// ---- package.json ----
console.log('[1] package.json')
const pkgRaw = readFileSync(join(root, 'package.json'), 'utf8')
let pkg
try { pkg = JSON.parse(pkgRaw); ok('JSON 合法') } catch (e) { bad(`JSON 解析失败: ${e.message}`) }
if (pkg) {
  pkg.name === 'dsh-preset-research' ? ok(`name=${pkg.name}`) : bad(`name 异常: ${pkg.name}`)
  pkg.dsh?.bundle?.patch === './cordis.patch.yml' ? ok('dsh.bundle.patch 指向正确') : bad('dsh.bundle.patch 缺失/不对')
  pkg.private === true ? ok('private=true') : bad('应设 private: true')
}

// ---- cordis.patch.yml ----
console.log('[2] cordis.patch.yml 解析')
const text = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
const jsTag = { tag: 'tag:yaml.org,2002:js', resolve: (v) => v }
let doc
try {
  doc = YAML.parse(text, { customTags: [jsTag], logLevel: 'silent' })
  ok('YAML 解析通过（含 !!js 标签）')
} catch (e) { bad(`YAML 解析失败: ${e.message}`) }

if (doc) {
  Array.isArray(doc) ? ok(`顶层是数组，${doc.length} 项`) : bad('顶层不是数组')
  const ins = doc.find((e) => e && e.insert)
  ins ? ok('存在 insert 条目') : bad('没有 insert 条目（新增必须写在 insert 下）')

  const rows = ins?.insert ?? []
  const preset = rows.find((r) => r.id === 'preset-research')
  preset ? ok(`找到 preset-research 行`) : bad('找不到 preset-research 行')
  preset?.name === '@deepseek-ai/dsh-agent-preset' ? ok('name = dsh-agent-preset') : bad(`name 不对: ${preset?.name}`)
  // ⚠️ id 是【会话日志里存的那个标识符】—— 改了它，已有会话在重启恢复时会被拒绝（"缺失时拒绝恢复"）。
  preset?.config?.id === 'research'
    ? ok('config.id = research（**不要改**：已有会话靠它恢复）')
    : bad(`config.id 不对: ${preset?.config?.id} —— 改 id 会让已有会话无法恢复！`)
  typeof preset?.config?.order === 'number' ? ok(`config.order = ${preset.config.order}`) : bad('config.order 不是数字')
  // 展示名可以改，但必须"有意地改"：改这里就要同步改这条断言（防止手滑改掉模式名）。
  const EXPECTED_NAME = 'Chrome信息检索模式'
  preset?.config?.name === EXPECTED_NAME
    ? ok(`展示名 = ${preset.config.name}`)
    : bad(`展示名是 "${preset?.config?.name}"，期望 "${EXPECTED_NAME}"（要改名就同步改本断言）`)

  const plugins = preset?.config?.plugins
  Array.isArray(plugins) ? ok(`plugins 是数组，${plugins.length} 条`) : bad('plugins 不是数组')

  // 每条子插件必须能表达成「有 id + name」
  const problems = []
  for (const [i, p] of (plugins ?? []).entries()) {
    if (!p || typeof p !== 'object') { problems.push(`#${i} 不是对象`); continue }
    if (!p.id) problems.push(`#${i} 缺 id`)
    if (!p.name && !p.group) problems.push(`#${i} (${p.id}) 缺 name 且不是 group`)
  }
  problems.length === 0 ? ok('每条子插件都有 id/name') : bad(`子插件问题: ${problems.join('; ')}`)

  // 关键子插件与关键配置
  const byId = Object.fromEntries((plugins ?? []).filter(Boolean).map((p) => [p.id, p]))
  for (const need of ['persona', 'tool-ask-user', 'tool-web', 'tool-todo', 'mcp-browser', 'tool-pwsh', 'tool-fs']) {
    byId[need] ? ok(`含子插件 ${need}`) : bad(`缺少子插件 ${need}`)
  }
  // 重复 id 会让声明加载失败
  const ids = (plugins ?? []).filter(Boolean).map((p) => p.id)
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i)
  dup.length === 0 ? ok('子插件 id 无重复') : bad(`子插件 id 重复: ${[...new Set(dup)].join(',')}`)
  byId['tool-plugin-manager']?.disabled === true ? ok('plugin-manager 已关闭') : bad('plugin-manager 应 disabled: true')

  const persona = byId['persona']?.config ?? {}
  ;(persona.suffix ?? '').includes('ask_user_question') ? ok('persona 里含人机验证交接指令') : bad('persona 缺交接指令')
  ;(persona.suffix ?? '').includes('mcp__browser__') ? ok('persona 里含浏览器自检指令') : bad('persona 缺自检指令')

  // ---- MCP 行 ----
  console.log('[3] mcp-browser 行')
  const m = byId['mcp-browser']
  m?.name === '@deepseek-ai/dsh-mcp-client' ? ok('name = dsh-mcp-client') : bad(`name 不对: ${m?.name}`)
  const c = m?.config ?? {}
  c.serverName === 'browser' ? ok('serverName = browser（工具名 mcp__browser__*）') : bad(`serverName 不对: ${c.serverName}`)
  c.transport === 'stdio' ? ok('transport = stdio') : bad(`transport 不对: ${c.transport}`)
  c.command === 'cmd' ? ok('command = cmd（Windows 必须 cmd /c 才能跑 npx）') : bad(`command 不对: ${c.command}`)
  Array.isArray(c.args) ? ok(`args ${c.args.length} 项`) : bad('args 不是数组')
  const args = c.args ?? []
  args.some((a) => a === null || a === undefined || a === '') ? bad('args 里有空项') : ok('args 无空项')
  const s = args.join(' ')
  for (const [need, label] of [['/c', 'cmd /c'], ['npx', 'npx'], ['@playwright/mcp@', '包名带版本'], ['--browser chrome', '--browser chrome'], ['--user-data-dir', '--user-data-dir'], ['--output-dir', '--output-dir'], ['--output-max-size', '--output-max-size']]) {
    s.includes(need) ? ok(`args 含 ${label}`) : bad(`args 缺 ${label}`)
  }
  // ⚠️ 产物必须有上限，否则 runtime/ 会无上限膨胀（2026-10-14 实测涨到 6.4 MB / 319 个文件）
  {
    const i = args.indexOf('--output-max-size')
    const v = i === -1 ? NaN : Number(args[i + 1])
    Number.isFinite(v) && v > 0
      ? ok(`output-max-size = ${v} 字节（Playwright 自己淘汰最旧的产物）`)
      : bad('--output-max-size 缺失或不是正整数 —— runtime/ 会无上限膨胀')
  }
  // 两个路径必须是绝对路径
  const udd = args[args.indexOf('--user-data-dir') + 1]
  const od = args[args.indexOf('--output-dir') + 1]
  // user-data-dir：允许字面绝对路径，也允许 !!js 表达式；
  // ⚠️ 但**开源包里不许出现写死的用户名目录**（2026-10-14：原先写死 C:\Users\<user>\…）。
  const uddIsExpr = typeof udd === 'string' && /getBuiltinModule|process\.env/u.test(udd)
  const uddHardcodesUser = typeof udd === 'string' && /[A-Za-z]:\\Users\\/u.test(udd)
  if (uddHardcodesUser) bad(`user-data-dir 里写死了用户目录（开源包不许带用户名）: ${udd}`)
  else if (isAbsWin(udd)) ok('user-data-dir 是字面绝对路径（⚠️ 下载者需自行修改）')
  else if (uddIsExpr) ok('user-data-dir 由 !!js 推导（不含用户名、可移植）')
  else bad(`user-data-dir 既不是绝对路径也不是 !!js 表达式: ${JSON.stringify(udd)}`)
  isAbsWin(od) ? ok(`output-dir 是绝对路径`) : bad(`output-dir 不是绝对 Windows 路径: ${od}`)
  c.failOnStartupError === false ? ok('failOnStartupError = false（浏览器挂了不拖垮整个模式）') : bad('failOnStartupError 应为 false')
  typeof c.toolCallTimeoutMs === 'number' && c.toolCallTimeoutMs >= 60000 ? ok(`toolCallTimeoutMs = ${c.toolCallTimeoutMs}`) : bad('toolCallTimeoutMs 偏小')

  // output-dir 需要可写（不存在就建）
  console.log('[4] output-dir')
  if (od && isAbsWin(od)) {
    try { mkdirSync(od, { recursive: true }); ok(`可创建/已存在: ${od}`) } catch (e) { bad(`建不了 output-dir: ${e.message}`) }
  }

  // ---- 站点经验库：已插件化 —— 这里守"它确实交出去了、而且没有两份来源" ----
  console.log('[5] 站点经验库（已由 dsh-site-experience 插件承担）')
  const cands = byId['agent-instructions']?.config?.instructionFileCandidates
  Array.isArray(cands) ? ok(`instructionFileCandidates = ${cands.join(', ')}`) : bad('agent-instructions 缺 instructionFileCandidates')
  for (const need of ['AGENTS.md', 'CLAUDE.md']) {
    (cands ?? []).includes(need)
      ? ok(`候选含 ${need}`)
      : bad(`候选漏了 ${need}（该字段是【整个数组替换】，漏掉会让原有指令文件静默不再加载）`)
  }
  // ⚠️ 插件化后【必须不再】注入 SITES.md：库的位置与纪律改由插件的 systemPrompt 段承担。
  //    留着它会让库出现两份来源（工作区根 + 插件目录）而互相漂移。
  (cands ?? []).includes('SITES.md')
    ? bad('候选里仍有 SITES.md —— 插件化后它与插件的库会形成两份来源，必须删掉')
    : ok('候选里没有 SITES.md（库的唯一来源是插件）')
  // 本包不该再自带 knowledge/（已搬进插件）
  existsSync(join(root, 'knowledge'))
    ? bad('本包还有 knowledge/ —— 库已搬进 dsh-site-experience，重复会漂移')
    : ok('本包不再自带 knowledge/（唯一来源是插件）')
  // persona 必须指向插件，并保留"插件不可用就如实说"的兜底
  const suffix = persona.suffix ?? ''
  suffix.includes('dsh-site-experience') ? ok('persona 指向了 dsh-site-experience 插件') : bad('persona 没提插件')
  suffix.includes('不可用') ? ok('persona 有"插件不可用"的兜底') : bad('persona 缺"插件不可用"的兜底')
  // 配套：插件本体、它的库、它的门禁都在
  const PLUGIN = 'D:/code/DeepSeekHarness/PluginWork/dsh-site-experience'
  existsSync(PLUGIN) ? ok(`插件目录在: ${PLUGIN}`) : bad(`插件目录不在: ${PLUGIN}（经验库会整体失效）`)
  existsSync(`${PLUGIN}/knowledge/INDEX.md`) ? ok('插件的 knowledge/INDEX.md 在') : bad('插件的 knowledge/INDEX.md 不在')
  existsSync(`${PLUGIN}/check-sites.mjs`) ? ok('插件的门禁脚本在') : bad('插件的门禁脚本不在')
}

console.log(fail.length === 0 ? '\nRESULT: OK' : `\nRESULT: FAIL (${fail.length})`)
for (const f of fail) console.log(`  - ${f}`)
process.exitCode = fail.length === 0 ? 0 : 1

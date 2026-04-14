#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = __dirname

const cfg = {
  skillsDir: path.join(projectRoot, 'skills'),
  outPath: path.join(projectRoot, 'data/skills.json'),
  iconSearchPaths: [
    'resources/ic_launcher.webp', 'resources/ic_launcher.png',
    'resources/ic_launcher.jpg', 'resources/ic_launcher.svg',
    'assets/ic_launcher.webp', 'assets/ic_launcher.png',
    'assets/ic_launcher.jpg', 'assets/ic_launcher.svg',
    'res/ic_launcher.webp', 'res/ic_launcher.png',
    'ic_launcher.webp', 'ic_launcher.png',
  ],
}

const log = (...args) => console.log('[build]', ...args)
const warn = (...args) => console.warn('[build] ⚠', ...args)

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: raw }

  const [, yaml, body] = m
  const lines = yaml.split(/\r?\n/)

  const data = {}
  let currentListKey = null

  for (const rawLine of lines) {
    if (rawLine.trim() === '' || rawLine.trim().startsWith('#')) continue

    const listItem = rawLine.match(/^\s+-\s+(.*)$/)
    if (listItem && currentListKey) {
      data[currentListKey].push(stripQuotes(listItem[1].trim()))
      continue
    }

    const kv = rawLine.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (!kv) {
      currentListKey = null
      continue
    }

    const [, key, valueRaw] = kv
    const value = valueRaw.trim()

    if (value === '') {
      data[key] = []
      currentListKey = key
    } else {
      currentListKey = null
      if (/^-?\d+$/.test(value)) {
        data[key] = parseInt(value, 10)
      } else if (/^-?\d+\.\d+$/.test(value)) {
        data[key] = parseFloat(value)
      } else {
        data[key] = stripQuotes(value)
      }
    }
  }

  return { data, body }
}

function parseJsdoc(scriptPath) {
  let content
  try {
    content = fs.readFileSync(scriptPath, 'utf8')
  } catch {
    return null
  }

  const block = content.match(/\/\*\*([\s\S]*?)\*\//)
  if (!block) return null

  const lines = block[1]
    .split('\n')
    .map((l) => l.trim().replace(/^\*\s?/, '').trim())
    .filter((l) => l !== '')

  const result = { name: null, info: { description: '', args: [] } }

  for (const line of lines) {
    if (!line.startsWith('@')) continue

    const m = line.match(/^@(\w+)(?::([\w-]+))?\s*(.*)$/)
    if (!m) continue
    const [, tag, lang, rest] = m

    switch (tag) {
      case 'command': {
        if (!lang) result.name = rest.trim()
        break
      }
      case 'description': {
        const text = rest.trim()
        if (lang) {
          result.info.i18n ??= {}
          result.info.i18n[lang] ??= {}
          result.info.i18n[lang].description = text
        } else {
          result.info.description = text
        }
        break
      }
      case 'arg': {
        if (lang) {
          const mm = rest.match(/^(\S+)\s+(.*)$/)
          if (!mm) break
          const [, argName, argDesc] = mm
          result.info.i18n ??= {}
          result.info.i18n[lang] ??= {}
          result.info.i18n[lang].args ??= {}
          result.info.i18n[lang].args[argName] = argDesc.trim()
        } else {
          const mm = rest.match(
            /^(\S+?)(?::([\w.-]+))?(!)?(?:=(\S+))?(?:\s+(.*))?$/,
          )
          if (!mm) break
          const [, argName, argType, bang, defVal, argDesc] = mm
          result.info.args.push({
            name: argName,
            type: argType || 'string',
            required: !!bang,
            default: defVal ?? null,
            description: (argDesc || '').trim(),
          })
        }
        break
      }
    }
  }

  return result
}

function scanScriptCommands(skillDir) {
  const scriptsDir = path.join(skillDir, 'scripts')
  if (!fs.existsSync(scriptsDir)) return {}

  const commands = {}
  let files
  try {
    files = fs.readdirSync(scriptsDir).sort()
  } catch {
    return {}
  }

  for (const f of files) {
    if (f.startsWith('_') || f.startsWith('.')) continue
    if (!/\.(m?js|ts)$/.test(f)) continue

    const parsed = parseJsdoc(path.join(scriptsDir, f))
    const fallbackName = f.replace(/\.(m?js|ts)$/, '')
    const name = parsed?.name || fallbackName
    commands[name] = parsed ? parsed.info : { description: '', args: [] }
  }

  return commands
}

function findIconExt(skillDir) {
  for (const rel of cfg.iconSearchPaths) {
    const p = path.join(skillDir, rel)
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return (path.extname(p).toLowerCase() || '.png').slice(1)
    }
  }
  return null
}

function scanSkills() {
  if (!fs.existsSync(cfg.skillsDir)) {
    warn(`skills/ directory not found: ${cfg.skillsDir}`)
    return []
  }

  const entries = fs.readdirSync(cfg.skillsDir, { withFileTypes: true })
  const skills = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

    const skillDir = path.join(cfg.skillsDir, entry.name)
    const skillMd = path.join(skillDir, 'SKILL.md')

    if (!fs.existsSync(skillMd)) {
      warn(`skip ${entry.name}/ — missing SKILL.md`)
      continue
    }

    try {
      const raw = fs.readFileSync(skillMd, 'utf8')
      const { data } = parseFrontmatter(raw)

      const displayName =
        data.display_name || data.app_name || data.name || entry.name

      let requires
      if (Array.isArray(data.requires)) {
        requires = data.requires.map(String)
      } else if (typeof data.requires === 'string') {
        requires = [data.requires]
      }

      skills.push({
        id: entry.name,
        display_name: displayName,
        description: data.description || '',
        version: data.version != null ? String(data.version) : null,
        author: data.author || null,
        category: data.category || null,
        package: data.package || null,
        bundle_id: data.bundle_id || null,
        tags: Array.isArray(data.tags) ? data.tags : [],
        requires: requires || [],
        commands: scanScriptCommands(skillDir),
        icon: findIconExt(skillDir),
      })
    } catch (err) {
      warn(`failed to parse ${entry.name}/SKILL.md: ${err.message}`)
    }
  }

  skills.sort((a, b) => a.id.localeCompare(b.id))
  return skills
}

function main() {
  const skills = scanSkills()
  log(`found ${skills.length} skills`)

  const payload = {
    version: 1,
    generated_at: new Date().toISOString(),
    total: skills.length,
    skills,
  }

  fs.mkdirSync(path.dirname(cfg.outPath), { recursive: true })
  fs.writeFileSync(cfg.outPath, JSON.stringify(payload, null, 2) + '\n')
  log(`wrote ${path.relative(projectRoot, cfg.outPath)}`)
}

main()

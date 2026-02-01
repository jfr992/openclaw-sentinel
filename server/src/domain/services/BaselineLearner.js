/**
 * BaselineLearner - Learn normal behavior patterns to reduce false positives
 *
 * Tracks:
 * - Command frequency by tool type
 * - Common file paths accessed
 * - Normal exec commands
 * - Typical activity times
 *
 * After learning period, flags anomalies that deviate from baseline.
 */

import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import os from 'os'

const BASELINE_FILE = process.env.BASELINE_FILE ||
  path.join(os.homedir(), '.openclaw', 'sentinel-baseline.json')

const DEFAULT_CONFIG = {
  learningPeriodHours: 24,  // Hours before baseline is "learned"
  anomalyThreshold: 3.0,     // Multiplier for "unusual" activity
  sensitivity: 'medium',     // low, medium, high
  whitelistCommands: [],     // Commands to always allow
  whitelistPaths: [],        // Paths to always allow
  whitelistTools: []         // Tools to always allow
}

export class BaselineLearner extends EventEmitter {
  constructor(opts = {}) {
    super()
    this.configPath = opts.configPath || BASELINE_FILE
    this.baseline = this._load()
    this.currentWindow = {
      tools: {},
      commands: {},
      paths: {},
      startedAt: Date.now()
    }

    // Save periodically
    this._saveInterval = setInterval(() => this._save(), 60000)
  }

  _load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
        return {
          ...this._defaultBaseline(),
          ...data
        }
      }
    } catch (err) {
      console.error('[Baseline] Failed to load:', err.message)
    }
    return this._defaultBaseline()
  }

  _save() {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.baseline, null, 2))
    } catch (err) {
      console.error('[Baseline] Failed to save:', err.message)
    }
  }

  _defaultBaseline() {
    return {
      config: { ...DEFAULT_CONFIG },
      windows: [],           // Historical windows
      learned: false,        // Has learning period completed?
      startedAt: Date.now(),
      stats: {
        toolCounts: {},      // tool -> count
        commandCounts: {},   // command pattern -> count
        pathCounts: {},      // path pattern -> count
        hourlyActivity: {}   // hour -> count
      }
    }
  }

  /**
   * Record a tool call for learning
   */
  recordToolCall(toolCall) {
    const { name, arguments: args } = toolCall

    // Update current window
    this.currentWindow.tools[name] = (this.currentWindow.tools[name] || 0) + 1

    // Track exec commands
    if (name === 'exec' && args?.command) {
      const cmdPattern = this._normalizeCommand(args.command)
      this.currentWindow.commands[cmdPattern] = (this.currentWindow.commands[cmdPattern] || 0) + 1
      this.baseline.stats.commandCounts[cmdPattern] = (this.baseline.stats.commandCounts[cmdPattern] || 0) + 1
    }

    // Track file paths
    if (['Read', 'Write', 'Edit'].includes(name) && (args?.path || args?.file_path)) {
      const pathPattern = this._normalizePath(args.path || args.file_path)
      this.currentWindow.paths[pathPattern] = (this.currentWindow.paths[pathPattern] || 0) + 1
      this.baseline.stats.pathCounts[pathPattern] = (this.baseline.stats.pathCounts[pathPattern] || 0) + 1
    }

    // Update global stats
    this.baseline.stats.toolCounts[name] = (this.baseline.stats.toolCounts[name] || 0) + 1

    // Track hourly activity
    const hour = new Date().getHours().toString()
    this.baseline.stats.hourlyActivity[hour] = (this.baseline.stats.hourlyActivity[hour] || 0) + 1

    // Check if learning period complete
    this._checkLearned()

    // Flush window periodically (every hour)
    if (Date.now() - this.currentWindow.startedAt > 3600000) {
      this._flushWindow()
    }
  }

  _flushWindow() {
    this.baseline.windows.push({
      ...this.currentWindow,
      endedAt: Date.now()
    })

    // Keep only last 168 windows (1 week of hourly data)
    if (this.baseline.windows.length > 168) {
      this.baseline.windows = this.baseline.windows.slice(-168)
    }

    this.currentWindow = {
      tools: {},
      commands: {},
      paths: {},
      startedAt: Date.now()
    }

    this._save()
  }

  _checkLearned() {
    if (this.baseline.learned) return

    const toolsLearned = Object.keys(this.baseline.stats.toolCounts).length
    const commandsLearned = Object.keys(this.baseline.stats.commandCounts).length
    const hoursElapsed = (Date.now() - this.baseline.startedAt) / 3600000

    // Consider learned if:
    // 1. 24h has passed (original behavior), OR
    // 2. We have enough data (10+ tools AND 100+ commands) - for seeded baselines
    const hasEnoughData = toolsLearned >= 10 && commandsLearned >= 100
    const timeElapsed = hoursElapsed >= this.baseline.config.learningPeriodHours

    if (timeElapsed || hasEnoughData) {
      this.baseline.learned = true
      this.emit('learned', {
        hoursElapsed,
        toolsLearned,
        commandsLearned,
        reason: hasEnoughData ? 'data-volume' : 'time-elapsed'
      })
    }
  }

  /**
   * Check if a tool call is anomalous (after learning period)
   */
  isAnomaly(toolCall) {
    // During learning period, nothing is anomalous
    if (!this.baseline.learned) {
      return { isAnomaly: false, reason: 'learning' }
    }

    const { name, arguments: args } = toolCall
    const config = this.baseline.config

    // Check whitelists
    if (config.whitelistTools.includes(name)) {
      return { isAnomaly: false, reason: 'whitelisted_tool' }
    }

    if (name === 'exec' && args?.command) {
      const cmd = args.command
      if (config.whitelistCommands.some(w => cmd.includes(w))) {
        return { isAnomaly: false, reason: 'whitelisted_command' }
      }

      // Check if command pattern is known
      const cmdPattern = this._normalizeCommand(cmd)
      if (!this.baseline.stats.commandCounts[cmdPattern]) {
        return {
          isAnomaly: true,
          reason: 'unknown_command',
          details: `Command pattern "${cmdPattern}" never seen before`
        }
      }
    }

    if (['Read', 'Write', 'Edit'].includes(name)) {
      const filePath = args?.path || args?.file_path
      if (filePath && config.whitelistPaths.some(w => filePath.includes(w))) {
        return { isAnomaly: false, reason: 'whitelisted_path' }
      }
    }

    // Check if tool is rarely used
    const toolCount = this.baseline.stats.toolCounts[name] || 0
    const avgToolCount = Object.values(this.baseline.stats.toolCounts)
      .reduce((a, b) => a + b, 0) / Object.keys(this.baseline.stats.toolCounts).length

    if (toolCount < avgToolCount / config.anomalyThreshold) {
      return {
        isAnomaly: true,
        reason: 'rare_tool',
        details: `Tool "${name}" used ${toolCount} times (avg: ${Math.round(avgToolCount)})`
      }
    }

    return { isAnomaly: false, reason: 'normal' }
  }

  /**
   * Normalize command to a pattern (remove specific values)
   */
  _normalizeCommand(cmd) {
    // Extract base command (first word)
    const parts = cmd.trim().split(/\s+/)
    const base = parts[0]

    // Group by base command + key flags
    // e.g., "ls -la /some/path" -> "ls -la"
    // e.g., "git commit -m 'msg'" -> "git commit -m"
    const flags = parts.slice(1).filter(p => p.startsWith('-')).join(' ')
    return flags ? `${base} ${flags}` : base
  }

  /**
   * Normalize path to a pattern (remove specific filenames)
   */
  _normalizePath(filePath) {
    // Get directory + extension pattern
    const dir = path.dirname(filePath)
    const ext = path.extname(filePath)
    return ext ? `${dir}/*${ext}` : `${dir}/*`
  }

  /**
   * Add to whitelist
   */
  whitelist(type, value) {
    const key = `whitelist${type.charAt(0).toUpperCase() + type.slice(1)}s`
    if (this.baseline.config[key] && !this.baseline.config[key].includes(value)) {
      this.baseline.config[key].push(value)
      this._save()
      return true
    }
    return false
  }

  /**
   * Update config
   */
  updateConfig(updates) {
    this.baseline.config = { ...this.baseline.config, ...updates }
    this._save()
  }

  /**
   * Reset learning
   */
  reset() {
    this.baseline = this._defaultBaseline()
    this._save()
  }

  /**
   * Get current status
   */
  getStatus() {
    const toolsLearned = Object.keys(this.baseline.stats.toolCounts).length
    const commandsLearned = Object.keys(this.baseline.stats.commandCounts).length
    const hoursElapsed = (Date.now() - this.baseline.startedAt) / 3600000

    // Calculate progress from both time AND data volume
    const timeProgress = Math.min(100, (hoursElapsed / this.baseline.config.learningPeriodHours) * 100)
    const dataProgress = Math.min(100, ((toolsLearned / 10) * 50) + ((commandsLearned / 100) * 50))
    const learningProgress = Math.round(Math.max(timeProgress, dataProgress))

    return {
      learned: this.baseline.learned,
      learningProgress,
      hoursElapsed: Math.round(hoursElapsed),
      hoursRemaining: this.baseline.learned ? 0 : Math.max(0, Math.round(this.baseline.config.learningPeriodHours - hoursElapsed)),
      config: this.baseline.config,
      stats: {
        toolsLearned,
        commandsLearned,
        pathsLearned: Object.keys(this.baseline.stats.pathCounts).length,
        windowsCollected: this.baseline.windows.length
      }
    }
  }

  /**
   * Get top patterns (for display)
   */
  getTopPatterns(limit = 10) {
    const sortByCount = (obj) => Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([pattern, count]) => ({ pattern, count }))

    return {
      tools: sortByCount(this.baseline.stats.toolCounts),
      commands: sortByCount(this.baseline.stats.commandCounts),
      paths: sortByCount(this.baseline.stats.pathCounts)
    }
  }

  destroy() {
    if (this._saveInterval) {
      clearInterval(this._saveInterval)
    }
    this._save()
  }
}

export default BaselineLearner

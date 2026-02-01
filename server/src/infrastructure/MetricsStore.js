/**
 * MetricsStore - SQLite storage for usage metrics
 * Stores data in 5-minute buckets for flexible time range queries
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const BUCKET_SIZE_MS = 5 * 60 * 1000 // 5 minutes

export class MetricsStore {
  constructor(dbPath) {
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this._initSchema()
  }

  _initSchema() {
    this.db.exec(`
      -- Usage metrics (5-min buckets)
      CREATE TABLE IF NOT EXISTS usage_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket_start TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'unknown',
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read INTEGER DEFAULT 0,
        cache_write INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        tool_calls INTEGER DEFAULT 0,
        UNIQUE(bucket_start, model)
      );
      
      CREATE INDEX IF NOT EXISTS idx_usage_time ON usage_metrics(bucket_start);
      CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_metrics(model);
      
      -- Performance metrics (5-min buckets)
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket_start TEXT NOT NULL UNIQUE,
        task_completion_rate REAL DEFAULT 0,
        avg_latency_ms INTEGER DEFAULT 0,
        tool_success_rate REAL DEFAULT 0,
        memory_usage_rate REAL DEFAULT 0,
        proactive_score INTEGER DEFAULT 0,
        overall_score INTEGER DEFAULT 0,
        tasks_completed INTEGER DEFAULT 0,
        tool_calls_total INTEGER DEFAULT 0,
        tool_calls_failed INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_perf_time ON performance_metrics(bucket_start);
      
      -- Insights metrics (5-min buckets)
      CREATE TABLE IF NOT EXISTS insights_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket_start TEXT NOT NULL UNIQUE,
        health_score INTEGER DEFAULT 0,
        corrections_count INTEGER DEFAULT 0,
        sentiment_score INTEGER DEFAULT 0,
        context_health INTEGER DEFAULT 0,
        confusion_signals INTEGER DEFAULT 0,
        reask_count INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_insights_time ON insights_metrics(bucket_start);
      
      -- Memory stats (5-min buckets)
      CREATE TABLE IF NOT EXISTS memory_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket_start TEXT NOT NULL UNIQUE,
        agents_count INTEGER DEFAULT 0,
        files_indexed INTEGER DEFAULT 0,
        chunks_total INTEGER DEFAULT 0,
        cache_entries INTEGER DEFAULT 0,
        vector_ready INTEGER DEFAULT 0,
        fts_ready INTEGER DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_memory_time ON memory_stats(bucket_start);
      
      -- Security events (individual events, not bucketed)
      CREATE TABLE IF NOT EXISTS security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT DEFAULT 'low',
        tool_name TEXT,
        command TEXT,
        risk_score REAL DEFAULT 0,
        acknowledged INTEGER DEFAULT 0,
        details TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_security_time ON security_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_security_type ON security_events(event_type);
      
      -- Sync state
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)
  }

  /**
   * Get bucket start time for a timestamp
   */
  _getBucket(timestamp) {
    const ts = new Date(timestamp).getTime()
    const bucketStart = Math.floor(ts / BUCKET_SIZE_MS) * BUCKET_SIZE_MS
    return new Date(bucketStart).toISOString()
  }

  /**
   * Upsert usage metrics for a message
   */
  recordUsage(message) {
    if (!message.usage && !message.message?.usage) return
    
    const usage = message.usage || message.message?.usage
    const timestamp = message.timestamp || new Date().toISOString()
    const model = message.model || message.message?.model || 'unknown'
    const bucket = this._getBucket(timestamp)
    
    const stmt = this.db.prepare(`
      INSERT INTO usage_metrics (bucket_start, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd, message_count, tool_calls)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(bucket_start, model) DO UPDATE SET
        input_tokens = input_tokens + excluded.input_tokens,
        output_tokens = output_tokens + excluded.output_tokens,
        cache_read = cache_read + excluded.cache_read,
        cache_write = cache_write + excluded.cache_write,
        cost_usd = cost_usd + excluded.cost_usd,
        message_count = message_count + 1,
        tool_calls = tool_calls + excluded.tool_calls
    `)
    
    stmt.run(
      bucket,
      model,
      usage.input || 0,
      usage.output || 0,
      usage.cacheRead || 0,
      usage.cacheWrite || 0,
      usage.cost?.total || 0,
      0 // tool_calls counted separately
    )
  }

  /**
   * Record tool call
   */
  recordToolCall(toolCall) {
    const timestamp = toolCall.timestamp || new Date().toISOString()
    const bucket = this._getBucket(timestamp)
    const model = 'tools'
    
    const stmt = this.db.prepare(`
      INSERT INTO usage_metrics (bucket_start, model, tool_calls)
      VALUES (?, ?, 1)
      ON CONFLICT(bucket_start, model) DO UPDATE SET
        tool_calls = tool_calls + 1
    `)
    
    stmt.run(bucket, model)
  }

  /**
   * Query usage by time range
   * @param {string} start - ISO timestamp
   * @param {string} end - ISO timestamp
   * @param {string} granularity - '5min' | 'hour' | 'day'
   */
  queryUsage(start, end, granularity = 'hour') {
    const groupBy = {
      '5min': "bucket_start",
      'hour': "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)",
      'day': "strftime('%Y-%m-%d', bucket_start)"
    }[granularity] || groupBy['hour']

    const stmt = this.db.prepare(`
      SELECT 
        ${groupBy} as period,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(cache_read) as cache_read,
        SUM(cache_write) as cache_write,
        SUM(cost_usd) as cost,
        SUM(message_count) as messages,
        SUM(tool_calls) as tool_calls
      FROM usage_metrics
      WHERE bucket_start >= ? AND bucket_start <= ?
      GROUP BY ${groupBy}
      ORDER BY period ASC
    `)

    return stmt.all(start, end)
  }

  /**
   * Query usage by model
   */
  queryByModel(start, end) {
    const stmt = this.db.prepare(`
      SELECT 
        model,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(cost_usd) as cost,
        SUM(message_count) as calls
      FROM usage_metrics
      WHERE bucket_start >= ? AND bucket_start <= ?
        AND model != 'tools'
      GROUP BY model
      ORDER BY total_tokens DESC
    `)

    return stmt.all(start, end)
  }

  /**
   * Get summary stats
   */
  getSummary(start, end) {
    const stmt = this.db.prepare(`
      SELECT 
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        SUM(cache_read) as total_cache_read,
        SUM(cache_write) as total_cache_write,
        SUM(cost_usd) as total_cost,
        SUM(message_count) as total_messages,
        SUM(tool_calls) as total_tool_calls
      FROM usage_metrics
      WHERE bucket_start >= ? AND bucket_start <= ?
    `)

    const row = stmt.get(start, end)
    const cacheHitRatio = row.total_cache_read && row.total_input
      ? (row.total_cache_read / (row.total_cache_read + row.total_input)) * 100
      : 0

    return {
      ...row,
      cacheHitRatio: Math.round(cacheHitRatio * 10) / 10
    }
  }

  /**
   * Get/set sync state
   */
  getSyncState(key) {
    const stmt = this.db.prepare('SELECT value FROM sync_state WHERE key = ?')
    const row = stmt.get(key)
    return row?.value
  }

  setSyncState(key, value) {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)')
    stmt.run(key, value)
  }

  // ============================================
  // Performance Metrics
  // ============================================

  /**
   * Record performance snapshot
   */
  recordPerformance(data) {
    const bucket = this._getBucket(new Date().toISOString())
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO performance_metrics 
      (bucket_start, task_completion_rate, avg_latency_ms, tool_success_rate, 
       memory_usage_rate, proactive_score, overall_score, tasks_completed,
       tool_calls_total, tool_calls_failed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    
    stmt.run(
      bucket,
      data.taskCompletionRate || 0,
      data.avgLatencyMs || 0,
      data.toolSuccessRate || 0,
      data.memoryUsageRate || 0,
      data.proactiveScore || 0,
      data.overallScore || 0,
      data.tasksCompleted || 0,
      data.toolCallsTotal || 0,
      data.toolCallsFailed || 0
    )
  }

  /**
   * Query performance by time range
   */
  queryPerformance(start, end, granularity = 'hour') {
    const groupBy = {
      '5min': "bucket_start",
      'hour': "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)",
      'day': "strftime('%Y-%m-%d', bucket_start)"
    }[granularity] || "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)"

    const stmt = this.db.prepare(`
      SELECT 
        ${groupBy} as period,
        AVG(task_completion_rate) as task_completion_rate,
        AVG(avg_latency_ms) as avg_latency_ms,
        AVG(tool_success_rate) as tool_success_rate,
        AVG(memory_usage_rate) as memory_usage_rate,
        AVG(proactive_score) as proactive_score,
        AVG(overall_score) as overall_score,
        SUM(tasks_completed) as tasks_completed,
        SUM(tool_calls_total) as tool_calls_total,
        SUM(tool_calls_failed) as tool_calls_failed
      FROM performance_metrics
      WHERE bucket_start >= ? AND bucket_start <= ?
      GROUP BY ${groupBy}
      ORDER BY period ASC
    `)

    return stmt.all(start, end)
  }

  // ============================================
  // Insights Metrics
  // ============================================

  /**
   * Record insights snapshot
   */
  recordInsights(data) {
    const bucket = this._getBucket(new Date().toISOString())
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO insights_metrics 
      (bucket_start, health_score, corrections_count, sentiment_score,
       context_health, confusion_signals, reask_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    
    stmt.run(
      bucket,
      data.healthScore || 0,
      data.correctionsCount || 0,
      data.sentimentScore || 0,
      data.contextHealth || 0,
      data.confusionSignals || 0,
      data.reaskCount || 0
    )
  }

  /**
   * Query insights by time range
   */
  queryInsights(start, end, granularity = 'hour') {
    const groupBy = {
      '5min': "bucket_start",
      'hour': "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)",
      'day': "strftime('%Y-%m-%d', bucket_start)"
    }[granularity] || "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)"

    const stmt = this.db.prepare(`
      SELECT 
        ${groupBy} as period,
        AVG(health_score) as health_score,
        SUM(corrections_count) as corrections_count,
        AVG(sentiment_score) as sentiment_score,
        AVG(context_health) as context_health,
        SUM(confusion_signals) as confusion_signals,
        SUM(reask_count) as reask_count
      FROM insights_metrics
      WHERE bucket_start >= ? AND bucket_start <= ?
      GROUP BY ${groupBy}
      ORDER BY period ASC
    `)

    return stmt.all(start, end)
  }

  // ============================================
  // Memory Stats
  // ============================================

  /**
   * Record memory stats snapshot
   */
  recordMemoryStats(data) {
    const bucket = this._getBucket(new Date().toISOString())
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memory_stats 
      (bucket_start, agents_count, files_indexed, chunks_total, cache_entries, vector_ready, fts_ready)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    
    stmt.run(
      bucket,
      data.agentsCount || 0,
      data.filesIndexed || 0,
      data.chunksTotal || 0,
      data.cacheEntries || 0,
      data.vectorReady ? 1 : 0,
      data.ftsReady ? 1 : 0
    )
  }

  /**
   * Query memory stats by time range
   */
  queryMemoryStats(start, end, granularity = 'hour') {
    const groupBy = {
      '5min': "bucket_start",
      'hour': "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)",
      'day': "strftime('%Y-%m-%d', bucket_start)"
    }[granularity] || "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)"

    const stmt = this.db.prepare(`
      SELECT 
        ${groupBy} as period,
        MAX(agents_count) as agents_count,
        MAX(files_indexed) as files_indexed,
        MAX(chunks_total) as chunks_total,
        MAX(cache_entries) as cache_entries,
        MAX(vector_ready) as vector_ready,
        MAX(fts_ready) as fts_ready
      FROM memory_stats
      WHERE bucket_start >= ? AND bucket_start <= ?
      GROUP BY ${groupBy}
      ORDER BY period ASC
    `)

    return stmt.all(start, end)
  }

  // ============================================
  // Security Events
  // ============================================

  /**
   * Record security event
   */
  recordSecurityEvent(event) {
    const stmt = this.db.prepare(`
      INSERT INTO security_events 
      (timestamp, event_type, severity, tool_name, command, risk_score, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    
    stmt.run(
      event.timestamp || new Date().toISOString(),
      event.type || 'unknown',
      event.severity || 'low',
      event.toolName || null,
      event.command || null,
      event.riskScore || 0,
      JSON.stringify(event.details || {})
    )
  }

  /**
   * Query security events
   */
  querySecurityEvents(start, end, options = {}) {
    let sql = `
      SELECT * FROM security_events
      WHERE timestamp >= ? AND timestamp <= ?
    `
    const params = [start, end]

    if (options.severity) {
      sql += ` AND severity = ?`
      params.push(options.severity)
    }

    if (options.unacknowledgedOnly) {
      sql += ` AND acknowledged = 0`
    }

    sql += ` ORDER BY timestamp DESC LIMIT ?`
    params.push(options.limit || 100)

    const stmt = this.db.prepare(sql)
    return stmt.all(...params)
  }

  /**
   * Get security summary
   */
  getSecuritySummary(start, end) {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) as low,
        SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END) as unacknowledged,
        AVG(risk_score) as avg_risk_score
      FROM security_events
      WHERE timestamp >= ? AND timestamp <= ?
    `)

    return stmt.get(start, end)
  }

  // ============================================
  // Maintenance
  // ============================================

  /**
   * Cleanup old data
   * Run daily
   */
  rollupOldData(daysToKeep = 30) {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString()
    
    let deleted = 0
    deleted += this.db.prepare('DELETE FROM usage_metrics WHERE bucket_start < ?').run(cutoff).changes
    deleted += this.db.prepare('DELETE FROM performance_metrics WHERE bucket_start < ?').run(cutoff).changes
    deleted += this.db.prepare('DELETE FROM insights_metrics WHERE bucket_start < ?').run(cutoff).changes
    deleted += this.db.prepare('DELETE FROM security_events WHERE timestamp < ?').run(cutoff).changes
    
    return deleted
  }

  close() {
    this.db.close()
  }
}

export default MetricsStore

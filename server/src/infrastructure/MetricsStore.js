/**
 * MetricsStore - SQLite storage for usage metrics
 * Stores data in 5-minute buckets for flexible time range queries
 * Supports multi-agent filtering via agent_id
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
    this._migrateSchema()
  }

  _initSchema() {
    this.db.exec(`
      -- Usage metrics (5-min buckets, per-agent)
      CREATE TABLE IF NOT EXISTS usage_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket_start TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'main',
        model TEXT NOT NULL DEFAULT 'unknown',
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read INTEGER DEFAULT 0,
        cache_write INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        tool_calls INTEGER DEFAULT 0,
        UNIQUE(bucket_start, agent_id, model)
      );
      
      CREATE INDEX IF NOT EXISTS idx_usage_time ON usage_metrics(bucket_start);
      CREATE INDEX IF NOT EXISTS idx_usage_agent ON usage_metrics(agent_id);
      CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_metrics(model);
      
      -- Performance metrics (5-min buckets, per-agent)
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket_start TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'main',
        task_completion_rate REAL DEFAULT 0,
        avg_latency_ms INTEGER DEFAULT 0,
        tool_success_rate REAL DEFAULT 0,
        memory_usage_rate REAL DEFAULT 0,
        proactive_score INTEGER DEFAULT 0,
        overall_score INTEGER DEFAULT 0,
        tasks_completed INTEGER DEFAULT 0,
        tool_calls_total INTEGER DEFAULT 0,
        tool_calls_failed INTEGER DEFAULT 0,
        UNIQUE(bucket_start, agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_perf_time ON performance_metrics(bucket_start);
      CREATE INDEX IF NOT EXISTS idx_perf_agent ON performance_metrics(agent_id);
      
      -- Insights metrics (5-min buckets, per-agent)
      CREATE TABLE IF NOT EXISTS insights_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket_start TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'main',
        health_score INTEGER DEFAULT 0,
        corrections_count INTEGER DEFAULT 0,
        sentiment_score INTEGER DEFAULT 0,
        context_health INTEGER DEFAULT 0,
        confusion_signals INTEGER DEFAULT 0,
        reask_count INTEGER DEFAULT 0,
        UNIQUE(bucket_start, agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_insights_time ON insights_metrics(bucket_start);
      CREATE INDEX IF NOT EXISTS idx_insights_agent ON insights_metrics(agent_id);
      
      -- Memory stats (5-min buckets, global - not per-agent)
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
      
      -- Security events (individual events, per-agent)
      CREATE TABLE IF NOT EXISTS security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'main',
        event_type TEXT NOT NULL,
        severity TEXT DEFAULT 'low',
        tool_name TEXT,
        command TEXT,
        risk_score REAL DEFAULT 0,
        acknowledged INTEGER DEFAULT 0,
        details TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_security_time ON security_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_security_agent ON security_events(agent_id);
      CREATE INDEX IF NOT EXISTS idx_security_type ON security_events(event_type);
      
      -- Sync state
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)
  }

  /**
   * Migrate schema for existing databases (add agent_id columns)
   */
  _migrateSchema() {
    // Check if agent_id exists in usage_metrics
    const cols = this.db.prepare("PRAGMA table_info(usage_metrics)").all()
    const hasAgentId = cols.some(c => c.name === 'agent_id')
    
    if (!hasAgentId) {
      console.log('[MetricsStore] Migrating schema to add agent_id...')
      
      // Add agent_id to existing tables
      this.db.exec(`
        -- Recreate usage_metrics with agent_id
        ALTER TABLE usage_metrics RENAME TO usage_metrics_old;
        
        CREATE TABLE usage_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bucket_start TEXT NOT NULL,
          agent_id TEXT NOT NULL DEFAULT 'main',
          model TEXT NOT NULL DEFAULT 'unknown',
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          cache_read INTEGER DEFAULT 0,
          cache_write INTEGER DEFAULT 0,
          cost_usd REAL DEFAULT 0,
          message_count INTEGER DEFAULT 0,
          tool_calls INTEGER DEFAULT 0,
          UNIQUE(bucket_start, agent_id, model)
        );
        
        INSERT INTO usage_metrics (bucket_start, agent_id, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd, message_count, tool_calls)
        SELECT bucket_start, 'main', model, input_tokens, output_tokens, cache_read, cache_write, cost_usd, message_count, tool_calls
        FROM usage_metrics_old;
        
        DROP TABLE usage_metrics_old;
        
        CREATE INDEX IF NOT EXISTS idx_usage_time ON usage_metrics(bucket_start);
        CREATE INDEX IF NOT EXISTS idx_usage_agent ON usage_metrics(agent_id);
        CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_metrics(model);
      `)
      
      // Check and migrate performance_metrics
      const perfCols = this.db.prepare("PRAGMA table_info(performance_metrics)").all()
      const perfHasAgent = perfCols.some(c => c.name === 'agent_id')
      
      if (!perfHasAgent) {
        this.db.exec(`
          ALTER TABLE performance_metrics RENAME TO performance_metrics_old;
          
          CREATE TABLE performance_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bucket_start TEXT NOT NULL,
            agent_id TEXT NOT NULL DEFAULT 'main',
            task_completion_rate REAL DEFAULT 0,
            avg_latency_ms INTEGER DEFAULT 0,
            tool_success_rate REAL DEFAULT 0,
            memory_usage_rate REAL DEFAULT 0,
            proactive_score INTEGER DEFAULT 0,
            overall_score INTEGER DEFAULT 0,
            tasks_completed INTEGER DEFAULT 0,
            tool_calls_total INTEGER DEFAULT 0,
            tool_calls_failed INTEGER DEFAULT 0,
            UNIQUE(bucket_start, agent_id)
          );
          
          INSERT INTO performance_metrics (bucket_start, agent_id, task_completion_rate, avg_latency_ms, tool_success_rate, memory_usage_rate, proactive_score, overall_score, tasks_completed, tool_calls_total, tool_calls_failed)
          SELECT bucket_start, 'main', task_completion_rate, avg_latency_ms, tool_success_rate, memory_usage_rate, proactive_score, overall_score, tasks_completed, tool_calls_total, tool_calls_failed
          FROM performance_metrics_old;
          
          DROP TABLE performance_metrics_old;
          
          CREATE INDEX IF NOT EXISTS idx_perf_time ON performance_metrics(bucket_start);
          CREATE INDEX IF NOT EXISTS idx_perf_agent ON performance_metrics(agent_id);
        `)
      }
      
      // Migrate insights_metrics
      const insCols = this.db.prepare("PRAGMA table_info(insights_metrics)").all()
      const insHasAgent = insCols.some(c => c.name === 'agent_id')
      
      if (!insHasAgent) {
        this.db.exec(`
          ALTER TABLE insights_metrics RENAME TO insights_metrics_old;
          
          CREATE TABLE insights_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bucket_start TEXT NOT NULL,
            agent_id TEXT NOT NULL DEFAULT 'main',
            health_score INTEGER DEFAULT 0,
            corrections_count INTEGER DEFAULT 0,
            sentiment_score INTEGER DEFAULT 0,
            context_health INTEGER DEFAULT 0,
            confusion_signals INTEGER DEFAULT 0,
            reask_count INTEGER DEFAULT 0,
            UNIQUE(bucket_start, agent_id)
          );
          
          INSERT INTO insights_metrics (bucket_start, agent_id, health_score, corrections_count, sentiment_score, context_health, confusion_signals, reask_count)
          SELECT bucket_start, 'main', health_score, corrections_count, sentiment_score, context_health, confusion_signals, reask_count
          FROM insights_metrics_old;
          
          DROP TABLE insights_metrics_old;
          
          CREATE INDEX IF NOT EXISTS idx_insights_time ON insights_metrics(bucket_start);
          CREATE INDEX IF NOT EXISTS idx_insights_agent ON insights_metrics(agent_id);
        `)
      }
      
      console.log('[MetricsStore] Migration complete')
    }
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
  recordUsage(message, agentId = 'main') {
    if (!message.usage && !message.message?.usage) return
    
    const usage = message.usage || message.message?.usage
    const timestamp = message.timestamp || new Date().toISOString()
    const model = message.model || message.message?.model || 'unknown'
    const bucket = this._getBucket(timestamp)
    
    const stmt = this.db.prepare(`
      INSERT INTO usage_metrics (bucket_start, agent_id, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd, message_count, tool_calls)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(bucket_start, agent_id, model) DO UPDATE SET
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
      agentId,
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
  recordToolCall(toolCall, agentId = 'main') {
    const timestamp = toolCall.timestamp || new Date().toISOString()
    const bucket = this._getBucket(timestamp)
    const model = 'tools'
    
    const stmt = this.db.prepare(`
      INSERT INTO usage_metrics (bucket_start, agent_id, model, tool_calls)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(bucket_start, agent_id, model) DO UPDATE SET
        tool_calls = tool_calls + 1
    `)
    
    stmt.run(bucket, agentId, model)
  }

  /**
   * List all agents in the database
   */
  listAgents() {
    const stmt = this.db.prepare(`
      SELECT DISTINCT agent_id FROM (
        SELECT agent_id FROM usage_metrics
        UNION
        SELECT agent_id FROM performance_metrics
        UNION
        SELECT agent_id FROM insights_metrics
      ) ORDER BY agent_id
    `)
    return stmt.all().map(r => r.agent_id)
  }

  /**
   * Query usage by time range
   * @param {string} start - ISO timestamp
   * @param {string} end - ISO timestamp
   * @param {string} granularity - '5min' | 'hour' | 'day'
   * @param {string} agentId - filter by agent (optional, null = all)
   */
  queryUsage(start, end, granularity = 'hour', agentId = null) {
    const groupBy = {
      '5min': "bucket_start",
      'hour': "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)",
      'day': "strftime('%Y-%m-%d', bucket_start)"
    }[granularity] || "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)"

    const agentFilter = agentId ? "AND agent_id = ?" : ""
    const params = agentId ? [start, end, agentId] : [start, end]

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
      WHERE bucket_start >= ? AND bucket_start <= ? ${agentFilter}
      GROUP BY ${groupBy}
      ORDER BY period ASC
    `)

    return stmt.all(...params)
  }

  /**
   * Query usage by model
   */
  queryByModel(start, end, agentId = null) {
    const agentFilter = agentId ? "AND agent_id = ?" : ""
    const params = agentId ? [start, end, agentId] : [start, end]

    const stmt = this.db.prepare(`
      SELECT 
        model,
        SUM(input_tokens + output_tokens) as total_tokens,
        SUM(cost_usd) as cost,
        SUM(message_count) as calls
      FROM usage_metrics
      WHERE bucket_start >= ? AND bucket_start <= ?
        AND model != 'tools' ${agentFilter}
      GROUP BY model
      ORDER BY total_tokens DESC
    `)

    return stmt.all(...params)
  }

  /**
   * Get summary stats
   */
  getSummary(start, end, agentId = null) {
    const agentFilter = agentId ? "AND agent_id = ?" : ""
    const params = agentId ? [start, end, agentId] : [start, end]

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
      WHERE bucket_start >= ? AND bucket_start <= ? ${agentFilter}
    `)

    const row = stmt.get(...params)
    const cacheHitRatio = row.total_cache_read && row.total_input
      ? (row.total_cache_read / (row.total_cache_read + row.total_input)) * 100
      : 0

    return { ...row, cacheHitRatio }
  }

  /**
   * Record performance snapshot
   */
  recordPerformance(data, agentId = 'main') {
    const bucket = this._getBucket(data.timestamp || new Date().toISOString())
    
    const stmt = this.db.prepare(`
      INSERT INTO performance_metrics (
        bucket_start, agent_id, task_completion_rate, avg_latency_ms, tool_success_rate,
        memory_usage_rate, proactive_score, overall_score, tasks_completed,
        tool_calls_total, tool_calls_failed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bucket_start, agent_id) DO UPDATE SET
        task_completion_rate = excluded.task_completion_rate,
        avg_latency_ms = excluded.avg_latency_ms,
        tool_success_rate = excluded.tool_success_rate,
        memory_usage_rate = excluded.memory_usage_rate,
        proactive_score = excluded.proactive_score,
        overall_score = excluded.overall_score,
        tasks_completed = excluded.tasks_completed,
        tool_calls_total = excluded.tool_calls_total,
        tool_calls_failed = excluded.tool_calls_failed
    `)
    
    stmt.run(
      bucket,
      agentId,
      data.task_completion || data.tasks?.completionRate || 0,
      data.avg_latency_ms || data.latency?.avgMs || 0,
      data.tool_success_rate || data.tools?.successRate || 0,
      data.memory_usage_rate || data.memory?.usageRate || 0,
      data.proactive_score || data.proactive?.valueScore || 0,
      data.overall_score || data.overallScore || 0,
      data.tasks_completed || data.tasks?.total || 0,
      data.tool_calls_total || data.tools?.total || 0,
      data.tool_calls_failed || 0
    )
  }

  /**
   * Query performance metrics
   */
  queryPerformance(start, end, granularity = 'hour', agentId = null) {
    const groupBy = {
      '5min': "bucket_start",
      'hour': "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)",
      'day': "strftime('%Y-%m-%d', bucket_start)"
    }[granularity] || "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)"

    const agentFilter = agentId ? "AND agent_id = ?" : ""
    const params = agentId ? [start, end, agentId] : [start, end]

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
      WHERE bucket_start >= ? AND bucket_start <= ? ${agentFilter}
      GROUP BY ${groupBy}
      ORDER BY period ASC
    `)

    return stmt.all(...params)
  }

  /**
   * Record insights snapshot
   */
  recordInsights(data, agentId = 'main') {
    const bucket = this._getBucket(data.timestamp || new Date().toISOString())
    
    const stmt = this.db.prepare(`
      INSERT INTO insights_metrics (
        bucket_start, agent_id, health_score, corrections_count, sentiment_score,
        context_health, confusion_signals, reask_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bucket_start, agent_id) DO UPDATE SET
        health_score = excluded.health_score,
        corrections_count = excluded.corrections_count,
        sentiment_score = excluded.sentiment_score,
        context_health = excluded.context_health,
        confusion_signals = excluded.confusion_signals,
        reask_count = excluded.reask_count
    `)
    
    stmt.run(
      bucket,
      agentId,
      data.health_score || data.healthScore || 0,
      data.corrections_count || data.corrections?.total || 0,
      data.sentiment_score || data.sentiment?.feedbackScore || 0,
      data.context_health || data.context?.healthScore || 0,
      data.confusion_signals || data.context?.events?.confusionSignals || 0,
      data.reask_count || data.context?.events?.reasksCount || 0
    )
  }

  /**
   * Query insights metrics
   */
  queryInsights(start, end, granularity = 'hour', agentId = null) {
    const groupBy = {
      '5min': "bucket_start",
      'hour': "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)",
      'day': "strftime('%Y-%m-%d', bucket_start)"
    }[granularity] || "strftime('%Y-%m-%dT%H:00:00Z', bucket_start)"

    const agentFilter = agentId ? "AND agent_id = ?" : ""
    const params = agentId ? [start, end, agentId] : [start, end]

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
      WHERE bucket_start >= ? AND bucket_start <= ? ${agentFilter}
      GROUP BY ${groupBy}
      ORDER BY period ASC
    `)

    return stmt.all(...params)
  }

  /**
   * Record memory stats (global, not per-agent)
   */
  recordMemoryStats(data) {
    const bucket = this._getBucket(data.timestamp || new Date().toISOString())
    
    const stmt = this.db.prepare(`
      INSERT INTO memory_stats (
        bucket_start, agents_count, files_indexed, chunks_total,
        cache_entries, vector_ready, fts_ready
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bucket_start) DO UPDATE SET
        agents_count = excluded.agents_count,
        files_indexed = excluded.files_indexed,
        chunks_total = excluded.chunks_total,
        cache_entries = excluded.cache_entries,
        vector_ready = excluded.vector_ready,
        fts_ready = excluded.fts_ready
    `)
    
    stmt.run(
      bucket,
      data.agents_count || data.agentsCount || 0,
      data.files_indexed || data.filesIndexed || data.files || 0,
      data.chunks_total || data.chunksTotal || data.chunks || 0,
      data.cache_entries || data.cacheEntries || 0,
      data.vector_ready ? 1 : 0,
      data.fts_ready ? 1 : 0
    )
  }

  /**
   * Query memory stats
   */
  queryMemory(start, end, granularity = 'hour') {
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

  /**
   * Record security event
   */
  recordSecurityEvent(event, agentId = 'main') {
    const stmt = this.db.prepare(`
      INSERT INTO security_events (timestamp, agent_id, event_type, severity, tool_name, command, risk_score, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    
    stmt.run(
      event.timestamp || new Date().toISOString(),
      agentId,
      event.type || event.event_type || 'unknown',
      event.severity || 'low',
      event.tool || event.tool_name || null,
      event.command || null,
      event.risk_score || event.riskScore || 0,
      JSON.stringify(event.details || {})
    )
  }

  /**
   * Query security events
   */
  querySecurityEvents(start, end, limit = 100, agentId = null) {
    const agentFilter = agentId ? "AND agent_id = ?" : ""
    const params = agentId ? [start, end, agentId, limit] : [start, end, limit]

    const stmt = this.db.prepare(`
      SELECT * FROM security_events
      WHERE timestamp >= ? AND timestamp <= ? ${agentFilter}
      ORDER BY timestamp DESC
      LIMIT ?
    `)

    return stmt.all(...params)
  }

  /**
   * Count data points (for determining if backfill needed)
   */
  countDataPoints(table = 'performance_metrics') {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`)
    return stmt.get().count
  }

  /**
   * Close the database
   */
  close() {
    this.db.close()
  }
}

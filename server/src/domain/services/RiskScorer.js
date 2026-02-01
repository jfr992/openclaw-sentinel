/**
 * RiskScorer - Analyze tool calls and commands for security risks
 * Pure domain logic, no dependencies
 */

export const RISK_LEVELS = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
}

export const RISK_TYPES = {
  DESTRUCTIVE_COMMAND: 'destructive_command',
  PRIVILEGE_ESCALATION: 'privilege_escalation',
  CREDENTIAL_ACCESS: 'credential_access',
  DATA_EXFILTRATION: 'data_exfiltration',
  SENSITIVE_FILE: 'sensitive_file',
  NETWORK_EXPOSURE: 'network_exposure',
  UNUSUAL_PATTERN: 'unusual_pattern'
}

// Risk patterns with severity
const PATTERNS = {
  // CRITICAL - Destructive commands
  destructive: [
    { pattern: /rm\s+(-rf?|--recursive).*\//i, level: RISK_LEVELS.CRITICAL, type: RISK_TYPES.DESTRUCTIVE_COMMAND },
    { pattern: /rm\s+-rf?\s+[~$]/i, level: RISK_LEVELS.CRITICAL, type: RISK_TYPES.DESTRUCTIVE_COMMAND },
    { pattern: /mkfs\./i, level: RISK_LEVELS.CRITICAL, type: RISK_TYPES.DESTRUCTIVE_COMMAND },
    { pattern: /dd\s+.*of=\/dev/i, level: RISK_LEVELS.CRITICAL, type: RISK_TYPES.DESTRUCTIVE_COMMAND },
    { pattern: />\s*\/dev\/[sh]d[a-z]/i, level: RISK_LEVELS.CRITICAL, type: RISK_TYPES.DESTRUCTIVE_COMMAND },
    { pattern: /DROP\s+(DATABASE|TABLE)/i, level: RISK_LEVELS.CRITICAL, type: RISK_TYPES.DESTRUCTIVE_COMMAND },
    { pattern: /TRUNCATE\s+TABLE/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.DESTRUCTIVE_COMMAND },
  ],

  // HIGH - Privilege escalation
  privilege: [
    { pattern: /sudo\s+/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.PRIVILEGE_ESCALATION },
    { pattern: /chmod\s+777/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.PRIVILEGE_ESCALATION },
    { pattern: /chmod\s+\+s/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.PRIVILEGE_ESCALATION },
    { pattern: /chown\s+root/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.PRIVILEGE_ESCALATION },
    { pattern: /setuid|setgid/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.PRIVILEGE_ESCALATION },
  ],

  // HIGH - Credential access
  credentials: [
    { pattern: /\.env/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.CREDENTIAL_ACCESS },
    { pattern: /[_-](KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)[S]?\b/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.CREDENTIAL_ACCESS },
    { pattern: /id_rsa|id_ed25519/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.CREDENTIAL_ACCESS },
    { pattern: /\.pem\b|\.key\b/i, level: RISK_LEVELS.MEDIUM, type: RISK_TYPES.CREDENTIAL_ACCESS },
    { pattern: /aws_access_key|aws_secret/i, level: RISK_LEVELS.CRITICAL, type: RISK_TYPES.CREDENTIAL_ACCESS },
    { pattern: /ANTHROPIC_API_KEY|OPENAI_API_KEY/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.CREDENTIAL_ACCESS },
  ],

  // MEDIUM - Data exfiltration signals
  exfiltration: [
    { pattern: /curl.*-X\s*POST/i, level: RISK_LEVELS.MEDIUM, type: RISK_TYPES.DATA_EXFILTRATION },
    { pattern: /curl.*--data/i, level: RISK_LEVELS.MEDIUM, type: RISK_TYPES.DATA_EXFILTRATION },
    { pattern: /base64\s+.*\|.*curl/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.DATA_EXFILTRATION },
    { pattern: /nc\s+-.*\d+\.\d+\.\d+\.\d+/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.DATA_EXFILTRATION },
    { pattern: /scp\s+.*@/i, level: RISK_LEVELS.MEDIUM, type: RISK_TYPES.DATA_EXFILTRATION },
  ],

  // MEDIUM - Sensitive files
  sensitiveFiles: [
    { pattern: /\/etc\/passwd/i, level: RISK_LEVELS.MEDIUM, type: RISK_TYPES.SENSITIVE_FILE },
    { pattern: /\/etc\/shadow/i, level: RISK_LEVELS.CRITICAL, type: RISK_TYPES.SENSITIVE_FILE },
    { pattern: /\.ssh\//i, level: RISK_LEVELS.MEDIUM, type: RISK_TYPES.SENSITIVE_FILE },
    { pattern: /\.gnupg\//i, level: RISK_LEVELS.MEDIUM, type: RISK_TYPES.SENSITIVE_FILE },
    { pattern: /\.aws\/credentials/i, level: RISK_LEVELS.CRITICAL, type: RISK_TYPES.SENSITIVE_FILE },
    { pattern: /\.kube\/config/i, level: RISK_LEVELS.HIGH, type: RISK_TYPES.SENSITIVE_FILE },
  ],

  // LOW-MEDIUM - Network exposure
  network: [
    { pattern: /--host\s+0\.0\.0\.0/i, level: RISK_LEVELS.MEDIUM, type: RISK_TYPES.NETWORK_EXPOSURE },
    { pattern: /bind\s+0\.0\.0\.0/i, level: RISK_LEVELS.MEDIUM, type: RISK_TYPES.NETWORK_EXPOSURE },
    { pattern: /ngrok/i, level: RISK_LEVELS.LOW, type: RISK_TYPES.NETWORK_EXPOSURE },
    { pattern: /--expose/i, level: RISK_LEVELS.LOW, type: RISK_TYPES.NETWORK_EXPOSURE },
  ]
}

/**
 * Score a single command/text for risk
 * @param {string} text - Command or content to analyze
 * @returns {Array} Array of detected risks
 */
export function scoreText(text) {
  if (!text || typeof text !== 'string') return []

  const risks = []

  for (const [category, patterns] of Object.entries(PATTERNS)) {
    for (const { pattern, level, type } of patterns) {
      const match = text.match(pattern)
      if (match) {
        risks.push({
          type,
          level,
          category,
          match: match[0],
          description: getDescription(type, match[0])
        })
      }
    }
  }

  // Sort by severity (highest first)
  return risks.sort((a, b) => b.level - a.level)
}

/**
 * Score a tool call
 * @param {Object} toolCall - Tool call object with name and arguments
 * @returns {Array} Array of detected risks
 */
export function scoreToolCall(toolCall) {
  const risks = []

  if (!toolCall) return risks

  const { name, arguments: args } = toolCall

  // Analyze command if exec tool
  if (name === 'exec' && args?.command) {
    risks.push(...scoreText(args.command))
  }

  // Analyze file operations
  if (name === 'Read' || name === 'Write' || name === 'Edit') {
    const path = args?.path || args?.file_path
    if (path) {
      risks.push(...scoreText(path))
    }
  }

  // Analyze web requests
  if (name === 'web_fetch' || name === 'web_search') {
    const url = args?.url || args?.query
    if (url) {
      // Check for potentially sensitive queries
      risks.push(...scoreText(url))
    }
  }

  return risks
}

/**
 * Calculate overall risk score for a session
 * @param {Array} toolCalls - Array of tool calls
 * @returns {Object} Risk summary
 */
export function calculateSessionRisk(toolCalls) {
  const allRisks = []
  const risksByType = {}
  let maxLevel = RISK_LEVELS.NONE

  for (const tc of toolCalls) {
    const risks = scoreToolCall(tc)
    for (const risk of risks) {
      allRisks.push({ ...risk, toolCall: tc.name, timestamp: tc.timestamp })
      maxLevel = Math.max(maxLevel, risk.level)

      if (!risksByType[risk.type]) {
        risksByType[risk.type] = []
      }
      risksByType[risk.type].push(risk)
    }
  }

  return {
    level: maxLevel,
    levelName: getLevelName(maxLevel),
    totalRisks: allRisks.length,
    criticalCount: allRisks.filter(r => r.level === RISK_LEVELS.CRITICAL).length,
    highCount: allRisks.filter(r => r.level === RISK_LEVELS.HIGH).length,
    byType: risksByType,
    risks: allRisks.slice(0, 50) // Return top 50
  }
}

function getLevelName(level) {
  switch (level) {
    case RISK_LEVELS.CRITICAL: return 'CRITICAL'
    case RISK_LEVELS.HIGH: return 'HIGH'
    case RISK_LEVELS.MEDIUM: return 'MEDIUM'
    case RISK_LEVELS.LOW: return 'LOW'
    default: return 'NONE'
  }
}

function getDescription(type, match) {
  const descriptions = {
    [RISK_TYPES.DESTRUCTIVE_COMMAND]: `Destructive command detected: ${match}`,
    [RISK_TYPES.PRIVILEGE_ESCALATION]: `Privilege escalation attempt: ${match}`,
    [RISK_TYPES.CREDENTIAL_ACCESS]: `Potential credential access: ${match}`,
    [RISK_TYPES.DATA_EXFILTRATION]: `Data exfiltration signal: ${match}`,
    [RISK_TYPES.SENSITIVE_FILE]: `Sensitive file access: ${match}`,
    [RISK_TYPES.NETWORK_EXPOSURE]: `Network exposure: ${match}`,
    [RISK_TYPES.UNUSUAL_PATTERN]: `Unusual pattern: ${match}`
  }
  return descriptions[type] || `Risk detected: ${match}`
}

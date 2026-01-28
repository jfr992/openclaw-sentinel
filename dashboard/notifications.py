"""
Notifications - Webhook, Slack, and other alert delivery.
"""
import os
import json
import threading
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
import urllib.request
import urllib.error

NOTIFICATIONS_CONFIG = Path.home() / '.clawdbot' / 'security' / 'notifications.json'


class NotificationManager:
    """Manages alert notifications via webhooks, Slack, etc."""
    
    def __init__(self):
        self.config = self._load_config()
        self._queue: List[Dict] = []
        self._lock = threading.Lock()
    
    def _load_config(self) -> Dict:
        """Load notification config."""
        # First check environment variables
        config = {
            'enabled': os.environ.get('NOTIFICATIONS_ENABLED', 'false').lower() == 'true',
            'webhook_url': os.environ.get('WEBHOOK_URL'),
            'slack_webhook': os.environ.get('SLACK_WEBHOOK'),
            'min_severity': os.environ.get('MIN_ALERT_SEVERITY', 'medium'),
            'rate_limit_seconds': int(os.environ.get('NOTIFICATION_RATE_LIMIT', '60')),
            'last_sent': None,
        }
        
        # Override with file config if exists
        if NOTIFICATIONS_CONFIG.exists():
            try:
                file_config = json.loads(NOTIFICATIONS_CONFIG.read_text())
                config.update(file_config)
            except:
                pass
        
        return config
    
    def _save_config(self):
        """Save notification config."""
        NOTIFICATIONS_CONFIG.parent.mkdir(parents=True, exist_ok=True)
        NOTIFICATIONS_CONFIG.write_text(json.dumps(self.config, indent=2, default=str))
    
    def update_config(self, updates: Dict):
        """Update notification configuration."""
        self.config.update(updates)
        self._save_config()
    
    def get_config(self) -> Dict:
        """Get current config (without sensitive URLs)."""
        return {
            'enabled': self.config.get('enabled', False),
            'has_webhook': bool(self.config.get('webhook_url')),
            'has_slack': bool(self.config.get('slack_webhook')),
            'min_severity': self.config.get('min_severity', 'medium'),
            'rate_limit_seconds': self.config.get('rate_limit_seconds', 60),
        }
    
    def _should_send(self, severity: str) -> bool:
        """Check if alert should be sent based on severity and rate limit."""
        if not self.config.get('enabled'):
            return False
        
        # Check severity threshold
        severity_levels = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}
        min_level = severity_levels.get(self.config.get('min_severity', 'medium'), 2)
        alert_level = severity_levels.get(severity, 2)
        
        if alert_level < min_level:
            return False
        
        # Check rate limit
        last_sent = self.config.get('last_sent')
        if last_sent:
            try:
                last_time = datetime.fromisoformat(last_sent)
                elapsed = (datetime.now() - last_time).total_seconds()
                if elapsed < self.config.get('rate_limit_seconds', 60):
                    return False
            except:
                pass
        
        return True
    
    def _send_webhook(self, url: str, payload: Dict) -> bool:
        """Send generic webhook."""
        try:
            data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=data,
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status == 200
        except Exception as e:
            print(f"[Notifications] Webhook error: {e}")
            return False
    
    def _send_slack(self, alert: Dict) -> bool:
        """Send Slack notification."""
        slack_url = self.config.get('slack_webhook')
        if not slack_url:
            return False
        
        # Format for Slack
        severity_emoji = {
            'low': '🔵',
            'medium': '🟡',
            'high': '🟠',
            'critical': '🔴'
        }
        
        severity = alert.get('severity', 'medium')
        emoji = severity_emoji.get(severity, '⚪')
        
        payload = {
            'text': f"{emoji} *Security Alert*: {alert.get('title', 'Unknown')}",
            'blocks': [
                {
                    'type': 'header',
                    'text': {
                        'type': 'plain_text',
                        'text': f"{emoji} Security Alert",
                        'emoji': True
                    }
                },
                {
                    'type': 'section',
                    'fields': [
                        {
                            'type': 'mrkdwn',
                            'text': f"*Type:*\n{alert.get('title', 'Unknown')}"
                        },
                        {
                            'type': 'mrkdwn',
                            'text': f"*Severity:*\n{severity.upper()}"
                        }
                    ]
                },
                {
                    'type': 'section',
                    'text': {
                        'type': 'mrkdwn',
                        'text': f"*Details:*\n```{alert.get('description', 'No details')}```"
                    }
                },
                {
                    'type': 'context',
                    'elements': [
                        {
                            'type': 'mrkdwn',
                            'text': f"🦀 MoltBot Security Dashboard | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                        }
                    ]
                }
            ]
        }
        
        return self._send_webhook(slack_url, payload)
    
    def _send_generic_webhook(self, alert: Dict) -> bool:
        """Send to generic webhook URL."""
        webhook_url = self.config.get('webhook_url')
        if not webhook_url:
            return False
        
        payload = {
            'event': 'security_alert',
            'timestamp': datetime.now().isoformat(),
            'alert': alert,
            'source': 'moltbot-security'
        }
        
        return self._send_webhook(webhook_url, payload)
    
    def send_alert(self, alert: Dict):
        """Send alert notification."""
        severity = alert.get('severity', 'medium')
        
        if not self._should_send(severity):
            return
        
        # Send to all configured destinations
        sent = False
        
        if self.config.get('slack_webhook'):
            if self._send_slack(alert):
                sent = True
        
        if self.config.get('webhook_url'):
            if self._send_generic_webhook(alert):
                sent = True
        
        if sent:
            self.config['last_sent'] = datetime.now().isoformat()
            self._save_config()
    
    def send_alert_async(self, alert: Dict):
        """Send alert in background thread."""
        thread = threading.Thread(target=self.send_alert, args=(alert,), daemon=True)
        thread.start()
    
    def test_connection(self) -> Dict:
        """Test notification connections."""
        results = {'slack': None, 'webhook': None}
        
        test_alert = {
            'title': 'Test Alert',
            'description': 'This is a test notification from MoltBot Security Dashboard.',
            'severity': 'low',
        }
        
        if self.config.get('slack_webhook'):
            results['slack'] = self._send_slack(test_alert)
        
        if self.config.get('webhook_url'):
            results['webhook'] = self._send_generic_webhook(test_alert)
        
        return results


# Singleton
_manager: Optional[NotificationManager] = None

def get_notification_manager() -> NotificationManager:
    global _manager
    if _manager is None:
        _manager = NotificationManager()
    return _manager

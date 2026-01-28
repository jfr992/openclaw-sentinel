"""
Gateway WebSocket Client - Real-time connection to Clawdbot gateway.
"""
import os
import json
import threading
import time
from pathlib import Path
from typing import Callable, Optional
import socketio

CLAWDBOT_CONFIG = Path.home() / '.clawdbot' / 'clawdbot.json'


class GatewayClient:
    """WebSocket client for Clawdbot gateway."""
    
    def __init__(self):
        self.sio = socketio.Client(reconnection=True, reconnection_attempts=0)
        self.connected = False
        self.gateway_url = os.environ.get('CLAWDBOT_URL', 'ws://127.0.0.1:18789')
        self.token = os.environ.get('CLAWDBOT_API_TOKEN') or self._load_token()
        self.callbacks: dict[str, list[Callable]] = {
            'tool_call': [],
            'message': [],
            'session': [],
            'error': [],
        }
        self._setup_handlers()
    
    def _load_token(self) -> Optional[str]:
        """Load gateway token from clawdbot config."""
        if CLAWDBOT_CONFIG.exists():
            try:
                config = json.loads(CLAWDBOT_CONFIG.read_text())
                return config.get('gateway', {}).get('auth', {}).get('token')
            except:
                pass
        return None
    
    def _setup_handlers(self):
        """Set up socket.io event handlers."""
        
        @self.sio.event
        def connect():
            self.connected = True
            print(f"[GatewayClient] Connected to {self.gateway_url}")
        
        @self.sio.event
        def disconnect():
            self.connected = False
            print("[GatewayClient] Disconnected")
        
        @self.sio.event
        def connect_error(data):
            print(f"[GatewayClient] Connection error: {data}")
            for cb in self.callbacks['error']:
                cb({'type': 'connect_error', 'data': data})
        
        # Handle tool calls (exec, read, write, etc.)
        @self.sio.on('tool')
        def on_tool(data):
            for cb in self.callbacks['tool_call']:
                cb(data)
        
        # Handle messages
        @self.sio.on('message')
        def on_message(data):
            for cb in self.callbacks['message']:
                cb(data)
        
        # Handle session events
        @self.sio.on('session')
        def on_session(data):
            for cb in self.callbacks['session']:
                cb(data)
        
        # Generic event handler for unknown events
        @self.sio.on('*')
        def on_any(event, data):
            # Forward to tool_call if it looks like a tool event
            if isinstance(data, dict) and 'tool' in str(data).lower():
                for cb in self.callbacks['tool_call']:
                    cb({'event': event, **data})
    
    def on(self, event: str, callback: Callable):
        """Register a callback for an event type."""
        if event in self.callbacks:
            self.callbacks[event].append(callback)
    
    def connect(self):
        """Connect to gateway WebSocket."""
        if self.connected:
            return True
        
        try:
            auth = {'token': self.token} if self.token else {}
            self.sio.connect(
                self.gateway_url,
                auth=auth,
                transports=['websocket'],
                wait_timeout=10
            )
            return True
        except Exception as e:
            print(f"[GatewayClient] Failed to connect: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from gateway."""
        if self.connected:
            self.sio.disconnect()
    
    def start_background(self):
        """Start connection in background thread."""
        def run():
            while True:
                if not self.connected:
                    self.connect()
                time.sleep(5)
        
        thread = threading.Thread(target=run, daemon=True)
        thread.start()
    
    def get_status(self) -> dict:
        """Get connection status."""
        return {
            'connected': self.connected,
            'gateway_url': self.gateway_url,
            'has_token': bool(self.token),
        }


# Singleton
_client: Optional[GatewayClient] = None

def get_gateway_client() -> GatewayClient:
    global _client
    if _client is None:
        _client = GatewayClient()
    return _client

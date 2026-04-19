"""
NeoSC Notification Hub — SSE-based real-time notifications.
Each user has an asyncio.Queue; backend publishes events, frontend consumes via EventSource.
"""
import asyncio
import json
import logging
from typing import Dict, List, Optional
from datetime import datetime, timezone

logger = logging.getLogger("notifications")


class NotificationHub:
    def __init__(self):
        # user_id -> list of active queues (one per open SSE connection)
        self._queues: Dict[str, List[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, user_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._queues.setdefault(user_id, []).append(q)
        return q

    async def unsubscribe(self, user_id: str, q: asyncio.Queue):
        async with self._lock:
            if user_id in self._queues and q in self._queues[user_id]:
                self._queues[user_id].remove(q)
                if not self._queues[user_id]:
                    del self._queues[user_id]

    async def publish(self, user_id: str, event: dict):
        """Deliver event to all open connections of user_id."""
        event = {**event, "ts": datetime.now(timezone.utc).isoformat()}
        async with self._lock:
            queues = list(self._queues.get(user_id, []))
        if not queues:
            logger.debug(f"No active subscribers for user_id={user_id}")
        for q in queues:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning(f"Queue full for user_id={user_id}, dropping event")

    async def broadcast(self, event: dict, role: Optional[str] = None):
        """Deliver to every active connection (optionally filtered)."""
        event = {**event, "ts": datetime.now(timezone.utc).isoformat()}
        async with self._lock:
            snapshot = {uid: list(qs) for uid, qs in self._queues.items()}
        for _uid, qs in snapshot.items():
            for q in qs:
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    pass


hub = NotificationHub()


async def sse_generator(q: asyncio.Queue):
    """Yield SSE-formatted messages from the queue until disconnect."""
    # Initial ping to let the client know it's connected
    yield f"event: ready\ndata: {json.dumps({'ok': True})}\n\n"
    try:
        while True:
            try:
                # Heartbeat every 20s to keep proxy connections alive
                event = await asyncio.wait_for(q.get(), timeout=20.0)
                yield f"event: {event.get('type', 'message')}\ndata: {json.dumps(event)}\n\n"
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
    except asyncio.CancelledError:
        raise

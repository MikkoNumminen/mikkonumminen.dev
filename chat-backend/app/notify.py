"""Telegram queue notification — informational, throttled, best-effort.

Chosen over email because `httpx` is already a dependency of this backend, so
this costs one POST and no new package; there is no SMTP, mail or webhook
infrastructure anywhere in the repo, and email would have meant credentials, a
provider and deliverability work for a message that says "you have 3 pending".

Deliberately informational only — no action links. That removes the entire
signed-link problem: there is nothing to forge, because the only thing the
notification can do is tell the owner to open ragctl, which is a local surface
nobody else can reach.

BEST-EFFORT, ALWAYS. A visitor's submission has already been accepted by the time
this runs. A Telegram outage, a revoked token, a network partition — none of them
may surface to the visitor as a failed submit. Every path here swallows its
errors and reports the failure through the return value instead.

Disabled unless BOTH env vars are set, following the `RAG_LOG_FILE` convention
where empty means off. A fresh clone, CI, and anyone else running this backend
get a no-op rather than a crash.
"""

from __future__ import annotations

import logging

import httpx

from .config import TelegramConfig

_log = logging.getLogger(__name__)

_API = "https://api.telegram.org/bot{token}/sendMessage"
_TIMEOUT_SECONDS = 5.0
"""Short: nothing is waiting on this, but a hung request should not pin a task."""


class QueueNotifier:
    """Sends the digest, and remembers when it last did.

    The throttle state is in-memory on purpose. A missed ping after a restart
    costs nothing — the next submission re-evaluates and sends — whereas
    persisting it would mean another table for a value that is only ever a
    politeness.
    """

    def __init__(self, config: TelegramConfig | None) -> None:
        self._config = config
        self._last_sent_at: float | None = None

    @property
    def enabled(self) -> bool:
        return self._config is not None and self._config.enabled

    @property
    def last_sent_at(self) -> float | None:
        return self._last_sent_at

    def mark_sent(self, now: float) -> None:
        self._last_sent_at = now

    async def send_digest(self, pending: int, now: float) -> bool:
        """Send "N pending" and record the time. False if it did not go out.

        The caller decides WHETHER to send (`shoutbox.should_notify`); this
        decides only how. Keeping the policy in a pure function and the transport
        here is what lets the throttle be tested without a network.
        """
        if self._config is None or not self._config.enabled:
            return False
        text = (
            f"Shoutbox: {pending} message{'s' if pending != 1 else ''} waiting. "
            "Open ragctl and run `queue`."
        )
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    _API.format(token=self._config.token),
                    json={"chat_id": self._config.chat_id, "text": text},
                )
            if response.status_code != 200:
                # Logged, not raised: a bad token should be visible in the
                # backend log without ever reaching a visitor.
                _log.warning("telegram notify failed: status=%s", response.status_code)
                return False
        except Exception:  # noqa: BLE001 - best-effort by contract
            _log.warning("telegram notify failed", exc_info=True)
            return False
        self.mark_sent(now)
        return True

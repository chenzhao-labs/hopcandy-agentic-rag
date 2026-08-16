"""Single-concurrency execution boundary for the on-demand GPU Agent."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from threading import BoundedSemaphore, Lock
from typing import Callable


class RuntimeBusyError(RuntimeError):
    pass


class RuntimeTimeoutError(RuntimeError):
    pass


class LiveQueryRuntime:
    def __init__(self, runner: Callable[[str], dict], timeout_seconds: float) -> None:
        self.runner = runner
        self.timeout_seconds = timeout_seconds
        self._slot = BoundedSemaphore(1)
        self._executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="hopcandy-live"
        )
        self._state_lock = Lock()
        self._busy = False

    @property
    def busy(self) -> bool:
        with self._state_lock:
            return self._busy

    def _set_busy(self, value: bool) -> None:
        with self._state_lock:
            self._busy = value

    def _release(self, _future=None) -> None:
        self._set_busy(False)
        self._slot.release()

    def execute(self, question: str) -> dict:
        if not self._slot.acquire(blocking=False):
            raise RuntimeBusyError("the live runtime already has an active query")
        self._set_busy(True)
        future = self._executor.submit(self.runner, question)
        try:
            result = future.result(timeout=self.timeout_seconds)
        except FutureTimeout as error:
            future.add_done_callback(self._release)
            raise RuntimeTimeoutError("the live query exceeded its timeout") from error
        except BaseException:
            self._release()
            raise
        self._release()
        return result

    def close(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)


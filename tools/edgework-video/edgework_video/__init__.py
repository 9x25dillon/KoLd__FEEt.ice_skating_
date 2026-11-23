"""EDGEWORK offline video-to-motion & evidence intake pipeline."""

__version__ = "0.1.0"

EXIT_OK = 0
EXIT_INVALID_INPUT = 2
EXIT_PRECONDITION_UNMET = 3
EXIT_BACKEND_FAILURE = 4


class EdgeworkVideoError(Exception):
    """Structured error carrying an explicit CLI exit code."""

    def __init__(self, message: str, exit_code: int) -> None:
        super().__init__(message)
        self.exit_code = exit_code

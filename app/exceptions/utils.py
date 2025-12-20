class UnsupportedFileTypeError(ValueError):
    """Raised when file type is not supported."""

    def __init__(self, suffix: str) -> None:
        super().__init__(f"Unsupported file type: {suffix}")
        self.suffix = suffix

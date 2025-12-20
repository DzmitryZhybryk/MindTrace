class ResourceNotFoundError(KeyError):
    """Raised when resource is not found in registry."""

    def __init__(self, registry_class_name: str, resource_key: type) -> None:
        super().__init__(f"'{registry_class_name}' object has no attribute '{resource_key}'")
        self.registry_class_name = registry_class_name
        self.resource_key = resource_key

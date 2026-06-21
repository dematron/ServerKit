"""Slug generation utilities."""
import re


SLUG_PATTERN = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')


def slugify(text):
    """Convert a string to a URL-safe slug.

    Examples:
        'Hello World' -> 'hello-world'
        'My Queue Group!' -> 'my-queue-group'
        '  Multiple   spaces  ' -> 'multiple-spaces'
    """
    if not text:
        return ''
    text = str(text).lower().strip()
    # Replace any run of non-alphanumeric characters with a single hyphen
    text = re.sub(r'[^a-z0-9]+', '-', text)
    # Strip leading/trailing hyphens
    text = text.strip('-')
    return text


def unique_slug(base, exists, default='untitled'):
    """Return a unique slug based on `base`.

    `exists` is a callable that takes a slug and returns True if it is already
    in use. If `base` is taken, appends `-1`, `-2`, etc. until a free slug is
    found.

    Args:
        base: The text or slug to start from.
        exists: Callable(slug: str) -> bool.
        default: Fallback string when `base` slugifies to something empty.

    Returns:
        A unique slug string.
    """
    base_slug = slugify(base) or default
    if not exists(base_slug):
        return base_slug

    counter = 1
    while True:
        candidate = f'{base_slug}-{counter}'
        if not exists(candidate):
            return candidate
        counter += 1


def is_valid_slug(value):
    """Return True if `value` is a non-empty, well-formed slug."""
    return bool(value and SLUG_PATTERN.match(value))


def validate_slug(value):
    """Validate a slug and return a normalized value or raise ValueError.

    This is stricter than `slugify`: it rejects empty values and values that
    contain characters outside `[a-z0-9-]`, rather than converting them.
    """
    slug = (value or '').strip().lower()
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'[^a-z0-9-]', '', slug)
    slug = re.sub(r'-{2,}', '-', slug).strip('-')
    if not slug:
        raise ValueError('Slug is required')
    if not SLUG_PATTERN.match(slug):
        raise ValueError('Slug can only contain lowercase letters, numbers, and hyphens')
    return slug

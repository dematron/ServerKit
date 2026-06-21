"""Slug generation utilities."""
import re


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


def unique_slug(base, exists):
    """Return a unique slug based on `base`.

    `exists` is a callable that takes a slug and returns True if it is already
    in use. If `base` is taken, appends `-1`, `-2`, etc. until a free slug is
    found.
    """
    base_slug = slugify(base)
    if not base_slug:
        base_slug = 'untitled'
    if not exists(base_slug):
        return base_slug

    counter = 1
    while True:
        candidate = f'{base_slug}-{counter}'
        if not exists(candidate):
            return candidate
        counter += 1

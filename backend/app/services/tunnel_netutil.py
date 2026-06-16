"""Pure, dependency-free helpers for the WireGuard tunnel broker.

Kept import-light (stdlib only) so the subnet allocator, interface-name
derivation and health classification are unit-testable without booting
Flask/SQLAlchemy. See docs/REMOTE_ACCESS_ROADMAP.md (Phase 1, #7 / #11).
"""

import ipaddress

# The tunnel overlay pool: 10.88.0.0/16 carved into /24s. Deliberately an
# uncommon RFC-1918 block so it won't collide with a typical home LAN
# (192.168.x / 10.0.x). Each tunnel gets one /24 — .1 = edge, .2 = private.
TUNNEL_POOL = "10.88.0.0/16"

# A peer counts as "live" if it handshook within this window. WireGuard
# rehandshakes well inside it when persistent-keepalive is 25s.
HANDSHAKE_FRESH_SECONDS = 180


def pick_subnet(used_subnets):
    """Return (subnet_cidr, edge_ip, private_ip) for the first free /24 in
    the pool. ``used_subnets`` is any iterable of CIDR strings already taken.

    Raises RuntimeError if the pool is exhausted (256 /24s).
    """
    used = set(used_subnets or [])
    for third in range(256):
        cidr = "10.88.%d.0/24" % third
        if cidr not in used:
            return cidr, "10.88.%d.1" % third, "10.88.%d.2" % third
    raise RuntimeError("tunnel subnet pool exhausted (10.88.0.0/16, 256 /24s)")


def interface_name_for(tunnel_id):
    """Derive a stable, kernel-valid WireGuard interface name from a tunnel
    id. Linux caps interface names at 15 chars; 'skwg' + 8 hex is 12. The
    same name is used on both ends (they're different hosts).
    """
    compact = str(tunnel_id).replace("-", "")[:8] or "0"
    return "skwg%s" % compact


def derive_status(latest_handshake_epoch, now_epoch, interface_up=True):
    """Classify tunnel health from a peer's latest-handshake timestamp.

    - 'down'     — the interface isn't up
    - 'up'       — handshook within HANDSHAKE_FRESH_SECONDS
    - 'degraded' — handshook before, but now stale (link may be recovering)
    - 'pending'  — interface up but no handshake yet (just created)
    """
    if not interface_up:
        return "down"
    if latest_handshake_epoch and latest_handshake_epoch > 0:
        age = now_epoch - latest_handshake_epoch
        return "up" if age <= HANDSHAKE_FRESH_SECONDS else "degraded"
    return "pending"


def validate_endpoint_host(ip_address):
    """True if ``ip_address`` is usable as the edge's public endpoint host.

    Accepts IPv4/IPv6; rejects empty, malformed, loopback and unspecified
    addresses. Private ranges are allowed (a lab/LAN edge is valid).
    """
    if not ip_address:
        return False
    try:
        ip = ipaddress.ip_address(str(ip_address).strip())
    except ValueError:
        return False
    return not (ip.is_loopback or ip.is_unspecified)

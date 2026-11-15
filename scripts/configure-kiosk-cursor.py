#!/usr/bin/env python3
"""Install a transparent cursor theme for the Pi's labwc session."""
from pathlib import Path
from struct import pack
import sys


THEME = 'ShaggyInvisible'
ALIASES = (
    'default', 'arrow', 'top_left_arrow', 'right_ptr', 'context-menu', 'help',
    'pointer', 'hand1', 'hand2', 'progress', 'left_ptr_watch', 'wait', 'watch',
    'cell', 'cross', 'crosshair', 'text', 'xterm', 'vertical-text', 'alias',
    'copy', 'move', 'fleur', 'all-scroll', 'no-drop', 'not-allowed',
    'grab', 'grabbing', 'e-resize', 'n-resize', 'ne-resize', 'nw-resize',
    's-resize', 'se-resize', 'sw-resize', 'w-resize', 'ew-resize',
    'ns-resize', 'nesw-resize', 'nwse-resize', 'col-resize', 'row-resize',
    'zoom-in', 'zoom-out',
)
START = '# BEGIN Shaggy kiosk cursor'
END = '# END Shaggy kiosk cursor'


def configure(home, defaults=Path('/etc/xdg/labwc')):
    icons = home / '.local/share/icons' / THEME
    cursors = icons / 'cursors'
    cursors.mkdir(parents=True, exist_ok=True)
    (icons / 'index.theme').write_text('[Icon Theme]\nName=Shaggy Invisible\n')
    # Xcursor header, one image table entry, and 24x24 fully transparent ARGB pixels.
    image_type, size = 0xfffd0002, 24
    binary = (pack('<4s6I', b'Xcur', 16, 0x10000, 1, image_type, size, 28)
              + pack('<9I', 36, image_type, size, 1, size, size, 0, 0, 0)
              + bytes(size * size * 4))
    (cursors / 'left_ptr').write_bytes(binary)
    for name in ALIASES:
        alias = cursors / name
        if not alias.is_symlink() and not alias.exists():
            alias.symlink_to('left_ptr')

    config = home / '.config/labwc'
    config.mkdir(parents=True, exist_ok=True)
    environment = config / 'environment'
    fallback = defaults / 'environment'
    current = environment.read_text() if environment.exists() else fallback.read_text() if fallback.is_file() else ''
    before, start, rest = current.partition(START)
    if start:
        _, end, after = rest.partition(END)
        if not end:
            raise ValueError('Incomplete Shaggy cursor settings block in ' + str(environment))
        current = before + after.lstrip('\n')
    block = (f'{START}\nXCURSOR_THEME={THEME}\n'
             'XCURSOR_PATH=$HOME/.local/share/icons:/usr/share/icons:/usr/share/pixmaps\n'
             f'{END}\n')
    updated = (current.rstrip() + '\n\n' if current.strip() else '') + block
    if not environment.exists() or environment.read_text() != updated:
        environment.write_text(updated)


if __name__ == '__main__':
    configure(Path(sys.argv[1]))

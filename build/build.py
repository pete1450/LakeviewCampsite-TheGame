#!/usr/bin/env python3
"""Assemble campground/index.html: head + three.min.js + logic.js + game.js + minigames.js + foot.

Usage: python3 build.py [output-path]
Defaults to ~/workspace/your_files/campground/index.html
"""
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
head = (HERE / 'head.html').read_text()
three = (HERE / 'three.min.js').read_text()
logic = (HERE / 'logic.js').read_text()
game = (HERE / 'game.js').read_text()
minigames = (HERE / 'minigames.js').read_text()

# logic.js + game.js + minigames.js share ONE <script> scope in the output:
# a duplicate top-level const/let/class/function name silently breaks (or
# hijacks) the other file's code, so fail the build instead.
seen = {}
for fname, src in (('logic.js', logic), ('game.js', game), ('minigames.js', minigames)):
    for m in re.finditer(r'^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)', src, re.M):
        name = m.group(1)
        if name in seen:
            raise SystemExit(f'BUILD FAILED: top-level name "{name}" declared in both {seen[name]} and {fname}')
        seen[name] = fname
out = head + three + '\n</script>\n<script>\n' + logic + '\n' + game + '\n' + minigames + '\n</script>\n</body>\n</html>\n'

if len(sys.argv) > 1:
    dest = pathlib.Path(sys.argv[1])
else:
    dest = pathlib.Path.home() / 'workspace' / 'your_files' / 'campground' / 'index.html'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out)
print('wrote', dest, len(out), 'bytes')

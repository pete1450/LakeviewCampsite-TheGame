#!/usr/bin/env python3
"""Assemble campground/index.html: head + three.min.js + logic.js + game.js + foot.

Usage: python3 build.py [output-path]
Defaults to ~/workspace/your_files/campground/index.html
"""
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
head = (HERE / 'head.html').read_text()
three = (HERE / 'three.min.js').read_text()
logic = (HERE / 'logic.js').read_text()
game = (HERE / 'game.js').read_text()
out = head + three + '\n</script>\n<script>\n' + logic + '\n' + game + '\n</script>\n</body>\n</html>\n'

if len(sys.argv) > 1:
    dest = pathlib.Path(sys.argv[1])
else:
    dest = pathlib.Path.home() / 'workspace' / 'your_files' / 'campground' / 'index.html'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out)
print('wrote', dest, len(out), 'bytes')

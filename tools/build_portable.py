"""Build a standalone offline HTML. Uses only Python's standard library."""
from pathlib import Path
import base64
import hashlib
import re

root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text(encoding='utf-8-sig')
scripts = [(root / name).read_text(encoding='utf-8-sig') for name in ['grid-core.js', 'app.js']]
css = (root / 'styles.css').read_text(encoding='utf-8-sig')

def digest(text):
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode()).digest()).decode() + "'"

html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + css + '</style>')
html = re.sub(r'  <script src="(?:grid-core|app)[.]js" defer></script>\n', '', html)
html = html.replace('</body>', '\n'.join('<script>' + script + '</script>' for script in scripts) + '\n</body>')
html = html.replace("script-src 'self' file:;", 'script-src ' + ' '.join(map(digest, scripts)) + ';')
html = html.replace("style-src 'self' file:;", 'style-src ' + digest(css) + ';')
dest = root / '留墨.html'
dest.write_text(html, encoding='utf-8')
print(f'Built {dest.name}: {dest.stat().st_size:,} bytes')

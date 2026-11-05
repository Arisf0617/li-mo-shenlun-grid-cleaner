from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / 'android-app' / 'app' / 'src' / 'main' / 'assets'
source.mkdir(parents=True, exist_ok=True)
for name in ('index.html', 'styles.css', 'app.js', 'grid-core.js', 'grid-worker.js'):
    (source / name).write_bytes((root / name).read_bytes())
index = (source / 'index.html').read_text(encoding='utf-8-sig')
index = index.replace('<script src="app.js" defer></script>',
                      '<script src="android-native.js" defer></script>\n  <script src="app.js" defer></script>')
index = index.replace('<meta name="viewport" content="width=device-width, initial-scale=1">',
                      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">')
(source / 'index.html').write_text(index, encoding='utf-8')
(source / 'android-native.js').write_bytes((root / 'android-app/app/src/main/assets/android-native.js').read_bytes())
print(f'Synchronized {len(list(source.iterdir()))} local web assets.')

#!/usr/bin/env python3
"""Builds Travel Log into dist/: a single-file index.html plus the PWA files.
   Also writes dist/artifact.html (same app without PWA tags) for single-file hosting."""
import hashlib, json, shutil, subprocess, sys, pathlib
ROOT = pathlib.Path(__file__).parent; SRC = ROOT / 'src'; PUB = ROOT / 'public'; DIST = ROOT / 'dist'
css = (SRC / 'styles.css').read_text()
js = '\n'.join((SRC / f).read_text() for f in ['app.1-core.js', 'app.1b-sync.js', 'app.2-screens.js', 'app.3-ui.js'])
tpl = (SRC / 'index.template.html').read_text()
# syntax check before shipping anything
check = ROOT / '.build-check.js'; check.write_text(js)
r = subprocess.run(['node', '--check', str(check)], capture_output=True, text=True); check.unlink()
if r.returncode: print(r.stderr); sys.exit('JavaScript syntax error, build stopped.')
html = tpl.replace('/*CSS*/', css).replace('/*JS*/', js)
PWA = '''<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Travel Log">'''
if DIST.exists(): shutil.rmtree(DIST)
(DIST / 'icons').mkdir(parents=True)
index = html.replace('<!--PWA-->', PWA)
(DIST / 'index.html').write_text(index)
(DIST / 'artifact.html').write_text(html.replace('<!--PWA-->\n', ''))
version = hashlib.sha256(index.encode()).hexdigest()[:10]
(DIST / 'sw.js').write_text((PUB / 'sw.template.js').read_text().replace('__VERSION__', version))
shutil.copy(PUB / 'manifest.webmanifest', DIST / 'manifest.webmanifest')
for f in (PUB / 'icons').iterdir(): shutil.copy(f, DIST / 'icons' / f.name)
json.loads((DIST / 'manifest.webmanifest').read_text())   # manifest must be valid JSON
(DIST / '.nojekyll').write_text('')
print(f'built dist/ (index.html {len(index)//1024} KB, cache version {version})')

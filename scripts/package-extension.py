"""Package the unpacked extension and embed its engine in the standalone page."""
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


def main():
    root = Path(__file__).resolve().parents[1]
    extension = root / 'extension'
    manifest = json.loads((extension / 'manifest.json').read_text(encoding='utf-8'))
    engine = (extension / 'rewrite.js').read_text(encoding='utf-8').strip()
    webpage = root / 'index.html'
    html = webpage.read_text(encoding='utf-8')
    pattern = r'(<script id="rewrite-engine">)([\s\S]*?)(</script>)'
    matches = list(re.finditer(pattern, html))
    if len(matches) != 1:
        raise ValueError('Expected one embedded rewrite-engine script in index.html')
    match = matches[0]
    if match[2].strip() != engine:
        updated = html[:match.start(2)] + '\n' + engine + '\n' + html[match.end(2):]
        webpage.write_bytes(updated.encode('utf-8'))

    files = {
        'manifest.json', 'popup.css', 'popup.js', 'rewrite.js',
        manifest['action']['default_popup'], manifest['background']['service_worker'],
        *manifest['icons'].values(), *manifest['action']['default_icon'].values(),
    }
    target = root / 'dist' / 'logfog-extension.zip'
    target.parent.mkdir(exist_ok=True)
    partial = target.with_suffix('.tmp')
    try:
        with ZipFile(partial, 'w') as archive:
            for filename in sorted(files):
                info = ZipInfo(filename, date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, (extension / filename).read_bytes(),
                                 compress_type=ZIP_DEFLATED, compresslevel=9)
        partial.replace(target)
    finally:
        partial.unlink(missing_ok=True)
    print(f'Created {target.name} ({target.stat().st_size} bytes)')


if __name__ == '__main__':
    main()

import os, sys, subprocess, hashlib
from pathlib import Path

EXE = Path(os.environ['APPDATA']) / 'Python/Python312/Scripts/hwp5txt.exe'
ROOT = Path('data/raw/attachments')
OUT = ROOT / 'hwp-txt'

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    hwps = [p for p in ROOT.rglob('*.hwp')]
    ok = fail = 0
    for p in hwps:
        sha = hashlib.sha256(p.read_bytes()).hexdigest()[:16]
        target = OUT / f'{sha}.txt'
        if target.exists():
            ok += 1
            continue
        try:
            r = subprocess.run([str(EXE), str(p)], capture_output=True, timeout=60)
            if r.returncode == 0 and len(r.stdout) > 20:
                # stdout은 원본 바이트(euc-kr/utf-8 혼재 가능) → 그대로 기록 후 디코딩 시도 순서 적용
                text = None
                for enc in ('utf-8', 'cp949', 'euc-kr'):
                    try:
                        text = r.stdout.decode(enc)
                        break
                    except UnicodeDecodeError:
                        continue
                if text is None:
                    text = r.stdout.decode('utf-8', errors='replace')
                if len(text.replace('\\s', '').strip()) < 10:
                    raise ValueError('empty text')
                target.write_text(text, encoding='utf-8')
                ok += 1
            else:
                fail += 1
        except Exception:
            fail += 1
    print(f'[hwp-batch] ok={ok} fail={fail} total={len(hwps)}')

main()

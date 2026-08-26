import sys, io

# hwp5 패키지 API로 본문 텍스트 추출 (hwp5txt 내부 구현과 동일 경로)
from hwp5.xmlmodel import Hwp5File
from hwp5.tagids import HWPTAG_PARA_TEXT
from hwp5.dataio import RecordStream
import struct

def para_text(record):
    # PARA_TEXT 레코드 → 텍스트 디코드 (hwp5txt와 동일한 방식: YBYTE/UTF16)
    from hwp5.hwp5txt import text_content  # 존재 시 사용
    return None

def main(path):
    f = Hwp5File(path)
    out = []
    for model in f.bodytext.models():
        # models()는 섹션의 아이템 스트림을 제너레이트 (형식: (tagid, payload, ...))
        pass
    # 안전하게 저수준 접근
    for section in f.bodytext.sections:
        stream = section.open()
        rs = RecordStream(stream)
        while True:
            try:
                header = rs.next_record_header()
            except StopIteration:
                break
            tag_id, size, level = header
            payload = rs.read_payload(size) if hasattr(rs, 'read_payload') else stream.read(size)
            if tag_id == HWPTAG_PARA_TEXT:
                # 첫 2바이트는 char shape count; 이후 문자 스트림
                data = payload[2:] if len(payload) > 2 else b''
                i = 0
                buf = []
                while i < len(data):
                    b = data[i]
                    if b < 0x80 and b != 0:
                        buf.append(chr(b)); i += 1
                    elif i + 1 < len(data):
                        chunk = data[i:i+2]
                        ch = int.from_bytes(chunk, 'little')
                        if ch == 0x000D or ch == 0x2029:
                            buf.append('\n')
                        elif ch >= 0x20:
                            try:
                                buf.append(chunk.decode('utf-16-le'))
                            except Exception:
                                pass
                        i += 2
                    else:
                        break
                out.append(''.join(buf))
    sys.stdout.reconfigure(encoding='utf-8')
    print('\n'.join(out))

main(sys.argv[1])

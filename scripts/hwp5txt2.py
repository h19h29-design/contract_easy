import sys

from hwp5.hwp5txt import TextTransform
from hwp5.xmlmodel import Hwp5File
from hwp5.utils import filtered

def main(path):
    f = Hwp5File(path)
    out = io.StringIO()
    transform = TextTransform()
    # hwp5txt 본문 변환 경로: bodytext.models() → TextTransform
    models = f.bodytext.models()
    for item in filtered(models, predicate=lambda m: True):
        pass
    # 실제 사용: Hwp5File.bodytext.models()를 TextTransform에 흘려보내는 헬퍼가 없어
    # hwp5txt main과 동일한 호출을 모방한다.
    from hwp5.hwp5txt import main as _m  # noqa (참고용)
    raise SystemExit(2)

main(sys.argv[1])

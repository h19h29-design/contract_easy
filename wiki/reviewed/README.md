# wiki/reviewed

사람이 검토·수정한 지식 문서를 두는 곳입니다.

- `pnpm ingest:all`은 `wiki/generated`만 다시 쓰며, 이 폴더는 **절대 덮어쓰지 않습니다**.
- 검토 절차: generated 문서의 원문 인용과 메타데이터(게시일·시행일·확인일)를 대조 →
  수정본을 이 폴더에 복사·편집 → 검토자 기록 남기기(파일 상단 주석).
- 서비스 노출 우선순위: reviewed > generated (이후 API에 반영 예정).

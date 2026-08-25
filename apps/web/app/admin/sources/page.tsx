import Link from 'next/link';
import { redirect } from 'next/navigation';

export default function AdminSourcesPage() {
  // 출처 목록은 공개 /sources와 동일 데이터 + 관리자 컨텍스트
  void redirect;
  return (
    <div className="container">
      <h1>출처 관리</h1>
      <p>원문 버전·시행일·유효 상태는 공개 출처 화면과 API로 관리됩니다.</p>
      <p><Link href="/sources" className="btn">출처 목록 열기</Link></p>
      <section className="card">
        <h2>운영 규칙</h2>
        <ul>
          <li>삭제된 원문은 즉시 지우지 않고 <code>inactive</code>로 보존합니다.</li>
          <li>변경 감지 시 이전 버전이 유지되고 diff가 기록됩니다(<code>pnpm crawl:diff</code>).</li>
          <li>첨부파일은 robots.txt 정책상 메타데이터만 보관됩니다.</li>
        </ul>
      </section>
    </div>
  );
}

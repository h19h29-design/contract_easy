import Link from 'next/link';

const ADMIN_MENUS = [
  { href: '/admin/crawls', title: '수집 현황', desc: '크롤 실행 기록, 실패 목록' },
  { href: '/admin/sources', title: '출처 관리', desc: '원문 버전과 상태' },
  { href: '/admin/rules', title: '규칙 검토·승인', desc: '규칙 후보를 원문 근거와 함께 검토하고 active로 승인' },
  { href: '/admin/reports', title: '답변 신고', desc: '잘못된 AI 답변 신고 처리' }
];

export default function AdminHome() {
  return (
    <div className="container">
      <h1>관리자</h1>
      <div className="choice-grid">
        {ADMIN_MENUS.map((m) => (
          <Link key={m.href} href={m.href} className="choice-card">
            <strong>{m.title}</strong>
            <span className="desc">{m.desc}</span>
          </Link>
        ))}
      </div>
      <p className="muted">감사로그는 /api/admin/audit API에서 확인할 수 있습니다.</p>
    </div>
  );
}

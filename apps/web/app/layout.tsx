import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: '서울시교육청 공사계약 통합지원',
  description: '공사계약 절차·서류·FAQ를 근거 원문과 함께 안내하는 통합지원 시스템'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="site">
          <div className="container">
            <Link href="/" className="brand">서울시교육청 공사계약 길잡이</Link>
            <nav className="main">
              <Link href="/wizard">계약 안내 시작</Link>
              <Link href="/search">통합검색</Link>
              <Link href="/guide">절차·서식</Link>
              <Link href="/sources">출처</Link>
              <Link href="/workspace">업무공간</Link>
              <Link href="/admin">관리자</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer-note">
          본 서비스의 AI 설명은 법률 자문이 아니며, 최종 판단은 현행 법령·예규·기관 지침과 계약담당자 검토를 따릅니다.
        </footer>
      </body>
    </html>
  );
}

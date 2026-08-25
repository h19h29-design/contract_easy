import Link from 'next/link';

export default function Home() {
  return (
    <div className="container">
      <section className="hero">
        <h1>공사계약, 혼자 고민하지 마세요</h1>
        <p>절차·서류·기준을 근거 원문과 함께 확인하고, 계약 전체 과정을 관리하세요.</p>
      </section>

      <section className="choice-grid">
        <Link href="/wizard" className="choice-card">
          <span className="emoji" aria-hidden>🚧</span>
          <strong>새 공사계약 시작</strong>
          <span className="desc">질문에 답하면 절차와 다음 할 일을 안내합니다</span>
        </Link>
        <Link href="/search" className="choice-card">
          <span className="emoji" aria-hidden>💬</span>
          <strong>계약업무 질문하기</strong>
          <span className="desc">FAQ·자료를 검색하고 출처와 함께 답을 찾습니다</span>
        </Link>
        <Link href="/guide" className="choice-card">
          <span className="emoji" aria-hidden>📚</span>
          <strong>절차와 서식 찾아보기</strong>
          <span className="desc">계약 흐름, 체크리스트, 서식 안내를 둘러봅니다</span>
        </Link>
      </section>

      <section className="card">
        <h2>이 서비스의 원칙</h2>
        <ul>
          <li>금액 기준·계약방법 같은 판단은 <strong>검토·승인된 규칙</strong>으로만 제공합니다. 승인된 규칙이 없으면 숫자를 추측하지 않고 <strong>담당자 검토 필요</strong>로 안내합니다.</li>
          <li>AI 설명에는 항상 <strong>원문 출처(제목·URL·게시일/시행일)</strong>를 함께 표시합니다.</li>
          <li>업무공간의 계약 자료는 비공개로 보관되며 공개 검색에 사용되지 않습니다.</li>
        </ul>
      </section>
    </div>
  );
}

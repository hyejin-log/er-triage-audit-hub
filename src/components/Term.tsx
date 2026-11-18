// [기획 > 사용자 이해] 용어에 점선 밑줄을 긋고, 마우스를 올리거나 키보드로 포커스하면 뜻을 보여 줍니다.
import type { ReactNode } from "react";
import { GLOSSARY, type GlossaryKey } from "../format";

export default function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const g = GLOSSARY[k];
  return (
    <span className="term" tabIndex={0} aria-label={`${g.term}: ${g.desc}`}>
      {children ?? g.term}
      <span className="term-tip" role="tooltip">
        <b>{g.term} · {g.short}</b>
        {g.desc}
      </span>
    </span>
  );
}

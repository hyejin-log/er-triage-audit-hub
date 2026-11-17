// [개발 > 프론트엔드] 앱 셸 — 탭 구성은 Rebate Lens(한눈에 보기 / 확인 필요 / 정상 진행 / 전체 / 근거 자료)를 따릅니다.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api";
import type { Decision, Review, Rule, Summary, Visit } from "./types";
import { safeStorage, saveStorage } from "./format";
import Overview from "./components/Overview";
import ReviewQueue from "./components/ReviewQueue";
import VisitTable from "./components/VisitTable";
import VisitDrawer from "./components/VisitDrawer";
import RulesPanel from "./components/RulesPanel";

export type Tab = "overview" | "high" | "medium" | "all" | "rules";
const REVIEW_CACHE = "er-audit:reviews";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [rules, setRules] = useState<Record<string, Rule>>({});
  const [reviews, setReviews] = useState<Record<string, Review>>(() => safeStorage(REVIEW_CACHE, {}));
  const [storeName, setStoreName] = useState<string>("");
  const [selected, setSelected] = useState<Visit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, v, r] = await Promise.all([api.summary(), api.visits(), api.rules()]);
      setSummary(s);
      setVisits(v.items);
      setRules(r);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "데이터를 불러오지 못했어요.");
      return;
    }
    try {
      const rv = await api.reviews();
      setStoreName(rv.store);
      // 서버 기록을 우선하고, 서버가 비어 있으면(서버리스 재시작) 브라우저 사본을 유지합니다.
      setReviews((local) => ({ ...local, ...rv.items }));
    } catch {
      setStoreName("browser");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => saveStorage(REVIEW_CACHE, reviews), [reviews]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const decide = useCallback(async (visitId: string, decision: Decision, note: string, reviewer: string) => {
    try {
      const saved = await api.saveReview({ visit_id: visitId, decision, note, reviewer });
      setReviews((prev) => ({ ...prev, [visitId]: saved }));
      setToast(`${visitId} · ${decision}로 기록했어요`);
    } catch (e) {
      // 서버 저장 실패 시에도 브라우저에는 남겨 작업이 끊기지 않게 합니다.
      setReviews((prev) => ({
        ...prev,
        [visitId]: { visit_id: visitId, decision, note, reviewer, decided_at: new Date().toISOString() },
      }));
      setToast(e instanceof ApiError ? `${e.message} 이 브라우저에만 저장했어요.` : "이 브라우저에만 저장했어요.");
    }
  }, []);

  const undo = useCallback(async (visitId: string) => {
    try {
      await api.deleteReview(visitId);
    } catch {
      /* 서버에 없던 기록이어도 화면에서는 되돌립니다. */
    }
    setReviews((prev) => {
      const next = { ...prev };
      delete next[visitId];
      return next;
    });
    setToast(`${visitId} 결정을 되돌렸어요`);
  }, []);

  const highVisits = useMemo(() => visits.filter((v) => v.status === "high"), [visits]);
  const mediumVisits = useMemo(() => visits.filter((v) => v.status === "medium"), [visits]);
  const pendingHigh = highVisits.filter((v) => !reviews[v.visit_id]).length;

  const tabs: { id: Tab; label: string; count?: number; tone?: string }[] = [
    { id: "overview", label: "한눈에 보기" },
    { id: "high", label: "확인 필요", count: pendingHigh, tone: "danger" },
    { id: "medium", label: "주의 관찰", count: mediumVisits.length, tone: "warn" },
    { id: "all", label: "전체 내원", count: visits.length },
    { id: "rules", label: "감사 기준" },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>+</span>
          <div>
            <strong>ER Triage Lens</strong>
            <span className="brand-sub">응급실 KTAS 감사 허브</span>
          </div>
        </div>
        <div className="topbar-meta">
          {summary && <span>{summary.period}</span>}
          <span className="pill pill-muted">가상 데이터</span>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="화면 전환">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? "is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && <span className={`tab-count ${t.tone ?? ""}`}>{t.count}</span>}
          </button>
        ))}
      </nav>

      <main className="content">
        {loadError ? (
          <div className="error-box" role="alert">
            <strong>데이터를 불러오지 못했어요</strong>
            <p>{loadError}</p>
            <button className="btn" onClick={load}>다시 불러오기</button>
          </div>
        ) : !summary ? (
          <div className="skeleton-grid" aria-busy="true">
            <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
          </div>
        ) : (
          <>
            {tab === "overview" && (
              <Overview summary={summary} pendingHigh={pendingHigh} reviewed={Object.keys(reviews).length} onGo={setTab} />
            )}
            {tab === "high" && (
              <ReviewQueue visits={highVisits} reviews={reviews} onDecide={decide} onUndo={undo} onOpen={setSelected} />
            )}
            {tab === "medium" && (
              <ReviewQueue visits={mediumVisits} reviews={reviews} onDecide={decide} onUndo={undo} onOpen={setSelected} tone="medium" />
            )}
            {tab === "all" && <VisitTable visits={visits} reviews={reviews} zones={summary.zones.map((z) => z.zone)} onOpen={setSelected} />}
            {tab === "rules" && <RulesPanel rules={rules} summary={summary} storeName={storeName} />}
          </>
        )}
      </main>

      {selected && <VisitDrawer visit={selected} review={reviews[selected.visit_id]} onClose={() => setSelected(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

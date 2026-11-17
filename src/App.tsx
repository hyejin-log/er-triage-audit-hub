// [개발 > 프론트엔드] 앱 셸 — 탭 구성은 Rebate Lens(한눈에 보기 / 확인 필요 / 정상 진행 / 전체 / 근거 자료)를 따릅니다.
// 부서 흐름: QI팀 결정 → (소명 요청) → 담당 부서 소명 → QI팀 확정
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, setAuthToken } from "./api";
import { supabase } from "./supabase";
import type { Decision, DeptCode, Review, Rule, Summary, User, Visit } from "./types";
import { safeStorage, saveStorage } from "./format";
import AuthBar from "./components/AuthBar";
import Overview from "./components/Overview";
import ReviewQueue from "./components/ReviewQueue";
import ExplanationBoard from "./components/ExplanationBoard";
import VisitTable from "./components/VisitTable";
import VisitDrawer from "./components/VisitDrawer";
import RulesPanel from "./components/RulesPanel";

export type Tab = "overview" | "high" | "medium" | "explain" | "all" | "rules";
const DEMO_TOKEN_KEY = "er-audit:demo-token";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [rules, setRules] = useState<Record<string, Rule>>({});
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [storeName, setStoreName] = useState<string>("");
  const [selected, setSelected] = useState<Visit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // ── [개발 > 인증] 세션 ────────────────────────────────────────────
  const adoptToken = useCallback(async (token: string | null, quiet = false) => {
    setAuthToken(token);
    if (!token) {
      setUser(null);
      return null;
    }
    try {
      const me = await api.me();
      setUser(me);
      if (!quiet) setToast(`${me.dept_name}${me.kind === "demo" ? " 데모" : ""}로 로그인했어요`);
      return me;
    } catch (e) {
      setAuthToken(null);
      setUser(null);
      if (!quiet && e instanceof ApiError) setToast(e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    // 1) 저장된 데모 토큰 복원
    const demoToken = safeStorage<string | null>(DEMO_TOKEN_KEY, null);
    if (demoToken) {
      adoptToken(demoToken, true).then((me) => {
        if (!me) saveStorage(DEMO_TOKEN_KEY, null);
      });
    }
    // 2) Supabase 이메일 세션
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !demoToken) adoptToken(data.session.access_token, true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        saveStorage(DEMO_TOKEN_KEY, null);
        adoptToken(session.access_token);
      } else if (event === "TOKEN_REFRESHED" && session) {
        setAuthToken(session.access_token);
      } else if (event === "SIGNED_OUT") {
        if (!safeStorage<string | null>(DEMO_TOKEN_KEY, null)) {
          setAuthToken(null);
          setUser(null);
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [adoptToken]);

  const demoLogin = useCallback(
    async (dept: DeptCode) => {
      if (supabase) await supabase.auth.signOut();
      const { token } = await api.demoLogin(dept);
      saveStorage(DEMO_TOKEN_KEY, token);
      const me = await adoptToken(token);
      if (me && me.dept !== "QI") setTab("explain");
    },
    [adoptToken],
  );

  const logout = useCallback(async () => {
    saveStorage(DEMO_TOKEN_KEY, null);
    if (supabase) await supabase.auth.signOut();
    setAuthToken(null);
    setUser(null);
    setToast("로그아웃했어요");
  }, []);

  // ── 데이터 ─────────────────────────────────────────────────────────
  const loadReviews = useCallback(async () => {
    try {
      const rv = await api.reviews();
      setStoreName(rv.store);
      setReviews(rv.items);
    } catch {
      setStoreName("unavailable");
    }
  }, []);

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
    await loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    load();
  }, [load]);

  // 다른 부서가 바꾼 진행 상황을 반영하도록 탭을 바꾸거나 화면으로 돌아오면 다시 읽습니다.
  useEffect(() => {
    loadReviews();
  }, [tab, user, loadReviews]);
  useEffect(() => {
    const onFocus = () => loadReviews();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadReviews]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // ── 동작 ───────────────────────────────────────────────────────────
  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      return true;
    } catch (e) {
      setToast(e instanceof ApiError ? e.message : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      if (e instanceof ApiError && e.status === 409) loadReviews();
      return false;
    }
  }, [loadReviews]);

  const decide = useCallback(
    (visitId: string, decision: Decision, note: string) =>
      guard(async () => {
        const saved = await api.saveReview({ visit_id: visitId, decision, note });
        setReviews((prev) => ({ ...prev, [visitId]: saved }));
        setToast(saved.stage === "requested" ? `${visitId} · 소명을 요청했어요` : `${visitId} · ${decision}로 확정했어요`);
      }),
    [guard],
  );

  const respond = useCallback(
    (visitId: string, response: string) =>
      guard(async () => {
        const saved = await api.respond(visitId, response);
        setReviews((prev) => ({ ...prev, [visitId]: saved }));
        setToast(`${visitId} · 소명을 제출했어요. QI팀이 확인합니다`);
      }),
    [guard],
  );

  const undo = useCallback(
    (visitId: string) =>
      guard(async () => {
        await api.deleteReview(visitId);
        setReviews((prev) => {
          const next = { ...prev };
          delete next[visitId];
          return next;
        });
        setToast(`${visitId} 결정을 되돌렸어요`);
      }),
    [guard],
  );

  const resetDemo = useCallback(
    () =>
      guard(async () => {
        const { deleted } = await api.resetDemo();
        setReviews({});
        setToast(`데모 데이터를 초기화했어요 (${deleted}건)`);
      }),
    [guard],
  );

  // ── 탭 ─────────────────────────────────────────────────────────────
  const highVisits = useMemo(() => visits.filter((v) => v.status === "high"), [visits]);
  const mediumVisits = useMemo(() => visits.filter((v) => v.status === "medium"), [visits]);
  const needsQi = (v: Visit) => !reviews[v.visit_id] || reviews[v.visit_id].stage === "answered";
  const pendingHigh = highVisits.filter(needsQi).length;
  const reviewList = Object.values(reviews);
  const isQi = user?.dept === "QI";
  const explainCount = user && !isQi
    ? reviewList.filter((r) => r.stage === "requested" && r.assigned_dept === user.dept).length
    : reviewList.filter((r) => r.stage === "answered").length;

  const tabs: { id: Tab; label: string; count?: number; tone?: string }[] = [
    { id: "overview", label: "한눈에 보기" },
    { id: "high", label: "확인 필요", count: pendingHigh, tone: "danger" },
    { id: "medium", label: "주의 관찰", count: mediumVisits.filter(needsQi).length, tone: "warn" },
    { id: "explain", label: user && !isQi ? `${user.dept_name} 소명` : "소명 현황", count: explainCount, tone: "accent" },
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
          {summary && <span className="hide-sm">{summary.period}</span>}
          <span className="pill pill-muted hide-sm">가상 데이터</span>
          <AuthBar user={user} onDemoLogin={demoLogin} onLogout={logout} />
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
              <Overview summary={summary} visits={visits} reviews={reviews} pendingHigh={pendingHigh} onGo={setTab} />
            )}
            {tab === "high" && (
              <ReviewQueue visits={highVisits} reviews={reviews} user={user} onDecide={decide} onUndo={undo} onOpen={setSelected} />
            )}
            {tab === "medium" && (
              <ReviewQueue visits={mediumVisits} reviews={reviews} user={user} onDecide={decide} onUndo={undo} onOpen={setSelected} tone="medium" />
            )}
            {tab === "explain" && (
              <ExplanationBoard
                visits={visits}
                reviews={reviews}
                user={user}
                onRespond={respond}
                onOpen={setSelected}
                onGo={setTab}
                onReset={resetDemo}
              />
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

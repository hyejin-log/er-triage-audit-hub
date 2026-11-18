// [개발 > 프론트엔드] 앱 셸 — 탭 구성은 Rebate Lens(한눈에 보기 / 확인 필요 / 정상 진행 / 전체 / 근거 자료)를 따릅니다.
// 부서 흐름: QI팀 결정 → (소명 요청) → 담당 부서 소명 → QI팀 확정
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, setAuthToken } from "./api";
import { supabase } from "./supabase";
import type { Decision, DeptCode, Progress, Review, Rule, Summary, User, Visit } from "./types";
import { safeStorage, saveStorage } from "./format";
import AuthBar from "./components/AuthBar";
import Overview from "./components/Overview";
import TeamHome from "./components/TeamHome";
import Landing from "./components/Landing";
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
  const [visitsLoaded, setVisitsLoaded] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; store?: string; db_ok?: boolean | null } | null>(null);
  const [rules, setRules] = useState<Record<string, Rule>>({});
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [storeName, setStoreName] = useState<string>("");
  const [selected, setSelected] = useState<Visit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [showHospital, setShowHospital] = useState(false);

  // 팀이 바뀌면 팀 홈부터 보여 줍니다.
  useEffect(() => setShowHospital(false), [user?.dept]);

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
    let cancelled = false;
    // 저장된 로그인(데모 토큰 → Supabase 세션)을 먼저 복원하고 나서 화면을 정합니다.
    (async () => {
      const demoToken = safeStorage<string | null>(DEMO_TOKEN_KEY, null);
      if (demoToken) {
        const me = await adoptToken(demoToken, true);
        if (!me) saveStorage(DEMO_TOKEN_KEY, null);
        else {
          if (!cancelled) setAuthReady(true);
          return;
        }
      }
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session) await adoptToken(data.session.access_token, true);
      }
      if (!cancelled) setAuthReady(true);
    })();
    if (!supabase) return () => { cancelled = true; };
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
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [adoptToken]);

  const demoLogin = useCallback(
    async (dept: DeptCode) => {
      if (supabase) await supabase.auth.signOut();
      const { token } = await api.demoLogin(dept);
      saveStorage(DEMO_TOKEN_KEY, token);
      await adoptToken(token);
      setTab("overview");
    },
    [adoptToken],
  );

  const logout = useCallback(async () => {
    saveStorage(DEMO_TOKEN_KEY, null);
    if (supabase) await supabase.auth.signOut();
    setAuthToken(null);
    setUser(null);
    setTab("overview");
    setSelected(null);
    setToast("로그아웃했어요");
  }, []);

  // ── 데이터 ─────────────────────────────────────────────────────────
  // 공개: 전체 집계(요약·진행 건수)와 감사 기준 / 로그인 후: 내원 목록과 결정 기록
  const loadPublic = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, r] = await Promise.all([api.summary(), api.rules()]);
      setSummary(s);
      setRules(r);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "데이터를 불러오지 못했어요.");
    }
    api.progress().then(setProgress, () => setProgress({ available: false, flagged: 0, undecided: 0, requested: 0, answered: 0, closed: 0 }));
  }, []);

  const loadReviews = useCallback(async () => {
    if (!user) return;
    try {
      const rv = await api.reviews();
      setStoreName(rv.store);
      setReviews(rv.items);
    } catch {
      setStoreName("unavailable");
    }
  }, [user]);

  useEffect(() => {
    loadPublic();
    // [유지보수] 상단 상태 표시 — 실제 /api/health 결과만 씁니다.
    api.health().then(setHealth, () => setHealth({ ok: false }));
  }, [loadPublic]);

  // 로그인하면 내원 목록을 불러오고, 로그아웃하면 지웁니다.
  useEffect(() => {
    if (!user) {
      setVisits([]);
      setReviews({});
      setVisitsLoaded(false);
      api.progress().then(setProgress, () => undefined);
      return;
    }
    let alive = true;
    api.visits().then(
      (v) => {
        if (!alive) return;
        setVisits(v.items);
        setVisitsLoaded(true);
      },
      (e) => alive && setLoadError(e instanceof ApiError ? e.message : "내원 목록을 불러오지 못했어요."),
    );
    return () => { alive = false; };
  }, [user]);

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
    { id: "overview", label: user && !isQi ? `${user.dept_name} 홈` : "한눈에 보기" },
    { id: "high", label: "확인 필요", count: pendingHigh, tone: "danger" },
    { id: "medium", label: "주의 관찰", count: mediumVisits.filter(needsQi).length, tone: "warn" },
    { id: "explain", label: user && !isQi ? `${user.dept_name} 소명` : "소명 현황", count: explainCount, tone: "accent" },
    { id: "all", label: "전체 내원", count: visits.length },
    { id: "rules", label: "감사 기준" },
  ];

  const sys = !health
    ? { tone: "is-warn", short: "상태 확인 중", full: "서버 상태를 확인하는 중이에요." }
    : !health.ok
      ? { tone: "is-bad", short: "연결 오류", full: "서버 또는 DB에 연결하지 못했어요. 잠시 후 새로고침해 주세요." }
      : health.store === "postgres"
        ? { tone: "", short: "DB 정상", full: "DB(Neon) 연결 정상 — 결정·소명·팀 메모가 저장돼요. 데이터는 모두 가상이에요." }
        : { tone: "is-warn", short: "임시 저장", full: "DB 없이 서버 메모리에 임시로 저장 중이에요(데모). 서버가 다시 켜지면 기록이 사라져요." };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden><CrossMark /></span>
          <div>
            <span className="brand-title">
              <strong>MediGuard ER</strong>
              <span className="brand-badge hide-sm">Clinical Audit Intelligence</span>
            </span>
            <span className="brand-sub">응급실 중증도(KTAS) 적정성 감사 · AI 검증</span>
          </div>
        </div>
        <div className="topbar-meta">
          {/* [유지보수] 서버·DB 연결 표시등 — 점만 두지 않고 짧은 글자를 항상 함께 보여요. 자세한 뜻은 마우스를 올리면 보여요. */}
          <span className={`sys-status ${sys.tone}`} title={sys.full} aria-label={sys.full}>
            <i className={`sys-dot ${sys.tone}`} aria-hidden />
            <span>{sys.short}</span>
            <span className="sys-long">· 가상 데이터</span>
          </span>
          <AuthBar user={user} onDemoLogin={demoLogin} onLogout={logout} />
        </div>
      </header>

      {user && (
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
      )}

      <main className={`content ${authReady && !user ? "content-wide" : ""}`}>
        {loadError ? (
          <div className="error-box" role="alert">
            <strong>데이터를 불러오지 못했어요</strong>
            <p>{loadError}</p>
            <button className="btn" onClick={loadPublic}>다시 불러오기</button>
          </div>
        ) : authReady && !user ? (
          <Landing summary={summary} progress={progress} onDemoLogin={demoLogin} />
        ) : !authReady || !visitsLoaded || !summary ? (
          <div className="skeleton-grid" aria-busy="true">
            <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
          </div>
        ) : (
          <>
            {tab === "overview" && user && !isQi && !showHospital && (
              <TeamHome
                user={user}
                summary={summary}
                visits={visits}
                reviews={reviews}
                onOpen={setSelected}
                onGo={setTab}
                onShowHospital={() => setShowHospital(true)}
              />
            )}
            {tab === "overview" && (!user || isQi || showHospital) && (
              <>
                {user && !isQi && (
                  <div className="back-bar">
                    <span className="muted small">병원 전체 현황을 보고 있어요.</span>
                    <button className="link" onClick={() => setShowHospital(false)}>← {user.dept_name} 홈으로</button>
                  </div>
                )}
                <Overview summary={summary} visits={visits} reviews={reviews} pendingHigh={pendingHigh} onGo={setTab} />
              </>
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
            {tab === "all" && <VisitTable visits={visits} reviews={reviews} zones={summary.zones.map((z) => z.zone)} hospital={summary.hospital} onOpen={setSelected} />}
            {tab === "rules" && <RulesPanel rules={rules} summary={summary} storeName={storeName} />}
          </>
        )}
      </main>

      {selected && <VisitDrawer visit={selected} review={reviews[selected.visit_id]} user={user} onClose={() => setSelected(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

// [디자인] 두꺼운 의료 십자 로고
function CrossMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="8.4" y="2.5" width="7.2" height="19" rx="1.8" />
      <rect x="2.5" y="8.4" width="19" height="7.2" rx="1.8" />
    </svg>
  );
}

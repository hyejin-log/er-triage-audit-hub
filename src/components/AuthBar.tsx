// [개발 > 인증] 로그인 — 부서별 원클릭 데모 로그인 + 이메일 매직 링크(Supabase)
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { DEPTS } from "../format";
import type { DeptCode, User } from "../types";

interface Props {
  user: User | null;
  onDemoLogin: (dept: DeptCode) => Promise<void>;
  onLogout: () => Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthBar({ user, onDemoLogin, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<DeptCode | null>(null);
  const [value, setValue] = useState("");
  const [mailState, setMailState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc 를 누르면 닫습니다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (user) {
    return (
      <div className="auth-bar">
        <span className={`dept-pill dept-${user.dept}`} title={user.email ?? user.name}>
          {user.dept_name}
          <small>{user.kind === "demo" ? "데모" : user.email}</small>
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>로그아웃</button>
      </div>
    );
  }

  const demo = async (dept: DeptCode) => {
    setBusy(dept);
    setError(null);
    try {
      await onDemoLogin(dept);
      setOpen(false);
    } catch {
      setError("데모 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(null);
    }
  };

  const sendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const target = value.trim();
    if (!EMAIL_RE.test(target)) {
      setError("이메일 형식을 확인해 주세요.");
      return;
    }
    setError(null);
    setMailState("sending");
    const { error: err } = await supabase.auth.signInWithOtp({
      email: target,
      options: { emailRedirectTo: window.location.origin },
    });
    if (err) {
      setMailState("idle");
      setError(
        err.status === 429
          ? "로그인 메일을 너무 자주 요청했습니다. 잠시 후 다시 시도하거나 데모 로그인을 써 주세요."
          : "로그인 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
    setMailState("sent");
  };

  return (
    <div className="auth-wrap" ref={wrapRef}>
      <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        로그인
      </button>
      {open && (
        <div className="auth-pop" role="dialog" aria-label="로그인">
          <div className="stack-sm">
            <div>
              <strong>부서별 데모 계정</strong>
              <p className="muted small">별도 가입 없이 접속됩니다. 부서마다 화면과 권한이 다릅니다.</p>
            </div>
            <div className="demo-grid">
              {DEPTS.map((d) => (
                <button
                  key={d.code}
                  type="button"
                  className={`demo-btn dept-${d.code}`}
                  onClick={() => demo(d.code)}
                  disabled={busy !== null}
                >
                  <b>{busy === d.code ? "들어가는 중…" : d.name}</b>
                  <span>{d.role}</span>
                </button>
              ))}
            </div>
          </div>

          {supabase && (
            <div className="stack-sm auth-mail">
              <div className="divider"><span>또는 이메일로 로그인</span></div>
              {mailState === "sent" ? (
                <>
                  <p className="small"><b>메일함을 확인해 주세요.</b> {value.trim()}로 로그인 링크를 보냈습니다.</p>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setMailState("idle"); setValue(""); }}>다른 이메일로 받기</button>
                </>
              ) : (
                <form onSubmit={sendMail} className="stack-sm" noValidate>
                  <label className="field">
                    <span>이메일</span>
                    <input
                      type="email"
                      autoComplete="email"
                      value={value}
                      maxLength={120}
                      onChange={(e) => { setValue(e.target.value); setError(null); }}
                      onBlur={() => value && !EMAIL_RE.test(value.trim()) && setError("이메일 형식을 확인해 주세요.")}
                    />
                  </label>
                  <button className="btn" type="submit" disabled={mailState === "sending"}>
                    {mailState === "sending" ? "보내는 중…" : "로그인 링크 받기"}
                  </button>
                  <p className="muted small">이메일 계정은 QI팀 권한으로 접속됩니다.</p>
                </form>
              )}
            </div>
          )}
          {error && <p className="text-danger small" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

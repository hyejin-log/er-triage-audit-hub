// [개발 > 인증] 감사 담당자 로그인 — 이메일 매직 링크(비밀번호 없음)
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

interface Props {
  email: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthBar({ email }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!supabase) return null;

  if (email) {
    return (
      <div className="auth-bar">
        <span className="auth-email" title={email}>{email}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => supabase!.auth.signOut()}>로그아웃</button>
      </div>
    );
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = value.trim();
    if (!EMAIL_RE.test(target)) {
      setError("이메일 형식을 확인해 주세요.");
      return;
    }
    setError(null);
    setState("sending");
    const { error: err } = await supabase!.auth.signInWithOtp({
      email: target,
      options: { emailRedirectTo: window.location.origin },
    });
    if (err) {
      setState("idle");
      setError(
        err.status === 429
          ? "로그인 메일을 너무 자주 요청했어요. 잠시 후 다시 시도해 주세요."
          : "로그인 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
    setState("sent");
  };

  return (
    <div className="auth-wrap">
      <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        담당자 로그인
      </button>
      {open && (
        <div className="auth-pop" role="dialog" aria-label="담당자 로그인">
          {state === "sent" ? (
            <div className="stack-sm">
              <strong>메일함을 확인해 주세요</strong>
              <p className="muted small">{value.trim()}로 로그인 링크를 보냈어요. 링크를 누르면 이 화면으로 돌아와 로그인돼요.</p>
              <button className="btn btn-ghost btn-sm" onClick={() => { setState("idle"); setValue(""); }}>다른 이메일로 받기</button>
            </div>
          ) : (
            <form onSubmit={send} className="stack-sm" noValidate>
              <label className="field">
                <span>이메일</span>
                <input
                  ref={inputRef}
                  type="email"
                  autoComplete="email"
                  value={value}
                  maxLength={120}
                  onChange={(e) => { setValue(e.target.value); setError(null); }}
                  onBlur={() => value && !EMAIL_RE.test(value.trim()) && setError("이메일 형식을 확인해 주세요.")}
                />
              </label>
              {error && <p className="text-danger small" role="alert">{error}</p>}
              <button className="btn btn-primary" type="submit" disabled={state === "sending"}>
                {state === "sending" ? "보내는 중…" : "로그인 링크 받기"}
              </button>
              <p className="muted small">비밀번호 없이 메일로 받은 링크로 로그인해요.</p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

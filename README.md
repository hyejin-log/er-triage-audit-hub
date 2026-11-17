# ER Triage Lens · 응급실 KTAS 감사 허브

응급실에 내원한 환자의 **중증도 분류(KTAS 1~5)가 적절했는지**, **체류 시간이 24시간을 넘지 않았는지**,
**입원 병상 배정이 늦어지지 않았는지**를 감사하는 대시보드입니다.

[Rebate Lens](https://rebate-lens-dqbe.axhub.app)(판매장려금 지급 검토)의 구조를 의료 데이터에 맞게 옮겼습니다.

| Rebate Lens | ER Triage Lens |
|---|---|
| 판매장려금 지급 건 40건 | 응급실 내원 160건 (48시간, 가상) |
| 관련 거래처 그룹 합산 | 구역별 동시 재실 환자 합산 |
| 전결 한도 | 구역 병상 수 (과밀화 100%) |
| 지급 보류 · 확인 필요 | High Risk 이상 징후 카드 |
| AI 근거 제안 · 담당자 확정 | 동일 (적정 확인 / 재분류 확정 / 소명 요청) |
| 정산 금액이 어디로 가는지 | 환자가 어디로 가는지 (퇴실 경로 · 체류 분포) |

> ⚠️ 모든 데이터는 `scripts/generate_data.py`가 만든 **가상 데이터**입니다. 실제 환자 정보는 없습니다.
> 감사 기준값은 데모용 예시이며, 실제 적용 시 기관 지침과 응급의료기관 평가 기준을 확인하세요.

## 기술 스택

이음(ieum-donor-care) 프로젝트 스택에 React + Vite 프론트엔드를 더했습니다.

- **프론트엔드**: React 18 + Vite 6 + TypeScript (반응형, 다크 모드)
- **백엔드**: Python FastAPI + pydantic v2 (Vercel Python 서버리스 함수)
- **DB**: Postgres(Neon) + psycopg 3 — 담당자 결정과 이력 저장
- **인증**: Supabase Auth 이메일 매직 링크 — 로그인한 담당자만 결정 기록, 검토자 = 로그인 이메일
- **AI(선택)**: Anthropic Claude (`claude-opus-5-5`) — 키가 없으면 규칙 엔진 근거로 대체
- **내보내기**: openpyxl 엑셀
- **배포**: Vercel (GitHub 연동)

## 감사 규칙

| 등급 | 규칙 |
|---|---|
| 확인 필요 | 24시간 초과 체류 |
| 확인 필요 | 근거 없는 KTAS 하향 재분류 |
| 확인 필요 | 활력징후 대비 과소분류 의심 (SBP<90, SpO₂<90, GCS≤12, RR≥30 인데 KTAS 3~5) |
| 확인 필요 | 72시간 내 재내원 + 등급 상향 |
| 주의 | KTAS 목표 시간 내 진료 미달 (1 즉시 / 2 10분 / 3 30분 / 4 60분 / 5 120분) |
| 주의 | 입원 결정 후 병상 배정 6시간 초과 |
| 주의 | 근거는 있지만 2단계 이상 하향 재분류 |

규칙은 `backend/audit.py`의 `RULES`에 있습니다.

## 폴더 구조

```
api/index.py          FastAPI 앱 (/api/*)
backend/audit.py      감사 규칙 엔진, 구역 과밀화 계산
backend/ai.py         AI 근거 제안 (Claude → 실패 시 규칙 엔진)
backend/store.py      담당자 결정 저장 (Postgres 또는 메모리)
data/ed_visits.json   가상 내원 데이터 160건
db/schema.sql         reviews, review_log 테이블
scripts/generate_data.py  가상 데이터 생성기 (시드 고정)
src/                  React 화면
vercel.json           배포 설정
```

## 로컬 실행

```bash
# 1) Python 환경
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt     # macOS/Linux: .venv/bin/pip

# 2) 프론트엔드 의존성
npm install

# 3) API 서버 (터미널 1)
.venv\Scripts\python -m uvicorn api.index:app --reload --port 8000

# 4) 화면 (터미널 2) → http://localhost:5180
npm run dev
```

데이터를 다시 만들려면 `python scripts/generate_data.py --n 200`.

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 상태, 저장소 종류 |
| GET | `/api/summary` | 요약, 구역 과밀화, 퇴실 경로 |
| GET | `/api/visits?status=high&zone=경증구역&q=흉통` | 내원 목록 |
| GET | `/api/visits/{id}` | 내원 상세 |
| POST | `/api/visits/{id}/ai-review` | AI 근거 제안 |
| GET/POST | `/api/reviews` | 담당자 결정 조회/저장 |
| DELETE | `/api/reviews/{id}` | 결정 되돌리기 |
| GET | `/api/export.xlsx` | 감사 결과 엑셀 |

## 배포 (GitHub → Vercel)

브랜치 전략: `main` = 운영(Production), `develop` = 개발(Preview 배포).

1. GitHub에 빈 저장소를 만들고 연결합니다.
   ```bash
   git remote add origin https://github.com/<계정>/er-triage-audit-hub.git
   git push -u origin main develop
   ```
2. Vercel → **Add New Project** → 저장소 선택 → 설정은 `vercel.json`이 잡아 줍니다.
3. (선택) Vercel 환경 변수: `ANTHROPIC_API_KEY`, `DATABASE_URL`.
   Neon은 Vercel Storage에서 만들면 `DATABASE_URL`이 자동으로 들어가고, 테이블은 앱이 첫 연결 때 만듭니다.
4. 이후 `develop`에 푸시하면 Preview, `main`에 병합하면 운영에 배포됩니다.

## 다음 단계

- 역할별 권한: 현재는 AUDITOR_EMAILS / AUDITOR_EMAIL_DOMAINS 허용 목록만 지원
- 로그인 메일 발송: Supabase 기본 SMTP는 시간당 발송 수가 적으니 운영 시 커스텀 SMTP 연결
- 실데이터 연동: 비식별화 파이프라인 후 EMR/NEDIS 형식 import
- 감사 기준 설정 화면: 기관별 기준값 조정

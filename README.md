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
| 거래처 소명 요청중 | 담당 부서 소명 → QI팀 최종 확정 |
| 정산 금액이 어디로 가는지 | 환자가 어디로 가는지 (퇴실 경로 · 체류 분포) |

> ⚠️ 모든 데이터는 `scripts/generate_data.py`가 만든 **가상 데이터**입니다. 실제 환자 정보는 없습니다.
> 감사 기준값은 데모용 예시이며, 실제 적용 시 기관 지침과 응급의료기관 평가 기준을 확인하세요.

## 기술 스택

이음(ieum-donor-care) 프로젝트 스택에 React + Vite 프론트엔드를 더했습니다.

- **프론트엔드**: React 18 + Vite 6 + TypeScript (반응형, 다크 모드)
- **백엔드**: Python FastAPI + pydantic v2 (Vercel Python 서버리스 함수)
- **DB**: Postgres(Neon) + psycopg 3 — 담당자 결정과 이력 저장
- **인증**: 부서별 원클릭 데모 로그인(서버 서명 토큰) + Supabase Auth 이메일 매직 링크
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

## 부서와 소명 흐름

| 부서 | 역할 | 담당 감사 신호 |
|---|---|---|
| QI팀 | 감사·최종 판정 | 모든 건 판정, 소명 요청, 최종 확정 |
| 응급간호팀 | KTAS 분류 | 근거 없는 하향 재분류, 하향 재분류(근거 있음), 과소분류 의심 |
| 응급의학과 | 진료 | 진료 목표 시간 미달, 72시간 내 재내원 |
| 병상관리팀 | 입원·병상 | 24시간 초과 체류, 병상 배정 6시간 초과 |

```
QI팀 결정 ─ 적정 확인 / 재분류 확정 ─────────────────▶ 종결
          └ 소명 요청 → 담당 부서 자동 배정 ─▶ 부서 소명 제출 ─▶ QI팀 최종 확정 ─▶ 종결
```

- 로그인 창의 **부서로 체험하기** 버튼으로 메일 없이 부서별 데모 계정에 들어갑니다(12시간 유효, 서버가 서명한 토큰).
- 이메일(매직 링크) 계정은 QI팀 권한입니다. 부서를 바꾸려면 `DEPT_ASSIGNMENTS=메일=NURSING,…` 을 설정하세요.
- QI팀은 소명 현황 탭에서 **데모 데이터 초기화**로 모든 결정·소명·팀 메모를 비울 수 있습니다.

### 로그인 전 / 후

- **로그인 전**: 허브 소개, 전체 집계(내원 수·감사 신호·가장 붐빈 구역·체류 중앙값·감사 진행), 동작 순서, 팀별 로그인 카드만 보입니다.
- **로그인 후**: 탭(팀 홈·확인 필요·주의 관찰·소명·전체 내원·감사 기준)과 건별 내용이 보입니다.
- API도 같은 기준입니다. `/api/summary`, `/api/progress`, `/api/rules`, `/api/health` 만 공개이고, 내원 목록·상세·결정 기록·AI 근거·엑셀은 로그인해야 받을 수 있습니다.

### 팀별 화면

결정·소명 기록은 모든 팀이 함께 보고, **첫 화면(팀 홈)과 팀 메모는 팀마다 다릅니다.**

| 팀 | 팀 홈 지표 |
|---|---|
| QI팀 | 병원 전체 감사 현황(기존 ‘한눈에 보기’) |
| 응급간호팀 | 하향 재분류·근거 기록률·과소분류, 분류 간호사별 표, KTAS 최초 vs 최종 |
| 응급의학과 | 목표 시간 내 진료율, KTAS 등급별 달성률, 담당의별 대기, 72시간 재내원 |
| 병상관리팀 | 입원 결정·병상 대기 중앙값·6시간 이상, 구역 과밀화, 병상 대기 분포 |

- **팀 메모**: 내원 상세(타임라인) 창에서 남기며, 같은 팀만 읽고 지울 수 있습니다(`team_notes` 테이블, API가 부서로 거름).
- 팀 홈에서 ‘병원 전체 현황 보기’로 QI 화면과 같은 전체 현황을 볼 수 있습니다.

## 폴더 구조

```
api/index.py          FastAPI 앱 (/api/*)
backend/audit.py      감사 규칙 엔진, 구역 과밀화 계산
backend/ai.py         AI 근거 제안 (Claude → 실패 시 규칙 엔진)
backend/store.py      결정·소명 저장 (Postgres 또는 메모리)
backend/auth.py       데모 토큰 / Supabase 토큰 확인, 부서 권한
backend/departments.py 부서 목록과 감사 규칙별 담당 부서
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
| GET | `/api/summary` | 요약, 구역 과밀화, 퇴실 경로 (공개) |
| GET | `/api/progress` | 감사 진행 건수 (공개, 숫자만) |
| GET | `/api/visits?status=high&zone=경증구역&q=흉통` | 내원 목록 |
| GET | `/api/visits/{id}` | 내원 상세 |
| POST | `/api/visits/{id}/ai-review` | AI 근거 제안 |
| POST | `/api/demo-login` | 부서별 데모 로그인 `{dept}` |
| GET | `/api/me` | 로그인 사용자·부서 |
| GET/POST | `/api/reviews` | 결정 조회 / QI팀 결정 |
| POST | `/api/reviews/{id}/response` | 담당 부서 소명 제출 |
| DELETE | `/api/reviews/{id}` | 결정 되돌리기 (QI팀) |
| POST | `/api/demo/reset` | 데모 데이터 초기화 (QI팀) |
| GET/POST | `/api/notes` | 우리 팀 메모 조회 / 작성 |
| DELETE | `/api/notes/{id}` | 우리 팀 메모 삭제 |
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

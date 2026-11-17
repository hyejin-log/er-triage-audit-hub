// [개발 > 프론트엔드] Vite 설정 — 로컬에서는 /api 요청을 FastAPI(8000)로 넘깁니다.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // [개발 > 인증] Vercel Supabase 연동(접두어 SUPA)이 만든 공개 변수 SUPA_VITE_* 도 브라우저에 노출합니다.
  // 공개용(URL, anon/publishable key)만 이 접두어를 갖고, 비밀 키(SUPA_SUPABASE_*)는 노출되지 않습니다.
  envPrefix: ["VITE_", "SUPA_VITE_"],
  server: {
    port: 5180,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});

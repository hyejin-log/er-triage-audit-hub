// [개발 > 프론트엔드] Vite 설정 — 로컬에서는 /api 요청을 FastAPI(8000)로 넘깁니다.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});

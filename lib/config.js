// ============================================================
//  Vercel 函数配置：直接从 process.env 读取
// ------------------------------------------------------------
//  部署到 Vercel 后，在项目 Settings → Environment Variables 里
//  配置 RAWG_API_KEY / SUPABASE_URL / SUPABASE_ANON_KEY，
//  Vercel 会把它们注入到 process.env。
// ============================================================

export function getConfig() {
  return {
    rawgApiKey: process.env.RAWG_API_KEY || "",
    rawgBaseUrl: (process.env.RAWG_BASE_URL || "https://api.rawg.io/api").replace(/\/+$/, ""),
    supabaseUrl: (process.env.SUPABASE_URL || "").replace(/\/+$/, ""),
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  };
}

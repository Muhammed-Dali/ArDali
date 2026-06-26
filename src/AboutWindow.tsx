import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import { Github, Globe, X, RefreshCw } from "lucide-react";
import packageJson from "../package.json";

type GitHubRelease = {
  id: number;
  name: string;
  tag_name: string;
  published_at: string;
  body: string;
  html_url: string;
};

export function AboutWindow() {
  const [appVersion, setAppVersion] = useState(packageJson.version || "0.0.0");
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then((v) => {
      if (v && v !== "0.0.0") setAppVersion(v);
    }).catch(console.error);
    fetchReleases();
  }, []);

  const fetchReleases = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("https://api.github.com/repos/Muhammed-Dali/ArDali/releases");
      if (!response.ok) {
        throw new Error("Sürüm notları yüklenemedi.");
      }
      const data = await response.json();
      setReleases(data);
    } catch (err: any) {
      setError(err.message || "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const closeWindow = async () => {
    try {
      await getCurrentWebviewWindow().close();
    } catch {
      window.close();
    }
  };

  const openInternalLink = async (url: string) => {
    await emit("open-internal-web", url);
    await closeWindow();
  };

  const openLink = async (url: string) => {
    window.open(url, "_blank");
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" });
  };

  return (
    <main className="settings-window about-window" style={{ overflowY: "auto", height: "100vh" }}>
      <header className="settings-header" data-tauri-drag-region style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "default" }}>
        <h1 className="settings-title" data-tauri-drag-region style={{ pointerEvents: "none" }}>Hakkında</h1>
        <button className="settings-close-btn" onClick={() => void closeWindow()} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
          <X size={24} />
        </button>
      </header>

      <section className="settings-content" style={{ padding: "0 24px 24px" }}>
        <div className="about-hero" style={{ textAlign: "center", marginBottom: "32px", padding: "24px", backgroundColor: "var(--bg-secondary)", borderRadius: "12px" }}>
          <div style={{ marginBottom: "16px", display: "flex", justifyContent: "center" }}>
            <img src="/icons/app/ardali_256.png" alt="ArDli Logo" style={{ width: "80px", height: "80px", borderRadius: "20%" }} />
          </div>
          <h2 style={{ margin: "0 0 8px 0", fontSize: "24px", color: "var(--text-main)" }}>ArDli WebMedia</h2>
          <p style={{ margin: "0 0 16px 0", color: "var(--text-muted)", fontSize: "14px" }}>Versiyon {appVersion}</p>
          <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
            <button className="settings-secondary-btn" onClick={() => void openInternalLink("https://github.com/Muhammed-Dali/ArDali")} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Github size={16} /> GitHub
            </button>
            <button className="settings-secondary-btn" onClick={() => void openInternalLink("https://aur.archlinux.org/packages/ardali-bin")} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Globe size={16} /> Web Mağazası
            </button>
          </div>
        </div>

        <div className="changelog-section" style={{ padding: "0 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, color: "var(--accent)" }}>En Son Sürüm Notu (Yenilikler)</h3>
            <button onClick={() => void fetchReleases()} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }} title="Yenile">
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </button>
          </div>

          {loading ? (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "24px" }}>Yükleniyor...</p>
          ) : error ? (
            <p style={{ color: "var(--text-red, #ff5555)", textAlign: "center", padding: "24px" }}>{error}</p>
          ) : releases.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>Henüz sürüm notu bulunmuyor.</p>
          ) : (
            <div className="releases-list" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div key={releases[0].id} className="release-card" style={{ borderLeft: "3px solid var(--accent)", paddingLeft: "16px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px" }}>
                  <h4 style={{ margin: 0, fontSize: "16px", color: "var(--text-main)" }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); void openInternalLink(releases[0].html_url); }} style={{ color: "inherit", textDecoration: "none" }}>{releases[0].name || releases[0].tag_name}</a>
                  </h4>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{formatDate(releases[0].published_at)}</span>
                </div>
                <div 
                  className="release-body" 
                  style={{ fontSize: "14px", color: "var(--text-muted)", whiteSpace: "pre-wrap", lineHeight: "1.5" }}
                >
                  {/* Basit markdown işleme (bold ve linkler için ekstra eklenti gerektirmeden sade metin gösterimi) */}
                  {(releases[0].body || "Bu sürüm için not girilmemiş.").replace(/\r\n/g, "\n")}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

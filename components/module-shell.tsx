"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { ReactNode, useEffect, useState } from "react";
import { SearchDialog } from "@/components/search-dialog";
import { portalNavigation, siteConfig } from "@/config/site";

export function ModuleShell({ active, eyebrow, title, description, children, action }: {
  active: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const [light, setLight] = useState(false);
  const [search, setSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [account, setAccount] = useState<{ authenticated: boolean; name?: string } | null>(null);
  useEffect(() => {
    fetch("/api/auth/session").then((response) => response.json()).then((data: { authenticated?: boolean; user?: { email?: string; user_metadata?: { display_name?: string; full_name?: string } } }) => {
      setAccount({ authenticated: Boolean(data.authenticated), name: data.user?.user_metadata?.display_name || data.user?.user_metadata?.full_name || data.user?.email });
    }).catch(() => setAccount({ authenticated: false }));
  }, []);
  const quickResults = portalNavigation.slice(1).filter((item) => item.label.toLocaleLowerCase("pt-BR").includes(searchQuery.trim().toLocaleLowerCase("pt-BR")));
  return (
    <div className="nexus-app module-app" data-theme={light ? "light" : "dark"}>
      <aside className="module-sidebar">
        <a className="brand" href="/" aria-label={`${siteConfig.name} — início`}><span className="brand-mark"><i /><b /></span><span>{siteConfig.shortName}<small>BRASIL</small></span></a>
        <nav aria-label="Navegação principal">
          {portalNavigation.map((item) => <a className={active === item.href ? "active" : ""} href={item.href} key={item.href}><span>{item.icon}</span>{item.label}{item.href === "/ia" && <em>Beta</em>}</a>)}
        </nav>
        <a className="module-plan" href="/planos"><span>✦</span><p><strong>Planos Nexus</strong><small>Preços e recursos em definição.</small></p><i>→</i></a>
        <div className="module-profile"><span className="avatar avatar-way">{account?.authenticated ? (account.name || "N").slice(0,2).toUpperCase() : "NB"}</span><p><strong>{account?.authenticated ? account.name || "Conta Nexus" : "Visitante"}</strong><small>{account?.authenticated ? "Sessão protegida" : "Acesso público"}</small></p><a href={account?.authenticated ? "/conta" : "/entrar"}>{account?.authenticated ? "Conta" : "Entrar"}</a></div>
      </aside>
      <main className="module-main">
        <header className="module-topbar">
          <a className="module-mobile-logo" href="/"><span className="brand-mark"><i /><b /></span><strong>NEXUS</strong></a>
          <button className="module-search" onClick={() => setSearch(true)}><span>⌕</span> Buscar em todo o Nexus <kbd>⌘ K</kbd></button>
          <div><span className="online"><i /> Versão beta</span><button className="icon-button" aria-label="Alternar tema" onClick={() => setLight(!light)}>{light ? "☾" : "☼"}</button><a className="primary-small" href={account?.authenticated ? "/conta" : "/cadastro"}>{account?.authenticated ? "Minha conta" : "Criar conta"}</a></div>
        </header>
        <div className="module-content">
          <section className="module-hero"><div><span className="section-kicker">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</section>
          {children}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Navegação móvel">{portalNavigation.slice(0,5).map((item) => <a className={active === item.href ? "active" : ""} href={item.href} key={item.href}><span>{item.icon}</span>{item.label === "Nexus IA" ? "IA" : item.label}</a>)}</nav>
      <SearchDialog open={search} onOpenChange={setSearch} className="quick-search"><button aria-label="Fechar busca" onClick={() => setSearch(false)}>×</button><span>⌕</span><input aria-label="Buscar no Nexus" autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Digite o que procura..."/><p>{searchQuery ? "Resultados" : "Atalhos rápidos"}</p><div>{quickResults.length ? quickResults.map((item) => <a href={item.href} key={item.href}><span>{item.icon}</span>{item.label}<i>→</i></a>) : <small>Nenhuma área encontrada.</small>}</div></SearchDialog>
    </div>
  );
}

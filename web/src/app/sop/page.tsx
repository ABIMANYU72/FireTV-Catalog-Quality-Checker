'use client';

import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';

export default function SOPPage() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/sop.md')
      .then(r => r.text())
      .catch(() => '# SOP not found\n\nCopy `docs/SOP.md` to `web/public/sop.md`.')
      .then(text => { setContent(text); setLoading(false); });
  }, []);

  // Simple markdown renderer (no external lib needed for basic cases)
  function renderMarkdown(md: string): string {
    return md
      // h1-h4
      .replace(/^#### (.+)$/gm, '<h4 class="sop-h4">$1</h4>')
      .replace(/^### (.+)$/gm, '<h3 class="sop-h3">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="sop-h2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="sop-h1">$1</h1>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code inline
      .replace(/`(.+?)`/g, '<code class="sop-code">$1</code>')
      // Tables (basic)
      .replace(/^\|(.+)\|$/gm, (line) => {
        const cells = line.split('|').slice(1, -1);
        return '<tr>' + cells.map(c => `<td class="sop-td">${c.trim()}</td>`).join('') + '</tr>';
      })
      // Wrap <tr> in table
      .replace(/((<tr>[\s\S]*?<\/tr>\n?)+)/g, '<table class="sop-table">$1</table>')
      // HR
      .replace(/^---$/gm, '<hr class="sop-hr" />')
      // Blockquote / callout
      .replace(/^> (.+)$/gm, '<blockquote class="sop-blockquote">$1</blockquote>')
      // UL
      .replace(/^- (.+)$/gm, '<li class="sop-li">$1</li>')
      .replace(/((<li[^>]*>[\s\S]*?<\/li>\n?)+)/g, '<ul class="sop-ul">$1</ul>')
      // Paragraphs (blank line separates)
      .replace(/\n\n([^<\n][^\n]+)\n/g, '\n\n<p class="sop-p">$1</p>\n');
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="shimmer h-8 w-48 rounded mb-6" />
        <div className="shimmer h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8 page-enter">
      <div className="mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, var(--accent-purple)22, var(--accent-cyan)22)', border: '1px solid var(--border)' }}>
          <BookOpen size={18} style={{ color: 'var(--accent-purple)' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold gradient-text">Standard Operating Procedure</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Issue categories, severity levels, and reviewer guidelines
          </p>
        </div>
      </div>

      <div className="glass-card p-8 max-w-4xl">
        <style>{`
          .sop-h1 { font-size: 1.6rem; font-weight: 800; color: var(--text-primary); margin: 1.5rem 0 0.5rem; background: linear-gradient(135deg, var(--accent-purple), var(--accent-cyan)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          .sop-h2 { font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin: 2rem 0 0.75rem; padding-bottom: 0.4rem; border-bottom: 1px solid var(--border); }
          .sop-h3 { font-size: 1rem; font-weight: 600; color: var(--accent-purple); margin: 1.5rem 0 0.5rem; }
          .sop-h4 { font-size: 0.875rem; font-weight: 600; color: var(--text-secondary); margin: 1rem 0 0.3rem; text-transform: uppercase; letter-spacing: 0.05em; }
          .sop-p { color: var(--text-secondary); font-size: 0.875rem; line-height: 1.7; margin-bottom: 0.75rem; }
          .sop-code { background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; font-family: 'JetBrains Mono', monospace; font-size: 0.8em; color: var(--accent-cyan); }
          .sop-table { width: 100%; border-collapse: collapse; margin: 1rem 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
          .sop-td { padding: 8px 12px; font-size: 0.8rem; color: var(--text-secondary); border-bottom: 1px solid var(--border); }
          tr:first-child .sop-td { background: var(--bg-tertiary); color: var(--text-muted); font-weight: 600; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
          .sop-hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
          .sop-blockquote { border-left: 3px solid var(--accent-purple); padding-left: 1rem; margin: 0.75rem 0; color: var(--text-secondary); font-size: 0.875rem; font-style: italic; }
          .sop-ul { list-style: none; padding: 0; margin: 0.5rem 0 1rem; }
          .sop-li { position: relative; padding-left: 1.25rem; color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 0.4rem; line-height: 1.6; }
          .sop-li::before { content: '▸'; position: absolute; left: 0; color: var(--accent-purple); }
          strong { color: var(--text-primary); font-weight: 600; }
          em { color: var(--accent-cyan); font-style: italic; }
        `}</style>
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
      </div>
    </div>
  );
}

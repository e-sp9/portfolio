/**
 * Design Reference Components
 *
 * Simeon Griggs Portfolio スタイルのコンポーネント実装例
 * これらは参考実装であり、プロジェクトの要件に応じて調整してください
 */

import React, { useState, useEffect } from 'react';

// ========================================
// 型定義
// ========================================

interface ContentItem {
  id: string;
  type: 'blog' | 'talk' | 'course' | 'youtube' | 'guide';
  title: string;
  description: string;
  date: string;
  image?: {
    url: string;
    alt: string;
    blurHash?: string;
  };
  url: string;
}

// ========================================
// 1. コンテンツカード コンポーネント
// ========================================

interface ContentCardProps {
  item: ContentItem;
}

export const ContentCard: React.FC<ContentCardProps> = ({ item }) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  const typeLabels = {
    blog: 'Blog',
    talk: 'Talk',
    course: 'Course',
    youtube: 'YouTube',
    guide: 'Guide',
  };

  const typeColors = {
    blog: 'bg-blue-500',
    talk: 'bg-purple-500',
    course: 'bg-green-500',
    youtube: 'bg-red-500',
    guide: 'bg-yellow-500',
  };

  return (
    <article className="content-card group">
      {/* 画像サムネイル */}
      {item.image && (
        <div className="content-card__image-container">
          {/* BlurHashプレースホルダー */}
          {!imageLoaded && item.image.blurHash && (
            <div
              className="content-card__placeholder"
              style={{
                background: `linear-gradient(135deg, ${item.image.blurHash})`,
              }}
            />
          )}

          <img
            src={item.image.url}
            alt={item.image.alt}
            loading="lazy"
            className={`content-card__image ${imageLoaded ? 'loaded' : ''}`}
            onLoad={() => setImageLoaded(true)}
          />
        </div>
      )}

      {/* カードコンテンツ */}
      <div className="content-card__content">
        {/* コンテンツタイプバッジ */}
        <span className={`content-card__badge ${typeColors[item.type]}`}>
          {typeLabels[item.type]}
        </span>

        {/* タイトル */}
        <h3 className="content-card__title">
          <a href={item.url} className="content-card__link">
            {item.title}
          </a>
        </h3>

        {/* 説明 */}
        <p className="content-card__description">{item.description}</p>

        {/* メタ情報 */}
        <div className="content-card__meta">
          <time dateTime={item.date}>{formatDate(item.date)}</time>
        </div>
      </div>

      <style jsx>{`
        .content-card {
          background: var(--color-bg-secondary);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-base);
          transition: all var(--transition-base);
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .content-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-lg);
        }

        .content-card__image-container {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background: var(--color-bg-tertiary);
        }

        .content-card__placeholder {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .content-card__image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0;
          transition: opacity var(--transition-slow);
        }

        .content-card__image.loaded {
          opacity: 1;
        }

        .content-card__content {
          padding: var(--space-6);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          flex: 1;
        }

        .content-card__badge {
          display: inline-block;
          width: fit-content;
          padding: var(--space-1) var(--space-3);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: white;
          border-radius: var(--radius-base);
          text-transform: uppercase;
          letter-spacing: var(--tracking-wider);
        }

        .content-card__title {
          margin: 0;
          font-size: var(--text-xl);
          font-weight: var(--font-semibold);
          line-height: var(--leading-tight);
        }

        .content-card__link {
          color: var(--color-text-primary);
          text-decoration: none;
          display: inline-block;
          transition: color var(--transition-fast);
        }

        .content-card__link::after {
          content: ' →';
          display: inline-block;
          transition: transform var(--transition-fast);
        }

        .content-card__link:hover {
          color: var(--color-accent-primary);
        }

        .content-card__link:hover::after {
          transform: translateX(4px);
        }

        .content-card__description {
          margin: 0;
          font-size: var(--text-base);
          color: var(--color-text-secondary);
          line-height: var(--leading-normal);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .content-card__meta {
          margin-top: auto;
          padding-top: var(--space-2);
          font-size: var(--text-sm);
          color: var(--color-text-tertiary);
        }
      `}</style>
    </article>
  );
};

// ========================================
// 2. コンテンツグリッド コンポーネント
// ========================================

interface ContentGridProps {
  items: ContentItem[];
}

export const ContentGrid: React.FC<ContentGridProps> = ({ items }) => {
  return (
    <div className="content-grid">
      {items.map((item) => (
        <ContentCard key={item.id} item={item} />
      ))}

      <style jsx>{`
        .content-grid {
          display: grid;
          gap: var(--space-8);
          grid-template-columns: 1fr;
        }

        @media (min-width: 768px) {
          .content-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 1024px) {
          .content-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>
    </div>
  );
};

// ========================================
// 3. ナビゲーションタブ コンポーネント
// ========================================

interface NavTabsProps {
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const NavTabs: React.FC<NavTabsProps> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <nav className="nav-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}

      <style jsx>{`
        .nav-tabs {
          display: flex;
          gap: var(--space-4);
          border-bottom: 1px solid var(--color-border-light);
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .nav-tab {
          padding: var(--space-3) var(--space-4);
          font-size: var(--text-base);
          font-weight: var(--font-medium);
          color: var(--color-text-secondary);
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          transition: all var(--transition-fast);
          white-space: nowrap;
        }

        .nav-tab:hover {
          color: var(--color-text-primary);
        }

        .nav-tab.active {
          color: var(--color-accent-primary);
          border-bottom-color: var(--color-accent-primary);
        }
      `}</style>
    </nav>
  );
};

// ========================================
// 4. ダークモードトグル コンポーネント
// ========================================

export const DarkModeToggle: React.FC = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // 初期テーマの読み込み
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    setIsDark(initialDark);
    document.documentElement.setAttribute('data-theme', initialDark ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);

    const theme = newTheme ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  };

  return (
    <button
      className="dark-mode-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        // Sun icon (light mode)
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="5" strokeWidth="2" />
          <line x1="12" y1="1" x2="12" y2="3" strokeWidth="2" />
          <line x1="12" y1="21" x2="12" y2="23" strokeWidth="2" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" strokeWidth="2" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" strokeWidth="2" />
          <line x1="1" y1="12" x2="3" y2="12" strokeWidth="2" />
          <line x1="21" y1="12" x2="23" y2="12" strokeWidth="2" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" strokeWidth="2" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" strokeWidth="2" />
        </svg>
      ) : (
        // Moon icon (dark mode)
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      <style jsx>{`
        .dark-mode-toggle {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-full);
          background: transparent;
          border: 1px solid var(--color-border-medium);
          color: var(--color-text-primary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all var(--transition-fast);
        }

        .dark-mode-toggle:hover {
          background: var(--color-bg-tertiary);
          border-color: var(--color-border-dark);
        }

        .dark-mode-toggle:active {
          transform: scale(0.95);
        }
      `}</style>
    </button>
  );
};

// ========================================
// 5. ヘッダー コンポーネント
// ========================================

export const Header: React.FC = () => {
  return (
    <header className="header">
      <div className="header__container">
        {/* ロゴ */}
        <div className="header__logo">
          <a href="/" className="logo-link">
            Portfolio
          </a>
        </div>

        {/* ナビゲーション */}
        <nav className="header__nav">
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="nav-link">
            GitHub
          </a>
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="nav-link">
            Twitter
          </a>
          <DarkModeToggle />
        </nav>
      </div>

      <style jsx>{`
        .header {
          position: sticky;
          top: 0;
          z-index: var(--z-sticky);
          background: var(--color-bg-primary);
          border-bottom: 1px solid var(--color-border-light);
          backdrop-filter: var(--backdrop-blur-base);
        }

        .header__container {
          max-width: var(--container-max);
          margin: 0 auto;
          padding: var(--space-4) var(--space-6);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header__logo {
          font-size: var(--text-xl);
          font-weight: var(--font-semibold);
        }

        .logo-link {
          color: var(--color-text-primary);
          text-decoration: none;
          transition: color var(--transition-fast);
        }

        .logo-link:hover {
          color: var(--color-accent-primary);
        }

        .header__nav {
          display: flex;
          align-items: center;
          gap: var(--space-6);
        }

        .nav-link {
          color: var(--color-text-secondary);
          text-decoration: none;
          font-size: var(--text-base);
          font-weight: var(--font-medium);
          transition: color var(--transition-fast);
        }

        .nav-link:hover {
          color: var(--color-text-primary);
        }
      `}</style>
    </header>
  );
};

// ========================================
// ユーティリティ関数
// ========================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ========================================
// 使用例
// ========================================

export const ExampleUsage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('all');

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'blogs', label: 'Blogs' },
    { id: 'talks', label: 'Talks' },
    { id: 'courses', label: 'Courses' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'guides', label: 'Guides' },
  ];

  const sampleItems: ContentItem[] = [
    {
      id: '1',
      type: 'blog',
      title: 'Getting Started with React 19',
      description: 'Learn about the new features and improvements in React 19, including automatic batching and new hooks.',
      date: '2026-01-15',
      image: {
        url: 'https://via.placeholder.com/800x450',
        alt: 'React 19 illustration',
      },
      url: '/blog/react-19',
    },
    // ... more items
  ];

  const filteredItems = activeTab === 'all'
    ? sampleItems
    : sampleItems.filter(item => item.type === activeTab.slice(0, -1));

  return (
    <>
      <Header />

      <main style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: 'var(--space-8)' }}>
        <h1 style={{ fontSize: 'var(--text-5xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-12)' }}>
          Hello, internet!👋
        </h1>

        <NavTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

        <div style={{ marginTop: 'var(--space-8)' }}>
          <ContentGrid items={filteredItems} />
        </div>
      </main>
    </>
  );
};

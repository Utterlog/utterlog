import type { Metadata } from 'next';
import PageTitle from '@/components/blog/PageTitle';
import { getCoding } from '@/lib/blog-api';

export const metadata: Metadata = { title: 'Coding' };

type CodingProfile = {
  login?: string;
  name?: string;
  avatar_url?: string;
  html_url?: string;
  bio?: string;
  location?: string;
  public_repos?: number;
  followers?: number;
};

type CodingRepo = {
  name?: string;
  full_name?: string;
  html_url?: string;
  description?: string;
  language?: string;
  stars?: number;
  forks?: number;
  open_issues?: number;
  license?: string;
  pushed_at?: string;
  archived?: boolean;
  fork?: boolean;
  activities?: CodingActivity[];
};

type CodingActivity = {
  type?: string;
  label?: string;
  repo?: string;
  url?: string;
  created_at?: string;
  created_unix?: number;
  count?: number;
};

type CodingActivityRepoGroup = {
  name?: string;
  full_name?: string;
  html_url?: string;
  summary?: string;
  counts?: Record<string, number>;
  events?: CodingActivity[];
};

type CodingActivityDayGroup = {
  date?: string;
  label?: string;
  summary?: string;
  total?: number;
  repo_count?: number;
  repos?: CodingActivityRepoGroup[];
};

type CodingDay = {
  date: string;
  count: number;
};

type CodingData = {
  enabled?: boolean;
  configured?: boolean;
  source?: string;
  username?: string;
  profile?: CodingProfile;
  profiles?: CodingProfile[];
  repos?: CodingRepo[];
  events?: CodingActivity[];
  activity_days?: CodingActivityDayGroup[];
  contributions?: CodingDay[];
  stats?: {
    total_contributions?: number;
    all_contributions?: number;
    recent_events?: number;
    recent_repos?: number;
    public_repos?: number;
    followers?: number;
  };
  updated_at?: number;
  error?: string;
};

function formatCount(value?: number) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function formatDate(value?: string | number) {
  if (!value) return '';
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function formatTime(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function eventCode(type?: string) {
  const normalized = String(type || '').replace(/Event$/, '').toUpperCase();
  if (normalized.includes('PULLREQUESTREVIEW')) return 'REV';
  if (normalized.includes('PULLREQUEST')) return 'PR';
  if (normalized.includes('ISSUECOMMENT')) return 'CMT';
  if (normalized.includes('ISSUE')) return 'ISS';
  if (normalized === 'COMMIT') return 'COM';
  if (normalized.includes('PUSH')) return 'PUSH';
  if (normalized.includes('CREATE')) return 'NEW';
  if (normalized.includes('DELETE')) return 'DEL';
  if (normalized.includes('FORK')) return 'FORK';
  if (normalized.includes('WATCH')) return 'STAR';
  return normalized.slice(0, 4) || 'LOG';
}

function eventCodeClass(code: string) {
  return `code-${String(code || 'log').toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
}

const EVENT_CODE_ORDER = ['PUSH', 'COM', 'CMT', 'PR', 'REV', 'ISS', 'NEW', 'DEL', 'FORK', 'STAR'];

function eventCountEntries(counts?: Record<string, number>) {
  const source = counts || {};
  const known = EVENT_CODE_ORDER
    .filter(code => Number(source[code] || 0) > 0)
    .map(code => [code, Number(source[code])] as const);
  const rest = Object.entries(source)
    .filter(([code, count]) => !EVENT_CODE_ORDER.includes(code) && Number(count) > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, count]) => [code, Number(count)] as const);
  return [...known, ...rest];
}

function displayLogRepoName(repo: CodingActivityRepoGroup) {
  const fullName = String(repo.full_name || '').trim();
  if (fullName) return fullName;
  return String(repo.name || 'Repository');
}

function contributionLevel(count: number) {
  if (count >= 8) return 4;
  if (count >= 4) return 3;
  if (count >= 2) return 2;
  if (count >= 1) return 1;
  return 0;
}

function contributionCells(days: CodingDay[]) {
  if (!days.length) return [];
  const first = new Date(`${days[0].date}T00:00:00Z`);
  const blanks = Number.isNaN(first.getTime()) ? 0 : first.getUTCDay();
  return [...Array.from({ length: blanks }, () => null), ...days];
}

function contributionWeeks(days: CodingDay[]) {
  const cells = contributionCells(days);
  const weeks: Array<Array<CodingDay | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function todayContributionCount(days: CodingDay[]) {
  const today = new Date().toISOString().slice(0, 10);
  return days.find(day => day.date === today)?.count || 0;
}

function contributionYear(days: CodingDay[]) {
  const lastDay = days.length ? days[days.length - 1]?.date : '';
  const year = String(lastDay || '').slice(0, 4);
  return /^\d{4}$/.test(year) ? year : String(new Date().getFullYear());
}

function codingAccountTitle(profiles: CodingProfile[], username: string) {
  const logins = profiles.length
    ? profiles.map(item => item.login).filter(Boolean)
    : String(username || '').split(',').map(item => item.trim()).filter(Boolean);
  if (!logins.length) return '@github';
  return logins.map(item => `@${String(item).replace(/^@+/, '')}`).join(' / ');
}

function codingProfileURL(profile: CodingProfile, profiles: CodingProfile[], username: string) {
  if (profile.html_url) return profile.html_url;
  const firstProfile = profiles.find(item => item.html_url || item.login);
  if (firstProfile?.html_url) return firstProfile.html_url;
  if (firstProfile?.login) return `https://github.com/${firstProfile.login}`;
  const firstUsername = String(username || '').split(',').map(item => item.trim()).filter(Boolean)[0];
  return firstUsername ? `https://github.com/${firstUsername.replace(/^@+/, '')}` : '';
}

export default async function CodingPage() {
  const res = await getCoding().catch(() => ({ data: {} } as any));
  const data = (res?.data || {}) as CodingData;
  const profile = data.profile || {};
  const profiles = Array.isArray(data.profiles) ? data.profiles.filter(item => item?.login) : [];
  const username = data.username || profile.login || '';
  const activityDays = Array.isArray(data.activity_days) ? data.activity_days : [];
  const days = Array.isArray(data.contributions) ? data.contributions : [];
  const weeks = contributionWeeks(days);
  const todayContributions = todayContributionCount(days);
  const heatmapYear = contributionYear(days);
  const stats = data.stats || {};
  const profileSummary = profiles.length > 1
    ? profiles.map(item => item.name || item.login).filter(Boolean).join(' / ')
    : (profile.bio || 'Public coding activity, repositories and recent shipping rhythm.');
  const updatedAt = formatDate(data.updated_at);
  const titleText = codingAccountTitle(profiles, username);
  const titleURL = codingProfileURL(profile, profiles, username);
  const heatmapAvatar = profile.avatar_url || profiles.find(item => item.avatar_url)?.avatar_url || '';
  const titleStats = [
    { label: 'total contributions', value: stats.all_contributions ?? stats.total_contributions },
    { label: 'public repos', value: stats.public_repos },
    { label: 'followers', value: stats.followers },
  ];

  return (
    <div className="coding-page">
      <PageTitle
        title={titleURL ? (
          <a href={titleURL} target="_blank" rel="noopener noreferrer" className="coding-title-link">
            {titleText}
          </a>
        ) : titleText}
        icon="fa-brands fa-github"
        subtitle={profileSummary}
        className="coding-page-title"
        meta={titleStats.map((item) => (
          <span className="blog-page-title-stat coding-title-stat" key={item.label}>
            <strong>{formatCount(item.value)}</strong>
            <span>{item.label}</span>
          </span>
        ))}
      />

      <section className="coding-hero">
        <div className="coding-hero-copywrap">
          <h2 className="coding-hero-title">
            <span>代码持续生长。</span>
            <em>Code keeps moving, one commit at a time.</em>
          </h2>
          <p className="coding-hero-copy">
            <span>记录仓库、贡献热力和最近构建动态。</span>
            <span>A quiet journal of repositories, contributions, and recent shipping activity.</span>
          </p>
        </div>
        <div className="coding-hero-aside" aria-label="Coding summary">
          <span>Today</span>
          <strong>{formatCount(todayContributions)}</strong>
          <small>contributions</small>
        </div>
      </section>

      {data.enabled === false && (
        <div className="coding-notice">
          <i className="fa-regular fa-circle-info" aria-hidden="true" />
          <span>Coding 页面尚未启用，可在后台「页面」中开启。</span>
        </div>
      )}

      {!data.configured && (
        <div className="coding-notice">
          <i className="fa-regular fa-circle-info" aria-hidden="true" />
          <span>未配置 GitHub 地址。可在后台「页面 → Coding」填写；留空时会自动读取个人资料里的 GitHub 社交链接。</span>
        </div>
      )}

      {data.error && (
        <div className="coding-notice">
          <i className="fa-regular fa-triangle-exclamation" aria-hidden="true" />
          <span>GitHub 数据暂时无法刷新：{data.error}</span>
        </div>
      )}

      {data.configured && (
        <>
          <section className="coding-section coding-heatmap-section">
            <div className="coding-section-head">
              <div>
                <span>§ 01 · ACTIVITY</span>
                <h3>GitHub — <em>contribution rhythm</em></h3>
              </div>
              <div className="coding-heatmap-side">
                {heatmapAvatar ? (
                  <img
                    src={heatmapAvatar}
                    alt=""
                    className="coding-heatmap-avatar"
                    title={updatedAt ? `updated ${updatedAt}` : 'GitHub'}
                  />
                ) : updatedAt ? (
                  <time>updated {updatedAt}</time>
                ) : null}
              </div>
            </div>
            <div className="coding-heatmap-scroll">
              <div
                className="coding-heatmap"
                aria-label="GitHub activity heatmap"
                style={{ gridTemplateColumns: `repeat(${Math.max(weeks.length, 1)}, minmax(0, 1fr))` }}
              >
                {weeks.map((week, weekIndex) => (
                  <span className="coding-heatmap-week" key={`week-${weekIndex}`}>
                    {week.map((day, dayIndex) => (
                      <span
                        key={day?.date || `blank-${weekIndex}-${dayIndex}`}
                        className={`coding-heatmap-cell level-${day ? contributionLevel(day.count) : 'blank'}`}
                        title={day ? `${day.date}: ${day.count}` : undefined}
                      />
                    ))}
                  </span>
                ))}
              </div>
            </div>
            <div className="coding-heatmap-legend">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`level-${level}`} />)}
              <span>More · {formatCount(stats.total_contributions)} contributions in {heatmapYear}</span>
            </div>
          </section>

          <section className="coding-section coding-log-section">
            <div className="coding-section-head compact">
              <div>
                <span>§ 02 · SHIPPING LOG</span>
                <h3>Daily repository activity</h3>
              </div>
            </div>
            <div className="coding-log">
              {activityDays.length === 0 ? (
                <div className="coding-empty">暂无最近 GitHub 动态。</div>
              ) : activityDays.map((day) => {
                const dayRepos = Array.isArray(day.repos) ? day.repos : [];
                return (
                  <section className="coding-log-day" key={day.date || day.label}>
                    <header className="coding-log-day-head">
                      <div className="coding-log-day-kicker">
                        <strong>{day.label || formatDate(day.date)}</strong>
                        <span>· {formatCount(day.total)} ACROSS {formatCount(day.repo_count)} REPOS</span>
                      </div>
                      {day.date && <time>{formatDate(day.date)}</time>}
                    </header>
                    <div className="coding-log-repos">
                      {dayRepos.map((repo) => {
                        const events = Array.isArray(repo.events) ? repo.events : [];
                        const counts = eventCountEntries(repo.counts);
                        return (
                          <article className="coding-log-repo" key={`${day.date}-${repo.full_name || repo.name}`}>
                            <a href={repo.html_url || '#'} target="_blank" rel="noopener noreferrer" className="coding-log-repo-head">
                              <span className="coding-log-repo-name">{displayLogRepoName(repo)}</span>
                              <span className="coding-log-counts">
                                {counts.map(([code, count]) => (
                                  <span className={`coding-event-code ${eventCodeClass(code)}`} key={code}>{formatCount(count)} {code}</span>
                                ))}
                              </span>
                            </a>
                            <div className="coding-log-events">
                              {events.length === 0 ? (
                                <div className="coding-project-empty">暂无最近动作。</div>
                              ) : events.map((event, index) => {
                                const code = eventCode(event.type);
                                return (
                                  <a href={event.url || repo.html_url || '#'} target="_blank" rel="noopener noreferrer" className="coding-event" key={`${event.created_at}-${index}`}>
                                    <span className={`coding-event-code ${eventCodeClass(code)}`}>{code}</span>
                                    <span className="coding-event-text">
                                      <em>{event.label}</em>
                                    </span>
                                    <time>{formatTime(event.created_at)}</time>
                                  </a>
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

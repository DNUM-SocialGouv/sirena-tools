export interface SentryIssue {
  id: string;
  title: string;
  culprit?: string;
  level?: string;
  status?: string;
  permalink?: string;
  project?: {
    name?: string;
    slug?: string;
  };
  metadata?: {
    type?: string;
    value?: string;
  };
  firstSeen?: string;
  lastSeen?: string;
  count?: string;
  userCount?: number;
}

export interface SentryActor {
  name?: string;
  email?: string;
}

export interface SentryWebhookPayload {
  action: string;
  data: {
    issue?: SentryIssue;
    event?: {
      issue?: SentryIssue;
      [key: string]: unknown;
    };
  };
  actor?: SentryActor;
}

export interface MattermostPayload {
  text: string;
  username?: string;
  icon_url?: string;
}

const LEVEL_EMOJI: Record<string, string> = {
  fatal: "💀",
  error: "🔴",
  warning: "🟡",
  info: "🔵",
  debug: "⚪",
};

const ACTION_EMOJI: Record<string, string> = {
  created: "🆕",
  resolved: "✅",
  assigned: "👤",
  ignored: "🔕",
  unresolved: "🔄",
};

function levelEmoji(level?: string): string {
  return level ? (LEVEL_EMOJI[level] ?? "🔴") : "🔴";
}

function actionEmoji(action: string): string {
  return ACTION_EMOJI[action] ?? "🔔";
}

function formatAction(action: string): string {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

export function sentryToMattermost(payload: SentryWebhookPayload): MattermostPayload {
  const issue = payload.data.issue ?? payload.data.event?.issue;
  const action = payload.action;

  if (!issue) {
    return {
      text: `${actionEmoji(action)} **Sentry** — ${formatAction(action)} (no issue details)`,
      username: "Sentry",
      icon_url: "https://sentry.io/favicon.ico",
    };
  }

  const level = issue.level ?? "error";
  const project = issue.project?.name ?? issue.project?.slug ?? "unknown";
  const titleLink = issue.permalink ? `[${issue.title}](${issue.permalink})` : `**${issue.title}**`;

  const lines: string[] = [
    `${actionEmoji(action)} ${levelEmoji(level)} **[Sentry] ${
      formatAction(action)
    }** — ${titleLink}`,
  ];

  if (issue.culprit) {
    lines.push(`**Culprit:** \`${issue.culprit}\``);
  }

  const details: string[] = [];
  details.push(`**Project:** ${project}`);
  details.push(`**Level:** ${level}`);
  if (issue.status) {
    details.push(`**Status:** ${issue.status}`);
  }
  if (issue.count) {
    details.push(`**Occurrences:** ${issue.count}`);
  }
  if (issue.userCount !== undefined) {
    details.push(`**Users affected:** ${issue.userCount}`);
  }

  lines.push(details.join(" | "));

  if (payload.actor?.name) {
    lines.push(
      `**By:** ${payload.actor.name}${payload.actor.email ? ` <${payload.actor.email}>` : ""}`,
    );
  }

  return {
    text: lines.join("\n"),
    username: "Sentry",
    icon_url: "https://sentry.io/favicon.ico",
  };
}

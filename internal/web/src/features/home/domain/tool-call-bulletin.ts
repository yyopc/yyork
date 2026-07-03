export type ToolCallKind =
  | 'shell'
  | 'read'
  | 'edit'
  | 'search'
  | 'web-fetch'
  | 'web-search'
  | 'checklist'
  | 'other';

export type ParsedToolCall = {
  detail: string;
  kind: ToolCallKind;
  label: string;
  raw: string;
  running: boolean;
};

type ToolCallPattern = {
  kind: ToolCallKind;
  label: string;
  re: RegExp;
  running: boolean;
};

/** Matches strings written by `summarizeToolCall` in internal/cli/hooks.go. */
const toolCallPatterns: ToolCallPattern[] = [
  {
    kind: 'shell',
    label: 'Shell',
    re: /^(?:Running|Finished|Needs approval for) shell command: (.+)$/,
    running: false,
  },
  {
    kind: 'read',
    label: 'Read',
    re: /^(?:Running|Finished) file read: (.+)$/,
    running: false,
  },
  {
    kind: 'edit',
    label: 'Edit',
    re: /^(?:Running|Finished) file edit: (.+)$/,
    running: false,
  },
  {
    kind: 'search',
    label: 'Search',
    re: /^(?:Running|Finished) search: (.+)$/,
    running: false,
  },
  {
    kind: 'web-fetch',
    label: 'Fetch',
    re: /^(?:Running|Finished) web fetch: (.+)$/,
    running: false,
  },
  {
    kind: 'web-search',
    label: 'Search',
    re: /^(?:Running|Finished) web search: (.+)$/,
    running: false,
  },
  {
    kind: 'checklist',
    label: 'Tasks',
    re: /^(?:Running|Finished) task checklist\.$/,
    running: false,
  },
  // Legacy fixture strings — hooks emit "Running file read:" instead.
  {
    kind: 'read',
    label: 'Read',
    re: /^Reading file: (.+)$/,
    running: true,
  },
];

const toolCallPrefixPatterns: ToolCallPattern[] = [
  {
    kind: 'shell',
    label: 'Shell',
    re: /^(?:Running|Finished|Needs approval for) shell command\.$/,
    running: false,
  },
  {
    kind: 'edit',
    label: 'Edit',
    re: /^(?:Running|Finished) file edit\.$/,
    running: false,
  },
  {
    kind: 'search',
    label: 'Search',
    re: /^(?:Running|Finished) search\.$/,
    running: false,
  },
  {
    kind: 'checklist',
    label: 'Tasks',
    re: /^(?:Running|Finished) task checklist\.$/,
    running: false,
  },
];

function runningFromPrefix(line: string): boolean {
  return line.startsWith('Running ') || line.startsWith('Reading ');
}

export function parseToolCallBulletin(
  line: string
): ParsedToolCall | undefined {
  const raw = line.trim();
  if (!raw) {
    return undefined;
  }

  for (const pattern of toolCallPatterns) {
    const match = raw.match(pattern.re);
    if (!match) {
      continue;
    }
    const running = pattern.re.source.startsWith('^Reading')
      ? true
      : runningFromPrefix(raw);
    return {
      detail: match[1] ?? '',
      kind: pattern.kind,
      label: pattern.label,
      raw,
      running,
    };
  }

  for (const pattern of toolCallPrefixPatterns) {
    if (!pattern.re.test(raw)) {
      continue;
    }
    return {
      detail: '',
      kind: pattern.kind,
      label: pattern.label,
      raw,
      running: runningFromPrefix(raw),
    };
  }

  const generic = raw.match(
    /^(Running|Finished|Needs approval for) ([^.]+)\.$/
  );
  if (generic) {
    const phase = generic[1] ?? '';
    const toolName = generic[2] ?? '';
    return {
      detail: toolName.trim(),
      kind: 'other',
      label: 'Tool',
      raw,
      running: phase === 'Running',
    };
  }

  if (raw.startsWith('Running ') || raw.startsWith('Reading ')) {
    return {
      detail: raw.replace(/^(Running|Reading) /, ''),
      kind: 'other',
      label: 'Activity',
      raw,
      running: true,
    };
  }

  return undefined;
}

export function isRunningToolCallBulletin(line: string): boolean {
  const parsed = parseToolCallBulletin(line);
  return parsed?.running === true;
}

export type ToolCallBulletinItem = {
  parsed: ParsedToolCall;
  running: boolean;
  text: string;
};

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/');
  return segments[segments.length - 1] || path;
}

function compactShellArg(command: string): string {
  const compact = command.trim();
  if (compact.length <= 40) {
    return compact;
  }
  return `${compact.slice(0, 37).trimEnd()}...`;
}

export function formatToolCallBulletinText(parsed: ParsedToolCall): string {
  switch (parsed.kind) {
    case 'shell':
      return parsed.detail
        ? `Shell · ${compactShellArg(parsed.detail)}`
        : 'Shell command';
    case 'read':
    case 'edit':
      return parsed.detail
        ? `${parsed.label} · ${basename(parsed.detail)}`
        : parsed.label;
    case 'search':
    case 'web-search':
      return parsed.detail ? `Search · ${parsed.detail}` : 'Search';
    case 'web-fetch':
      return parsed.detail ? `Fetch · ${parsed.detail}` : 'Web fetch';
    case 'checklist':
      return 'Updating tasks';
    default:
      return parsed.detail || parsed.label;
  }
}

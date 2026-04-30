import { HealthSnapshot } from './HealthSnapshotFetcher';

export function serializeSnapshot(snapshot: HealthSnapshot): string {
  const title = snapshot.projectId.charAt(0).toUpperCase() + snapshot.projectId.slice(1);
  const lines: string[] = [
    `# ${title} Health — ${snapshot.fetchedAt}`,
    '',
    `**Status:** ${snapshot.status}`,
  ];

  if (snapshot.alerts.length > 0) {
    lines.push('', '## Alerts');
    for (const alert of snapshot.alerts) {
      lines.push(`- ${alert}`);
    }
  }

  if (snapshot.blockers.length > 0) {
    lines.push('', '## Blockers');
    for (const blocker of snapshot.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  return lines.join('\n');
}

export function serializeError(projectId: string, error: string): string {
  const title = projectId.charAt(0).toUpperCase() + projectId.slice(1);
  return [
    `# ${title} Health — ${new Date().toISOString()}`,
    '',
    `**Status:** unavailable`,
    '',
    `Health data could not be fetched: ${error}`,
  ].join('\n');
}

interface TrackTitleTeam {
  name?: string;
}

interface TrackTitleRelease {
  teams?: TrackTitleTeam[];
  team?: TrackTitleTeam;
  kind?: string;
}

/**
 * Назва доріжки для релізу mikai: об'єднані назви команд плюс позначка субтитрів.
 * Використовується і публічним шляхом, і fallback-ом через Dawn, щоб джерела
 * виглядали однаково. Публічний API віддає масив teams, приватний dawn-лістинг — одну team.
 */
export function getMikaiTrackTitle(release: TrackTitleRelease): string {
  const teamNames =
    release.teams?.map((team) => team.name).filter(Boolean).join(', ') || release.team?.name || 'Озвучення';
  const kindLabel = release.kind === 'sub' ? ' (Субтитри)' : '';
  return `${teamNames}${kindLabel}`;
}

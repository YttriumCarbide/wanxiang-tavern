import { restoreArchives } from '../archives.js';
import { restoredSummary, conversationText, restoreInvitationHistory } from '../memory.js';

export function restoreLibraryRecords(library, value) {
  library.archives = restoreArchives(value.archives);
  library.relationships = structuredClone(value.relationships || {});
  if (value.summaryWorldbook?.entries)
    library.summaryWorldbook = structuredClone(value.summaryWorldbook);
  library.invitationHistory = restoreInvitationHistory(value.invitationHistory);
  library.journeyActivities = (
    Array.isArray(value.journeyActivities) ? value.journeyActivities : []
  )
    .filter(
      (entry) =>
        ['service', 'outing', 'promotion'].includes(entry?.kind) &&
        typeof entry.title === 'string' &&
        Number.isFinite(entry.finishedAt),
    )
    .slice(-100)
    .map(({ kind, title, gameTime, finishedAt }) => ({
      kind,
      title: title.slice(0, 250),
      gameTime: String(gameTime || '').slice(0, 60),
      finishedAt,
    }));
  library.tavernChat = (Array.isArray(value.tavernChat) ? value.tavernChat : [])
    .filter(
      (message) =>
        ['user', 'assistant', 'system'].includes(message.role) &&
        typeof message.content === 'string' &&
        message.content.length <= 200000,
    )
    .map((message, index, messages) => {
      const {
        role,
        content,
        display,
        speakerIds,
        speakerName,
        summary,
        turnSummary,
        id,
        divider,
        journeyArchived,
        outing,
        gameTime,
      } = message;
      const validSummary = restoredSummary(summary, content);
      const player = messages[index - 1];
      const validTurn =
        role === 'assistant' && player?.role === 'user' && !player.divider && !divider
          ? restoredSummary(turnSummary, conversationText(player, message))
          : null;
      return {
        role,
        content,
        ...(typeof id === 'string' ? { id } : {}),
        ...(divider ? { divider: true } : {}),
        ...(journeyArchived ? { journeyArchived: true } : {}),
        ...(outing ? { outing: true } : {}),
        ...(typeof gameTime === 'string' ? { gameTime: gameTime.slice(0, 60) } : {}),
        ...(validSummary ? { summary: validSummary } : {}),
        ...(validTurn ? { turnSummary: validTurn } : {}),
        ...(typeof display === 'string' && display.length <= 200000 ? { display } : {}),
        ...(Array.isArray(speakerIds)
          ? {
              speakerIds: speakerIds
                .filter((id) => typeof id === 'string' && id.length <= 100)
                .slice(0, 100),
            }
          : {}),
        ...(typeof speakerName === 'string' && speakerName.length <= 1000 ? { speakerName } : {}),
      };
    });
  library.experienceClaims = Array.isArray(value.experienceClaims)
    ? value.experienceClaims.filter((id) => typeof id === 'string').slice(-4000)
    : [];
}

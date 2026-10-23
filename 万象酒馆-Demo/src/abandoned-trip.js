/** Loading keeps earned inventory/characters, but drops unfinished scripts and their temporary archives. */
export function discardUnfinishedTrip(library, activeScript = null) {
  const completed = new Set(
    (library.history || []).filter((entry) => entry.complete).map((entry) => entry.scriptId),
  );
  const scriptIds = new Set(
    (library.history || [])
      .filter((entry) => entry.complete === false)
      .map((entry) => entry.scriptId),
  );
  if (library.prepared) scriptIds.add(library.prepared);
  if (activeScript?.id) scriptIds.add(activeScript.id);
  for (const id of completed) scriptIds.delete(id);
  scriptIds.delete(undefined);
  if (!scriptIds.size) return false;
  const runIds = new Set(
    (library.history || [])
      .filter((entry) => scriptIds.has(entry.scriptId))
      .map((entry) => entry.runId)
      .filter(Boolean),
  );
  if (activeScript?.runId && scriptIds.has(activeScript.id)) runIds.add(activeScript.runId);
  library.scripts = (library.scripts || []).filter((entry) => !scriptIds.has(entry.id));
  library.history = (library.history || []).filter(
    (entry) => !scriptIds.has(entry.scriptId) && !runIds.has(entry.runId),
  );
  library.prepared = null;
  if (library.archives) {
    library.archives.items = library.archives.items.filter(
      (entry) => !runIds.has(entry.source?.runId) && !scriptIds.has(entry.source?.scriptId),
    );
    library.archives.npcs = library.archives.npcs.filter((npc) => {
      if (!npc.sources?.length) return true;
      npc.sources = npc.sources.filter(
        (source) => !runIds.has(source.runId) && !scriptIds.has(source.scriptId),
      );
      return npc.sources.length > 0;
    });
  }
  return true;
}

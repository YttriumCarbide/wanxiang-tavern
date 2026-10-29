import { galWorkspaceChecks } from './gal-workspace.mjs';

/** The retired modal suite is replaced by the shared, full-screen Gal conversation workflow. */
export async function chatChecks(options) {
  return galWorkspaceChecks(options);
}

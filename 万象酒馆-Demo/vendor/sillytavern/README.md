# SillyTavern compatibility sources

Retrieved from https://github.com/SillyTavern/SillyTavern/tree/release on 2026-10-17. GPL-3.0, see LICENSE.

merge-messages.mjs extracts the upstream mergeMessages function unchanged, with its Node crypto import and default placeholder. prompt-converters.source.txt preserves the complete source. chat-layout.source.html preserves the chat template reference; the local message renderer follows mes / ch_name / mes_text structure while isolating HTML in an iframe. Other upstream app-specific actions are not installed.

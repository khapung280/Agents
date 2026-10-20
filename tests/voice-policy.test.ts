import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isVoiceLanguage,
  isStopTranscript,
  localVoice,
} from "../client/voice-policy.js";
test("English and Nepali stop commands are exact; language and local speech output never silently fall back remotely", () => {
  for (const text of ["STOP!", "रोक", "रोक्नुहोस्।"])
    assert.ok(isStopTranscript(text));
  for (const text of ["stop later", "do not stop", "रोक अनि लेख", ""])
    assert.ok(!isStopTranscript(text));
  assert.ok(isVoiceLanguage("ne-NP"));
  assert.ok(!isVoiceLanguage("toString"));
  const remote = { lang: "ne-NP", localService: false };
  const english = { lang: "en-US", localService: true };
  const nepali = { lang: "ne_NP", localService: true };
  assert.equal(localVoice([remote, english], "ne-NP"), undefined);
  assert.equal(localVoice([remote, english, nepali], "ne-NP"), nepali);
  assert.equal(localVoice([remote, english, nepali], "en-US"), english);
});

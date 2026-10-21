import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesTestDocumentTitle,
  validateTestDocumentWindow,
} from "../shared/notepad.js";
import type { WindowState } from "../shared/computer.js";

// Pure evidence fixtures: these never launch Notepad or send Windows input.
const name = "agents-12345678-1234-4234-8234-123456789abc.txt";
const bounds = { x: 0, y: 0, width: 300, height: 200 };
const editor = {
  id: "1",
  name: "Editor",
  controlType: "ControlType.Document",
  enabled: true,
  password: false,
  focused: false,
  value: "",
  bounds,
};
const tab = {
  ...editor,
  id: "2",
  name,
  controlType: "ControlType.TabItem",
  value: null,
};
const window: WindowState = {
  windowId: "42",
  processId: 100,
  processStartedAt: "2026-10-21T00:00:00Z",
  executable: "C:\\Windows\\notepad.exe",
  title: `${name} - Notepad`,
  foreground: false,
  bounds,
  elements: [editor],
};

test("Notepad evidence accepts only complete registered document titles", () => {
  for (const title of [name, `${name} - Notepad`, `*${name} - Notepad`]) {
    assert.equal(matchesTestDocumentTitle(title, name), true);
    assert.doesNotThrow(() =>
      validateTestDocumentWindow({ ...window, title }, name),
    );
  }
  for (const title of [
    "Personal - Notepad",
    `other ${name} - Notepad`,
    `${name} - Notepad - personal`,
    `**${name}`,
  ]) {
    assert.equal(matchesTestDocumentTitle(title, name), false);
    assert.throws(
      () => validateTestDocumentWindow({ ...window, title }, name),
      /document title/,
    );
  }
  assert.equal(matchesTestDocumentTitle("personal.txt", "personal.txt"), false);
});

test("Notepad evidence rejects personal tabs and ambiguous or unreadable editors", () => {
  assert.doesNotThrow(() =>
    validateTestDocumentWindow({ ...window, elements: [editor, tab] }, name),
  );
  for (const elements of [
    [editor, tab, tab],
    [editor, { ...tab, name: "Personal.txt" }],
  ])
    assert.throws(
      () => validateTestDocumentWindow({ ...window, elements }, name),
      /tabs/,
    );
  for (const elements of [
    [],
    [editor, editor],
    [{ ...editor, password: true }],
    [{ ...editor, enabled: false }],
    [{ ...editor, value: null }],
  ])
    assert.throws(
      () => validateTestDocumentWindow({ ...window, elements }, name),
      /isolated/,
    );
});

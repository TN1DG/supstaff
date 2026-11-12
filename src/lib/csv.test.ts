import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { csvCell, csvRow } from "@/lib/csv";

describe("csvCell", () => {
  it("leaves plain text and empty values alone", () => {
    assert.equal(csvCell("Slept well"), "Slept well");
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
    assert.equal(csvCell(3), "3");
  });

  it("quotes commas, quotes and line breaks", () => {
    assert.equal(csvCell("tea, toast"), '"tea, toast"');
    assert.equal(csvCell('said "no"'), '"said ""no"""');
    assert.equal(csvCell("line 1\nline 2"), '"line 1\nline 2"');
    assert.equal(csvCell("line 1\r\nline 2"), '"line 1\r\nline 2"');
  });

  it("neutralises every formula trigger character", () => {
    for (const c of ["=", "+", "-", "@", "\t", "\r"]) {
      assert.ok(csvCell(`${c}cmd`).replace(/^"/, "").startsWith("'"), `prefix for ${JSON.stringify(c)}`);
    }
    assert.equal(csvCell('=HYPERLINK("http://evil","x")'), `"'=HYPERLINK(""http://evil"",""x"")"`);
  });

  it("only checks the first character", () => {
    assert.equal(csvCell("a=b"), "a=b");
  });
});

describe("csvRow", () => {
  it("joins cells with commas", () => {
    assert.equal(csvRow(["a", "=1", null]), "a,'=1,");
  });
});

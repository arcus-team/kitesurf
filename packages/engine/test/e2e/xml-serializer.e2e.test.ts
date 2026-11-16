// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
// https://opensource.org/licenses/Apache-2.0

import { expect, test } from "./harness";

const PAGE =
  "<!doctype html><html lang=en><head><title>t</title></head>" +
  '<body><p class="a">x &amp; y<br></p><!--c--></body></html>';

test("XMLSerializer serializes a doctype, elements, text and comments", async ({ page }) => {
  await page.goto("data:text/html," + encodeURIComponent(PAGE), { waitUntil: "domcontentloaded" });

  const out = await page.evaluate(() => {
    const s = new XMLSerializer();
    return {
      doctype: s.serializeToString(document.doctype!),
      p: s.serializeToString(document.querySelector("p")!),
      comment: s.serializeToString(document.body.lastChild!),
      throws: (() => {
        try {
          s.serializeToString({} as Node);
          return false;
        } catch (e) {
          return e instanceof TypeError;
        }
      })(),
    };
  });

  expect(out).toEqual({
    doctype: "<!DOCTYPE html>",
    p: '<p xmlns="http://www.w3.org/1999/xhtml" class="a">x &amp; y<br /></p>',
    comment: "<!--c-->",
    throws: true,
  });
});

test("page.content() returns the doctype and the document", async ({ page }) => {
  await page.goto("data:text/html," + encodeURIComponent(PAGE), { waitUntil: "domcontentloaded" });

  const html = await page.content();
  expect(html.startsWith("<!DOCTYPE html><html")).toBe(true);
  expect(html).toContain('<p class="a">x &amp; y<br></p>');
});

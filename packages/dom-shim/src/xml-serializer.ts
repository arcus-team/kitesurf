// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
// https://opensource.org/licenses/Apache-2.0

// XMLSerializer: the DOM Parsing spec's XML serialization, walked over the public Node surface.
// Playwright's page.content() calls serializeToString(document.doctype).

import type * as Idl from "./idl/types.generated.js";

const HTML_NS = "http://www.w3.org/1999/xhtml";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

// HTML void elements serialize as `<br />` in the HTML namespace.
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "basefont",
  "bgsound",
  "br",
  "col",
  "embed",
  "frame",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

interface AttrLike {
  namespaceURI: string | null;
  prefix: string | null;
  localName: string;
  value: string;
}

// The public Node surface the serializer reads; which fields exist depends on nodeType.
interface NodeLike {
  nodeType: number;
  childNodes?: ArrayLike<NodeLike>;
  // Element
  namespaceURI?: string | null;
  prefix?: string | null;
  localName?: string;
  attributes?: ArrayLike<AttrLike>;
  content?: NodeLike;
  // CharacterData / ProcessingInstruction
  data?: string;
  target?: string;
  // DocumentType
  name?: string;
  publicId?: string;
  systemId?: string;
}

function isNodeLike(value: unknown): value is NodeLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { nodeType?: unknown }).nodeType === "number"
  );
}

function escapeText(data: string): string {
  return data.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\t/g, "&#9;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;");
}

function qualifiedName(prefix: string | null, localName: string): string {
  return prefix ? `${prefix}:${localName}` : localName;
}

function serializeDoctype(node: NodeLike): string {
  let out = `<!DOCTYPE ${node.name ?? ""}`;
  if (node.publicId) out += ` PUBLIC "${node.publicId}"`;
  else if (node.systemId) out += " SYSTEM";
  if (node.systemId) out += ` "${node.systemId}"`;
  return out + ">";
}

function serializeChildren(node: NodeLike, inheritedNs: string | null): string {
  const kids = node.childNodes;
  if (!kids) return "";
  let out = "";
  for (let i = 0; i < kids.length; i++) out += serializeNode(kids[i], inheritedNs);
  return out;
}

function serializeElement(el: NodeLike, inheritedNs: string | null): string {
  const ns = el.namespaceURI ?? null;
  const elPrefix = el.prefix ?? null;
  const localName = el.localName ?? "";
  const attrs: ArrayLike<AttrLike> = el.attributes ?? [];
  const name = qualifiedName(elPrefix, localName);
  let out = `<${name}`;
  // Declare the element's default namespace where it changes (the root of an HTML
  // document gets xmlns="http://www.w3.org/1999/xhtml", as in browsers).
  let declaredXmlns = false;
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    if (a.namespaceURI === XMLNS_NS && a.prefix === null && a.localName === "xmlns") {
      declaredXmlns = true;
    }
  }
  if (!elPrefix && ns !== inheritedNs && !declaredXmlns) {
    out += ` xmlns="${escapeAttr(ns ?? "")}"`;
  }
  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i];
    let prefix = a.prefix;
    if (a.namespaceURI === XML_NS) prefix = "xml";
    else if (a.namespaceURI === XMLNS_NS && a.localName !== "xmlns") prefix = "xmlns";
    out += ` ${qualifiedName(prefix, a.localName)}="${escapeAttr(a.value)}"`;
  }
  const childNs = elPrefix ? inheritedNs : ns;
  // <template> serializes its content fragment, not its (empty) children.
  const source = ns === HTML_NS && localName === "template" && el.content ? el.content : el;
  const inner = serializeChildren(source, childNs);
  if (ns === HTML_NS) {
    if (VOID_ELEMENTS.has(localName) && inner === "") return out + " />";
    return `${out}>${inner}</${name}>`;
  }
  if (inner === "") return out + "/>";
  return `${out}>${inner}</${name}>`;
}

function serializeNode(node: NodeLike, inheritedNs: string | null): string {
  switch (node.nodeType) {
    case 1:
      return serializeElement(node, inheritedNs);
    case 3:
      return escapeText(node.data ?? "");
    case 4:
      return `<![CDATA[${node.data ?? ""}]]>`;
    case 7:
      return `<?${node.target ?? ""} ${node.data ?? ""}?>`;
    case 8:
      return `<!--${node.data ?? ""}-->`;
    case 9:
    case 11:
      return serializeChildren(node, null);
    case 10:
      return serializeDoctype(node);
    default:
      return "";
  }
}

class XMLSerializer implements Idl.XMLSerializer {
  serializeToString(root: unknown): string {
    if (!isNodeLike(root)) {
      throw new TypeError(
        "Failed to execute 'serializeToString' on 'XMLSerializer': parameter 1 is not of type 'Node'.",
      );
    }
    return serializeNode(root, null);
  }
}

export { XMLSerializer };

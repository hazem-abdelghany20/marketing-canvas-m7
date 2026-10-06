import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Under jsdom import.meta.url is not a file URL, and this needs no DOM: the path is made from the project root, where vitest runs.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const spec = read("docs/spec.md");
const matrix = read("docs/state-matrix.md");
const roadmap = read("backlog/ROADMAP.md");

const SCREENS: Array<[id: string, title: string]> = [
  ["P1", "Phone shell"],
  ["P2", "Trace"],
  ["P3", "Board on a phone"],
  ["P4", "Chat on a phone"],
  ["P5", "Find"],
  ["P6", "Add and node sheets"],
];
const STATES = ["Loading", "Empty", "Error", "Success", "Disabled", "Permissions"];

/** The text of a section, from its heading to the next heading of the same level or higher. */
function section(doc: string, heading: string): string {
  const level = heading.match(/^#+/)![0].length;
  const start = doc.indexOf(`\n${heading}\n`);
  if (start === -1) return "";
  const rest = doc.slice(start + heading.length + 2);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return next === -1 ? rest : rest.slice(0, next);
}

describe("the spec", () => {
  it.each(SCREENS)(
    "has a section for %s — %s, with its layout, content, behavior and acceptance criteria",
    (id, title) => {
      const body = section(spec, `# ${id} — ${title}`);

      expect(body, `# ${id} — ${title}`).not.toBe("");
      for (const part of ["### Layout", "### Behavior", "### States", "### Acceptance criteria"]) {
        expect(body, `${id} ${part}`).toContain(part);
      }
      expect(body).toContain("state-matrix.md");
    },
  );

  it("lists the phone's screens in the screen inventory, each tracing to a step of the path", () => {
    const inventory = section(spec, "## Screen inventory");

    for (const [id, title] of SCREENS) expect(inventory, id).toContain(`| ${id} | ${title}`);
    expect(inventory).toContain("Below 640px");
  });

  it("says in S3 where the phone layout begins, and that the layout from 640px up is unchanged", () => {
    const workspace = section(spec, "# S3 — Workspace");

    expect(workspace).toContain("Below 640px");
    expect(workspace).toContain("P1");
  });
});

describe("the state matrix", () => {
  it.each(SCREENS)("has all six states for %s — %s, none of them blank", (id, title) => {
    const body = section(matrix, `## ${id} — ${title}`);

    expect(body, `## ${id} — ${title}`).not.toBe("");
    for (const state of STATES) {
      const row = body.split("\n").find((line) => line.startsWith(`| **${state}** |`));
      expect(row, `${id} ${state}`).toBeTruthy();
      const cells = row!.split("|").slice(1, -1);
      expect(cells[1]!.trim().length, `${id} ${state} is blank`).toBeGreaterThan(10);
    }
  });
});

describe("the roadmap", () => {
  it("lists tickets 023 to 029, the phone layout, and the branch they are on", () => {
    const phone = section(roadmap, "## Phone layout — 023–029 (on `mobile-optimization-ui`)");

    expect(phone).not.toBe("");
    for (const ticket of ["023", "024", "025", "026", "027", "028", "029"])
      expect(phone, ticket).toContain(`**${ticket} `);
    expect(roadmap).toContain("mobile-optimization-ui");
  });

  it("has a ticket file for each of them", () => {
    for (const file of [
      "023-phone-shell-and-tab-bar",
      "024-trace-home",
      "025-phone-board",
      "026-phone-chat",
      "027-phone-find",
      "028-phone-add-and-node-sheet",
      "029-phone-pass",
    ]) {
      expect(read(`backlog/${file}.md`).length, file).toBeGreaterThan(200);
    }
  });
});

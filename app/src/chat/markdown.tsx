import type { ReactNode } from "react";

type Block = { kind: "p"; text: string } | { kind: "ul" | "ol"; items: string[]; start: number };

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

/**
 * The server's replies are markdown, but only a little of it: paragraphs, bulleted and
 * numbered lists, **bold** and `code`. A blank line between list items does not end the list.
 */
function parse(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Extract<Block, { items: string[] }> | null = null;
  const endParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: "p", text: paragraph.join("\n") });
    paragraph = [];
  };

  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      endParagraph();
      const kind = bullet ? "ul" : "ol";
      if (!list || list.kind !== kind) {
        list = { kind, items: [], start: numbered ? Number(numbered[1]) : 1 };
        blocks.push(list);
      }
      list.items.push(bullet ? bullet[1]! : numbered![2]!);
    } else if (line.trim() === "") {
      endParagraph();
    } else {
      list = null;
      paragraph.push(line);
    }
  }
  endParagraph();
  return blocks;
}

/** Inline marks. A marker still waiting for its closing half, as in a reply that is mid-stream, stays plain text. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/).map((part, i) => {
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded-sm bg-panel px-1 font-mono text-[0.92em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

/** Renders a reply as elements, never as HTML: nothing in the text can become markup. */
export function Markdown({ text }: { text: string }) {
  return (
    <>
      {parse(text).map((block, i) => {
        if (block.kind === "p") {
          return (
            <p key={i} className="m-0 whitespace-pre-wrap [&:not(:first-child)]:mt-2">
              {inline(block.text)}
            </p>
          );
        }
        const Tag = block.kind;
        return (
          <Tag
            key={i}
            start={block.kind === "ol" ? block.start : undefined}
            className={`m-0 pl-5 [&:not(:first-child)]:mt-2 ${block.kind === "ul" ? "list-disc" : "list-decimal"}`}
          >
            {block.items.map((item, j) => (
              <li key={j} className="[&:not(:first-child)]:mt-1">
                {inline(item)}
              </li>
            ))}
          </Tag>
        );
      })}
    </>
  );
}

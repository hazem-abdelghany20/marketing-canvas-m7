import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../components/Button";
import { COPY } from "../ui/copy";

interface ThreadComposerProps {
  placeholder: string;
  /** Sends the text. Rejects if it could not be sent; the composer then gives the text back. */
  onPost: (text: string) => Promise<unknown>;
}

/**
 * The box a comment is written in. Enter posts and Shift+Enter starts a new line. Post waits for words.
 * It clears the moment a comment is sent, keeps focus for a follow-up, and gives the text back if the send
 * fails, so nothing typed is lost to a request.
 */
export function ThreadComposer({ placeholder, onPost }: ThreadComposerProps) {
  const [value, setValue] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const empty = value.trim() === "";

  // A thread opens with its composer ready.
  useEffect(() => field.current?.focus({ preventScroll: true }), []);

  function post() {
    if (empty) return;
    const text = value;
    setValue("");
    field.current?.focus({ preventScroll: true });
    // Only if nothing has been typed since: a person already writing the next one does not lose it.
    onPost(text).catch(() => setValue((now) => (now === "" ? text : now)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    post();
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={field}
        aria-label="Comment"
        rows={2}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        className="w-full resize-none rounded-md border border-subtle bg-elevated px-2.5 py-[9px] text-[13px] leading-normal text-primary outline-none placeholder:text-muted"
      />
      <div>
        <Button variant="primary" disabledReason={empty ? COPY.commentWriteFirst : null} onClick={post}>
          Post
        </Button>
      </div>
    </div>
  );
}

// Live GLSL editor. Recompiles as you type; on an error the last good shader
// keeps running and the error links to its line.

import type { CompileError } from '../gl/glsl';

export interface EditorHooks {
  /** Try the new source. Return errors, or an empty list on success. */
  apply(vertex: string, fragment: string): CompileError[];
  revert(): void;
  closed(): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Editor {
  private readonly root = $<HTMLElement>('editor');
  private readonly title = $<HTMLElement>('editor-title');
  private readonly vertex = $<HTMLTextAreaElement>('editor-vertex');
  private readonly fragment = $<HTMLTextAreaElement>('editor-fragment');
  private readonly errors = $<HTMLOListElement>('editor-errors');
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly hooks: EditorHooks) {
    for (const area of [this.vertex, this.fragment]) {
      area.addEventListener('input', () => this.schedule());
      area.addEventListener('keydown', (e) => this.onKey(e, area));
    }
    $('editor-close').addEventListener('click', () => this.close());
    $('editor-revert').addEventListener('click', () => this.hooks.revert());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(title: string, vertex: string, fragment: string): void {
    this.title.textContent = title;
    this.vertex.value = vertex;
    this.fragment.value = fragment;
    this.showErrors([]);
    this.root.hidden = false;
  }

  close(): void {
    clearTimeout(this.timer);
    this.root.hidden = true;
    this.hooks.closed();
  }

  setTitle(title: string): void {
    this.title.textContent = title;
  }

  showErrors(errors: CompileError[]): void {
    this.errors.replaceChildren(
      ...errors.map((e) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${e.stage}${e.line ? `:${e.line}` : ''}  ${e.message}`;
        button.addEventListener('click', () => this.jumpTo(e));
        li.append(button);
        return li;
      }),
    );
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.showErrors(this.hooks.apply(this.vertex.value, this.fragment.value)), 250);
  }

  private jumpTo(error: CompileError): void {
    const area = error.stage === 'vertex' ? this.vertex : this.fragment;
    const lines = area.value.split('\n');
    const line = Math.max(1, Math.min(error.line || 1, lines.length));
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    area.focus();
    area.setSelectionRange(start, start + lines[line - 1]!.length);
    // Scroll the line into view: textareas don't do this on their own.
    const lineHeight = parseFloat(getComputedStyle(area).lineHeight) || 18;
    area.scrollTop = Math.max(0, (line - 4) * lineHeight);
  }

  private onKey(e: KeyboardEvent, area: HTMLTextAreaElement): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      area.blur();
      this.close();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      // Indent instead of leaving the editor. (Esc, then Tab, to move focus on.)
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end } = area;
      area.setRangeText('\t', s, end, 'end');
      this.schedule();
    }
  }
}

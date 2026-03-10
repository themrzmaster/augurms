// ========================
// Undo/Redo Command Pattern
// ========================

import type {
  EditorFoothold,
  EditorLife,
  EditorPortal,
  EditorLadderRope,
  EditorSeat,
  EditorId,
} from "./types";

export interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

export class CompositeCommand implements Command {
  description: string;
  private commands: Command[];

  constructor(description: string, commands: Command[]) {
    this.description = description;
    this.commands = commands;
  }

  execute() {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo() {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}

// ---------- Generic Move Command ----------

export class MoveElementCommand<T extends { editorId: EditorId; x: number; y: number }> implements Command {
  description: string;
  private getElements: () => T[];
  private setElements: (els: T[]) => void;
  private editorId: EditorId;
  private dx: number;
  private dy: number;

  constructor(
    description: string,
    editorId: EditorId,
    dx: number,
    dy: number,
    getElements: () => T[],
    setElements: (els: T[]) => void,
  ) {
    this.description = description;
    this.editorId = editorId;
    this.dx = dx;
    this.dy = dy;
    this.getElements = getElements;
    this.setElements = setElements;
  }

  execute() {
    this.setElements(
      this.getElements().map((el) =>
        el.editorId === this.editorId
          ? { ...el, x: el.x + this.dx, y: el.y + this.dy }
          : el,
      ),
    );
  }

  undo() {
    this.setElements(
      this.getElements().map((el) =>
        el.editorId === this.editorId
          ? { ...el, x: el.x - this.dx, y: el.y - this.dy }
          : el,
      ),
    );
  }
}

// ---------- Foothold Move Command ----------

export class MoveFootholdCommand implements Command {
  description: string;
  private getFootholds: () => EditorFoothold[];
  private setFootholds: (fhs: EditorFoothold[]) => void;
  private editorId: EditorId;
  private dx: number;
  private dy: number;

  constructor(
    description: string,
    editorId: EditorId,
    dx: number,
    dy: number,
    getFootholds: () => EditorFoothold[],
    setFootholds: (fhs: EditorFoothold[]) => void,
  ) {
    this.description = description;
    this.editorId = editorId;
    this.dx = dx;
    this.dy = dy;
    this.getFootholds = getFootholds;
    this.setFootholds = setFootholds;
  }

  execute() {
    this.setFootholds(
      this.getFootholds().map((fh) =>
        fh.editorId === this.editorId
          ? { ...fh, x1: fh.x1 + this.dx, y1: fh.y1 + this.dy, x2: fh.x2 + this.dx, y2: fh.y2 + this.dy }
          : fh,
      ),
    );
  }

  undo() {
    this.setFootholds(
      this.getFootholds().map((fh) =>
        fh.editorId === this.editorId
          ? { ...fh, x1: fh.x1 - this.dx, y1: fh.y1 - this.dy, x2: fh.x2 - this.dx, y2: fh.y2 - this.dy }
          : fh,
      ),
    );
  }
}

// ---------- Foothold Endpoint Drag Command ----------

export class MoveFootholdEndpointCommand implements Command {
  description: string;
  private getFootholds: () => EditorFoothold[];
  private setFootholds: (fhs: EditorFoothold[]) => void;
  private editorId: EditorId;
  private endpoint: "start" | "end";
  private dx: number;
  private dy: number;

  constructor(
    description: string,
    editorId: EditorId,
    endpoint: "start" | "end",
    dx: number,
    dy: number,
    getFootholds: () => EditorFoothold[],
    setFootholds: (fhs: EditorFoothold[]) => void,
  ) {
    this.description = description;
    this.editorId = editorId;
    this.endpoint = endpoint;
    this.dx = dx;
    this.dy = dy;
    this.getFootholds = getFootholds;
    this.setFootholds = setFootholds;
  }

  execute() {
    this.setFootholds(
      this.getFootholds().map((fh) => {
        if (fh.editorId !== this.editorId) return fh;
        if (this.endpoint === "start") {
          return { ...fh, x1: fh.x1 + this.dx, y1: fh.y1 + this.dy };
        }
        return { ...fh, x2: fh.x2 + this.dx, y2: fh.y2 + this.dy };
      }),
    );
  }

  undo() {
    this.setFootholds(
      this.getFootholds().map((fh) => {
        if (fh.editorId !== this.editorId) return fh;
        if (this.endpoint === "start") {
          return { ...fh, x1: fh.x1 - this.dx, y1: fh.y1 - this.dy };
        }
        return { ...fh, x2: fh.x2 - this.dx, y2: fh.y2 - this.dy };
      }),
    );
  }
}

// ---------- Add Element Command ----------

export class AddElementCommand<T> implements Command {
  description: string;
  private getElements: () => T[];
  private setElements: (els: T[]) => void;
  private element: T;

  constructor(
    description: string,
    element: T,
    getElements: () => T[],
    setElements: (els: T[]) => void,
  ) {
    this.description = description;
    this.element = element;
    this.getElements = getElements;
    this.setElements = setElements;
  }

  execute() {
    this.setElements([...this.getElements(), this.element]);
  }

  undo() {
    this.setElements(this.getElements().filter((el) => el !== this.element));
  }
}

// ---------- Delete Element Command ----------

export class DeleteElementCommand<T extends { editorId: EditorId }> implements Command {
  description: string;
  private getElements: () => T[];
  private setElements: (els: T[]) => void;
  private editorId: EditorId;
  private deletedElement: T | null = null;
  private deletedIndex = -1;

  constructor(
    description: string,
    editorId: EditorId,
    getElements: () => T[],
    setElements: (els: T[]) => void,
  ) {
    this.description = description;
    this.editorId = editorId;
    this.getElements = getElements;
    this.setElements = setElements;
  }

  execute() {
    const elements = this.getElements();
    this.deletedIndex = elements.findIndex((el) => el.editorId === this.editorId);
    if (this.deletedIndex >= 0) {
      this.deletedElement = elements[this.deletedIndex];
      this.setElements(elements.filter((_, i) => i !== this.deletedIndex));
    }
  }

  undo() {
    if (this.deletedElement && this.deletedIndex >= 0) {
      const elements = [...this.getElements()];
      elements.splice(this.deletedIndex, 0, this.deletedElement);
      this.setElements(elements);
    }
  }
}

// ---------- Update Property Command ----------

export class UpdatePropertyCommand<T extends { editorId: EditorId }> implements Command {
  description: string;
  private getElements: () => T[];
  private setElements: (els: T[]) => void;
  private editorId: EditorId;
  private key: keyof T;
  private oldValue: T[keyof T] | undefined;
  private newValue: T[keyof T];

  constructor(
    description: string,
    editorId: EditorId,
    key: keyof T,
    newValue: T[keyof T],
    getElements: () => T[],
    setElements: (els: T[]) => void,
  ) {
    this.description = description;
    this.editorId = editorId;
    this.key = key;
    this.newValue = newValue;
    this.getElements = getElements;
    this.setElements = setElements;
    // Capture old value
    const el = getElements().find((e) => e.editorId === editorId);
    this.oldValue = el ? el[key] : undefined;
  }

  execute() {
    this.setElements(
      this.getElements().map((el) =>
        el.editorId === this.editorId ? { ...el, [this.key]: this.newValue } : el,
      ),
    );
  }

  undo() {
    this.setElements(
      this.getElements().map((el) =>
        el.editorId === this.editorId ? { ...el, [this.key]: this.oldValue } : el,
      ),
    );
  }
}

// ---------- Move Ladder/Rope Command ----------

export class MoveLadderRopeCommand implements Command {
  description: string;
  private getLadderRopes: () => EditorLadderRope[];
  private setLadderRopes: (lrs: EditorLadderRope[]) => void;
  private editorId: EditorId;
  private dx: number;
  private dy: number;

  constructor(
    description: string,
    editorId: EditorId,
    dx: number,
    dy: number,
    getLadderRopes: () => EditorLadderRope[],
    setLadderRopes: (lrs: EditorLadderRope[]) => void,
  ) {
    this.description = description;
    this.editorId = editorId;
    this.dx = dx;
    this.dy = dy;
    this.getLadderRopes = getLadderRopes;
    this.setLadderRopes = setLadderRopes;
  }

  execute() {
    this.setLadderRopes(
      this.getLadderRopes().map((lr) =>
        lr.editorId === this.editorId
          ? { ...lr, x: lr.x + this.dx, y1: lr.y1 + this.dy, y2: lr.y2 + this.dy }
          : lr,
      ),
    );
  }

  undo() {
    this.setLadderRopes(
      this.getLadderRopes().map((lr) =>
        lr.editorId === this.editorId
          ? { ...lr, x: lr.x - this.dx, y1: lr.y1 - this.dy, y2: lr.y2 - this.dy }
          : lr,
      ),
    );
  }
}

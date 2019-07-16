import { Code } from "../editor/i-write-code";
import { Selection } from "../editor/selection";
import { ShowErrorMessage, ErrorReason } from "../editor/i-show-error-message";
import { createWriteInMemory } from "../editor/adapters/write-code-in-memory";
import { removeRedundantElse } from "./remove-redundant-else";
import { testEach } from "../tests-helpers";

describe("Remove Redundant Else", () => {
  let showErrorMessage: ShowErrorMessage;

  beforeEach(() => {
    showErrorMessage = jest.fn();
  });

  testEach<{ code: Code; selection: Selection; expected: Code }>(
    "should remove redundant else",
    [
      {
        description: "basic scenario",
        code: `function doSomethingIfValid() {
  console.log("Start working");

  if (!isValid) {
    showWarning();
    return;
  } else {
    doSomething();
    doAnotherThing();
  }

  doSomeFinalThing();
}`,
        selection: new Selection([3, 3], [9, 3]),
        expected: `function doSomethingIfValid() {
  console.log("Start working");

  if (!isValid) {
    showWarning();
    return;
  }

  doSomething();
  doAnotherThing();

  doSomeFinalThing();
}`
      },
      {
        description: "only the selected one",
        code: `function doSomethingIfValid() {
  if (!isValid) {
    showWarning();
    return;
  } else {
    doSomething();
    doAnotherThing();
  }

  if (!isCorrect) {
    showWarning();
    return;
  } else {
    showMessage();
  }
}`,
        selection: new Selection([1, 3], [7, 3]),
        expected: `function doSomethingIfValid() {
  if (!isValid) {
    showWarning();
    return;
  }

  doSomething();
  doAnotherThing();

  if (!isCorrect) {
    showWarning();
    return;
  } else {
    showMessage();
  }
}`
      },
      {
        description: "when cursor is inside",
        code: `function doSomethingIfValid() {
  if (!isValid) {
    showWarning();
    return;
  } else {
    doSomething();
    doAnotherThing();
  }
}`,
        selection: Selection.cursorAt(3, 3),
        expected: `function doSomethingIfValid() {
  if (!isValid) {
    showWarning();
    return;
  }
  doSomething();
  doAnotherThing();
}`
      },
      {
        description: "with throw expression",
        code: `function doSomethingIfValid() {
  if (!isValid) {
    throw new Error("Oh no!");
  } else {
    doSomething();
    doAnotherThing();
  }
}`,
        selection: Selection.cursorAt(3, 3),
        expected: `function doSomethingIfValid() {
  if (!isValid) {
    throw new Error("Oh no!");
  }
  doSomething();
  doAnotherThing();
}`
      },
      {
        description: "with else if",
        code: `function doSomethingIfValid() {
  if (!isValid) {
    throw new Error("Oh no!");
  } else if (isCorrect) {
    doSomething();
  } else {
    doAnotherThing();
  }
}`,
        selection: Selection.cursorAt(2, 4),
        expected: `function doSomethingIfValid() {
  if (!isValid) {
    throw new Error("Oh no!");
  }
  if (isCorrect) {
    doSomething();
  } else {
    doAnotherThing();
  }
}`
      }
    ],
    async ({ code, selection, expected }) => {
      const result = await doRemoveRedundantElse(code, selection);

      expect(result).toBe(expected);
    }
  );

  it("should show an error message if selection has no redundant else", async () => {
    const code = `if (!isValid) {
  showWarning();
} else {
  doSomething();
  doAnotherThing();
}`;
    const selection = new Selection([0, 0], [5, 1]);

    await doRemoveRedundantElse(code, selection);

    expect(showErrorMessage).toBeCalledWith(
      ErrorReason.DidNotFoundRedundantElse
    );
  });

  async function doRemoveRedundantElse(
    code: Code,
    selection: Selection
  ): Promise<Code> {
    const [write, getState] = createWriteInMemory(code);
    await removeRedundantElse(code, selection, write, showErrorMessage);
    return getState().code;
  }
});

import { ErrorReason, Code } from "../../editor/editor";
import { InMemoryEditor } from "../../editor/adapters/in-memory-editor";
import { testEach } from "../../tests-helpers";
import * as t from "../../ast";

import { convertLetToConst, createVisitor } from "./convert-let-to-const";

describe("Convert let to const", () => {
  testEach<{ code: Code; expected: Code }>(
    "should convert let to const",
    [
      {
        description: "non-mutated variable, not declared in a block",
        code: `let [cursor]someVariable = 'value';`,
        expected: `const someVariable = 'value';`
      },
      {
        description: "non-mutated variable declared in a block",
        code: `{
  let s[cursor]omeVariable = 'value';
}`,
        expected: `{
  const someVariable = 'value';
}`
      },
      {
        description: "only the selected non-mutated variable",
        code: `let [cursor]someVariable = 'someValue';
let otherVariable = 'otherValue';`,
        expected: `const someVariable = 'someValue';
let otherVariable = 'otherValue';`
      },
      {
        description:
          "only the selected non-mutated variable, other one is mutated",
        code: `let [cursor]someVariable = 'someValue';
let otherVariable = 'otherValue';
otherVariable = 'newValue';`,
        expected: `const someVariable = 'someValue';
let otherVariable = 'otherValue';
otherVariable = 'newValue';`
      }
    ],
    async ({ code, expected }) => {
      const editor = new InMemoryEditor(code);

      await convertLetToConst(editor);

      expect(editor.code).toBe(expected);
    }
  );

  testEach<{ code: Code }>(
    "should not convert",
    [
      {
        description: "already a const",
        code: `const [cursor]someVariable = 'value';`
      },
      {
        description: "variable declared as var",
        code: `var [cursor]someVariable = 'value';`
      },
      {
        description: "mutated variable",
        code: `let [cursor]someVariable = 'value';
someVariable = 'anotherValue';`
      },
      {
        description: "mutated variable in a nested scope",
        code: `let [cursor]someVariable = 'value';
{
  someVariable = 'anotherValue';
}`
      },
      {
        description: "mutated variable in a block",
        code: `{
  let s[cursor]omeVariable = 'value';
  someVariable = 'anotherValue';
}`
      },
      {
        description: "multiple variables declared together",
        code: `let [cursor]someVariable, otherVariable = 'value';`
      },
      {
        description:
          "two variables declared together, first mutated, second not",
        code: `let someVariable, o[cursor]therVariable = 'value';
someVariable = 'anotherValue';`
      },
      {
        description:
          "two variables declared on same line, second mutated, first not",
        code: `let [cursor]someVariable, otherVariable = 'value';
otherVariable = 'anotherValue';`
      },
      {
        description: "multiple variables, one mutated, one not",
        code: `let [cursor]someVariable = 'someValue';
let otherVariable = 'otherValue';
someVariable = 'newValue';`
      }
    ],
    async ({ code }) => {
      const editor = new InMemoryEditor(code);
      const originalCode = editor.code;

      await convertLetToConst(editor);

      expect(editor.code).toBe(originalCode);
    }
  );

  it("should show an error message if refactoring can't be made", async () => {
    const code = `// This is a comment, can't be refactored`;
    const editor = new InMemoryEditor(code);
    jest.spyOn(editor, "showError");

    await convertLetToConst(editor);

    expect(editor.showError).toBeCalledWith(
      ErrorReason.DidNotFindLetToConvertToConst
    );
  });

  it("should not match a 'const' declaration", async () => {
    const editor = new InMemoryEditor(`const aVariable[cursor] = "value";`);

    await expectVisitorWontMatch(editor);
  });
});

async function expectVisitorWontMatch(editor: InMemoryEditor) {
  const isMatching = await isMatchingVisitor(editor.code, (onMatch) =>
    createVisitor(editor.selection, () => onMatch())
  );

  try {
    expect(isMatching).toBe(false);
  } catch (error) {
    throw new Error("Visitor matches given code but shouldn't");
  }
}

function isMatchingVisitor(
  code: Code,
  createVisitor: (onMatch: Function) => t.Visitor
): Promise<boolean> {
  const STOP_IDENTIFIER_NAME = "STOP_HERE";
  const codeWithStopIdentifier = `${code}
let ${STOP_IDENTIFIER_NAME};`;

  return new Promise<boolean>((resolve) => {
    const visitor = createVisitor(() => resolve(true));

    t.traverseAST(t.parse(codeWithStopIdentifier), {
      ...visitor,
      Identifier(path) {
        // Ensures that we will return if we have found nothing.
        // Assumes we traverse the AST from top to bottom.
        if (path.node.name === STOP_IDENTIFIER_NAME) {
          path.stop();
          resolve(false);
        }
      }
    });
  });
}

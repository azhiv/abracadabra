import { Editor, Code, ErrorReason } from "../../editor/editor";
import { Selection } from "../../editor/selection";
import { Position } from "../../editor/position";
import * as ast from "../../ast";

import { renameSymbol } from "../rename-symbol/rename-symbol";

export { extractVariable };

async function extractVariable(
  code: Code,
  selection: Selection,
  editor: Editor
) {
  const {
    occurrence,
    hasMultipleOccurrences,
    parseId,
    parseCode
  } = findExtractableCode(code, selection);
  const { path, loc } = occurrence;

  if (!path || !loc) {
    editor.showError(ErrorReason.DidNotFoundExtractableCode);
    return;
  }

  if (hasMultipleOccurrences) {
    await editor.askUser([]);
  }

  const variableName = "extracted";
  const extractedSelection = Selection.fromAST(loc);
  const indentation = " ".repeat(extractedSelection.getIndentationLevel(path));

  const cursorOnExtractedId = new Position(
    extractedSelection.start.line + extractedSelection.height + 1,
    extractedSelection.start.character + variableName.length
  );

  await editor.readThenWrite(
    extractedSelection,
    extractedCode => [
      // Insert new variable declaration.
      {
        code: `const ${variableName} = ${parseCode(
          extractedCode
        )};\n${indentation}`,
        selection: extractedSelection.putCursorAtScopeParentPosition(path)
      },
      // Replace extracted code with new variable.
      {
        code: parseId(variableName),
        selection: extractedSelection
      }
    ],
    cursorOnExtractedId
  );

  // Extracted symbol is located at `selection` => just trigger a rename.
  await renameSymbol(editor);
}

function findExtractableCode(
  code: Code,
  selection: Selection
): ExtractableCode {
  let result: ExtractableCode = {
    occurrence: {
      path: undefined,
      loc: undefined
    },
    parseId: id => id,
    parseCode: code => code,
    hasMultipleOccurrences: false
  };

  ast.traverseAST(code, {
    enter(path) {
      if (!isExtractableContext(path.parent)) return;

      if (isPartOfMemberExpression(path)) return;
      if (isClassPropertyIdentifier(path)) return;
      if (isVariableDeclarationIdentifier(path)) return;
      if (isFunctionCallIdentifier(path)) return;
      if (isJSXPartialElement(path)) return;
      if (ast.isTemplateElement(path)) return;
      if (ast.isBlockStatement(path)) return;
      if (ast.isSpreadElement(path)) return;
      // Don't extract object method because we don't handle `this`.
      if (ast.isObjectMethod(path)) return;

      const { node } = path;
      if (!selection.isInsideNode(node)) return;

      result.occurrence.path = path;
      result.occurrence.loc = ast.isObjectProperty(node)
        ? findObjectPropertyLoc(selection, node) || result.occurrence.loc
        : ast.isJSXExpressionContainer(node)
        ? node.expression.loc || result.occurrence.loc
        : node.loc;

      result.parseId =
        (ast.isJSXElement(node) || ast.isJSXText(node)) &&
        ast.isJSX(path.parent)
          ? id => `{${id}}`
          : id => id;

      result.parseCode = ast.isJSXText(node)
        ? code => `"${code}"`
        : code => code;
    }
  });

  const foundPath = result.occurrence.path;
  if (foundPath) {
    let occurrencesCount = 0;
    ast.traverseAST(code, {
      enter(path) {
        // TODO: extract as "areEqual(pathA, pathB)" in AST
        if (path.type !== foundPath.type) return;
        if (
          ast.isStringLiteral(path.node) &&
          ast.isStringLiteral(foundPath.node) &&
          path.node.value === foundPath.node.value
        ) {
          occurrencesCount += 1;
        }
      }
    });
    result.hasMultipleOccurrences = occurrencesCount > 1;
  }

  return result;
}

function findObjectPropertyLoc(
  selection: Selection,
  node: ast.SelectableObjectProperty
): ast.SourceLocation | null {
  if (selection.isInsideNode(node.value)) return node.value.loc;
  if (node.computed) return node.key.loc;

  // Non-computed properties can't be extracted.
  // It will extract the whole object instead.
  return null;
}

function isExtractableContext(node: ast.Node): boolean {
  return (
    (ast.isExpression(node) && !ast.isArrowFunctionExpression(node)) ||
    ast.isReturnStatement(node) ||
    ast.isVariableDeclarator(node) ||
    ast.isClassProperty(node) ||
    ast.isIfStatement(node) ||
    ast.isWhileStatement(node) ||
    ast.isSwitchCase(node)
  );
}

function isClassPropertyIdentifier(path: ast.NodePath): boolean {
  return (
    ast.isClassProperty(path.parent) &&
    !path.parent.computed &&
    ast.isIdentifier(path.node)
  );
}

function isVariableDeclarationIdentifier(path: ast.NodePath): boolean {
  return ast.isVariableDeclarator(path.parent) && ast.isIdentifier(path.node);
}

function isFunctionCallIdentifier(path: ast.NodePath): boolean {
  return ast.isCallExpression(path.parent) && path.parent.callee === path.node;
}

function isJSXPartialElement(path: ast.NodePath): boolean {
  return ast.isJSXOpeningElement(path) || ast.isJSXClosingElement(path);
}

function isPartOfMemberExpression(path: ast.NodePath): boolean {
  return ast.isIdentifier(path.node) && ast.isMemberExpression(path.parent);
}

type ExtractableCode = {
  occurrence: Occurrence;
  hasMultipleOccurrences: boolean;
  parseId: (id: Code) => Code;
  parseCode: (code: Code) => Code;
};

type Occurrence = {
  path: ast.NodePath | undefined;
  loc: ast.SourceLocation | undefined;
};

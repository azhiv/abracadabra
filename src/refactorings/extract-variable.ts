import { Code, WritableEditor } from "./i-write-updates";
import { DelegateToEditor } from "./i-delegate-to-editor";
import { ShowErrorMessage, ErrorReason } from "./i-show-error-message";
import { renameSymbol } from "./rename-symbol";
import { Selection } from "./selection";
import * as ast from "./ast";

export { extractVariable };

async function extractVariable(
  code: Code,
  selection: Selection,
  editor: WritableEditor,
  delegateToEditor: DelegateToEditor,
  showErrorMessage: ShowErrorMessage
) {
  let foundPath: ExtractablePath | undefined;
  let foundLoc: ast.SourceLocation | undefined;

  ast.traverseAST(code, {
    enter(path) {
      if (!isExtractablePath(path)) return;
      if (!selection.isInside(Selection.fromAST(path.node.loc))) return;

      foundPath = path;

      const node = path.node;
      if (!ast.isObjectProperty(node)) {
        foundLoc = node.loc;
        return;
      }

      if (
        isExtractableNode(node.value) &&
        selection.isInside(Selection.fromAST(node.value.loc))
      ) {
        // Node contains the object property key => extract the value only.
        // E.g. node is `foo: "bar"` / value is `"bar"`
        foundLoc = node.value.loc;
      }

      // Here, node is an object property which value is not in selection.
      // It means the property is selected. In this case, we extract the
      // object containing the property, not the property value.
      // The object to extract was matched before. Do nothing here.
    }
  });

  if (!foundPath || !foundLoc) {
    showErrorMessage(ErrorReason.DidNotFoundExtractedCode);
    return;
  }

  const variableName = "extracted";
  const extractedCodeSelection = Selection.fromAST(foundLoc);
  const indentation = " ".repeat(
    extractedCodeSelection.getIndentationLevel(foundPath)
  );
  const extractedCode = editor.read(extractedCodeSelection);

  await editor.write([
    // Insert new variable declaration.
    {
      code: `const ${variableName} = ${extractedCode};\n${indentation}`,
      selection: extractedCodeSelection.putCursorAtScopeParentPosition(
        foundPath
      )
    },
    // Replace extracted code with new variable.
    {
      code: variableName,
      selection: extractedCodeSelection
    }
  ]);

  // Extracted symbol is located at `selection` => just trigger a rename.
  await renameSymbol(delegateToEditor);
}

function isExtractablePath(path: ast.NodePath): path is ExtractablePath {
  return ast.isExpression(path.parent) && isExtractableNode(path.node);
}

function isExtractableNode(node: ast.Node): node is ExtractableNode {
  return !!node.loc;
}

type ExtractablePath = ast.NodePath<ExtractableNode>;

type ExtractableNode = ast.Node & { loc: ast.SourceLocation };

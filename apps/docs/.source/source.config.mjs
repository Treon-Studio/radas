// source.config.ts
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import remarkYoutube from "remark-youtube";

// app/components/mermaid/index.ts
import { visit } from "unist-util-visit";
var COMPONENT_NAME = "Mermaid";
var MERMAID_IMPORT_AST = {
  type: "mdxjsEsm",
  data: {
    estree: {
      body: [
        {
          type: "ImportDeclaration",
          specifiers: [
            {
              type: "ImportSpecifier",
              imported: { type: "Identifier", name: COMPONENT_NAME },
              local: { type: "Identifier", name: COMPONENT_NAME }
            }
          ],
          source: { type: "Literal", value: "@/components/mermaid/Mermaid" }
        }
      ]
    }
  }
};
var remarkMermaid = () => (ast, _file, done) => {
  const codeblocks = [];
  visit(ast, { type: "code", lang: "mermaid" }, (node, index, parent) => {
    codeblocks.push([node, index, parent]);
  });
  if (codeblocks.length !== 0) {
    for (const [node, index, parent] of codeblocks) {
      parent.children.splice(index, 1, {
        type: "mdxJsxFlowElement",
        name: COMPONENT_NAME,
        attributes: [
          {
            type: "mdxJsxAttribute",
            name: "chart",
            value: node.value.replaceAll("\n", "\\n")
          }
        ]
      });
    }
    ast.children.unshift(MERMAID_IMPORT_AST);
  }
  done();
};

// source.config.ts
import { remarkHeading, remarkImage, remarkStructure, rehypeCode } from "fumadocs-core/mdx-plugins";
var { docs, meta } = defineDocs({
  docs: {}
});
var source_config_default = defineConfig({
  lastModifiedTime: "git",
  mdxOptions: {
    rehypeCodeOptions: {
      inline: "tailing-curly-colon",
      themes: {
        light: "catppuccin-latte",
        dark: "catppuccin-mocha"
      }
    },
    remarkPlugins: [remarkHeading, remarkImage, remarkStructure, remarkYoutube, remarkMermaid],
    rehypePlugins: (v) => [rehypeCode, ...v]
  }
});
export {
  source_config_default as default,
  docs,
  meta
};

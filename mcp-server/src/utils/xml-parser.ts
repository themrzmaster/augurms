import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { readFile, writeFile } from "fs/promises";

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name: string) => name === "imgdir" || name === "int" || name === "string" || name === "float" || name === "canvas" || name === "vector" || name === "extended",
  preserveOrder: true,
};

const builderOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  format: true,
  suppressEmptyNode: true,
};

export async function parseXmlFile(filePath: string): Promise<any> {
  const content = await readFile(filePath, "utf-8");
  const parser = new XMLParser(parserOptions);
  return parser.parse(content);
}

export async function writeXmlFile(filePath: string, data: any): Promise<void> {
  const builder = new XMLBuilder(builderOptions);
  const xml = builder.build(data);
  await writeFile(filePath, xml, "utf-8");
}

export function findAttribute(node: any, attrName: string): string | undefined {
  if (!node) return undefined;
  const children = Array.isArray(node) ? node : [node];
  for (const child of children) {
    for (const key of Object.keys(child)) {
      const items = Array.isArray(child[key]) ? child[key] : [child[key]];
      for (const item of items) {
        if (item?.[":@"]?.["@_name"] === attrName) {
          return item[":@"]?.["@_value"];
        }
      }
    }
  }
  return undefined;
}

import SwaggerParser from '@apidevtools/swagger-parser';
import fs from 'fs';
import minimist from 'minimist';
import path from 'path';
import util from 'util';

import { OpenAPI } from "openapi-types";

interface Stats {
  origOps?: number;
  origModels?: number;
  slimOps?: number;
  slimModels?: number;
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

class Helper {
  private readonly stats: Stats = { };

  constructor(
    private readonly doc: OpenAPI.Document,
  ) { }

  getOperationIds(includeTags: boolean = false): Array<string> {
    let operationIds: Array<string> = new Array();
    const paths = Object.values(this.doc.paths ?? {});
    paths.forEach(p => {
      const path: any = p ?? {};
      Object.values(path).forEach((method: any) => {
        const operationId = method?.operationId as string;
        if (!!operationId) {
          if (includeTags) {
            const tags: Array<string> = method?.tags ?? new Array();
            tags.forEach(t => operationIds.push(t + '.' + operationId));
          } else {
            operationIds.push(operationId);
          }
        }
      });
    });
  
    operationIds = operationIds.sort((a, b) => a.localeCompare(b));
    return operationIds;
  }

  getModelIdsByOperationId(operationId: string): Array<string> {
    return this.getOperationRefs(operationId)
      .map(ref => this.getModelId(ref))
      .filter((id): id is string => isDefined(id));
  }

  filterSpec(operationsList: Array<string>, modelsList: Array<string>, invert: boolean) {
    if (!operationsList?.length) {
      console.log("Empty operations list file")
      return;
    }

    // if invert == true, convert the blacklist to a whitelist
    let whitelistOps = invert ? this.getOperationIds().filter(o => !operationsList.includes(o)) : [...operationsList];

    this.updateStats(false);
    this.filterOperations(whitelistOps);
    this.filterModels(whitelistOps, modelsList, invert);
    this.updateStats(true);
  }

  toJson(): string {
    return JSON.stringify(this.doc, undefined, 2);
  }

  getResults(outputFile: string): string {
    let builder = 'Results:';
    builder += '\n  Original: ' + (this.stats.origOps ?? 0) + ' operations; ' + (this.stats.origModels ?? 0) + ' models';
    builder += '\n  Slimmed:  ' + (this.stats.slimOps ?? 0) + ' operations; ' + (this.stats.slimModels ?? 0) + ' models';
    builder += '\n\nSlimmed swagger spec saved to: ' + outputFile;
    return builder
  }

  private updateStats(slimmed: boolean) {
    const opIds = this.getOperationIds();
    const modelIds = this.getModelIds();
    if (slimmed) {
      this.stats.slimOps = opIds.length;
      this.stats.slimModels = modelIds.length;
    } else {
      this.stats.origOps = opIds.length;
      this.stats.origModels = modelIds.length;
    }
  }

  private getModelIds(): Array<string> {
    const doc = this.doc as any;
    const models = doc.definitions ?? doc.components.schemas ?? {};
    const keys = Object.keys(models);
    return keys;
  }

  private getOperationById(id: string): any {
    const paths = Object.values(this.doc.paths ?? {});
    for (const element of paths) {
      const props = Object.values(element);
      for (const element of props) {
        const prop = element as any;
        if (prop?.operationId === id) {
          return prop;
        }
      }
    }
    return null;
  }

  private getOperationRefs(id: string, refs: Array<string> = new Array()): Array<string> {
    const op = this.getOperationById(id);
    return this.getItemRefs(op, refs);
  }
  
  private getItemRefs(item: any, refs: Array<string> = new Array()): Array<string> {
    if (!item || item !== Object(item)) return refs;
    if (Array.isArray(item)) item.forEach(i => this.getItemRefs(i, refs));
    else {
      const ref = item['$ref'];
      if (!!ref && !refs.includes(ref)) {
        const model = this.getModel(ref);
        if (!!model) {
          refs.push(ref);
          // get additional model refs from the definition, if present
          this.getItemRefs(model, refs);
        }
      }
      Object.values(item).forEach(v => this.getItemRefs(v, refs));
    }
    return refs;
  }

  private getModel(ref: string): any {
    const doc = this.doc as any;
    const models = doc.definitions ?? doc.components.schemas;
    const modelId = this.getModelId(ref);
    if (!models || !modelId) return null;
    return models[modelId];
  }

  private getModelId(ref: string): string | null {
    if (!ref?.startsWith('#/')) return ref;
    const splits = ref.split('/');
    return splits[splits.length - 1];
  }

  private filterOperations(whitelistOps: Array<string>) {
    const paths = this.doc.paths as any;
    const pathsKeys = Object.keys(paths);
    pathsKeys.forEach(key => {
      const path = paths[key];
      const opsKeys = Object.keys(path);
      for (const op of opsKeys) {
        const operationId = path[op]?.operationId as string;
        if (!operationId) continue;

        // remove operations that ARE NOT in the whitelist
        if (!whitelistOps.includes(operationId)) {
          delete path[op];
        }
      }

      // recheck and remove any empty paths
      if (Object.keys(path).length === 0) {
        delete paths[key];
      }
    });
  }

  private filterModels(whitelistOps: Array<string>, modelsList: Array<string>, invert: boolean) {
    const modelRefs: Array<string> = new Array();
    whitelistOps.forEach(id => this.getOperationRefs(id, modelRefs));
    const doc = this.doc as any;
    const models = doc.definitions ?? doc.components.schemas ?? {};
    // get all the models that are dependencies of our whitelisted operations
    let whitelistModels = modelRefs.map(r => this.getModelId(r) ?? '');
    // handle any additionally specified models (add or subtract, depending on invert = true/false)
    whitelistModels = invert
      ? whitelistModels.filter(m => !modelsList.includes(m))
      : whitelistModels.concat(modelsList);
    const keys = Object.keys(models);
    keys.forEach(key => {
      // remove model definitions that ARE NOT in the whitelist
      if (!whitelistModels.includes(key)) {
        delete models[key];
      }
    });
  }
}

async function main(args: Array<string>): Promise<number> {
  // parse the command line options
  const argv = minimist(args, { string: ['s', 'w', 'o'], });

  // parse the document
  const sourceFile = argv['s'] ?? '';
  const sourceDir = sourceFile.startsWith('http') ? '.' : path.dirname(sourceFile);
  let outputFile: string = argv['o'] ?? sourceDir + path.sep;
  const operationsFile: string = argv['w'];
  const modelsFile: string = argv['models'];
  const listOnly: boolean = argv['list'] ?? argv['list-all'];
  const listModels: boolean = argv['list-all'];
  const invert: boolean = argv['invert'];
  if (outputFile.endsWith(path.sep)) outputFile += 'slim-swagger.json'
  if (!sourceFile) {
    usage();
  } else {
    const parser = new SwaggerParser();
    const bundle = await parser.bundle(sourceFile);
    const helper = new Helper(bundle);
    if (listOnly || !operationsFile) {
      const ids = helper.getOperationIds();
      ids.forEach(id => {
        console.log(id);
        if (listModels) {
          console.group();
          const modelIds = helper.getModelIdsByOperationId(id);
          modelIds.forEach(modelId => {
            console.log(modelId);
          });
          console.groupEnd();
        }
      });
      return Promise.resolve(0);
    }

    return await slim(helper, outputFile, operationsFile, modelsFile, invert);
  }
}

function usage(exitCode = 0): never {
  console.log(`
SlimSwagger: a utility to slim down an existing swagger spec to a specific list of operations and model dependencies

Usage:
  To list all available operationId values in a given spec:
  node ./slim-swagger.js -s ./my-swagger-spec.json --list

  To list all available operationId AND modelId values in a given spec:
  node ./slim-swagger.js -s ./my-swagger-spec.json --list-all

  To generate a slimmed-down spec with only the specified operations + dependencies:
  node ./slim-swagger.js -s https://petstore.swagger.io/v2/swagger.json -w ./whitelist-petstore-operations.txt -o ./slim.json

Options:
  -s <path>    (required) the path to the source file to be slimmed (can be a filesystem path or a URL)
  -w <path>    (required for slimming) the path to a file containing a list of allowed operationId values (1 per line)
  -o <path>    (optional) the path for the output file (default: source directory + 'slim-swagger.json')
  --models <path> (optional) the path to a file containing a list of _additional_ allowed modelId values (for models that are not dependencies of allowed operations)
  --invert     (optional) turns the operations/models "whitelist" into a "blacklist" (disallowed values to be removed)
  --list       (optional) outputs a list of all available operationId values from the source file (default if no allowed list is given)
  --list-all   (optional) same as --list, but output includes modelId values
  `);

  process.exit(exitCode);
}

async function slim(helper: Helper, outputFile: string, operationsFile: string, modelsFile: string, invert: boolean): Promise<number> {
  let operationsContents: string = '';
  let modelsContents: string = '';
  try {
    const readFile = util.promisify(fs.readFile);
    operationsContents = (await readFile(operationsFile)).toString().trim();
    if (!operationsContents?.length) throw new Error("Empty operations list file: " + operationsFile);
    if (modelsFile) {
      modelsContents = (await readFile(modelsFile)).toString().trim();
      if (!modelsContents?.length) throw new Error("Empty models list file: " + modelsFile);
    }
  } catch (err) {
    console.error(err);
    return Promise.resolve(-1);
  }
  const operationsList = operationsContents.split('\n').map(l => l.trim()).filter(l => !!l.length);
  const modelsList = modelsContents.split('\n').map(l => l.trim()).filter(l => !!l.length);
  helper.filterSpec(operationsList, modelsList, invert);
  const json = helper.toJson();
  try {
    const writeFile = util.promisify(fs.writeFile);
    await writeFile(outputFile, json);
    console.log(helper.getResults(outputFile));
  } catch (err) {
    console.error(err);
    return Promise.resolve(-1);
  }
  
  return Promise.resolve(0);
}

main(process.argv.slice(2))
  .then(code => {
    process.exit(code);
  }, err => {
    console.error('Error: ' + (err.stack ?? err.message ?? err));
    process.exit(-1);
  });

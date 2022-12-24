SlimSwagger
============================
SlimSwagger is a utility to slim down an existing swagger spec to a specific list of operations. Given a swagger spec and a whitelist of `operationId`'s, it will parse the spec and remove any operations not in the whitelist. It also removes any models that are not used in the whitelisted operations. Finally, it saves the slimmed-down spec to an output file.


Features
--------------------------
- Parses Swagger specs in **JSON** or **YAML** format
- Accepts the [Swagger 2.0 schema](https://github.com/OAI/OpenAPI-Specification/blob/master/schemas/v2.0/schema.json) or [OpenAPI 3.0 Schema](https://github.com/OAI/OpenAPI-Specification/blob/master/schemas/v3.0/schema.json)
- Can parse local files from a filesystem path OR files on the web from a URL 


Building
--------------------------
To rebuild from source, from project root folder:

```bash
npm run build
```

The resulting `./dist/slim-swagger.js` can be executed using [node](https://nodejs.org/en/) as show above in the **Usage** section.


Usage
--------------------------
To list all available `operationId`'s in a given spec:
```bash
node ./slim-swagger.js -s ./my-swagger-spec.json --list
```

To slim down a spec to the whitelisted operations:
```bash
node ./slim-swagger.js -s https://petstore.swagger.io/v2/swagger.json -w ./whitelist-petstore.txt -o ./slim.json
```


Options
--------------------------
```text
-s <path>    (required) the path to the source file to be slimmed (can be a filesystem path or a URL)
-w <path>    (required) the path to a file containing a whitelist of allowed operationId values (1 per line)
-o <path>    (optional) the path for the output file (default: source directory + 'slim-swagger.json')
--list       (optional) outputs a list of all available operationId values from the source file (default if no allowed list is given)
```


Whitelist Example
--------------------------
Below is an example of the contents of a whitelist file for the [petstore](https://petstore.swagger.io/v2/swagger.json) spec containing only a subset of the available operations in the spec. One `operationId` per line.
```text
addPet
deletePet
findPetsByStatus
findPetsByTags
getPetById
updatePet
updatePetWithForm
uploadFile
```

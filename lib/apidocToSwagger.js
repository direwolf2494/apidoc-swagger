var _ = require('lodash');
var pathToRegexp = require('path-to-regexp').pathToRegexp;

var swagger = {
	swagger		: "2.0",
	info		: {},
	host		: undefined,
	basePath	: undefined,
	schemes		: undefined,
	paths		: {},
	definitions	: {}
};

/**
 * Converts Parsed apidocs spec into a swagger spec json object.
 * @param {parsed apidocs spec in json format} apidocJson 
 * @param {parsed project files in json format} projectJson 
 */
function toSwagger(apidocJson, projectJson, options) {
	var setDefaultResponse = options.defaultResponse;
	delete(options.defaultResponse)
	// add addition attributes to swagger output
	swagger.info = addInfo(projectJson);
	swagger = _.defaults(swagger, options)
	// convert apidocs spec to swagger spec
	swagger.paths = extractPaths(apidocJson, setDefaultResponse);
	
	return swagger;
}

var tagsRegex = /(<([^>]+)>)|(\r\n|\n|\r)/ig;
// Removes <p> </p> tags from text
function removeTags(text) {
	return text ? text.replace(tagsRegex, "") : text;
}

function addInfo(projectJson) {
	var info = {};
	info["title"] = projectJson.title || projectJson.name;
	info["version"] = projectJson.version;
	info["description"] = projectJson.description;
	return info;
}

/**
 * Extracts paths provided in json format
 * post, patch, put request parameters are extracted in body
 * get and delete are extracted to path parameters
 * @param apidocJson
 * @returns {{}}
 */
function extractPaths(apidocJson, defaultResponse){
	var apiPaths = groupByUrl(apidocJson);
	var paths = {};
	for (var i = 0; i < apiPaths.length; i++) {
		var verbs = apiPaths[i].verbs;
		var url = _.trimEnd(verbs[0].url, '/');
		var pattern = pathToRegexp(url, null);
		var matches = pattern.exec(url);

		// Surrounds URL parameters with curly brackets -> :email with {email}
		var pathKeys = [];
		for (var j = 1; j < matches.length; j++) {
			var key = matches[j].substr(1);
			url = url.replace(matches[j], "{"+ key +"}");
			pathKeys.push(key);
		}
		for(var j = 0; j < verbs.length; j++) {
			var verb = verbs[j];
			var type = verb.type;

			var obj = paths[url] = paths[url] || {};
			if (type == 'post' || type == 'patch' || type == 'put') {
				_.extend(obj, createPostPushPutOutput(verb, swagger.definitions, pathKeys, defaultResponse));
			} else {
				_.extend(obj, createGetDeleteOutput(verb, swagger.definitions, defaultResponse));
			}
		}
	}
	return paths;
}

function createPostPushPutOutput(verbs, definitions, pathKeys, defaultResponse) {
	var pathItemObject = {};
	var verbDefinitionResult = createVerbDefinitions(verbs, definitions);
	
	var params = [];
	// extract any header parameters
	var headerParams = createHeaderParameters(verbs);
	params = params.concat(headerParams);
	// extract any path parameters
	var pathParams = createPathParameters(verbs, pathKeys);
	pathParams = _.filter(pathParams, function(param) {
		var hasKey = pathKeys.indexOf(param.name) !== -1;
		return !((param.in === "path" || params.in === "query") && !hasKey)
	});
	params = params.concat(pathParams);

	var bodyRequired = verbs.parameter && verbs.parameter.fields && 
					verbs.parameter.fields.body && verbs.parameter.fields.body.length > 0;
	
	if (bodyRequired) {
		params.push({
			"in": "body",
			"name": "body",
			"description": removeTags(verbs.description),
			"required": bodyRequired,
			"schema": {
				"$ref": "#/definitions/" + verbDefinitionResult.topLevelParametersRef
			}
		});
	}

	pathItemObject[verbs.type] = {
		tags: [verbs.group],
		summary: removeTags(verbs.description),
		consumes: [
			"application/json"
		],
		produces: [
			"application/json"
		],
		parameters: params,
		responses: generateResponse(verbDefinitionResult.topLevelSuccessRef,
			verbDefinitionResult.topLevelSuccessRefType, defaultResponse)
	}

	return pathItemObject;
}

function createVerbDefinitions(verbs, definitions) {
	var result = {
		topLevelParametersRef : null,
		topLevelSuccessRef : null,
		topLevelSuccessRefType : null
	};
	var defaultObjectName = verbs.name;

	var fieldArrayResult = {};
	// create definitions for request body
	if (verbs && verbs.parameter && verbs.parameter.fields) {
		fieldArrayResult = createFieldArrayDefinitions(verbs.parameter.fields.body, definitions, verbs.name, defaultObjectName);		
		result.topLevelParametersRef = fieldArrayResult.topLevelRef;
	};
	// create definitions for success responses
	if (verbs && verbs.success && verbs.success.fields) {
		defaultObjectName = verbs.name + "Success";
		fieldArrayResult = createFieldArrayDefinitions(verbs.success.fields["Success 200"], definitions, verbs.name, defaultObjectName);		
		result.topLevelSuccessRef = fieldArrayResult.topLevelRef;
		result.topLevelSuccessRefType = fieldArrayResult.topLevelRefType;
	};

	return result;
}

function createFieldArrayDefinitions(fieldArray, definitions, topLevelRef, defaultObjectName) {
	var result = {
		topLevelRef : topLevelRef,
		topLevelRefType : "Object"
	}

	if (!fieldArray) {
		return result;
	}

	for (var i = 0; i < fieldArray.length; i++) {
		var parameter = fieldArray[i];

		var nestedName = createNestedName(parameter.field);
		var objectName = nestedName.objectName;
		// not an attribute of an object
		if (!objectName) {
			objectName = defaultObjectName;
			if (parameter.type === "Object" || parameter.type === "Object[]") {
				objectName = nestedName.propertyName;
				nestedName.propertyName = null;
			}
		}
		
		var type = parameter.type;
		createNestedDefinitions(parameter.type, definitions, objectName, topLevelRef);

		definitions[objectName] = definitions[objectName] ||
			{ properties : {}, required : [], title: objectName };

		if (nestedName.propertyName) {
			var prop = { type: (parameter.type || "").toLowerCase(), description: removeTags(parameter.description) };
			if(parameter.type == "Object") {
				prop.$ref = "#/definitions/" + parameter.field;
			}

			var typeIndex = type.indexOf("[]");
			if(typeIndex !== -1 && typeIndex === (type.length - 2)) {
				prop.type = "array";
				prop.items = {
					type: type.slice(0, type.length-2).toLowerCase()
				};
			}

			definitions[objectName]['properties'][nestedName.propertyName] = prop;
			if (!parameter.optional) {
				var arr = definitions[objectName]['required'];
				if(arr.indexOf(nestedName.propertyName) === -1) {
					arr.push(nestedName.propertyName);
				}
			};

		};
	}

	return result;
}

function createNestedName(field) {
	var propertyName = field;
	var objectName;
	var propertyNames = field.split(".");
	if(propertyNames && propertyNames.length > 1) {
		propertyName = propertyNames[propertyNames.length-1];
		propertyNames.pop();
		objectName = propertyNames.join(".");
	}

	return {
		propertyName: propertyName,
		objectName: objectName
	}
}

function createNestedDefinitions(type, definitions, field, topLevelRef) {
	var objectSchema = { $ref: `#/definitions/${field}` };
	var arraySchema = { type: "array", items: objectSchema };
	
	var schema = type === "Object[]" ? arraySchema : (type === "Object") ? objectSchema : null;

	if (schema) {
		if (definitions[topLevelRef]) {
			definitions[topLevelRef]['properties'][field] = schema;
			definitions[topLevelRef]['required'].push(field);
		} else {
			definitions[topLevelRef] = { properties: { [field]: schema }, required : [field]};
		}
	}
}

/**
 * Generate get, delete method output
 * @param verbs
 * @returns {{}}
 */
function createGetDeleteOutput(verbs, definitions, defaultResponse) {
	var pathItemObject = {};
	verbs.type = verbs.type === "del" ? "delete" : verbs.type;

	var verbDefinitionResult = createVerbDefinitions(verbs,definitions);
	pathItemObject[verbs.type] = {
		tags: [verbs.group],
		summary: removeTags(verbs.description),
		consumes: [
			"application/json"
		],
		produces: [
			"application/json"
		],
		parameters: createPathParameters(verbs).concat(createHeaderParameters(verbs)),
		responses: generateResponse(verbDefinitionResult.topLevelSuccessRef, 
			verbDefinitionResult.topLevelSuccessRefType, defaultResponse)
	}

	return pathItemObject;
}

function generateResponse(successRef, successRefType, defaultResponse) {
	// default empty response
	var response = {
		200: {
			description: "successful operation",
			headers: {}
		}
	};
	// apidocs parsed response
	if (!defaultResponse && successRef) {
		response = {
			"200": {
			  "description": "successful operation",
			  "schema": {
				"type": successRefType,
				"items": {
				  "$ref": "#/definitions/" + successRef
				}
			  }
			}
		}; 
	}

	return response;
}

/**
 * Iterate through all method parameters and create array of parameter objects which are stored as path parameters
 * @param verbs
 * @returns {Array}
 */
function createPathParameters(verbs) {
	const pathParams = (verbs.parameter && verbs.parameter.fields && verbs.parameter.fields.url) ?
		createParameters(verbs.parameter.fields.url) : [];

	const queryParams = (verbs.parameter && verbs.parameter.fields && verbs.parameter.fields.query) ?
		createParameters(verbs.parameter.fields.query) : [];

	const fileParams = (verbs.parameter && verbs.parameter.fields && verbs.parameter.fields.file) ?
		createParameters(verbs.parameter.fields.file) : [];

	return pathParams.concat(queryParams).concat(fileParams);
}

/**
 * Extracts header arguments that are associated with a request.
 * @param verbs 
 */

 function createHeaderParameters(verbs) {
	return (verbs.header && verbs.header.fields && verbs.header.fields.Header) ?
		createParameters(verbs.header.fields.Header) : [];
 }

function createParameters(parameters) {
	var parsedParams = [];

	for (var i = 0; i < parameters.length; i++) {
		var param = parameters[i];
		parsedParams.push({
			name: param.field,
			in: param.group === "url" ? "path" : param.group.toLowerCase(),
			required: !param.optional,
			type: param.type.toLowerCase(),
			description: removeTags(param.description)
		});
	}

	return parsedParams;
 }

function groupByUrl(apidocJson) {
	return _.chain(apidocJson)
		.groupBy("url")
		.toPairs()
		.map(function (element) {
			return _.zipObject(["url", "verbs"], element);
		})
		.value();
}

module.exports = {
	toSwagger: toSwagger
};
const HTTP = require("./httpHandler");
const { JSDOM } = require("jsdom");
const API2 = require("./api2.js");
const Helpers = require("./helpers");
const fs = require("fs");
const wgxpath = require('wgxpath');

class API3 extends API2 {
	static schemaVersion;

	static apiVersion = 3;

	static apiKey = this.config.apiKey;

	static useAPIKey(key) {
		this.apiKey = key;
	}

	static async get(url, headers = {}, auth = false) {
		url = this.config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}
		if (this.schemaVersion) {
			headers["Zotero-Schema-Version"] = this.schemaVersion;
		}
		if (!auth && this.apiKey) {
			headers.Authorization = "Bearer " + this.apiKey;
		}
		let response = await HTTP.get(url, headers, auth);
		if (this.config.verbose >= 2) {
			console.log("\n\n" + response.data + "\n");
		}
		return response;
	}

	static async userGet(userID, suffix, headers = {}, auth = null) {
		return this.get(`users/${userID}/${suffix}`, headers, auth);
	}

	static async head(url, headers = {}, auth = false) {
		url = this.config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}
		if (this.schemaVersion) {
			headers["Zotero-Schema-Version"] = this.schemaVersion;
		}
		if (!auth && this.apiKey) {
			headers.Authorization = "Bearer " + this.apiKey;
		}
		let response = await HTTP.head(url, headers, auth);
		if (this.config.verbose >= 2) {
			console.log("\n\n" + response.data + "\n");
		}
		return response;
	}

	static async userHead(userID, suffix, headers = {}, auth = null) {
		return this.head(`users/${userID}/${suffix}`, headers, auth);
	}
	
	static useSchemaVersion(version) {
		this.schemaVersion = version;
	}

	static async resetSchemaVersion() {
		const schema = JSON.parse(fs.readFileSync("../../htdocs/zotero-schema/schema.json"));
		this.schemaVersion = schema;
	}


	static async delete(url, headers = {}, auth = false) {
		url = this.config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}
		if (this.schemaVersion) {
			headers["Zotero-Schema-Version"] = this.schemaVersion;
		}
		if (!auth && this.apiKey) {
			headers.Authorization = "Bearer " + this.apiKey;
		}
		let response = await HTTP.delete(url, headers, auth);
		return response;
	}

	static async post(url, data, headers = {}, auth = false) {
		url = this.config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}
		if (this.schemaVersion) {
			headers["Zotero-Schema-Version"] = this.schemaVersion;
		}
		if (!auth && this.apiKey) {
			headers.Authorization = "Bearer " + this.apiKey;
		}
		let response = await HTTP.post(url, data, headers, auth);
		return response;
	}


	static async superGet(url, headers = {}) {
		return this.get(url, headers, {
			username: this.config.rootUsername,
			password: this.config.rootPassword
		});
	}


	static async superPost(url, data, headers = {}) {
		return this.post(url, data, headers, {
			username: this.config.rootUsername,
			password: this.config.rootPassword
		});
	}

	static async superDelete(url, headers = {}) {
		return this.delete(url, headers, {
			username: this.config.rootUsername,
			password: this.config.rootPassword
		});
	}

	static async createGroup(fields, returnFormat = 'id') {
		const xmlDoc = new JSDOM("<group></group>");
		const groupXML = xmlDoc.window.document.getElementsByTagName("group")[0];
		groupXML.setAttributeNS(null, "owner", fields.owner);
		groupXML.setAttributeNS(null, "name", fields.name || "Test Group " + Math.random().toString(36).substring(2, 15));
		groupXML.setAttributeNS(null, "type", fields.type);
		groupXML.setAttributeNS(null, "libraryEditing", fields.libraryEditing || 'members');
		groupXML.setAttributeNS(null, "libraryReading", fields.libraryReading || 'members');
		groupXML.setAttributeNS(null, "fileEditing", fields.fileEditing || 'none');
		groupXML.setAttributeNS(null, "description", "");
		groupXML.setAttributeNS(null, "url", "");
		groupXML.setAttributeNS(null, "hasImage", false);


		let response = await this.superPost(
			"groups",
			xmlDoc.window.document.getElementsByTagName("body")[0].innerHTML
		);
		if (response.status != 201) {
			console.log(response.data);
			throw new Error("Unexpected response code " + response.status);
		}

		let url = response.headers.location[0];
		let groupID = parseInt(url.match(/\d+$/)[0]);

		// Add members
		if (fields.members && fields.members.length) {
			let xml = '';
			for (let member of fields.members) {
				xml += '<user id="' + member + '" role="member"/>';
			}
			let usersResponse = await this.superPost(`groups/${groupID}/users`, xml);
			if (usersResponse.status != 200) {
				console.log(usersResponse.data);
				throw new Error("Unexpected response code " + usersResponse.status);
			}
		}

		if (returnFormat == 'response') {
			return response;
		}
		if (returnFormat == 'id') {
			return groupID;
		}
		throw new Error(`Unknown response format '${returnFormat}'`);
	}

	static async deleteGroup(groupID) {
		let response = await this.superDelete(
			`groups/${groupID}`
		);
		if (response.status != 204) {
			console.log(response.data);
			throw new Error("Unexpected response code " + response.status);
		}
	}

	static getSearchXML = async (keys, context = null) => {
		return this.getObject('search', keys, context, 'atom');
	};

	static async getContentFromAtomResponse(response, type = null) {
		let xml = this.getXMLFromResponse(response);
		let content = Helpers.xpathEval(xml, '//atom:entry/atom:content', true);
		if (!content) {
			console.log(content.documentElement.outerHTML);
			throw new Error("Atom response does not contain <content>");
		}
		let subcontent = Helpers.xpathEval(xml, '//atom:entry/atom:content/zapi:subcontent', true, true);
		if (subcontent) {
			if (!type) {
				throw new Error('$type not provided for multi-content response');
			}
			let component;
			switch (type) {
				case 'json':
					component = subcontent.filter(node => node.getAttribute('zapi:type') == 'json')[0];
					return JSON.parse(component.innerHTML);

				case 'html':
					component = subcontent.filter(node => node.getAttribute('zapi:type') == 'html')[0];
					return component;

				default:
					throw new Error("Unknown data type '$type'");
			}
		}
		else {
			throw new Error("Unimplemented");
		}
	}

	static async groupCreateItem(groupID, itemType, data = [], context = null, returnFormat = 'responseJSON') {
		let response = await this.get(`items/new?itemType=${itemType}`);
		let json = JSON.parse(await response.data);

		if (data) {
			for (let field in data) {
				json[field] = data[field];
			}
		}

		response = await this.groupPost(
			groupID,
			`items?key=${this.apiKey}`,
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);
		return this.handleCreateResponse('item', response, returnFormat, context, groupID);
	}

	static async resetKey(key) {
		let response;
		response = await this.get(
			`keys/${key}`,
			[],
			{
				username: `${this.config.rootUsername}`,
				password: `${this.config.rootPassword}`
			}
		);
		if (response.status != 200) {
			console.log(response.data);
			throw new Error(`GET returned ${response.status}`);
		}
		let json = this.getJSONFromResponse(response, true);


		const resetLibrary = (lib) => {
			for (const [permission, _] of Object.entries(lib)) {
				lib[permission] = false;
			}
		};
		if (json.access.user) {
			resetLibrary(json.access.user);
		}
		delete json.access.groups;
		response = await this.put(
			`users/${this.config.userID}/keys/${this.apiKey}`,
			JSON.stringify(json),
			[],
			{
				username: `${this.config.rootUsername}`,
				password: `${this.config.rootPassword}`
			}
		);
		if (response.status != 200) {
			console.log(response.data);
			throw new Error(`PUT returned ${response.status}`);
		}
	}

	static getItemXML = async (keys, context = null) => {
		return this.getObject('item', keys, context, 'atom');
	};

	static async parseLinkHeader(response) {
		let header = response.headers.link;
		let links = {};
		header.forEach(function (val) {
			let matches = val.match(/<([^>]+)>; rel="([^"]+)"/);
			links[matches[2]] = matches[1];
		});
		return links;
	}

	static async getItem(keys, context = null, format = false, groupID = false) {
		const mainObject = this || context;
		return mainObject.getObject('item', keys, context, format, groupID);
	}

	static async createAttachmentItem(linkMode, data = [], parentKey = false, context = false, returnFormat = 'responseJSON') {
		let response = await this.get(`items/new?itemType=attachment&linkMode=${linkMode}`);
		let json = JSON.parse(response.data);

		for (let key in data) {
			json[key] = data[key];
		}

		if (parentKey) {
			json.parentItem = parentKey;
		}

		response = await this.userPost(
			this.config.userID,
			`items?key=${this.apiKey}`,
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);

		return this.handleCreateResponse('item', response, returnFormat, context);
	}

	static async getItemResponse(keys, context = null, format = false, groupID = false) {
		const mainObject = this || context;
		return mainObject.getObjectResponse('item', keys, context, format, groupID);
	}

	static async postObjects(objectType, json) {
		let objectTypPlural = this.getPluralObjectType(objectType);
		return this.userPost(
			this.config.userID,
			objectTypPlural,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);
	}

	static getXMLFromFirstSuccessItem = async (response) => {
		let key = await this.getFirstSuccessKeyFromResponse(response);
		await this.getItemXML(key);
	};


	static async getCollection(keys, context = null, format = false, groupID = false) {
		const module = this || context;
		return module.getObject("collection", keys, context, format, groupID);
	}

	static async patch(url, data, headers = {}, auth = false) {
		let apiUrl = this.config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}
		if (this.schemaVersion) {
			headers["Zotero-Schema-Version"] = this.schemaVersion;
		}
		if (!auth && this.apiKey) {
			headers.Authorization = "Bearer " + this.apiKey;
		}
		let response = await HTTP.patch(apiUrl, data, headers, auth);
		return response;
	}

	static createDataObject = async (objectType, data = false, context = false, format = 'json') => {
		let template = await this.createUnsavedDataObject(objectType);
		if (data) {
			for (let key in data) {
				template[key] = data[key];
			}
		}
		data = template;
		let response;
		switch (objectType) {
			case 'collection':
				return this.createCollection("Test", data, context, format);

			case 'item':
				return this.createItem("book", data, context, format);

			case 'search':
				response = await this.postObjects(objectType, [data]);
				return this.handleCreateResponse('search', response, format, context);
		}
		return null;
	};

	static async put(url, data, headers = {}, auth = false) {
		url = this.config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}
		if (this.schemaVersion) {
			headers["Zotero-Schema-Version"] = this.schemaVersion;
		}
		if (!auth && this.apiKey) {
			headers.Authorization = "Bearer " + this.apiKey;
		}
		let response = await HTTP.put(url, data, headers, auth);
		return response;
	}

	static userPut = async (userID, suffix, data, headers = {}, auth = false) => {
		return this.put(`users/${userID}/${suffix}`, data, headers, auth);
	};

	static userPatch = async (userID, suffix, data, headers = {}, auth = false) => {
		return this.patch(`users/${userID}/${suffix}`, data, headers, auth);
	};

	static groupCreateAttachmentItem = async (groupID, linkMode, data = [], parentKey = false, context = false, returnFormat = 'responseJSON') => {
		let response = await this.get(`items/new?itemType=attachment&linkMode=${linkMode}`);
		let json = this.getJSONFromResponse(response);
		for (let key in data) {
			json[key] = data[key];
		}
		if (parentKey) {
			json.parentItem = parentKey;
		}

		response = await this.groupPost(
			groupID,
			`items?key=${this.apiKey}`,
			JSON.stringify([json]),
			{ "Content-Type": "application/json" }
		);

		return this.handleCreateResponse('item', response, returnFormat, context, groupID);
	};

	static async getFirstSuccessKeyFromResponse(response) {
		let json = this.getJSONFromResponse(response);
		if (!json.success) {
			console.log(response.body);
			throw new Error("No success keys found in response");
		}
		return json.success.shift();
	}

	static async groupGet(groupID, suffix, headers = {}, auth = false) {
		return this.get(`groups/${groupID}/${suffix}`, headers, auth);
	}

	static async getCollectionXML(keys, context = null) {
		return this.getObject('collection', keys, context, 'atom');
	}

	static async postItems(json) {
		return this.postObjects('item', json);
	}

	static async groupPut(groupID, suffix, data, headers = {}, auth = false) {
		return this.put(`groups/${groupID}/${suffix}`, data, headers, auth);
	}

	static async userDelete(userID, suffix, headers = {}, auth = false) {
		let url = `users/${userID}/${suffix}`;
		return this.delete(url, headers, auth);
	}

	static getSuccessfulKeysFromResponse(response) {
		let json = this.getJSONFromResponse(response);
		return Object.keys(json.successful).map((o) => {
			return json.successful[o].key;
		});
	}

	static async getItemTemplate(itemType) {
		let response = await this.get(`items/new?itemType=${itemType}`);
		if (response.status != 200) {
			console.log(response.status);
			console.log(response.data);
			throw new Error("Invalid response from template request");
		}
		return JSON.parse(response.data);
	}

	static async groupPost(groupID, suffix, data, headers = {}, auth = false) {
		return this.post(`groups/${groupID}/${suffix}`, data, headers, auth);
	}

	static async superPut(url, data, headers) {
		let postData = {
			username: this.config.rootUsername,
			password: this.config.rootPassword
		};
		Object.assign(postData, data);
		return this.put(url, postData, headers);
	}

	static async getSearchResponse(keys, context = null, format = false, groupID = false) {
		const module = this || context;
		return module.getObjectResponse('search', keys, context, format, groupID);
	}

	// Atom

	static async getSearch(keys, context = null, format = false, groupID = false) {
		const module = this || context;
		return module.getObject('search', keys, context, format, groupID);
	}

	static async createCollection(name, data = {}, context = null, returnFormat = 'responseJSON') {
		let parent, relations;

		if (typeof data == 'object') {
			parent = data.parentCollection ? data.parentCollection : false;
			relations = data.relations ? data.relations : {};
		}
		else {
			parent = data ? data : false;
			relations = {};
		}

		let json = [
			{
				name: name,
				parentCollection: parent,
				relations: relations
			}
		];

		if (data.deleted) {
			json[0].deleted = data.deleted;
		}

		let response = await this.postObjects('collection', json);
		return this.handleCreateResponse('collection', response, returnFormat, context);
	}

	static async setKeyGroupPermission(key, groupID, permission, _) {
		let response = await this.get(
			"keys/" + key,
			[],
			{
				username: this.config.rootUsername,
				password: this.config.rootPassword
			}
		);
		if (response.status != 200) {
			console.log(response.data);
			throw new Error("GET returned " + response.status);
		}

		let json = this.getJSONFromResponse(response);
		if (!json.access) {
			json.access = {};
		}
		if (!json.access.groups) {
			json.access.groups = {};
		}
		json.access.groups[groupID][permission] = true;
		response = await this.put(
			"keys/" + key,
			JSON.stringify(json),
			[],
			{
				username: this.config.rootUsername,
				password: this.config.rootPassword
			}
		);
		if (response.status != 200) {
			console.log(response.data);
			throw new Error("PUT returned " + response.status);
		}
	}

	static async setKeyOption(userID, key, option, val) {
		console.log("setKeyOption() is deprecated -- use setKeyUserPermission()");

		switch (option) {
			case 'libraryNotes':
				option = 'notes';
				break;

			case 'libraryWrite':
				option = 'write';
				break;
		}

		await this.setKeyUserPermission(key, option, val);
	}


	static async createNoteItem(text = "", parentKey = false, context = false, returnFormat = 'responseJSON') {
		let response = await this.get("items/new?itemType=note");
		let json = JSON.parse(response.data);
		json.note = text;
		if (parentKey) {
			json.parentItem = parentKey;
		}

		response = await this.postObjects('item', [json]);
		return this.handleCreateResponse('item', response, returnFormat, context);
	}

	static async createItem(itemType, data = {}, context = null, returnFormat = 'responseJSON') {
		let json = await this.getItemTemplate(itemType);

		if (data) {
			for (let field in data) {
				json[field] = data[field];
			}
		}

		let headers = {
			"Content-Type": "application/json",
			"Zotero-API-Key": this.apiKey
		};

		let requestBody = JSON.stringify([json]);

		let response = await this.userPost(this.config.userID, "items", requestBody, headers);

		return this.handleCreateResponse('item', response, returnFormat, context);
	}

	static async setKeyUserPermission(key, permission, value) {
		let response = await this.get(
			"keys/" + key,
			{},
			{
				username: this.config.rootUsername,
				password: this.config.rootPassword
			}
		);
		if (response.status != 200) {
			console.log(response.data);
			throw new Error("GET returned " + response.status);
		}

		if (this.apiVersion >= 3) {
			let json = this.getJSONFromResponse(response);

			switch (permission) {
				case 'library':
					if (json.access.user && value == !json.access.user.library) {
						break;
					}
					json.access.user.library = value;
					break;

				case 'write':
					if (json.access.user && value == !json.access.user.write) {
						break;
					}
					json.access.user.write = value;
					break;

				case 'notes':
					if (json.access.user && value == !json.access.user.notes) {
						break;
					}
					json.access.user.notes = value;
					break;
			}

			response = await this.put(
				"keys/" + this.apiKey,
				JSON.stringify(json),
				{},
				{
					username: this.config.rootUsername,
					password: this.config.rootPassword
				}
			);
		}
		else {
			let xml;
			try {
				xml = this.getXMLFromResponse(response);
			}
			catch (e) {
				console.log(response.data);
				throw e;
			}
			let current;
			for (let access of xml.getElementsByTagName("access")) {
				switch (permission) {
					case 'library':
						current = parseInt(access.getAttribute('library'));
						if (current != value) {
							access.setAttribute('library', parseInt(value));
						}
						break;

					case 'write':
						if (!access.library) {
							continue;
						}
						current = parseInt(access.getAttribute('write'));
						if (current != value) {
							access.setAttribute('write', parseInt(value));
						}
						break;

					case 'notes':
						if (!access.library) {
							break;
						}
						current = parseInt(access.getAttribute('notes'));
						if (current != value) {
							access.setAttribute('notes', parseInt(value));
						}
						break;
				}
			}

			response = await this.put(
				"keys/" + this.apiKey,
				xml.outterHTML,
				{},
				{
					username: this.config.rootUsername,
					password: this.config.rootPassword
				}
			);
		}
		if (response.status != 200) {
			console.log(response.data);
			throw new Error("PUT returned " + response.status);
		}
	}

	static async createAnnotationItem(annotationType, data = [], parentKey, context = false, returnFormat = 'responseJSON') {
		let response = await this.get(`items/new?itemType=annotation&annotationType=${annotationType}`);
		let json = await response.json();
		json.parentItem = parentKey;
		if (annotationType === 'highlight') {
			json.annotationText = 'This is highlighted text.';
		}
		if (data.annotationComment !== undefined) {
			json.annotationComment = data.annotationComment;
		}
		json.annotationColor = '#ff8c19';
		json.annotationSortIndex = '00015|002431|00000';
		json.annotationPosition = JSON.stringify({
			pageIndex: 123,
			rects: [
				[314.4, 412.8, 556.2, 609.6]
			]
		});

		response = await this.postObjects('item', [json]);
		return this.handleCreateResponse('item', response, returnFormat, context);
	}

	static async createSearch(name, conditions = [], context = null, returnFormat = 'responseJSON') {
		if (!conditions || conditions === 'default') {
			conditions = [
				{
					condition: 'title',
					operator: 'contains',
					value: 'test',
				},
			];
		}

		const json = [
			{
				name,
				conditions,
			},
		];

		let response = await this.postObjects('search', json);
		return this.handleCreateResponse('search', response, returnFormat, context);
	}

	static async getCollectionResponse(keys, context = null, format = false, groupID = false) {
		return this.getObjectResponse('collection', keys, context, format, groupID);
	}

	static createUnsavedDataObject = async (objectType) => {
		let json;
		switch (objectType) {
			case "collection":
				json = {
					name: "Test",
				};
				break;

			case "item":
				// Convert to array
				json = JSON.parse(JSON.stringify(await this.getItemTemplate("book")));
				break;

			case "search":
				json = {
					name: "Test",
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "test",
						},
					],
				};
				break;
		}
		return json;
	};

	static async handleCreateResponse(objectType, response, returnFormat, context = null, groupID = false) {
		let uctype = objectType.charAt(0).toUpperCase() + objectType.slice(1);

		if (context) {
			Helpers.assert200(response);
		}

		if (returnFormat == 'response') {
			return response;
		}

		let json = this.getJSONFromResponse(response);

		if (returnFormat != 'responseJSON' && Object.keys(json.success).length != 1) {
			console.log(json);
			throw new Error(uctype + " creation failed");
		}

		if (returnFormat == 'responseJSON') {
			return json;
		}

		let key = json.success[0];

		if (returnFormat == 'key') {
			return key;
		}

		let asResponse = false;
		if (/response$/i.test(returnFormat)) {
			returnFormat = returnFormat.substring(0, returnFormat.length - 8);
			asResponse = true;
		}
		let responseFunc;
		switch (uctype) {
			case 'Item':
				responseFunc = asResponse ? this.getItemResponse : this.getItem;
				break;
			case 'Collection':
				responseFunc = asResponse ? this.getCollectionResponse : this.getCollection;
				break;
			case 'Search':
				responseFunc = asResponse ? this.getSearchResponse : this.getSearch;
				break;
			default:
				throw Error("Unknown object type");
		}

		if (returnFormat.substring(0, 4) == 'json') {
			response = await responseFunc(key, this, 'json', groupID);
			if (returnFormat == 'json' || returnFormat == 'jsonResponse') {
				return response;
			}
			if (returnFormat == 'jsonData') {
				return response.data;
			}
		}

		response = await responseFunc(key, this, 'atom', groupID);

		if (returnFormat == 'atom' || returnFormat == 'atomResponse') {
			return response;
		}

		let xml = this.getXMLFromResponse(response);
		let data = this.parseDataFromAtomEntry(xml);

		if (returnFormat == 'data') {
			return data;
		}
		if (returnFormat == 'content') {
			return data.content;
		}
		if (returnFormat == 'atomJSON') {
			return JSON.parse(data.content);
		}

		throw new Error("Invalid result format '" + returnFormat + "'");
	}

	static async getObjectResponse(objectType, keys, context = null, format = false, groupID = false) {
		let objectTypePlural = this.getPluralObjectType(objectType);
	
		let single = typeof keys === "string";
	
		let url = `${objectTypePlural}`;
		if (single) {
			url += `/${keys}`;
		}
		url += `?key=${this.apiKey}`;
		if (!single) {
			url += `&${objectType}Key=${keys.join(',')}&order=${objectType}KeyList`;
		}
		if (format !== false) {
			url += `&format=${format}`;
			if (format == 'atom') {
				url += '&content=json';
			}
		}
		let response;
		if (groupID) {
			response = await this.groupGet(groupID, url);
		}
		else {
			response = await this.userGet(this.config.userID, url);
		}
		if (context) {
			Helpers.assert200(response);
		}
		return response;
	}

	static async getObject(objectType, keys, context = null, format = false, groupID = false) {
		let response = await this.getObjectResponse(objectType, keys, context, format, groupID);
		let contentType = response.headers['content-type'][0];
		switch (contentType) {
			case 'application/json':
				return this.getJSONFromResponse(response);

			case 'application/atom+xml':
				return this.getXMLFromResponse(response);

			default:
				console.log(response.body);
				throw new Error(`Unknown content type '${contentType}'`);
		}
	}
}

module.exports = API3;

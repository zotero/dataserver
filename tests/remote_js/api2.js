
const HTTP = require("./httpHandler");
const { JSDOM } = require("jsdom");
const wgxpath = require('wgxpath');
var config = require('config');

class API2 {
	static apiVersion = null;

	static useAPIVersion(version) {
		this.apiVersion = version;
	}

	static async login() {
		const response = await HTTP.post(
			`${config.apiURLPrefix}test/setup?u=${config.userID}&u2=${config.userID2}`,
			" ",
			{}, {
				username: config.rootUsername,
				password: config.rootPassword
			});
		if (!response.data) {
			throw new Error("Could not fetch credentials!");
		}
		return JSON.parse(response.data);
	}

	static async getItemTemplate(itemType) {
		let response = await this.get(`items/new?itemType=${itemType}`);
		return JSON.parse(response.data);
	}

	static async createItem(itemType, data = {}, context = null, responseFormat = 'atom') {
		let json = await this.getItemTemplate(itemType);

		if (data) {
			for (let field in data) {
				json[field] = data[field];
			}
		}

		let response = await this.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);

		return this.handleCreateResponse('item', response, responseFormat, context);
	}

	static async postItems(json) {
		return this.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				items: json
			}),
			{ "Content-Type": "application/json" }
		);
	}

	static async postItem(json) {
		return this.postItems([json]);
	}

	static async groupCreateItem(groupID, itemType, context = null, responseFormat = 'atom') {
		let response = await this.get(`items/new?itemType=${itemType}`);
		let json = this.getJSONFromResponse(response);

		response = await this.groupPost(
			groupID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);

		if (context && response.status != 200) {
			throw new Error("Group post resurned status != 200");
		}

		json = this.getJSONFromResponse(response);

		if (responseFormat !== 'json' && Object.keys(json.success).length !== 1) {
			console.log(json);
			throw new Error("Item creation failed");
		}

		switch (responseFormat) {
			case 'json':
				return json;

			case 'key':
				return Object.keys(json.success).shift();

			case 'atom': {
				let itemKey = Object.keys(json.success).shift();
				return this.groupGetItemXML(groupID, itemKey, context);
			}

			default:
				throw new Error(`Invalid response format '${responseFormat}'`);
		}
	}

	static async createAttachmentItem(linkMode, data = {}, parentKey = false, context = false, responseFormat = 'atom') {
		let response = await this.get(`items/new?itemType=attachment&linkMode=${linkMode}`);
		let json = JSON.parse(response.data);

		Object.keys(data).forEach((key) => {
			json[key] = data[key];
		});

		if (parentKey) {
			json.parentItem = parentKey;
		}

		response = await this.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);

		if (context && response.status !== 200) {
			throw new Error("Response status is not 200");
		}

		json = this.getJSONFromResponse(response);

		if (responseFormat !== 'json' && Object.keys(json.success).length !== 1) {
			console.log(json);
			throw new Error("Item creation failed");
		}

		switch (responseFormat) {
			case 'json':
				return json;

			case 'key':
				return json.success[0];

			case 'atom': {
				const itemKey = json.success[0];
				let xml = await this.getItemXML(itemKey, context);

				if (context) {
					const data = this.parseDataFromAtomEntry(xml);
					json = JSON.parse(data.content);
					if (linkMode !== json.linkMode) {
						throw new Error("Link mode does not match");
					}
				}
				return xml;
			}


			default:
				throw new Error(`Invalid response format '${responseFormat}'`);
		}
	}

	static async groupCreateAttachmentItem(groupID, linkMode, data = {}, parentKey = false, context = false, responseFormat = 'atom') {
		let response = await this.get(`items/new?itemType=attachment&linkMode=${linkMode}`);
		let json = JSON.parse(response.data);

		Object.keys(data).forEach((key) => {
			json[key] = data[key];
		});

		if (parentKey) {
			json.parentItem = parentKey;
		}

		response = await this.groupPost(
			groupID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);

		if (context && response.status !== 200) {
			throw new Error("Response status is not 200");
		}

		json = this.getJSONFromResponse(response);

		if (responseFormat !== 'json' && Object.keys(json.success).length !== 1) {
			console.log(json);
			throw new Error("Item creation failed");
		}

		switch (responseFormat) {
			case 'json':
				return json;

			case 'key':
				return json.success[0];

			case 'atom': {
				const itemKey = json.success[0];
				let xml = await this.groupGetItemXML(groupID, itemKey, context);

				if (context) {
					const data = this.parseDataFromAtomEntry(xml);
					json = JSON.parse(data.content);

					if (linkMode !== json.linkMode) {
						throw new Error("Link mode does not match");
					}
				}
				return xml;
			}


			default:
				throw new Error(`Invalid response format '${responseFormat}'`);
		}
	}

	static async createNoteItem(text = "", parentKey = false, context = false, responseFormat = 'atom') {
		let response = await this.get(`items/new?itemType=note`);
		let json = JSON.parse(response.data);

		json.note = text;

		if (parentKey) {
			json.parentItem = parentKey;
		}

		response = await this.userPost(
			config.userID,
			`items?key=${config.apiKey}`,
			JSON.stringify({
				items: [json]
			}),
			{ "Content-Type": "application/json" }
		);

		if (context && response.status !== 200) {
			throw new Error("Response status is not 200");
		}

		json = this.getJSONFromResponse(response);

		if (responseFormat !== 'json' && Object.keys(json.success).length !== 1) {
			console.log(json);
			throw new Error("Item creation failed");
		}

		switch (responseFormat) {
			case 'json':
				return json;

			case 'key':
				return json.success[0];

			case 'atom': {
				const itemKey = json.success[0];
				let xml = await this.getItemXML(itemKey, context);

				if (context) {
					const data = this.parseDataFromAtomEntry(xml);
					json = JSON.parse(data.content);

					if (text !== json.note) {
						throw new Error("Text does not match");
					}
				}

				return xml;
			}

			default:
				throw new Error(`Invalid response format '${responseFormat}'`);
		}
	}

	static async createCollection(name, data = {}, context = null, responseFormat = 'atom') {
		let parent, relations;
		
		if (typeof data == 'object') {
			parent = data.parentCollection ? data.parentCollection : false;
			relations = data.relations ? data.relations : {};
		}
		else {
			parent = data || false;
			relations = {};
		}

		const json = {
			collections: [
				{
					name: name,
					parentCollection: parent,
					relations: relations
				}
			]
		};

		const response = await this.userPost(
			config.userID,
			`collections?key=${config.apiKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);

		return this.handleCreateResponse('collection', response, responseFormat, context);
	}

	static async createSearch(name, conditions = [], context = null, responseFormat = 'atom') {
		if (conditions === 'default') {
			conditions = [
				{
					condition: 'title',
					operator: 'contains',
					value: 'test'
				}
			];
		}

		const json = {
			searches: [
				{
					name: name,
					conditions: conditions
				}
			]
		};

		const response = await this.userPost(
			config.userID,
			`searches?key=${config.apiKey}`,
			JSON.stringify(json),
			{ "Content-Type": "application/json" }
		);

		return this.handleCreateResponse('search', response, responseFormat, context);
	}

	static async getLibraryVersion() {
		const response = await this.userGet(
			config.userID,
			`items?key=${config.apiKey}&format=keys&limit=1`
		);
		return response.headers["last-modified-version"][0];
	}

	static async getGroupLibraryVersion(groupID) {
		const response = await this.groupGet(
			groupID,
			`items?key=${config.apiKey}&format=keys&limit=1`
		);
		return response.headers["last-modified-version"][0];
	}

	static async getItemXML(keys, context = null) {
		return this.getObjectXML('item', keys, context);
	}

	static async groupGetItemXML(groupID, keys, context = null) {
		if (typeof keys === 'string' || typeof keys === 'number') {
			keys = [keys];
		}

		const response = await this.groupGet(
			groupID,
			`items?key=${config.apiKey}&itemKey=${keys.join(',')}&order=itemKeyList&content=json`
		);
		if (context && response.status != 200) {
			throw new Error("Group set request failed.");
		}
		return this.getXMLFromResponse(response);
	}

	static async getCollectionXML(keys, context = null) {
		return this.getObjectXML('collection', keys, context);
	}

	static async getSearchXML(keys, context = null) {
		return this.getObjectXML('search', keys, context);
	}

	// Simple http requests with no dependencies
	static async get(url, headers = {}, auth = null) {
		url = config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}

		const response = await HTTP.get(url, headers, auth);

		if (config.verbose >= 2) {
			console.log("\n\n" + response.data + "\n");
		}

		return response;
	}

	static async superGet(url, headers = {}) {
		return this.get(url, headers, {
			username: config.username,
			password: config.password
		});
	}

	static async userGet(userID, suffix, headers = {}, auth = null) {
		return this.get(`users/${userID}/${suffix}`, headers, auth);
	}

	static async groupGet(groupID, suffix, headers = {}, auth = null) {
		return this.get(`groups/${groupID}/${suffix}`, headers, auth);
	}

	static async post(url, data, headers = {}, auth = null) {
		url = config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}

		return HTTP.post(url, data, headers, auth);
	}

	static async userPost(userID, suffix, data, headers = {}, auth = null) {
		return this.post(`users/${userID}/${suffix}`, data, headers, auth);
	}

	static async groupPost(groupID, suffix, data, headers = {}, auth = null) {
		return this.post(`groups/${groupID}/${suffix}`, data, headers, auth);
	}

	static async put(url, data, headers = {}, auth = null) {
		url = config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}

		return HTTP.put(url, data, headers, auth);
	}

	static async userPut(userID, suffix, data, headers = {}, auth = null) {
		return this.put(`users/${userID}/${suffix}`, data, headers, auth);
	}

	static async groupPut(groupID, suffix, data, headers = {}, auth = null) {
		return this.put(`groups/${groupID}/${suffix}`, data, headers, auth);
	}

	static async patch(url, data, headers = {}, auth = null) {
		url = config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}

		return HTTP.patch(url, data, headers, auth);
	}

	static async userPatch(userID, suffix, data, headers = {}) {
		return this.patch(`users/${userID}/${suffix}`, data, headers);
	}

	static async delete(url, headers = {}, auth = null) {
		url = config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}
		return HTTP.delete(url, headers, auth);
	}

	static async userDelete(userID, suffix, headers = {}) {
		return this.delete(`users/${userID}/${suffix}`, headers);
	}

	static async head(url, headers = {}, auth = null) {
		url = config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers["Zotero-API-Version"] = this.apiVersion;
		}

		return HTTP.head(url, headers, auth);
	}

	static async userClear(userID) {
		const response = await this.userPost(
			userID,
			"clear",
			"",
			{},
			{
				username: config.rootUsername,
				password: config.rootPassword
			}
		);
		if (response.status !== 204) {
			console.log(response.data);
			throw new Error(`Error clearing user ${userID}`);
		}
	}

	static async groupClear(groupID) {
		const response = await this.groupPost(
			groupID,
			"clear",
			"",
			{},
			{
				username: config.rootUsername,
				password: config.rootPassword
			}
		);

		if (response.status !== 204) {
			console.log(response.data);
			throw new Error(`Error clearing group ${groupID}`);
		}
	}


	// Response parsing
	static arrayGetFirst(arr) {
		try {
			return arr[0];
		}
		catch (e) {
			return null;
		}
	}


	static getXMLFromResponse(response) {
		var result;
		try {
			const jsdom = new JSDOM(response.data, { contentType: "application/xml", url: "http://localhost/" });
			wgxpath.install(jsdom.window, true);
			result = jsdom.window._document;
		}
		catch (e) {
			console.log(response.data);
			throw e;
		}
		return result;
	}

	static getJSONFromResponse(response) {
		const json = JSON.parse(response.data);
		if (json === null) {
			console.log(response.data);
			throw new Error("JSON response could not be parsed");
		}
		return json;
	}

	static getFirstSuccessKeyFromResponse(response) {
		const json = this.getJSONFromResponse(response);
		if (!json.success || json.success.length === 0) {
			console.log(response.data);
			throw new Error("No success keys found in response");
		}
		return json.success[0];
	}

	static parseDataFromAtomEntry(entryXML) {
		const key = this.arrayGetFirst(entryXML.getElementsByTagName('zapi:key'));
		const version = this.arrayGetFirst(entryXML.getElementsByTagName('zapi:version'));
		const content = this.arrayGetFirst(entryXML.getElementsByTagName('content'));
		if (content === null) {
			console.log(entryXML.outerHTML);
			throw new Error("Atom response does not contain <content>");
		}

		return {
			key: key ? key.textContent : null,
			version: version ? version.textContent : null,
			content: content ? content.textContent : null
		};
	}

	static getContentFromResponse(response) {
		const xml = this.getXMLFromResponse(response);
		const data = this.parseDataFromAtomEntry(xml);
		return data.content;
	}

	//
	static getPluralObjectType(objectType) {
		if (objectType === 'search') {
			return objectType + "es";
		}
		return objectType + "s";
	}

	static async getObjectXML(objectType, keys, context = null) {
		let objectTypePlural = this.getPluralObjectType(objectType);

		if (!Array.isArray(keys)) {
			keys = [keys];
		}

		let response = await this.userGet(
			config.userID,
			`${objectTypePlural}?key=${config.apiKey}&${objectType}Key=${keys.join(',')}&order=${objectType}KeyList&content=json`
		);

		// Checking the response status
		if (context && response.status !== 200) {
			throw new Error("Response status is not 200");
		}

		return this.getXMLFromResponse(response);
	}

	static async handleCreateResponse(objectType, response, responseFormat, context = null) {
		let uctype = objectType.charAt(0).toUpperCase() + objectType.slice(1);

		// Checking the response status
		if (response.status !== 200) {
			throw new Error("Response status is not 200");
		}

		let json = JSON.parse(response.data);

		if (responseFormat !== 'responsejson' && (!json.success || Object.keys(json.success).length !== 1)) {
			return response;
			//throw new Error(`${uctype} creation failed`);
		}

		if (responseFormat === 'responsejson') {
			return json;
		}

		let key = json.success[0];

		if (responseFormat === 'key') {
			return key;
		}

		// Calling the corresponding function based on the uctype
		let xml;
		switch (uctype) {
			case 'Search':
				xml = await this.getSearchXML(key, context);
				break;
			case 'Item':
				xml = await this.getItemXML(key, context);
				break;
			case 'Collection':
				xml = await this.getCollectionXML(key, context);
				break;
		}

		if (responseFormat === 'atom') {
			return xml;
		}

		let data = this.parseDataFromAtomEntry(xml);

		if (responseFormat === 'data') {
			return data;
		}
		if (responseFormat === 'content') {
			return data.content;
		}
		if (responseFormat === 'json') {
			return JSON.parse(data.content);
		}

		throw new Error(`Invalid response format '${responseFormat}'`);
	}

	static async setKeyOption(userID, key, option, val) {
		let response = await this.get(
			`users/${userID}/keys/${key}`,
			{},
			{
				username: config.rootUsername,
				password: config.rootPassword
			}
		);

		// Checking the response status
		if (response.status !== 200) {
			console.log(response.data);
			throw new Error(`GET returned ${response.status}`);
		}

		let xml;
		try {
			xml = this.getXMLFromResponse(response);
		}
		catch (e) {
			console.log(response.data);
			throw e;
		}

		for (let access of xml.getElementsByTagName('access')) {
			switch (option) {
				case 'libraryNotes': {
					if (!access.hasAttribute('library')) {
						break;
					}
					let current = parseInt(access.getAttribute('notes'));
					if (current !== val) {
						access.setAttribute('notes', val);
						response = await this.put(
							`users/${config.userID}/keys/${config.apiKey}`,
							xml.documentElement.outerHTML,
							{},
							{
								username: config.rootUsername,
								password: config.rootPassword
							}
						);
						if (response.status !== 200) {
							console.log(response.data);
							throw new Error(`PUT returned ${response.status}`);
						}
					}
					break;
				}
					

				case 'libraryWrite': {
					if (!access.hasAttribute('library')) {
						continue;
					}
					let current = parseInt(access.getAttribute('write'));
					if (current !== val) {
						access.setAttribute('write', val);
						response = await this.put(
							`users/${config.userID}/keys/${config.apiKey}`,
							xml.documentElement.outerHTML,
							{},
							{
								username: config.rootUsername,
								password: config.rootPassword
							}
						);
						if (response.status !== 200) {
							console.log(response.data);
							throw new Error(`PUT returned ${response.status}`);
						}
					}
					break;
				}
			}
		}
	}
}

module.exports = API2;

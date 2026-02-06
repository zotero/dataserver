/**
 * API helper class for Zotero API testing
 */

import config from 'config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { assert200 } from './assertions3.js';
import { DOMParser } from '@xmldom/xmldom';
import { xpathSelect } from './xpath.js';

let __filename = fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);

/**
 * Simple response wrapper to provide consistent interface
 */
class APIResponse {
	constructor(response, body) {
		this._response = response;
		this._body = body;
		this._status = response.status;
		this._headers = response.headers;
	}
	
	getStatus() {
		return this._status;
	}
	
	getBody() {
		return this._body;
	}
	
	getHeader(name) {
		return this._headers.get(name);
	}
}

class API {
	static apiVersion = false;
	static schemaVersion = false;
	static apiKey = false;

	// Generate a valid Zotero key (8 characters from allowed set)
	static generateKey() {
		let chars = '23456789ABCDEFGHIJKLMNPQRSTUVWXYZ';
		let key = '';
		for (let i = 0; i < 8; i++) {
			key += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return key;
	}

	// Alias for generateKey() to match PHP API
	static getKey() {
		return this.generateKey();
	}

	static useAPIVersion(version) {
		this.apiVersion = version;
	}
	
	static useSchemaVersion(version) {
		this.schemaVersion = version;
	}
	
	static resetSchemaVersion() {
		// Read schema version from the schema file
		let schemaPath = path.resolve(__dirname, '../../htdocs/zotero-schema/schema.json');
		let schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
		this.schemaVersion = schema.version;
	}
	
	static useAPIKey(key = '') {
		this.apiKey = key;
	}
	
	// Build headers object for requests
	static _buildHeaders(additionalHeaders = [], auth = false) {
		let headers = {};
		
		if (this.apiVersion) {
			headers['Zotero-API-Version'] = this.apiVersion;
		}
		if (this.schemaVersion) {
			headers['Zotero-Schema-Version'] = this.schemaVersion;
		}
		if (!auth && this.apiKey) {
			headers['Authorization'] = `Bearer ${this.apiKey}`;
		}
		if (auth) {
			let credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
			headers['Authorization'] = `Basic ${credentials}`;
		}
		
		// Parse additional headers (format: "Header-Name: value")
		for (let header of additionalHeaders) {
			let colonIndex = header.indexOf(':');
			if (colonIndex > 0) {
				let name = header.substring(0, colonIndex).trim();
				let value = header.substring(colonIndex + 1).trim();
				headers[name] = value;
			}
		}
		
		return headers;
	}
	
	// Core fetch wrapper
	static async _fetch(method, url, options = {}) {
		let { headers = {}, body, auth, redirect = 'manual' } = options;

		let fetchOptions = {
			method,
			headers: { ...headers },
			redirect: redirect // Default to 'manual' to not follow redirects
		};

		if (auth) {
			let credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
			fetchOptions.headers['Authorization'] = `Basic ${credentials}`;
		}

		if (body !== undefined) {
			fetchOptions.body = body;
		}

		if (config.get('verbose') >= 1) {
			console.log(`\n${method} ${url}`);
		}

		let response = await fetch(url, fetchOptions);
		let responseBody = await response.text();
		
		if (config.get('verbose') >= 2) {
			console.log(`\n${responseBody}\n`);
		}
		
		return new APIResponse(response, responseBody);
	}
	
	// HTTP methods
	static async get(url, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('GET', fullUrl, { headers: builtHeaders, auth });
	}
	
	static async superGet(url, headers = []) {
		return this.get(url, headers, {
			username: config.get('rootUsername'),
			password: config.get('rootPassword')
		});
	}
	
	static async userGet(userID, suffix, headers = [], auth = false) {
		return this.get(`users/${userID}/${suffix}`, headers, auth);
	}
	
	static async groupGet(groupID, suffix, headers = [], auth = false) {
		return this.get(`groups/${groupID}/${suffix}`, headers, auth);
	}
	
	static async post(url, data, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('POST', fullUrl, { headers: builtHeaders, body: data, auth });
	}
	
	static async superPost(url, data, headers = []) {
		return this.post(url, data, headers, {
			username: config.get('rootUsername'),
			password: config.get('rootPassword')
		});
	}
	
	static async userPost(userID, suffix, data, headers = [], auth = false) {
		return this.post(`users/${userID}/${suffix}`, data, headers, auth);
	}
	
	static async groupPost(groupID, suffix, data, headers = [], auth = false) {
		return this.post(`groups/${groupID}/${suffix}`, data, headers, auth);
	}
	
	static async put(url, data, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('PUT', fullUrl, { headers: builtHeaders, body: data, auth });
	}
	
	static async superPut(url, data, headers = []) {
		return this.put(url, data, headers, {
			username: config.get('rootUsername'),
			password: config.get('rootPassword')
		});
	}
	
	static async userPut(userID, suffix, data, headers = [], auth = false) {
		return this.put(`users/${userID}/${suffix}`, data, headers, auth);
	}
	
	static async groupPut(groupID, suffix, data, headers = [], auth = false) {
		return this.put(`groups/${groupID}/${suffix}`, data, headers, auth);
	}
	
	static async patch(url, data, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('PATCH', fullUrl, { headers: builtHeaders, body: data, auth });
	}
	
	static async userPatch(userID, suffix, data, headers = []) {
		return this.patch(`users/${userID}/${suffix}`, data, headers);
	}
	
	static async head(url, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('HEAD', fullUrl, { headers: builtHeaders, auth });
	}
	
	static async userHead(userID, suffix, headers = [], auth = false) {
		return this.head(`users/${userID}/${suffix}`, headers, auth);
	}
	
	static async delete(url, headers = [], auth = false) {
		let fullUrl = config.get('apiURLPrefix') + url;
		let builtHeaders = this._buildHeaders(headers, auth);
		return this._fetch('DELETE', fullUrl, { headers: builtHeaders, auth });
	}
	
	static async superDelete(url, headers = []) {
		return this.delete(url, headers, {
			username: config.get('rootUsername'),
			password: config.get('rootPassword')
		});
	}
	
	static async userDelete(userID, suffix, headers = [], auth = false) {
		return this.delete(`users/${userID}/${suffix}`, headers, auth);
	}
	
	static async groupDelete(groupID, suffix, headers = [], auth = false) {
		return this.delete(`groups/${groupID}/${suffix}`, headers, auth);
	}
	
	// User/Group clear methods
	static async userClear(userID) {
		let response = await this.userPost(
			userID,
			'clear',
			'',
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		if (response.getStatus() !== 204) {
			console.log(response.getBody());
			throw new Error(`Error clearing user ${userID}`);
		}
	}
	
	static async groupClear(groupID) {
		let response = await this.groupPost(
			groupID,
			'clear',
			'',
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		if (response.getStatus() !== 204) {
			console.log(response.getBody());
			throw new Error(`Error clearing group ${groupID}`);
		}
	}
	
	// Item template and creation methods
	static async getItemTemplate(itemType) {
		let response = await this.get(`items/new?itemType=${itemType}`);
		if (response.getStatus() !== 200) {
			console.log(response.getStatus());
			console.log(response.getBody());
			throw new Error('Invalid response from template request');
		}
		return JSON.parse(response.getBody());
	}
	
	static async createItem(itemType, data = {}, returnFormat = 'responseJSON') {
		let json = await this.getItemTemplate(itemType);
		
		if (data) {
			for (let [field, val] of Object.entries(data)) {
				json[field] = val;
			}
		}
		
		let response = await this.userPost(
			config.get('userID'),
			'items',
			JSON.stringify([json]),
			[
				'Content-Type: application/json',
				`Zotero-API-Key: ${config.get('apiKey')}`
			]
		);
		
		return this.handleCreateResponse('item', response, returnFormat);
	}
	
	static async postItem(json) {
		return this.postItems([json]);
	}
	
	static async postItems(json) {
		return this.postObjects('item', json);
	}
	
	static async postObjects(objectType, json) {
		let objectTypePlural = this.getPluralObjectType(objectType);
		return this.userPost(
			config.get('userID'),
			objectTypePlural,
			JSON.stringify(json),
			['Content-Type: application/json']
		);
	}
	
	static getPluralObjectType(objectType) {
		if (objectType === 'search') {
			return objectType + 'es';
		}
		return objectType + 's';
	}
	
	// Note creation
	static async createNoteItem(text = '', parentKey = false, returnFormat = 'responseJSON') {
		let response = await this.get('items/new?itemType=note');
		let json = JSON.parse(response.getBody());
		json.note = text;
		if (parentKey) {
			json.parentItem = parentKey;
		}
		
		let postResponse = await this.postObjects('item', [json]);
		return this.handleCreateResponse('item', postResponse, returnFormat);
	}
	
	// Attachment creation
	static async createAttachmentItem(linkMode, data = {}, parentKey = false, returnFormat = 'responseJSON') {
		let response = await this.get(`items/new?itemType=attachment&linkMode=${linkMode}`);
		let json = JSON.parse(response.getBody());
		for (let [key, val] of Object.entries(data)) {
			json[key] = val;
		}
		if (parentKey) {
			json.parentItem = parentKey;
		}
		
		let postResponse = await this.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		
		return this.handleCreateResponse('item', postResponse, returnFormat);
	}

	// Annotation creation
	static async createAnnotationItem(annotationType, data = {}, parentKey, returnFormat = 'responseJSON') {
		let response = await this.get(`items/new?itemType=annotation&annotationType=${annotationType}`);
		let json = JSON.parse(response.getBody());
		json.parentItem = parentKey;
		if (annotationType === 'highlight') {
			json.annotationText = 'This is highlighted text.';
		}
		if (data && data.annotationComment) {
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

		let postResponse = await this.userPost(
			config.get('userID'),
			`items?key=${config.get('apiKey')}`,
			JSON.stringify([json]),
			['Content-Type: application/json']
		);

		return this.handleCreateResponse('item', postResponse, returnFormat);
	}

	// Collection creation
	static async createCollection(name, data = {}, returnFormat = 'responseJSON') {
		let parent = false;
		let relations = {};
		
		if (data && typeof data === 'object') {
			parent = data.parentCollection || false;
			relations = data.relations || {};
		}
		else if (data) {
			parent = data;
		}
		
		let json = [{
			name: name,
			parentCollection: parent,
			relations: relations
		}];
		
		if (data && data.deleted !== undefined) {
			json[0].deleted = data.deleted;
		}
		
		let response = await this.postObjects('collection', json);
		return this.handleCreateResponse('collection', response, returnFormat);
	}
	
	// Search creation
	static async createSearch(name, conditions = [], returnFormat = 'responseJSON') {
		if (!conditions || conditions === 'default') {
			conditions = [{
				condition: 'title',
				operator: 'contains',
				value: 'test'
			}];
		}
		
		let json = [{
			name: name,
			conditions: conditions
		}];
		
		let response = await this.postObjects('search', json);
		return this.handleCreateResponse('search', response, returnFormat);
	}

	// Create a data object (collection, item, or search) with optional data
	static async createDataObject(objectType, data = {}, returnFormat = 'json') {
		switch (objectType) {
			case 'collection':
				return this.createCollection('Test', data, returnFormat);
			case 'item':
				return this.createItem('book', data, returnFormat);
			case 'search': {
				let conditions = data.conditions || [{
					condition: 'title',
					operator: 'contains',
					value: 'test'
				}];
				let name = data.name || 'Test';
				delete data.conditions;
				delete data.name;
				let searchData = { name, conditions, ...data };
				let response = await this.postObjects('search', [searchData]);
				return this.handleCreateResponse('search', response, returnFormat);
			}
		}
	}

	// Create an unsaved data object (not posted to server)
	static async createUnsavedDataObject(objectType) {
		switch (objectType) {
			case 'collection':
				return { name: 'Test' };
			case 'item':
				return this.getItemTemplate('book');
			case 'search':
				return {
					name: 'Test',
					conditions: [{
						condition: 'title',
						operator: 'contains',
						value: 'test'
					}]
				};
		}
	}

	// Group item creation
	static async groupCreateItem(groupID, itemType, data = {}, returnFormat = 'responseJSON') {
		let response = await this.get(`items/new?itemType=${itemType}`);
		let json = JSON.parse(response.getBody());
		
		if (data) {
			for (let [field, val] of Object.entries(data)) {
				json[field] = val;
			}
		}
		
		let postResponse = await this.groupPost(
			groupID,
			`items?key=${config.get('apiKey')}`,
			JSON.stringify([json]),
			['Content-Type: application/json']
		);
		
		return this.handleCreateResponse('item', postResponse, returnFormat, groupID);
	}

	// Group attachment creation
	static async groupCreateAttachmentItem(groupID, linkMode, data = {}, parentKey = null, returnFormat = 'responseJSON') {
		let response = await this.get(`items/new?itemType=attachment&linkMode=${linkMode}`);
		let json = JSON.parse(response.getBody());

		if (parentKey) {
			json.parentItem = parentKey;
		}

		if (data) {
			for (let [field, val] of Object.entries(data)) {
				json[field] = val;
			}
		}

		let postResponse = await this.groupPost(
			groupID,
			`items?key=${config.get('apiKey')}`,
			JSON.stringify([json]),
			['Content-Type: application/json']
		);

		return this.handleCreateResponse('item', postResponse, returnFormat, groupID);
	}

	// Get methods
	static async getItem(keys, format = false, groupID = false) {
		return this.getObject('item', keys, format, groupID);
	}
	
	static async getItemResponse(keys, format = false, groupID = false) {
		return this.getObjectResponse('item', keys, format, groupID);
	}
	
	static async getCollection(keys, format = false, groupID = false) {
		return this.getObject('collection', keys, format, groupID);
	}
	
	static async getCollectionResponse(keys, format = false, groupID = false) {
		return this.getObjectResponse('collection', keys, format, groupID);
	}
	
	static async getSearch(keys, format = false, groupID = false) {
		return this.getObject('search', keys, format, groupID);
	}
	
	static async getSearchResponse(keys, format = false, groupID = false) {
		return this.getObjectResponse('search', keys, format, groupID);
	}
	
	static async getObject(objectType, keys, format = false, groupID = false) {
		let response = await this.getObjectResponse(objectType, keys, format, groupID);
		let contentType = response.getHeader('Content-Type');
		
		switch (contentType) {
			case 'application/json':
				return this.getJSONFromResponse(response);
			case 'application/atom+xml':
				return this.getXMLFromResponse(response);
			default:
				console.log(response.getBody());
				throw new Error(`Unknown content type '${contentType}'`);
		}
	}
	
	static async getObjectResponse(objectType, keys, format = false, groupID = false) {
		let objectTypePlural = this.getPluralObjectType(objectType);
		let single = typeof keys === 'string';
		
		let url = objectTypePlural;
		if (single) {
			url += `/${keys}`;
		}
		url += `?key=${config.get('apiKey')}`;
		if (!single) {
			url += `&${objectType}Key=${keys.join(',')}&order=${objectType}KeyList`;
		}
		if (format !== false) {
			url += `&format=${format}`;
			if (format === 'atom') {
				url += '&content=json';
			}
		}
		
		let response;
		if (groupID) {
			response = await this.groupGet(groupID, url);
		}
		else {
			response = await this.userGet(config.get('userID'), url);
		}
		
		assert200(response);
		return response;
	}
	
	// Response parsing
	static getJSONFromResponse(response, _asObject = false) {
		let json = JSON.parse(response.getBody());
		if (json === null) {
			console.log(response.getBody());
			throw new Error('JSON response could not be parsed');
		}
		return json;
	}

	static getXMLFromResponse(response) {
		let parser = new DOMParser();
		let xml = parser.parseFromString(response.getBody(), 'text/xml');
		if (!xml) {
			console.log(response.getBody());
			throw new Error('XML response could not be parsed');
		}
		return xml;
	}

	static async getItemXML(keys) {
		if (!Array.isArray(keys)) {
			keys = [keys];
		}
		let response = await this.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&itemKey=${keys.join(',')}&order=itemKeyList&content=json`,
			[],
			false
		);
		assert200(response);
		return this.getXMLFromResponse(response);
	}

	static parseDataFromAtomEntry(entryXML) {
		let keyNode = xpathSelect(entryXML, '//atom:entry/zapi:key/text()', true);
		let versionNode = xpathSelect(entryXML, '//atom:entry/zapi:version/text()', true);
		let contentNode = xpathSelect(entryXML, '//atom:entry/atom:content', true);

		if (!contentNode) {
			throw new Error('Atom response does not contain <content>');
		}

		let content;
		// If 'content' contains XML, serialize all subnodes
		if (contentNode.childNodes && contentNode.childNodes.length > 0) {
			content = '';
			for (let i = 0; i < contentNode.childNodes.length; i++) {
				let child = contentNode.childNodes[i];
				if (child.nodeType === 1) { // Element node
					content += child.toString();
				}
				else if (child.nodeType === 3) { // Text node
					content += child.nodeValue;
				}
			}
		}
		else {
			content = contentNode.textContent || '';
		}

		return {
			key: keyNode ? keyNode.nodeValue : '',
			version: versionNode ? versionNode.nodeValue : '',
			content: content
		};
	}

	static getContentFromResponse(response) {
		let xml = this.getXMLFromResponse(response);
		let data = this.parseDataFromAtomEntry(xml);
		return data.content;
	}

	static getFirstSuccessKeyFromResponse(response) {
		let json = this.getJSONFromResponse(response);
		if (!json.success || json.success.length === 0) {
			console.log(response.getBody());
			throw new Error('No success keys found in response');
		}
		return json.success[0];
	}
	
	static getSuccessfulKeysFromResponse(response) {
		let json = this.getJSONFromResponse(response);
		return json.successful.map(o => o.key);
	}
	
	// Library version
	static async getLibraryVersion() {
		let response = await this.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&format=keys&limit=1`
		);
		return parseInt(response.getHeader('Last-Modified-Version'));
	}
	
	static async getGroupLibraryVersion(groupID) {
		let response = await this.groupGet(
			groupID,
			`items?key=${config.get('apiKey')}&format=keys&limit=1`
		);
		return parseInt(response.getHeader('Last-Modified-Version'));
	}
	
	// Key permission methods
	static async resetKey(key) {
		let response = await this.get(
			`keys/${key}`,
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		if (response.getStatus() !== 200) {
			console.log(response.getBody());
			throw new Error(`GET returned ${response.getStatus()}`);
		}

		let json = this.getJSONFromResponse(response);
		// Reset to default permissions
		json.access = {
			user: { library: false, files: false, notes: false, write: false },
			groups: {}
		};

		let putResponse = await this.put(
			`keys/${key}`,
			JSON.stringify(json),
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		if (putResponse.getStatus() !== 200) {
			console.log(putResponse.getBody());
			throw new Error(`PUT returned ${putResponse.getStatus()}`);
		}
	}

	static async setKeyUserPermission(key, permission, value) {
		let response = await this.get(
			`keys/${key}`,
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		if (response.getStatus() !== 200) {
			console.log(response.getBody());
			throw new Error(`GET returned ${response.getStatus()}`);
		}
		
		let json = this.getJSONFromResponse(response);
		
		if (!json.access) {
			json.access = {};
		}
		if (!json.access.user) {
			json.access.user = {};
		}
		
		switch (permission) {
			case 'library':
				json.access.user.library = value;
				break;
			case 'write':
				json.access.user.write = value;
				break;
			case 'notes':
				json.access.user.notes = value;
				break;
		}
		
		let putResponse = await this.put(
			`keys/${config.get('apiKey')}`,
			JSON.stringify(json),
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		if (putResponse.getStatus() !== 200) {
			console.log(putResponse.getBody());
			throw new Error(`PUT returned ${putResponse.getStatus()}`);
		}
	}
	
	static async setKeyGroupPermission(key, groupID, permission, _value) {
		let response = await this.get(
			`keys/${key}`,
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		if (response.getStatus() !== 200) {
			console.log(response.getBody());
			throw new Error(`GET returned ${response.getStatus()}`);
		}
		
		let json = this.getJSONFromResponse(response);
		if (!json.access) {
			json.access = {};
		}
		if (!json.access.groups) {
			json.access.groups = {};
		}
		if (!json.access.groups[groupID]) {
			json.access.groups[groupID] = {};
		}
		json.access.groups[groupID][permission] = true;
		
		let putResponse = await this.put(
			`keys/${key}`,
			JSON.stringify(json),
			[],
			{
				username: config.get('rootUsername'),
				password: config.get('rootPassword')
			}
		);
		if (putResponse.getStatus() !== 200) {
			console.log(putResponse.getBody());
			throw new Error(`PUT returned ${putResponse.getStatus()}`);
		}
	}
	
	// Group creation/management
	static async createGroup(fields, returnFormat = 'id') {
		// Build XML for group creation
		let xml = '<group';
		xml += ` owner="${fields.owner}"`;
		xml += ` name="${fields.name || 'Test Group ' + Date.now()}"`;
		xml += ` type="${fields.type}"`;
		xml += ` libraryEditing="${fields.libraryEditing || 'members'}"`;
		xml += ` libraryReading="${fields.libraryReading || 'members'}"`;
		xml += ` fileEditing="${fields.fileEditing || 'none'}"`;
		xml += ' description=""';
		xml += ' url=""';
		xml += ' hasImage="0"';
		xml += '/>';
		
		let response = await this.superPost('groups', xml);
		if (response.getStatus() !== 201) {
			console.log(response.getBody());
			throw new Error(`Unexpected response code ${response.getStatus()}`);
		}
		
		let url = response.getHeader('Location');
		let match = url.match(/[0-9]+$/);
		let groupID = parseInt(match[0]);
		
		// Add members
		if (fields.members && fields.members.length > 0) {
			let membersXml = '';
			for (let member of fields.members) {
				membersXml += `<user id="${member}" role="member"/>`;
			}
			let usersResponse = await this.superPost(`groups/${groupID}/users`, membersXml);
			if (usersResponse.getStatus() !== 200) {
				console.log(usersResponse.getBody());
				throw new Error(`Unexpected response code ${usersResponse.getStatus()}`);
			}
		}
		
		if (returnFormat === 'response') {
			return response;
		}
		if (returnFormat === 'id') {
			return groupID;
		}
		throw new Error(`Unknown response format '${returnFormat}'`);
	}
	
	static async deleteGroup(groupID) {
		let response = await this.superDelete(`groups/${groupID}`);
		if (response.getStatus() !== 204) {
			console.log(response.getBody());
			throw new Error(`Unexpected response code ${response.getStatus()}`);
		}
	}
	
	// Handle create response
	static handleCreateResponse(objectType, response, returnFormat, groupID = false) {
		let uctype = objectType.charAt(0).toUpperCase() + objectType.slice(1);
		
		assert200(response);
		
		if (returnFormat === 'response') {
			return response;
		}
		
		let json = this.getJSONFromResponse(response);

		if (returnFormat !== 'responseJSON' && Object.keys(json.success).length !== 1) {
			console.log(json);
			throw new Error(`${uctype} creation failed`);
		}
		
		if (returnFormat === 'responseJSON') {
			return json;
		}
		
		let key = json.success[0];
		
		if (returnFormat === 'key') {
			return key;
		}
		
		// For other formats, we need to fetch the object
		if (returnFormat === 'json' || returnFormat === 'jsonData' || returnFormat === 'atom') {
			let getter;
			if (objectType === 'item') {
				if (returnFormat === 'atom') {
					getter = this.getItemXML(key);
				}
				else {
					getter = this.getItem(key, 'json', groupID);
				}
			}
			else if (objectType === 'collection') {
				getter = this.getCollection(key, 'json', groupID);
			}
			else if (objectType === 'search') {
				getter = this.getSearch(key, 'json', groupID);
			}
			else {
				throw new Error(`Unknown object type '${objectType}'`);
			}
			return getter.then((result) => {
				if (returnFormat === 'atom') {
					return result;
				}
				if (returnFormat === 'jsonData') {
					return result.data;
				}
				return result;
			});
		}

		throw new Error(`Invalid result format '${returnFormat}'`);
	}
}

export { API };

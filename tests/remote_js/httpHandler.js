const fetch = require('node-fetch');
const config = require('./config');

class HTTP {
	static verbose = config.verbose;

	static async request(method, url, headers = {}, data = {}, auth = false) {
		let options = {
			method: method,
			headers: headers,
			follow: 0,
			redirect: 'manual',
			body: ["POST", "PUT", "PATCH", "DELETE"].includes(method) ? data : null
		};

		if (auth) {
			options.headers.Authorization = 'Basic ' + Buffer.from(auth.username + ':' + auth.password).toString('base64');
		}

		if (config.verbose >= 1) {
			console.log(`\n${method} ${url}\n`);
		}

		//Hardcoded for running tests against containers
		const localIPRegex = new RegExp("172.16.0.[0-9][0-9]");
		if (url.match(localIPRegex)) {
			url = url.replace(localIPRegex, 'localhost');
		}

		let success = false;
		let attempts = 3;
		let tried = 0;
		let response;
		while (!success && tried < attempts) {
			try {
				response = await fetch(url, options);
				success = true;
			}
			catch (error) {
				if (error.name === 'FetchError') {
					console.log('Request aborted. Wait for 2 seconds and retry...');
					await new Promise(r => setTimeout(r, 2000));
					tried += 1;
				}
			}
		}
		if (!success) {
			throw new Error(`${method} to ${url} did not succeed after ${attempts} attempts.`);
		}

		// Fetch doesn't automatically parse the response body, so we have to do that manually
		let responseData = await response.text();

		if (HTTP.verbose >= 2) {
			console.log(`\n\n${responseData}\n`);
		}

		// Return the response status, headers, and data in a format similar to Axios
		return {
			status: response.status,
			headers: response.headers.raw(),
			data: responseData
		};
	}

	static get(url, headers = {}, auth = false) {
		return this.request('GET', url, headers, {}, auth);
	}

	static post(url, data = {}, headers = {}, auth = false) {
		return this.request('POST', url, headers, data, auth);
	}

	static put(url, data = {}, headers = {}, auth = false) {
		return this.request('PUT', url, headers, data, auth);
	}

	static patch(url, data = {}, headers = {}, auth = false) {
		return this.request('PATCH', url, headers, data, auth);
	}

	static head(url, headers = {}, auth = false) {
		return this.request('HEAD', url, headers, {}, auth);
	}

	static options(url, headers = {}, auth = false) {
		return this.request('OPTIONS', url, headers, {}, auth);
	}

	static delete(url, headers = {}, auth = false) {
		return this.request('DELETE', url, headers, "", auth);
	}
}

module.exports = HTTP;
